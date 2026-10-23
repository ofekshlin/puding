import { CredentialStore } from "./credential-store";
import {
  ConnectionSummary,
  EnvCredentialScope,
  Provider,
  StoredCredential,
} from "./credential.types";
import { EnvCredentialStore } from "./env-credential-store";
import { PostgresCredentialStore } from "./postgres-credential-store";
import { UserDirectory } from "../users/user-directory";

/**
 * The store used whenever a database exists: the user's own rows first, then
 * the server's env credentials for the users `ENV_CREDENTIALS_FOR` allows.
 * Writes always go to Postgres, and any row (including a disconnect
 * tombstone) wins over the env fallback.
 */
export class LayeredCredentialStore extends CredentialStore {
  constructor(
    private readonly primary: PostgresCredentialStore,
    private readonly fallback: EnvCredentialStore,
    private readonly users: UserDirectory,
    private readonly scope: EnvCredentialScope,
  ) {
    super();
  }

  public async get<P extends Provider>(
    userId: string,
    provider: P,
  ): Promise<StoredCredential<P> | null> {
    const own = await this.primary.get(userId, provider);
    if (own) return own;
    if (!(await this.fallbackAllowed(userId))) return null;
    if (await this.primary.isDisconnected(userId, provider)) return null;
    return this.fallback.get(userId, provider);
  }

  public async save<P extends Provider>(
    userId: string,
    credential: StoredCredential<P>,
  ): Promise<void> {
    await this.primary.save(userId, credential);
  }

  public async delete(userId: string, provider: Provider): Promise<void> {
    const envWouldApply =
      (await this.fallbackAllowed(userId)) &&
      (await this.fallback.get(userId, provider)) !== null;
    if (envWouldApply) {
      await this.primary.tombstone(userId, provider);
    } else {
      await this.primary.delete(userId, provider);
    }
  }

  public async listConnected(userId: string): Promise<ConnectionSummary[]> {
    const own = await this.primary.listConnected(userId);
    if (!(await this.fallbackAllowed(userId))) return own;

    const disconnected = new Set(
      await this.primary.disconnectedProviders(userId),
    );
    const covered = new Set(own.map((summary) => summary.provider));
    const env = (await this.fallback.listConnected(userId)).filter(
      (summary) =>
        !covered.has(summary.provider) && !disconnected.has(summary.provider),
    );
    return [...own, ...env];
  }

  public async markError(
    userId: string,
    provider: Provider,
    message: string,
  ): Promise<void> {
    if (await this.primary.get(userId, provider)) {
      await this.primary.markError(userId, provider, message);
    } else if (await this.fallbackAllowed(userId)) {
      await this.fallback.markError(userId, provider, message);
    }
  }

  private async fallbackAllowed(userId: string): Promise<boolean> {
    switch (this.scope) {
      case "all":
        return true;
      case "admins":
        return (await this.users.findById(userId))?.role === "admin";
      case "none":
        return false;
    }
  }
}
