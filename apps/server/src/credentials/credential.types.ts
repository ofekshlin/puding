export const PROVIDERS = ["spotify", "notion", "devin"] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface SpotifySecret {
  refreshToken: string;
}

export interface NotionSecret {
  accessToken: string;
  refreshToken?: string;
}

export interface DevinSecret {
  apiKey: string;
  orgId: string;
}

export interface ProviderSecrets {
  spotify: SpotifySecret;
  notion: NotionSecret;
  devin: DevinSecret;
}

export type CredentialKind = "oauth" | "static_token";

export interface StoredCredential<P extends Provider = Provider> {
  provider: P;
  kind: CredentialKind;
  /** Decrypted secret. Lives in server memory only; never logged or sent to a client. */
  secret: ProviderSecrets[P];
  /** Non-secret settings, e.g. Devin default repo and aliases. */
  settings: Record<string, unknown>;
  accountLabel?: string;
  expiresAt?: Date;
}

/** Where a connection comes from: the user's own row, or the server's env vars. */
export type CredentialSource = "db" | "env";

/** A connection as shown to its user. Never carries secrets. */
export interface ConnectionSummary {
  provider: Provider;
  kind: CredentialKind;
  source: CredentialSource;
  settings: Record<string, unknown>;
  accountLabel?: string;
  expiresAt?: Date;
  connectedAt?: Date;
  lastError?: string;
}

/** Who may fall back to the server's env credentials when they have no row of their own. */
export type EnvCredentialScope = "none" | "admins" | "all";
export const ENV_CREDENTIAL_SCOPES: readonly EnvCredentialScope[] = [
  "none",
  "admins",
  "all",
];
