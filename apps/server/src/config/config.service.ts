import { Injectable, Logger } from "@nestjs/common";
import dotenv from "dotenv";
import path from "path";

@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);
  private readonly geminiApiKey: string;
  private readonly port: number;
  private readonly notionToken: string;
  private readonly tavilyApiKey?: string;
  private readonly spotifyClientId?: string;
  private readonly spotifyClientSecret?: string;
  private readonly spotifyRefreshToken?: string;
  private readonly spotifyRedirectUri: string;
  private readonly commitSha: string;
  private readonly serviceName: string;
  private readonly preview: boolean;

  // Define required environment variables here for easy extension
  private readonly requiredEnvVars = ["GEMINI_API_KEY", "NOTION_TOKEN"];

  constructor() {
    // Resolve absolute path to apps/server/.env
    const envPath = path.resolve(__dirname, "../../.env");
    dotenv.config({ path: envPath });

    this.validateConfig(envPath);

    this.geminiApiKey = process.env.GEMINI_API_KEY as string;
    this.port = process.env.PORT ? parseInt(process.env.PORT, 10) : 6601;
    this.notionToken = process.env.NOTION_TOKEN as string;
    this.tavilyApiKey = process.env.TAVILY_API_KEY;
    this.spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
    this.spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    this.spotifyRefreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
    this.spotifyRedirectUri =
      process.env.SPOTIFY_REDIRECT_URI ??
      `http://localhost:${this.port}/spotify/callback`;
    this.commitSha = process.env.RENDER_GIT_COMMIT ?? "unknown";
    this.serviceName = process.env.RENDER_SERVICE_NAME ?? "local";
    this.preview = process.env.IS_PULL_REQUEST === "true";
  }

  private validateConfig(envPath: string): void {
    const missingVars = this.requiredEnvVars.filter(
      (envVar) => !process.env[envVar],
    );

    if (missingVars.length > 0) {
      const errorMessage = `CRITICAL CONFIGURATION ERROR: Missing required environment variables: ${missingVars.join(", ")}. Attempted loading from: ${envPath}`;
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Retrieves the Google Gemini API key.
   */
  public getGeminiApiKey(): string {
    return this.geminiApiKey;
  }

  /**
   * Retrieves the port number the WebSocket server listens on.
   */
  public getPort(): number {
    return this.port;
  }

  /**
   * Retrieves the Notion integration token.
   */
  public getNotionToken(): string {
    return this.notionToken;
  }

  /**
   * Retrieves the Tavily API key.
   */
  public getTavilyApiKey(): string | undefined {
    return this.tavilyApiKey;
  }

  /**
   * Retrieves the Spotify application client ID.
   */
  public getSpotifyClientId(): string | undefined {
    return this.spotifyClientId;
  }

  /**
   * Retrieves the Spotify application client secret.
   */
  public getSpotifyClientSecret(): string | undefined {
    return this.spotifyClientSecret;
  }

  /**
   * Retrieves the stored Spotify refresh token used for silent re-authorization.
   */
  public getSpotifyRefreshToken(): string | undefined {
    return this.spotifyRefreshToken;
  }

  /**
   * Retrieves the Spotify OAuth2 redirect URI used during provisioning.
   */
  public getSpotifyRedirectUri(): string {
    return this.spotifyRedirectUri;
  }

  /**
   * Retrieves the git commit the running instance was built from.
   */
  public getCommitSha(): string {
    return this.commitSha;
  }

  /**
   * Retrieves the name of the deployed service instance.
   */
  public getServiceName(): string {
    return this.serviceName;
  }

  /**
   * Indicates whether this instance is a per-pull-request preview deployment.
   */
  public isPreview(): boolean {
    return this.preview;
  }
}
