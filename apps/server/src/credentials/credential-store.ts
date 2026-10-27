import {
  ConnectionSummary,
  Provider,
  StoredCredential,
} from "./credential.types";

/**
 * Per-user provider credentials. Injected by this abstract class so callers do
 * not know whether they come from Postgres, env vars or both.
 */
export abstract class CredentialStore {
  abstract get<P extends Provider>(
    userId: string,
    provider: P,
  ): Promise<StoredCredential<P> | null>;

  abstract save<P extends Provider>(
    userId: string,
    credential: StoredCredential<P>,
  ): Promise<void>;

  abstract delete(userId: string, provider: Provider): Promise<void>;

  abstract listConnected(userId: string): Promise<ConnectionSummary[]>;

  abstract markError(
    userId: string,
    provider: Provider,
    message: string,
  ): Promise<void>;
}

export class ReadOnlyCredentialStoreError extends Error {
  constructor(provider: Provider) {
    super(
      `The ${provider} credential comes from server environment variables and cannot be changed here.`,
    );
    this.name = "ReadOnlyCredentialStoreError";
  }
}
