import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { PudingUser } from "../users/user-directory";

/** Runs after `UserGuard`; admits only admins. */
@Injectable()
export class AdminGuard implements CanActivate {
  public canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest<{ user?: PudingUser }>().user;
    if (user?.role !== "admin") {
      throw new ForbiddenException({ reason: "admin_only" });
    }
    return true;
  }
}
