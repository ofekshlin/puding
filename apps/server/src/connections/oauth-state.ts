import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, lt } from "drizzle-orm";
import { randomUUID } from "crypto";
import { jwtVerify, SignJWT } from "jose";
import { ConfigService } from "../config/config.service";
import { Provider } from "../credentials/credential.types";
import { DATABASE, DatabaseConnection, isUuid } from "../database/database";
import { oauthStates } from "../database/schema";

export const OAUTH_STATE_AUDIENCE = "puding-oauth-state";
const STATE_TTL_MS = 10 * 60_000;

/** Raised when connect flows cannot run: no database or no signing secret. */
export class OAuthUnavailableError extends Error {
  constructor() {
    super("OAuth connect needs DATABASE_URL and PUDING_AUTH_SECRET.");
    this.name = "OAuthUnavailableError";
  }
}

/**
 * Signed, single-use OAuth `state`: a 10-minute JWT carrying
 * `{ sub: userId, provider, nonce }`, whose nonce row in `oauth_states` is
 * deleted on first use, so replayed, expired or cross-provider states fail.
 */
@Injectable()
export class OAuthStateService {
  private readonly secret?: Uint8Array;

  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(DATABASE) private readonly connection: DatabaseConnection | null,
  ) {
    const secret = config.getPudingAuthSecret();
    if (secret) this.secret = new TextEncoder().encode(secret);
  }

  public isAvailable(): boolean {
    return Boolean(this.secret && this.connection);
  }

  public async issue(userId: string, provider: Provider): Promise<string> {
    if (!this.secret || !this.connection || !isUuid(userId)) {
      throw new OAuthUnavailableError();
    }
    const nonce = randomUUID();
    const expiresAt = new Date(Date.now() + STATE_TTL_MS);
    const { db } = this.connection;
    await db.delete(oauthStates).where(lt(oauthStates.expiresAt, new Date()));
    await db.insert(oauthStates).values({ nonce, userId, provider, expiresAt });
    return new SignJWT({ provider, nonce })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setAudience(OAUTH_STATE_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.secret);
  }

  /** The user the flow was started for, or null when `state` is not valid (any more). */
  public async consume(
    state: string | undefined,
    provider: Provider,
  ): Promise<string | null> {
    if (!state || !this.secret || !this.connection) return null;
    let userId: string;
    let nonce: string;
    try {
      const { payload } = await jwtVerify(state, this.secret, {
        audience: OAUTH_STATE_AUDIENCE,
        algorithms: ["HS256"],
      });
      if (payload.provider !== provider) return null;
      if (typeof payload.sub !== "string" || typeof payload.nonce !== "string")
        return null;
      userId = payload.sub;
      nonce = payload.nonce;
    } catch {
      return null;
    }
    const rows = await this.connection.db
      .delete(oauthStates)
      .where(
        and(
          eq(oauthStates.nonce, nonce),
          eq(oauthStates.userId, userId),
          eq(oauthStates.provider, provider),
          gt(oauthStates.expiresAt, new Date()),
        ),
      )
      .returning({ userId: oauthStates.userId });
    return rows[0]?.userId ?? null;
  }
}
