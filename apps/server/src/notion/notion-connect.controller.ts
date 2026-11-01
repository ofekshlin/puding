import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  Post,
  Put,
  Query,
  Redirect,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser, UserGuard } from "../auth/user.guard";
import { ConfigService } from "../config/config.service";
import {
  OAuthStateService,
  OAuthUnavailableError,
} from "../connections/oauth-state";
import {
  CredentialStore,
  ReadOnlyCredentialStoreError,
} from "../credentials/credential-store";
import {
  ConnectionSummary,
  StoredCredential,
} from "../credentials/credential.types";
import { PudingUser } from "../users/user-directory";
import { NotionTokenManager } from "./notion-token-manager";

/** "Connect Notion" (public-connection OAuth) plus a paste-a-token fallback. */
@Controller("connections/notion")
export class NotionConnectController {
  private readonly logger = new Logger(NotionConnectController.name);

  constructor(
    @Inject(NotionTokenManager) private readonly notion: NotionTokenManager,
    @Inject(OAuthStateService) private readonly states: OAuthStateService,
    @Inject(CredentialStore) private readonly credentials: CredentialStore,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /** Whether this server can run the OAuth flow (the paste fallback always shows). */
  @Get("options")
  @UseGuards(UserGuard)
  public options(): { oauth: boolean } {
    return { oauth: this.notion.isConfigured() && this.states.isAvailable() };
  }

  @Post("authorize")
  @HttpCode(200)
  @UseGuards(UserGuard)
  public async authorize(
    @CurrentUser() user: PudingUser,
  ): Promise<{ url: string }> {
    if (!this.notion.isConfigured()) {
      throw new ServiceUnavailableException({ reason: "not_configured" });
    }
    try {
      const state = await this.states.issue(user.id, "notion");
      return { url: this.notion.buildAuthorizeUrl(state) };
    } catch (error) {
      if (error instanceof OAuthUnavailableError) {
        throw new ServiceUnavailableException({ reason: "no_database" });
      }
      throw error;
    }
  }

  /** Public: Notion redirects here; identity comes only from the signed `state`. */
  @Get("callback")
  @Redirect()
  public async callback(
    @Query("code") code?: string,
    @Query("state") state?: string,
    @Query("error") error?: string,
  ): Promise<{ url: string }> {
    const userId = await this.states.consume(state, "notion");
    if (!userId) return this.toSettings({ error: "notion_state" });
    if (error || !code) return this.toSettings({ error: "notion_denied" });
    try {
      const tokens = await this.notion.exchangeCode(code);
      await this.credentials.save(userId, {
        provider: "notion",
        kind: "oauth",
        secret: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
        settings: {
          workspaceId: tokens.workspaceId,
          workspaceIcon: tokens.workspaceIcon,
        },
        accountLabel: tokens.workspaceName,
        expiresAt: tokens.expiresAt,
      });
      this.logger.log(`Notion connected for user ${userId}.`);
      return this.toSettings({ connected: "notion" });
    } catch (err) {
      this.logger.error(
        `Notion connect failed for user ${userId}: ${err instanceof Error ? err.message : err}`,
      );
      return this.toSettings({ error: "notion_failed" });
    }
  }

  /** Saves a pasted Notion integration token after Notion accepts it. */
  @Put("token")
  @UseGuards(UserGuard)
  public async pasteToken(
    @CurrentUser() user: PudingUser,
    @Body() body: { token?: unknown } | undefined,
  ): Promise<ConnectionSummary> {
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token) throw new BadRequestException({ reason: "missing_token" });
    const check = await this.notion.validateToken(token);
    if (!check.ok) throw new BadRequestException({ reason: check.reason });
    const credential: StoredCredential<"notion"> = {
      provider: "notion",
      kind: "static_token",
      secret: { accessToken: token },
      settings: {},
      accountLabel: check.workspaceName,
    };
    try {
      await this.credentials.save(user.id, credential);
    } catch (error) {
      if (error instanceof ReadOnlyCredentialStoreError) {
        throw new ConflictException({ reason: "read_only" });
      }
      throw error;
    }
    const summary = (await this.credentials.listConnected(user.id)).find(
      (c) => c.provider === "notion",
    );
    return (
      summary ?? {
        provider: "notion",
        kind: "static_token",
        source: "db",
        settings: {},
        accountLabel: check.workspaceName,
      }
    );
  }

  private toSettings(params: Record<string, string>): { url: string } {
    const origin = this.config.getWebOrigins()[0];
    return { url: `${origin}/settings?${new URLSearchParams(params)}` };
  }
}
