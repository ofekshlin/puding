import {
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  Post,
  Query,
  Redirect,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { and, count, eq, ne } from "drizzle-orm";
import { CurrentUser, UserGuard } from "../auth/user.guard";
import { ConfigService } from "../config/config.service";
import {
  OAuthStateService,
  OAuthUnavailableError,
} from "../connections/oauth-state";
import { CredentialStore } from "../credentials/credential-store";
import { DATABASE, DatabaseConnection } from "../database/database";
import { connections } from "../database/schema";
import { PudingUser } from "../users/user-directory";
import { SpotifyAuthService } from "./spotify-auth.service";

/** Spotify apps in development mode allow at most five users, owner included. */
export const SPOTIFY_DEV_MODE_LIMIT = 5;

export interface SpotifySlots {
  used: number;
  max: number;
  /** False when the server has no Spotify app or cannot run OAuth. */
  available: boolean;
}

/** "Connect Spotify" for each signed-in user (authorization-code flow). */
@Controller("connections/spotify")
export class SpotifyConnectController {
  private readonly logger = new Logger(SpotifyConnectController.name);

  constructor(
    @Inject(SpotifyAuthService) private readonly spotify: SpotifyAuthService,
    @Inject(OAuthStateService) private readonly states: OAuthStateService,
    @Inject(CredentialStore) private readonly credentials: CredentialStore,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DATABASE) private readonly connection: DatabaseConnection | null,
  ) {}

  /** How many of the development-mode Spotify user slots are taken. */
  @Get("slots")
  @UseGuards(UserGuard)
  public async slots(): Promise<SpotifySlots> {
    return {
      used: await this.usedSlots(),
      max: SPOTIFY_DEV_MODE_LIMIT,
      available: this.spotify.isConfigured() && this.states.isAvailable(),
    };
  }

  /** Returns Spotify's consent URL; the browser navigates to it. */
  @Post("authorize")
  @HttpCode(200)
  @UseGuards(UserGuard)
  public async authorize(
    @CurrentUser() user: PudingUser,
  ): Promise<{ url: string }> {
    if (!this.spotify.isConfigured()) {
      throw new ServiceUnavailableException({ reason: "not_configured" });
    }
    const existing = await this.credentials.get(user.id, "spotify");
    if (!existing && (await this.usedSlots()) >= SPOTIFY_DEV_MODE_LIMIT) {
      throw new ConflictException({ reason: "spotify_full" });
    }
    try {
      const state = await this.states.issue(user.id, "spotify");
      return { url: this.spotify.buildAuthorizeUrl(state) };
    } catch (error) {
      if (error instanceof OAuthUnavailableError) {
        throw new ServiceUnavailableException({ reason: "no_database" });
      }
      throw error;
    }
  }

  /** Public: Spotify redirects here; identity comes only from the signed `state`. */
  @Get("callback")
  @Redirect()
  public async callback(
    @Query("code") code?: string,
    @Query("state") state?: string,
    @Query("error") error?: string,
  ): Promise<{ url: string }> {
    const userId = await this.states.consume(state, "spotify");
    if (!userId) return this.toSettings({ error: "spotify_state" });
    if (error || !code) return this.toSettings({ error: "spotify_denied" });

    try {
      const tokens = await this.spotify.exchangeCode(code);
      const profile = await this.spotify.fetchProfile(tokens.accessToken);
      if (profile.kind === "not_allowlisted") {
        return this.toSettings({ error: "spotify_not_allowlisted" });
      }
      await this.credentials.save(userId, {
        provider: "spotify",
        kind: "oauth",
        secret: { refreshToken: tokens.refreshToken },
        settings: {},
        accountLabel: profile.kind === "ok" ? profile.label : undefined,
      });
      this.logger.log(`Spotify connected for user ${userId}.`);
      return this.toSettings({ connected: "spotify" });
    } catch (err) {
      this.logger.error(
        `Spotify connect failed for user ${userId}: ${err instanceof Error ? err.message : err}`,
      );
      return this.toSettings({ error: "spotify_failed" });
    }
  }

  private toSettings(params: Record<string, string>): { url: string } {
    const origin = this.config.getWebOrigins()[0];
    return { url: `${origin}/settings?${new URLSearchParams(params)}` };
  }

  /** Users with their own Spotify row, plus the owner while env credentials still serve. */
  private async usedSlots(): Promise<number> {
    const envOwner =
      this.config.getSpotifyRefreshToken() &&
      this.config.getEnvCredentialsScope() !== "none"
        ? 1
        : 0;
    if (!this.connection) return envOwner;
    const [row] = await this.connection.db
      .select({ n: count() })
      .from(connections)
      .where(
        and(
          eq(connections.provider, "spotify"),
          ne(connections.kind, "disconnected"),
        ),
      );
    return Number(row?.n ?? 0) + envOwner;
  }
}
