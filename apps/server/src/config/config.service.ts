import { Injectable, Logger } from "@nestjs/common";
import dotenv from "dotenv";
import path from "path";
import {
  ENV_CREDENTIAL_SCOPES,
  EnvCredentialScope,
} from "../credentials/credential.types";

export const SIGNUP_MODES = ["allowlist", "request", "open"] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];

const DEFAULT_WEB_ORIGIN = "http://localhost:6600";

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
  private readonly accessToken?: string;
  private readonly devinApiKey?: string;
  private readonly devinOrgId?: string;
  private readonly devinDefaultRepo?: string;
  private readonly devinRepoAliases: Record<string, string>;
  private readonly devinMaxAcuPerSession: number;
  private readonly devinMaxActiveSessions: number;
  private readonly devinEnabledInPreview: boolean;
  private readonly devinPollIntervalMs: number;
  private readonly devinMaxWatchedUsers: number;
  private readonly maxSocketsPerUser: number;
  private readonly tavilyDailyLimitPerUser: number;
  private readonly databaseUrl?: string;
  private readonly credentialsEncryptionKeys?: string;
  private readonly envCredentialsScope: EnvCredentialScope;
  private readonly pudingAuthSecret?: string;
  private readonly adminEmails: string[];
  private readonly signupMode: SignupMode;
  private readonly allowedEmails: string[];
  private readonly webOrigins: string[];

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
    this.accessToken = process.env.PUDING_ACCESS_TOKEN || undefined;
    this.devinApiKey = process.env.DEVIN_API_KEY || undefined;
    this.devinOrgId = process.env.DEVIN_ORG_ID || undefined;
    this.devinDefaultRepo = process.env.DEVIN_DEFAULT_REPO || undefined;
    this.devinRepoAliases = ConfigService.parseAliases(
      process.env.DEVIN_REPO_ALIASES,
    );
    this.devinMaxAcuPerSession = ConfigService.parsePositiveInt(
      process.env.DEVIN_MAX_ACU_PER_SESSION,
      10,
    );
    this.devinMaxActiveSessions = ConfigService.parsePositiveInt(
      process.env.DEVIN_MAX_ACTIVE_SESSIONS,
      3,
    );
    this.devinEnabledInPreview = process.env.DEVIN_ENABLE_IN_PREVIEW === "true";
    this.devinPollIntervalMs = Math.max(
      ConfigService.parsePositiveInt(process.env.DEVIN_POLL_INTERVAL_MS, 20000),
      5000,
    );
    this.devinMaxWatchedUsers = ConfigService.parsePositiveInt(
      process.env.DEVIN_MAX_WATCHED_USERS,
      10,
    );
    this.maxSocketsPerUser = ConfigService.parsePositiveInt(
      process.env.MAX_SOCKETS_PER_USER,
      3,
    );
    this.tavilyDailyLimitPerUser = ConfigService.parsePositiveInt(
      process.env.TAVILY_DAILY_LIMIT_PER_USER,
      100,
    );
    this.databaseUrl = process.env.DATABASE_URL || undefined;
    this.credentialsEncryptionKeys =
      process.env.CREDENTIALS_ENCRYPTION_KEYS || undefined;
    this.envCredentialsScope = this.parseEnvCredentialsScope(
      process.env.ENV_CREDENTIALS_FOR,
    );
    this.pudingAuthSecret = process.env.PUDING_AUTH_SECRET || undefined;
    this.adminEmails = ConfigService.parseEmails(process.env.ADMIN_EMAILS);
    this.signupMode = this.parseSignupMode(process.env.SIGNUP_MODE);
    this.allowedEmails = ConfigService.parseEmails(process.env.ALLOWED_EMAILS);
    this.webOrigins = (process.env.WEB_ORIGIN || DEFAULT_WEB_ORIGIN)
      .split(",")
      .map((origin) => origin.trim().replace(/\/+$/, ""))
      .filter(Boolean);
  }

  private parseSignupMode(raw: string | undefined): SignupMode {
    const value = (raw ?? "").trim().toLowerCase();
    if (!value) return "request";
    if ((SIGNUP_MODES as readonly string[]).includes(value)) {
      return value as SignupMode;
    }
    this.logger.warn(
      `SIGNUP_MODE="${raw}" is not one of ${SIGNUP_MODES.join(", ")}; using "request".`,
    );
    return "request";
  }

  private static parseEmails(raw: string | undefined): string[] {
    return (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
  }

  private parseEnvCredentialsScope(
    raw: string | undefined,
  ): EnvCredentialScope {
    const value = (raw ?? "").trim().toLowerCase();
    if (!value) return "none";
    if ((ENV_CREDENTIAL_SCOPES as readonly string[]).includes(value)) {
      return value as EnvCredentialScope;
    }
    this.logger.warn(
      `ENV_CREDENTIALS_FOR="${raw}" is not one of ${ENV_CREDENTIAL_SCOPES.join(", ")}; using "none".`,
    );
    return "none";
  }

  private static parsePositiveInt(
    raw: string | undefined,
    fallback: number,
  ): number {
    const value = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private static parseAliases(raw: string | undefined): Record<string, string> {
    const aliases: Record<string, string> = {};
    for (const entry of (raw ?? "").split(",")) {
      const [alias, repo] = entry.split("=").map((part) => part?.trim());
      if (alias && repo) aliases[alias.toLowerCase()] = repo;
    }
    return aliases;
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

  /**
   * Retrieves the shared secret WebSocket clients must present, if configured.
   */
  public getAccessToken(): string | undefined {
    return this.accessToken;
  }

  /**
   * Retrieves the Devin API token (personal access token or service-user key).
   */
  public getDevinApiKey(): string | undefined {
    return this.devinApiKey;
  }

  /**
   * Retrieves the Devin organization ID (`org-…`).
   */
  public getDevinOrgId(): string | undefined {
    return this.devinOrgId;
  }

  /**
   * Retrieves the repository (`owner/name`) Devin works on when none is named.
   */
  public getDevinDefaultRepo(): string | undefined {
    return this.devinDefaultRepo;
  }

  /**
   * Retrieves spoken repository aliases, keyed by lower-case alias.
   */
  public getDevinRepoAliases(): Record<string, string> {
    return this.devinRepoAliases;
  }

  /**
   * Retrieves the ACU cap applied to every Puding-created Devin session.
   */
  public getDevinMaxAcuPerSession(): number {
    return this.devinMaxAcuPerSession;
  }

  /**
   * Retrieves how many Puding-created Devin sessions may work at once.
   */
  public getDevinMaxActiveSessions(): number {
    return this.devinMaxActiveSessions;
  }

  /**
   * Whether Devin tools may be registered in a pull-request preview.
   */
  public isDevinEnabledInPreview(): boolean {
    return this.devinEnabledInPreview;
  }

  /**
   * How often Devin sessions are polled while a client is connected (min 5s).
   */
  public getDevinPollIntervalMs(): number {
    return this.devinPollIntervalMs;
  }

  /**
   * How many users may have their Devin sessions polled at the same time.
   */
  public getDevinMaxWatchedUsers(): number {
    return this.devinMaxWatchedUsers;
  }

  /**
   * How many voice sockets one user may have open at once.
   */
  public getMaxSocketsPerUser(): number {
    return this.maxSocketsPerUser;
  }

  /**
   * How many shared Tavily searches each user may run per UTC day.
   */
  public getTavilyDailyLimitPerUser(): number {
    return this.tavilyDailyLimitPerUser;
  }

  /**
   * Retrieves the Postgres connection string; unset means no database.
   */
  public getDatabaseUrl(): string | undefined {
    return this.databaseUrl;
  }

  /**
   * Retrieves the `version:base64key` list used to encrypt stored credentials.
   */
  public getCredentialsEncryptionKeys(): string | undefined {
    return this.credentialsEncryptionKeys;
  }

  /**
   * Which users may fall back to the server's env credentials when a database exists.
   */
  public getEnvCredentialsScope(): EnvCredentialScope {
    return this.envCredentialsScope;
  }

  /**
   * Retrieves the secret shared with the web app for signing Puding tokens; unset keeps the legacy access token.
   */
  public getPudingAuthSecret(): string | undefined {
    return this.pudingAuthSecret;
  }

  /**
   * Retrieves the lowercase emails that are always approved admins.
   */
  public getAdminEmails(): string[] {
    return [...this.adminEmails];
  }

  /** How new Google accounts are admitted (`SIGNUP_MODE`, default `request`). */
  public getSignupMode(): SignupMode {
    return this.signupMode;
  }

  /** Emails approved on first sign-in in `allowlist` mode (`ALLOWED_EMAILS`). */
  public getAllowedEmails(): string[] {
    return [...this.allowedEmails];
  }

  /** Web app origins allowed by CORS (`WEB_ORIGIN`, comma-separated). */
  public getWebOrigins(): string[] {
    return [...this.webOrigins];
  }
}
