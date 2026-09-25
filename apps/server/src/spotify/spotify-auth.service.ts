import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "../config/config.service";

/**
 * OAuth2 scopes required to search, control playback, and manage playlists.
 */
export const SPOTIFY_SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
  "playlist-modify-private",
  "playlist-modify-public",
];

const ACCOUNTS_BASE_URL = "https://accounts.spotify.com";
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

/**
 * Manages the Spotify OAuth2 token lifecycle.
 *
 * The refresh token is provisioned once through the authorization-code flow
 * (see `SpotifyAuthController`) and then stored server-side as
 * `SPOTIFY_REFRESH_TOKEN`. At runtime only the silent refresh grant is used.
 */
@Injectable()
export class SpotifyAuthService {
  private readonly logger = new Logger(SpotifyAuthService.name);
  private accessToken?: string;
  private expiresAt = 0;
  private inFlightRefresh?: Promise<string>;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  /**
   * Returns whether the client credentials needed for any OAuth2 call exist.
   */
  public isConfigured(): boolean {
    return Boolean(
      this.configService.getSpotifyClientId() &&
        this.configService.getSpotifyClientSecret(),
    );
  }

  /**
   * Builds the Spotify authorization URL used for one-time provisioning.
   */
  public buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.requireClientCredentials().clientId,
      scope: SPOTIFY_SCOPES.join(" "),
      redirect_uri: this.configService.getSpotifyRedirectUri(),
      state,
    });

    return `${ACCOUNTS_BASE_URL}/authorize?${params.toString()}`;
  }

  /**
   * Exchanges an authorization code for a long-lived refresh token.
   */
  public async exchangeCode(code: string): Promise<{ refreshToken: string }> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.configService.getSpotifyRedirectUri(),
    });

    const tokens = await this.requestToken(body);
    if (!tokens.refresh_token) {
      throw new Error(
        "Spotify did not return a refresh token for this authorization code.",
      );
    }

    this.cacheAccessToken(tokens.access_token, tokens.expires_in);
    this.logger.log("Spotify authorization code exchanged successfully.");
    return { refreshToken: tokens.refresh_token };
  }

  /**
   * Returns a valid access token, refreshing it when it is expired or absent.
   */
  public async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt) {
      return this.accessToken;
    }
    return this.refreshAccessToken();
  }

  /**
   * Forces a token refresh, discarding the cached access token.
   */
  public async refreshAccessToken(): Promise<string> {
    if (!this.inFlightRefresh) {
      this.inFlightRefresh = this.performRefresh().finally(() => {
        this.inFlightRefresh = undefined;
      });
    }
    return this.inFlightRefresh;
  }

  private async performRefresh(): Promise<string> {
    const refreshToken = this.configService.getSpotifyRefreshToken();
    if (!refreshToken) {
      throw new Error(
        "SPOTIFY_REFRESH_TOKEN is not defined in the environment. Authorize Spotify once via GET /spotify/login.",
      );
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const tokens = await this.requestToken(body);
    this.cacheAccessToken(tokens.access_token, tokens.expires_in);
    this.logger.log("Spotify access token refreshed.");
    return tokens.access_token;
  }

  private cacheAccessToken(accessToken: string, expiresIn: number): void {
    this.accessToken = accessToken;
    this.expiresAt = Date.now() + expiresIn * 1000 - TOKEN_EXPIRY_MARGIN_MS;
  }

  private async requestToken(body: URLSearchParams): Promise<{
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  }> {
    const { clientId, clientSecret } = this.requireClientCredentials();
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64",
    );

    const response = await fetch(`${ACCOUNTS_BASE_URL}/api/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const details = await response.text();
      this.logger.error(
        `Spotify token request failed with status ${response.status}: ${details}`,
      );
      throw new Error(
        `Spotify token request failed with status ${response.status}.`,
      );
    }

    return response.json() as Promise<{
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    }>;
  }

  private requireClientCredentials(): {
    clientId: string;
    clientSecret: string;
  } {
    const clientId = this.configService.getSpotifyClientId();
    const clientSecret = this.configService.getSpotifyClientSecret();

    if (!clientId || !clientSecret) {
      throw new Error(
        "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be defined in the environment.",
      );
    }

    return { clientId, clientSecret };
  }
}
