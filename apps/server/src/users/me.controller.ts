import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { CredentialStore } from "../credentials/credential-store";
import { ConnectionSummary } from "../credentials/credential.types";
import { AllowPending, CurrentUser, UserGuard } from "../auth/user.guard";
import { PudingUser } from "./user-directory";

export interface MeResponse extends PudingUser {
  connections: ConnectionSummary[];
}

@Controller("me")
@UseGuards(UserGuard)
export class MeController {
  constructor(
    @Inject(CredentialStore) private readonly credentials: CredentialStore,
  ) {}

  /** The signed-in user, their status, and (once approved) their connections. */
  @Get()
  @AllowPending({ rejected: true })
  public async getMe(@CurrentUser() user: PudingUser): Promise<MeResponse> {
    const connections =
      user.status === "approved"
        ? await this.credentials.listConnected(user.id)
        : [];
    return { ...user, connections };
  }
}
