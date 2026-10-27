import { Inject, Injectable, Logger } from "@nestjs/common";
import { errors, jwtVerify } from "jose";
import { ConfigService } from "../config/config.service";
import { LOCAL_USER } from "../users/env-user-directory";
import {
  NewUserDefaults,
  PudingUser,
  UserDirectory,
  UserStatus,
} from "../users/user-directory";
import { AccessGuard } from "./access-guard.service";

export const PUDING_TOKEN_AUDIENCE = "puding-backend";
const MIN_SECRET_BYTES = 32;
const STATUS_CACHE_TTL_MS = 30_000;

export type AuthFailureReason =
  "missing" | "invalid" | "expired" | "pending" | "rejected";

export type AuthResult =
  { ok: true; user: PudingUser } | { ok: false; reason: AuthFailureReason };

/**
 * Turns the short-lived Puding token minted by the web app (HS256, signed with
 * `PUDING_AUTH_SECRET`) into a Puding user. While the secret is unset, the
 * legacy `PUDING_ACCESS_TOKEN` check applies and every client is the local user.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secret?: Uint8Array;
  private readonly adminEmails: Set<string>;
  private readonly cache = new Map<string, { user: PudingUser; at: number }>();

  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(UserDirectory) private readonly users: UserDirectory,
    @Inject(AccessGuard) private readonly accessGuard: AccessGuard,
  ) {
    const secret = config.getPudingAuthSecret();
    if (secret) {
      this.secret = new TextEncoder().encode(secret);
      if (this.secret.length < MIN_SECRET_BYTES) {
        throw new Error(
          `PUDING_AUTH_SECRET must be at least ${MIN_SECRET_BYTES} bytes (e.g. openssl rand -base64 32).`,
        );
      }
    } else {
      this.logger.warn(
        "PUDING_AUTH_SECRET is not set: Google sign-in is off and clients use the legacy access token.",
      );
    }
    this.adminEmails = new Set(config.getAdminEmails());
  }

  /** True once Google sign-in tokens are required. */
  public isEnabled(): boolean {
    return this.secret !== undefined;
  }

  /**
   * Verifies a token and checks that the user's status is one of `allowed`.
   */
  public async authenticate(
    token: string | null | undefined,
    allowed: readonly UserStatus[] = ["approved"],
  ): Promise<AuthResult> {
    const result = await this.identify(token);
    if (!result.ok) return result;
    if (!allowed.includes(result.user.status)) {
      return {
        ok: false,
        reason: result.user.status === "rejected" ? "rejected" : "pending",
      };
    }
    return result;
  }

  /** Drops cached users so a status change applies on the next request. */
  public forget(userId: string): void {
    for (const [sub, entry] of this.cache) {
      if (entry.user.id === userId) this.cache.delete(sub);
    }
  }

  private async identify(
    token: string | null | undefined,
  ): Promise<AuthResult> {
    if (!this.secret) {
      if (!this.accessGuard.isTokenValid(token)) {
        return { ok: false, reason: token ? "invalid" : "missing" };
      }
      return { ok: true, user: { ...LOCAL_USER } };
    }
    if (!token) return { ok: false, reason: "missing" };

    let claims: { sub: string; email: string; name?: string; picture?: string };
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        audience: PUDING_TOKEN_AUDIENCE,
        algorithms: ["HS256"],
        requiredClaims: ["exp", "sub"],
      });
      if (
        typeof payload.sub !== "string" ||
        typeof payload.email !== "string"
      ) {
        return { ok: false, reason: "invalid" };
      }
      claims = {
        sub: payload.sub,
        email: payload.email,
        name: typeof payload.name === "string" ? payload.name : undefined,
        picture:
          typeof payload.picture === "string" ? payload.picture : undefined,
      };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof errors.JWTExpired ? "expired" : "invalid",
      };
    }

    const cached = this.cache.get(claims.sub);
    if (cached && Date.now() - cached.at < STATUS_CACHE_TTL_MS) {
      return { ok: true, user: cached.user };
    }

    const user = await this.users.upsertFromGoogle(
      {
        googleSub: claims.sub,
        email: claims.email,
        name: claims.name,
        pictureUrl: claims.picture,
      },
      this.defaultsFor(claims.email),
    );
    this.cache.set(claims.sub, { user, at: Date.now() });
    return { ok: true, user };
  }

  private defaultsFor(email: string): NewUserDefaults {
    return this.adminEmails.has(email.toLowerCase())
      ? { role: "admin", status: "approved" }
      : { role: "user", status: "pending" };
  }
}
