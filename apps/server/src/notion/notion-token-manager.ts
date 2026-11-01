import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "../config/config.service";
import {
  CredentialStore,
  ReadOnlyCredentialStoreError,
} from "../credentials/credential-store";
import { StoredCredential } from "../credentials/credential.types";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const REFRESH_MARGIN_MS = 60_000;
const VALIDATE_TIMEOUT_MS = 10_000;

export interface NotionOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  workspaceId?: string;
  workspaceName?: string;
  workspaceIcon?: string;
}

/** A failed call to Notion's token endpoint. */
export class NotionTokenError extends Error {
  constructor(
    public readonly status: number,
    public readonly invalidGrant: boolean,
  ) {
    super(`Notion token request failed with status ${status}.`);
    this.name = "NotionTokenError";
  }
}

export type NotionTokenCheck =
  | { ok: true; workspaceName?: string }
  | { ok: false; reason: "rejected" | "unreachable" };

interface NotionTokenResponse {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number | null;
  workspace_id?: string | null;
  workspace_name?: string | null;
  workspace_icon?: string | null;
}

/**
 * Notion public-connection OAuth: consent URL, code exchange and the
 * `refresh_token` grant for expiring tokens. Pasted tokens pass through.
 */
@Injectable()
export class NotionTokenManager {
  private readonly logger = new Logger(NotionTokenManager.name);
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(CredentialStore) private readonly credentials: CredentialStore,
  ) {}

  public isConfigured(): boolean {
    return Boolean(
      this.config.getNotionOAuthClientId() &&
      this.config.getNotionOAuthClientSecret(),
    );
  }

  /** Notion's consent screen, where the user picks the pages Puding may use. */
  public buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.getNotionOAuthClientId() ?? "",
      response_type: "code",
      owner: "user",
      redirect_uri: this.config.getNotionOAuthRedirectUri(),
      state,
    });
    return `${NOTION_API}/oauth/authorize?${params}`;
  }

  public async exchangeCode(code: string): Promise<NotionOAuthTokens> {
    return this.requestToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.config.getNotionOAuthRedirectUri(),
    });
  }

  /** Checks a pasted integration token with `GET /v1/users/me`. */
  public async validateToken(token: string): Promise<NotionTokenCheck> {
    let response: Response;
    try {
      response = await fetch(`${NOTION_API}/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_VERSION,
        },
        signal: AbortSignal.timeout(VALIDATE_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, reason: "unreachable" };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "rejected" };
    }
    if (!response.ok) return { ok: false, reason: "unreachable" };
    const me = (await response.json()) as {
      bot?: { workspace_name?: string | null };
    };
    return { ok: true, workspaceName: me.bot?.workspace_name ?? undefined };
  }

  /** The token to call Notion with, refreshed first when it is about to expire. */
  public async accessTokenFor(
    userId: string,
    credential: StoredCredential<"notion">,
  ): Promise<string> {
    const { refreshToken } = credential.secret;
    const expiring =
      credential.expiresAt &&
      credential.expiresAt.getTime() - REFRESH_MARGIN_MS < Date.now();
    if (credential.kind !== "oauth" || !refreshToken || !expiring) {
      return credential.secret.accessToken;
    }
    let pending = this.inFlight.get(userId);
    if (!pending) {
      pending = this.refresh(userId, credential, refreshToken).finally(() =>
        this.inFlight.delete(userId),
      );
      this.inFlight.set(userId, pending);
    }
    return pending;
  }

  private async refresh(
    userId: string,
    credential: StoredCredential<"notion">,
    refreshToken: string,
  ): Promise<string> {
    let tokens: NotionOAuthTokens;
    try {
      tokens = await this.requestToken({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      });
    } catch (err) {
      if (err instanceof NotionTokenError && err.invalidGrant) {
        await this.credentials
          .markError(
            userId,
            "notion",
            "Notion access expired or was revoked. Reconnect Notion.",
          )
          .catch(() => undefined);
      }
      throw err;
    }
    try {
      await this.credentials.save(userId, {
        ...credential,
        secret: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? refreshToken,
        },
        expiresAt: tokens.expiresAt,
      });
    } catch (err) {
      if (!(err instanceof ReadOnlyCredentialStoreError)) {
        this.logger.warn(
          `Could not store refreshed Notion token for ${userId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    this.logger.log(`Notion access token refreshed for user ${userId}.`);
    return tokens.accessToken;
  }

  private async requestToken(
    body: Record<string, string>,
  ): Promise<NotionOAuthTokens> {
    const clientId = this.config.getNotionOAuthClientId();
    const clientSecret = this.config.getNotionOAuthClientSecret();
    if (!clientId || !clientSecret) {
      throw new Error(
        "NOTION_OAUTH_CLIENT_ID and NOTION_OAUTH_CLIENT_SECRET must be set.",
      );
    }
    const response = await fetch(`${NOTION_API}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const details = await response.text();
      this.logger.error(
        `Notion token request failed with status ${response.status}: ${details}`,
      );
      throw new NotionTokenError(
        response.status,
        response.status === 400 && details.includes("invalid_grant"),
      );
    }
    const tokens = (await response.json()) as NotionTokenResponse;
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : undefined,
      workspaceId: tokens.workspace_id ?? undefined,
      workspaceName: tokens.workspace_name ?? undefined,
      workspaceIcon: tokens.workspace_icon ?? undefined,
    };
  }
}
