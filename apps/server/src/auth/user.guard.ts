import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IncomingHttpHeaders } from "http";
import { PudingUser, UserStatus } from "../users/user-directory";
import { AuthService } from "./auth.service";

const ALLOW_PENDING = "puding:allowPending";

export interface AllowPendingOptions {
  /** Also admit rejected users (only `GET /me`, which drives the invite-only screen). */
  rejected?: boolean;
}

/** Lets verified users who are not yet approved reach this route. */
export const AllowPending = (options: AllowPendingOptions = {}) =>
  SetMetadata(ALLOW_PENDING, options);

interface AuthenticatedRequest {
  headers: IncomingHttpHeaders;
  user?: PudingUser;
}

/** The user `UserGuard` attached to the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PudingUser | undefined =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

/**
 * REST counterpart of the WebSocket check: verifies `Authorization: Bearer`
 * and requires an approved user unless the route is marked `@AllowPending()`.
 */
@Injectable()
export class UserGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  public async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const options = this.reflector.getAllAndOverride<
      AllowPendingOptions | undefined
    >(ALLOW_PENDING, [ctx.getHandler(), ctx.getClass()]);

    const allowed: UserStatus[] = ["approved"];
    if (options) allowed.push("pending");
    if (options?.rejected) allowed.push("rejected");

    const result = await this.auth.authenticate(
      UserGuard.bearer(req.headers.authorization),
      allowed,
    );
    if (!result.ok) {
      const body = { reason: result.reason };
      if (result.reason === "pending" || result.reason === "rejected") {
        throw new ForbiddenException(body);
      }
      throw new UnauthorizedException(body);
    }
    req.user = result.user;
    return true;
  }

  private static bearer(header: string | undefined): string | null {
    const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
    return match ? match[1].trim() : null;
  }
}
