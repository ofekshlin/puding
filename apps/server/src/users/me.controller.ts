import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { AllowPending, CurrentUser, UserGuard } from "../auth/user.guard";
import { SignupMode } from "../config/config.service";
import { CredentialStore } from "../credentials/credential-store";
import { ConnectionSummary } from "../credentials/credential.types";
import { SignupPolicy } from "./signup-policy";
import { PudingUser, UserDirectory } from "./user-directory";

export const MAX_REQUEST_NOTE_LENGTH = 500;

export interface MeResponse extends PudingUser {
  connections: ConnectionSummary[];
  signupMode: SignupMode;
  /** Admins only: access requests waiting for a decision. */
  pendingRequests?: number;
}

@Controller("me")
@UseGuards(UserGuard)
export class MeController {
  constructor(
    @Inject(CredentialStore) private readonly credentials: CredentialStore,
    @Inject(UserDirectory) private readonly users: UserDirectory,
    @Inject(SignupPolicy) private readonly policy: SignupPolicy,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  /** The signed-in user, their status, and (once approved) their connections. */
  @Get()
  @AllowPending({ rejected: true })
  public async getMe(@CurrentUser() user: PudingUser): Promise<MeResponse> {
    const connections =
      user.status === "approved"
        ? await this.credentials.listConnected(user.id)
        : [];
    const me: MeResponse = {
      ...user,
      connections,
      signupMode: this.policy.getMode(),
    };
    if (user.role === "admin" && user.status === "approved") {
      me.pendingRequests = (await this.users.list("pending")).length;
    }
    return me;
  }

  /** A pending user asks an admin for access (only in `request` mode). */
  @Post("access-request")
  @AllowPending()
  public async requestAccess(
    @CurrentUser() user: PudingUser,
    @Body() body: { note?: unknown } | undefined,
  ): Promise<MeResponse> {
    if (this.policy.getMode() !== "request") {
      throw new ConflictException({ reason: "requests_closed" });
    }
    if (user.status !== "pending") {
      throw new ConflictException({ reason: "not_pending" });
    }
    const note =
      typeof body?.note === "string"
        ? body.note.trim().slice(0, MAX_REQUEST_NOTE_LENGTH) || null
        : null;
    const updated = await this.users.recordAccessRequest(user.id, note);
    if (!updated) {
      throw new ServiceUnavailableException({ reason: "no_database" });
    }
    this.auth.forget(updated.id);
    return { ...updated, connections: [], signupMode: this.policy.getMode() };
  }
}
