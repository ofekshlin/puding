import { Logger } from "@nestjs/common";
import { and, eq, ne } from "drizzle-orm";
import { isUuid, type Database } from "../database/database";
import { connections } from "../database/schema";
import { CredentialStore } from "./credential-store";
import {
  CredentialCipher,
  CredentialDecryptionError,
} from "./credential-cipher";
import {
  ConnectionSummary,
  Provider,
  StoredCredential,
} from "./credential.types";

const CACHE_TTL_MS = 5 * 60 * 1000;

type ConnectionRow = typeof connections.$inferSelect;

/** What a user's row says about a provider: a usable credential, or an explicit disconnect. */
type RowState =
  | { disconnected: false; credential: StoredCredential | null }
  | { disconnected: true };

/**
 * Encrypted per-user credentials in the `connections` table, with a short
 * in-process cache that every write for the same user and provider evicts.
 */
export class PostgresCredentialStore extends CredentialStore {
  private readonly logger = new Logger(PostgresCredentialStore.name);
  private readonly cache = new Map<
    string,
    { state: RowState | null; at: number }
  >();

  constructor(
    private readonly db: Database,
    private readonly cipher: CredentialCipher,
    private readonly now: () => number = Date.now,
  ) {
    super();
  }

  public async get<P extends Provider>(
    userId: string,
    provider: P,
  ): Promise<StoredCredential<P> | null> {
    const state = await this.load(userId, provider);
    if (!state || state.disconnected) return null;
    return state.credential as StoredCredential<P> | null;
  }

  /** Whether the user explicitly disconnected this provider (a tombstone row). */
  public async isDisconnected(
    userId: string,
    provider: Provider,
  ): Promise<boolean> {
    return (await this.load(userId, provider))?.disconnected === true;
  }

  public async save<P extends Provider>(
    userId: string,
    credential: StoredCredential<P>,
  ): Promise<void> {
    const encrypted = this.cipher.encrypt(
      credential.secret,
      CredentialCipher.additionalData(userId, credential.provider),
    );
    const values = {
      kind: credential.kind,
      secretCipher: encrypted.cipher,
      keyVersion: encrypted.keyVersion,
      accountLabel: credential.accountLabel ?? null,
      settings: credential.settings,
      expiresAt: credential.expiresAt ?? null,
      connectedAt: new Date(this.now()),
      lastError: null,
    };
    await this.db
      .insert(connections)
      .values({ userId, provider: credential.provider, ...values })
      .onConflictDoUpdate({
        target: [connections.userId, connections.provider],
        set: values,
      });
    this.evict(userId, credential.provider);
  }

  public async delete(userId: string, provider: Provider): Promise<void> {
    if (!isUuid(userId)) return;
    await this.db
      .delete(connections)
      .where(
        and(eq(connections.userId, userId), eq(connections.provider, provider)),
      );
    this.evict(userId, provider);
  }

  /** Replaces the user's row with a secret-less tombstone that suppresses any env fallback. */
  public async tombstone(userId: string, provider: Provider): Promise<void> {
    const values = {
      kind: "disconnected" as const,
      secretCipher: null,
      keyVersion: null,
      accountLabel: null,
      settings: {},
      expiresAt: null,
      connectedAt: new Date(this.now()),
      lastError: null,
    };
    await this.db
      .insert(connections)
      .values({ userId, provider, ...values })
      .onConflictDoUpdate({
        target: [connections.userId, connections.provider],
        set: values,
      });
    this.evict(userId, provider);
  }

  public async listConnected(userId: string): Promise<ConnectionSummary[]> {
    if (!isUuid(userId)) return [];
    const rows = await this.db
      .select({
        provider: connections.provider,
        kind: connections.kind,
        settings: connections.settings,
        accountLabel: connections.accountLabel,
        expiresAt: connections.expiresAt,
        connectedAt: connections.connectedAt,
        lastError: connections.lastError,
      })
      .from(connections)
      .where(
        and(
          eq(connections.userId, userId),
          ne(connections.kind, "disconnected"),
        ),
      );
    return rows.map((row) => ({
      provider: row.provider,
      kind: row.kind as StoredCredential["kind"],
      source: "db",
      settings: row.settings,
      accountLabel: row.accountLabel ?? undefined,
      expiresAt: row.expiresAt ?? undefined,
      connectedAt: row.connectedAt,
      lastError: row.lastError ?? undefined,
    }));
  }

  /** Providers the user has explicitly disconnected. */
  public async disconnectedProviders(userId: string): Promise<Provider[]> {
    if (!isUuid(userId)) return [];
    const rows = await this.db
      .select({ provider: connections.provider })
      .from(connections)
      .where(
        and(
          eq(connections.userId, userId),
          eq(connections.kind, "disconnected"),
        ),
      );
    return rows.map((row) => row.provider);
  }

  public async markError(
    userId: string,
    provider: Provider,
    message: string,
  ): Promise<void> {
    if (!isUuid(userId)) return;
    await this.db
      .update(connections)
      .set({ lastError: message })
      .where(
        and(
          eq(connections.userId, userId),
          eq(connections.provider, provider),
          ne(connections.kind, "disconnected"),
        ),
      );
    this.evict(userId, provider);
  }

  private async load(
    userId: string,
    provider: Provider,
  ): Promise<RowState | null> {
    if (!isUuid(userId)) return null;
    const key = `${userId}:${provider}`;
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.at < CACHE_TTL_MS) return cached.state;

    const [row] = await this.db
      .select()
      .from(connections)
      .where(
        and(eq(connections.userId, userId), eq(connections.provider, provider)),
      )
      .limit(1);
    const state = row ? await this.decode(row) : null;
    this.cache.set(key, { state, at: this.now() });
    return state;
  }

  private async decode(row: ConnectionRow): Promise<RowState> {
    if (row.kind === "disconnected") return { disconnected: true };
    if (!row.secretCipher || row.keyVersion === null) {
      this.logger.error(
        `Connection ${row.provider} for user ${row.userId} has no stored secret.`,
      );
      return { disconnected: false, credential: null };
    }

    const additionalData = CredentialCipher.additionalData(
      row.userId,
      row.provider,
    );
    let secret: unknown;
    try {
      secret = this.cipher.decrypt(
        { cipher: row.secretCipher, keyVersion: row.keyVersion },
        additionalData,
      );
    } catch (error) {
      if (!(error instanceof CredentialDecryptionError)) throw error;
      this.logger.error(
        `Connection ${row.provider} for user ${row.userId}: ${error.message}`,
      );
      await this.db
        .update(connections)
        .set({ lastError: "Stored credential could not be read; reconnect." })
        .where(
          and(
            eq(connections.userId, row.userId),
            eq(connections.provider, row.provider),
          ),
        );
      return { disconnected: false, credential: null };
    }

    if (row.keyVersion !== this.cipher.currentKeyVersion) {
      await this.reencrypt(row, secret, additionalData);
    }

    return {
      disconnected: false,
      credential: {
        provider: row.provider,
        kind: row.kind,
        secret,
        settings: row.settings,
        accountLabel: row.accountLabel ?? undefined,
        expiresAt: row.expiresAt ?? undefined,
      } as StoredCredential,
    };
  }

  private async reencrypt(
    row: ConnectionRow,
    secret: unknown,
    additionalData: string,
  ): Promise<void> {
    try {
      const encrypted = this.cipher.encrypt(secret, additionalData);
      await this.db
        .update(connections)
        .set({
          secretCipher: encrypted.cipher,
          keyVersion: encrypted.keyVersion,
        })
        .where(
          and(
            eq(connections.userId, row.userId),
            eq(connections.provider, row.provider),
            eq(connections.keyVersion, row.keyVersion as number),
          ),
        );
      this.logger.log(
        `Re-encrypted ${row.provider} for user ${row.userId} from key v${row.keyVersion} to v${encrypted.keyVersion}.`,
      );
    } catch (error) {
      this.logger.warn(
        `Could not re-encrypt ${row.provider} for user ${row.userId}: ${(error as Error).message}`,
      );
    }
  }

  private evict(userId: string, provider: Provider): void {
    this.cache.delete(`${userId}:${provider}`);
  }
}
