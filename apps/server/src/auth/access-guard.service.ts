import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash, timingSafeEqual } from "crypto";
import { IncomingMessage } from "http";
import { ConfigService } from "../config/config.service";

export const ACCESS_TOKEN_QUERY_PARAM = "token";
export const UNAUTHORIZED_CLOSE_CODE = 4401;

/** Reads `?token=` from an upgrade request; browsers cannot set WebSocket headers. */
export function readQueryToken(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    return url.searchParams.get(ACCESS_TOKEN_QUERY_PARAM);
  } catch {
    return null;
  }
}

/**
 * Gatekeeper for WebSocket upgrades. When `PUDING_ACCESS_TOKEN` is configured,
 * a client must present the same value in the `?token=` query parameter.
 */
@Injectable()
export class AccessGuard {
  private readonly logger = new Logger(AccessGuard.name);
  private readonly expectedDigest?: Buffer;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const token = configService.getAccessToken();
    if (token) {
      this.expectedDigest = AccessGuard.digest(token);
    } else {
      this.logger.warn(
        "PUDING_ACCESS_TOKEN is not set: the WebSocket gateway accepts any client. Set it in every deployed environment.",
      );
    }
  }

  public isEnabled(): boolean {
    return this.expectedDigest !== undefined;
  }

  /**
   * Checks the token carried by an upgrade request. Both sides are hashed first
   * so the comparison is constant-time regardless of the presented length.
   */
  public isAuthorized(req: IncomingMessage): boolean {
    return this.isTokenValid(readQueryToken(req));
  }

  public isTokenValid(presented: string | null | undefined): boolean {
    if (!this.expectedDigest) return true;
    if (!presented) return false;

    return timingSafeEqual(AccessGuard.digest(presented), this.expectedDigest);
  }

  private static digest(value: string): Buffer {
    return createHash("sha256").update(value).digest();
  }
}
