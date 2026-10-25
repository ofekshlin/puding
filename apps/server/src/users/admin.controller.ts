import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { AuthService } from "../auth/auth.service";
import { UserAccessEvents } from "../auth/user-access-events";
import { CurrentUser, UserGuard } from "../auth/user.guard";
import { isUuid } from "../database/database";
import { SignupPolicy } from "./signup-policy";
import { PudingUser, UserDirectory, UserStatus } from "./user-directory";

const STATUSES: readonly UserStatus[] = ["pending", "approved", "rejected"];

@Controller("admin/users")
@UseGuards(UserGuard, AdminGuard)
export class AdminController {
  constructor(
    @Inject(UserDirectory) private readonly users: UserDirectory,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SignupPolicy) private readonly policy: SignupPolicy,
    @Inject(UserAccessEvents) private readonly events: UserAccessEvents,
  ) {}

  @Get()
  public async list(
    @Query("status") status?: string,
  ): Promise<{ users: PudingUser[] }> {
    if (status && !STATUSES.includes(status as UserStatus)) {
      throw new BadRequestException({ reason: "invalid_status" });
    }
    return { users: await this.users.list(status as UserStatus | undefined) };
  }

  @Post(":id/approve")
  public approve(
    @CurrentUser() admin: PudingUser,
    @Param("id") id: string,
  ): Promise<PudingUser> {
    return this.decide(admin, id, "approved");
  }

  /** Rejects a request; for an approved user this revokes access. */
  @Post(":id/reject")
  public reject(
    @CurrentUser() admin: PudingUser,
    @Param("id") id: string,
  ): Promise<PudingUser> {
    return this.decide(admin, id, "rejected");
  }

  private async decide(
    admin: PudingUser,
    id: string,
    status: UserStatus,
  ): Promise<PudingUser> {
    const target = await this.users.findById(id);
    if (!target) throw new NotFoundException({ reason: "unknown_user" });
    if (
      status === "rejected" &&
      (target.id === admin.id || this.policy.isAdminEmail(target.email))
    ) {
      throw new BadRequestException({ reason: "cannot_reject_admin" });
    }
    const updated = await this.users.update(id, {
      status,
      decidedBy: isUuid(admin.id) ? admin.id : null,
    });
    if (!updated) throw new NotFoundException({ reason: "unknown_user" });
    this.auth.forget(id);
    if (status === "rejected" && target.status === "approved") {
      this.events.revoked(id);
    }
    return updated;
  }
}
