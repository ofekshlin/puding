import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  HttpCode,
  Inject,
  Param,
  Put,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser, UserGuard } from "../auth/user.guard";
import {
  CredentialStore,
  ReadOnlyCredentialStoreError,
} from "../credentials/credential-store";
import {
  ConnectionSummary,
  PROVIDERS,
  Provider,
} from "../credentials/credential.types";
import { PudingUser } from "../users/user-directory";
import {
  DevinConnectionInput,
  DevinConnectionService,
  DevinKeyError,
} from "./devin-connection.service";

/** The signed-in user's own provider connections. */
@Controller("connections")
@UseGuards(UserGuard)
export class ConnectionsController {
  constructor(
    @Inject(CredentialStore) private readonly credentials: CredentialStore,
    @Inject(DevinConnectionService)
    private readonly devin: DevinConnectionService,
  ) {}

  /** Saves a Devin PAT after checking it against the Devin API. */
  @Put("devin")
  public async connectDevin(
    @CurrentUser() user: PudingUser,
    @Body() body: DevinConnectionInput | undefined,
  ): Promise<ConnectionSummary> {
    try {
      return await this.devin.connect(user.id, body ?? {});
    } catch (error) {
      if (error instanceof DevinKeyError) {
        throw new BadRequestException({ reason: error.reason });
      }
      if (error instanceof ReadOnlyCredentialStoreError) {
        throw new ConflictException({ reason: "read_only" });
      }
      throw error;
    }
  }

  /** Disconnects a provider; the user's live sessions reconnect without its tools. */
  @Delete(":provider")
  @HttpCode(204)
  public async disconnect(
    @CurrentUser() user: PudingUser,
    @Param("provider") provider: string,
  ): Promise<void> {
    if (!PROVIDERS.includes(provider as Provider)) {
      throw new BadRequestException({ reason: "unknown_provider" });
    }
    try {
      await this.credentials.delete(user.id, provider as Provider);
    } catch (error) {
      if (error instanceof ReadOnlyCredentialStoreError) {
        throw new ConflictException({ reason: "read_only" });
      }
      throw error;
    }
  }
}
