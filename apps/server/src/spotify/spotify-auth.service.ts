import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "../config/config.service";
import { ConnectionEvents } from "../credentials/connection-events";
import {
  CredentialStore,
  ReadOnlyCredentialStoreError,
} from "../credentials/credential-store";
import { StoredCredential } from "../credentials/credential.types";

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
const API_BASE_URL = "https://api.spotify.com/v1";

/** A failed call to Spotify's token endpoint. */
export class SpotifyTokenError extends Error {
  constructor(
    public readonly status: number,
    public readonly invalidGrant: boolean,
  ) {
    super(`Spotify token request failed with status ${status}.`);
    this.name = "SpotifyTokenError";
  }
}

export type SpotifyProfile =
  | { kind: "ok"; label: string }
  | { kind: "not_allowlisted" }
  | { kind: "unknown" };
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

/**
 * Manages the Spotify OAuth2 token lifecycle.
 *
 * Each user's refresh token comes from "Connect Spotify"
 * (`SpotifyConnectController`) and is stored in their connection; at runtime
 * only the silent refresh grant is used, keyed by user.
 */
@Injectable()
export class SpotifyAuthService {
  private readonly logger = new Logger(SpotifyAuthService.name);
  private readonly accessTokens = new Map<
    string,
    { token: string; expiresAt: number }
  >();
  private readonly inFlightRefreshes = new Map<string, Promise<string>>();

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(CredentialStore) private readonly credentials: CredentialStore,
    @Inject(ConnectionEvents) connectionEvents: ConnectionEvents,
  ) {
    connectionEvents.onChanged((userId, provider) => {
      if (provider === "spotify") this.forget(userId);
    });
  }

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
   * Builds the Spotify consent URL for a user's connect flow.
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
  public async exchangeCode(
    code: string,
  ): Promise<{ refreshToken: string; accessToken: string }> {
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

    this.logger.log("Spotify authorization code exchanged successfully.");
    return {
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
    };
  }

  /**
   * The account's display name. In development mode Spotify answers 403 for
   * accounts missing from the app's Users Management list.
   */
  public async fetchProfile(accessToken: string): Promise<SpotifyProfile> {
    const response = await fetch(`${API_BASE_URL}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 403) return { kind: "not_allowlisted" };
    if (!response.ok) return { kind: "unknown" };
    const me = (await response.json()) as {
      display_name?: string | null;
      id?: string;
    };
    const label = me.display_name || me.id;
    return label ? { kind: "ok", label } : { kind: "unknown" };
  }

  /**
   * Returns a valid access token, refreshing it when it is expired or absent.
   */
  public async getAccessToken(userId: string): Promise<string> {
    const cached = this.accessTokens.get(userId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }
    return this.refreshAccessToken(userId);
  }

  /** Drops a user's cached access token, e.g. after they reconnected. */
  public forget(userId: string): void {
    this.accessTokens.delete(userId);
  }

  /**
   * Forces a token refresh, discarding the cached access token.
   */
  public async refreshAccessToken(userId: string): Promise<string> {
    let inFlight = this.inFlightRefreshes.get(userId);
    if (!inFlight) {
      inFlight = this.performRefresh(userId).finally(() => {
        this.inFlightRefreshes.delete(userId);
      });
      this.inFlightRefreshes.set(userId, inFlight);
    }
    return inFlight;
  }

  private async performRefresh(userId: string): Promise<string> {
    const credential = await this.credentials.get(userId, "spotify");
    if (!credential) {
      throw new Error(
        "Spotify isn't connected for this user. They can connect it in Puding's Settings.",
      );
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credential.secret.refreshToken,
    });

    let tokens: Awaited<ReturnType<SpotifyAuthService["requestToken"]>>;
    try {
      tokens = await this.requestToken(body);
    } catch (err) {
      if (err instanceof SpotifyTokenError && err.invalidGrant) {
        await this.credentials
          .markError(
            userId,
            "spotify",
            "Spotify sign-in expired or was revoked. Reconnect Spotify.",
          )
          .catch(() => undefined);
      }
      throw err;
    }
    this.accessTokens.set(userId, {
      token: tokens.access_token,
      expiresAt: Date.now() + tokens.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS,
    });
    if (
      tokens.refresh_token &&
      tokens.refresh_token !== credential.secret.refreshToken
    ) {
      await this.saveRotatedRefreshToken(
        userId,
        credential,
        tokens.refresh_token,
      );
    }
    this.logger.log(`Spotify access token refreshed for user ${userId}.`);
    return tokens.access_token;
  }

  private async saveRotatedRefreshToken(
    userId: string,
    credential: StoredCredential<"spotify">,
    refreshToken: string,
  ): Promise<void> {
    try {
      await this.credentials.save(userId, {
        ...credential,
        secret: { refreshToken },
      });
    } catch (err) {
      if (!(err instanceof ReadOnlyCredentialStoreError)) {
        this.logger.warn(
          `Could not store rotated Spotify refresh token for ${userId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
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
      throw new SpotifyTokenError(
        response.status,
        response.status === 400 && details.includes("invalid_grant"),
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
