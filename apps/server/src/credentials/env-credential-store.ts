import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "../config/config.service";
import {
  CredentialStore,
  ReadOnlyCredentialStoreError,
} from "./credential-store";
import {
  ConnectionSummary,
  PROVIDERS,
  Provider,
  StoredCredential,
} from "./credential.types";

/**
 * Serves the server's own env credentials (`NOTION_TOKEN`,
 * `SPOTIFY_REFRESH_TOKEN`, `DEVIN_*`) to whichever user asks. Without a
 * database it is the whole store, behind the implicit `local` user; with one,
 * `LayeredCredentialStore` decides who may fall back to it.
 */
@Injectable()
export class EnvCredentialStore extends CredentialStore {
  private readonly logger = new Logger(EnvCredentialStore.name);
  private readonly errors = new Map<Provider, string>();

  constructor(private readonly config: ConfigService) {
    super();
  }

  public async get<P extends Provider>(
    _userId: string,
    provider: P,
  ): Promise<StoredCredential<P> | null> {
    return this.credentialFor(provider);
  }

  public async save<P extends Provider>(
    _userId: string,
    credential: StoredCredential<P>,
  ): Promise<void> {
    throw new ReadOnlyCredentialStoreError(credential.provider);
  }

  public async delete(_userId: string, provider: Provider): Promise<void> {
    throw new ReadOnlyCredentialStoreError(provider);
  }

  public async listConnected(_userId: string): Promise<ConnectionSummary[]> {
    const summaries: ConnectionSummary[] = [];
    for (const provider of PROVIDERS) {
      const credential = this.credentialFor(provider);
      if (!credential) continue;
      summaries.push({
        provider,
        kind: credential.kind,
        source: "env",
        settings: credential.settings,
        accountLabel: credential.accountLabel,
        lastError: this.errors.get(provider),
      });
    }
    return summaries;
  }

  public async markError(
    _userId: string,
    provider: Provider,
    message: string,
  ): Promise<void> {
    this.logger.warn(
      `Env ${provider} credential marked as failing: ${message}`,
    );
    this.errors.set(provider, message);
  }

  private credentialFor<P extends Provider>(
    provider: P,
  ): StoredCredential<P> | null {
    return (this.build(provider) as StoredCredential<P> | null) ?? null;
  }

  private build(provider: Provider): StoredCredential | null {
    switch (provider) {
      case "notion": {
        const accessToken = this.config.getNotionToken();
        return accessToken
          ? {
              provider,
              kind: "static_token",
              secret: { accessToken },
              settings: {},
              accountLabel: "Server Notion integration",
            }
          : null;
      }
      case "spotify": {
        const refreshToken = this.config.getSpotifyRefreshToken();
        return refreshToken
          ? {
              provider,
              kind: "oauth",
              secret: { refreshToken },
              settings: {},
              accountLabel: "Server Spotify account",
            }
          : null;
      }
      case "devin": {
        const apiKey = this.config.getDevinApiKey();
        const orgId = this.config.getDevinOrgId();
        const allowedHere =
          !this.config.isPreview() || this.config.isDevinEnabledInPreview();
        if (!apiKey || !orgId || !allowedHere) return null;
        return {
          provider,
          kind: "static_token",
          secret: { apiKey, orgId },
          settings: {
            defaultRepo: this.config.getDevinDefaultRepo(),
            repoAliases: this.config.getDevinRepoAliases(),
          },
          accountLabel: orgId,
        };
      }
    }
  }
}
