import {
  Controller,
  Get,
  Inject,
  Query,
  Redirect,
  ServiceUnavailableException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { SpotifyAuthService } from "./spotify-auth.service";

/**
 * One-time provisioning routes for the Spotify authorization-code flow.
 * These are operator-facing: the resulting refresh token is stored in
 * `apps/server/.env` and reused silently by every later session.
 */
@Controller("spotify")
export class SpotifyAuthController {
  private readonly logger = new Logger(SpotifyAuthController.name);
  private pendingState?: string;

  constructor(
    @Inject(SpotifyAuthService)
    private readonly spotifyAuthService: SpotifyAuthService,
  ) {}

  /**
   * Redirects the operator to Spotify's consent screen.
   * Route: GET /spotify/login
   */
  @Get("login")
  @Redirect()
  public login(): { url: string } {
    this.assertConfigured();
    this.pendingState = randomUUID();
    return { url: this.spotifyAuthService.buildAuthorizeUrl(this.pendingState) };
  }

  /**
   * Handles the Spotify redirect and returns the refresh token to store.
   * Route: GET /spotify/callback
   */
  @Get("callback")
  public async callback(
    @Query("code") code?: string,
    @Query("state") state?: string,
    @Query("error") error?: string,
  ): Promise<string> {
    this.assertConfigured();

    if (error) {
      throw new BadRequestException(`Spotify authorization failed: ${error}`);
    }
    if (!code) {
      throw new BadRequestException(
        "Spotify authorization callback is missing the 'code' parameter.",
      );
    }
    if (!state || state !== this.pendingState) {
      throw new BadRequestException(
        "Spotify authorization state mismatch. Restart the flow at /spotify/login.",
      );
    }
    this.pendingState = undefined;

    const { refreshToken } = await this.spotifyAuthService.exchangeCode(code);
    this.logger.log(
      "Spotify refresh token issued. Store it as SPOTIFY_REFRESH_TOKEN in apps/server/.env.",
    );

    return [
      "Spotify authorized successfully.",
      "",
      "Add the following line to apps/server/.env and restart the server:",
      "",
      `SPOTIFY_REFRESH_TOKEN=${refreshToken}`,
    ].join("\n");
  }

  private assertConfigured(): void {
    if (!this.spotifyAuthService.isConfigured()) {
      throw new ServiceUnavailableException(
        "Spotify is not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in apps/server/.env.",
      );
    }
  }
}
