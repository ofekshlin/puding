import { CredentialStore } from "./credential-store";
import { ConnectionEvents } from "./connection-events";
import {
  ConnectionSummary,
  Provider,
  StoredCredential,
} from "./credential.types";

/** Announces every connection change so caches and live sessions can react. */
export class NotifyingCredentialStore extends CredentialStore {
  constructor(
    private readonly inner: CredentialStore,
    private readonly events: ConnectionEvents,
  ) {
    super();
  }

  public get<P extends Provider>(
    userId: string,
    provider: P,
  ): Promise<StoredCredential<P> | null> {
    return this.inner.get(userId, provider);
  }

  public listConnected(userId: string): Promise<ConnectionSummary[]> {
    return this.inner.listConnected(userId);
  }

  public async save<P extends Provider>(
    userId: string,
    credential: StoredCredential<P>,
  ): Promise<void> {
    await this.inner.save(userId, credential);
    this.events.changed(userId, credential.provider, "saved");
  }

  public async delete(userId: string, provider: Provider): Promise<void> {
    await this.inner.delete(userId, provider);
    this.events.changed(userId, provider, "deleted");
  }

  public async markError(
    userId: string,
    provider: Provider,
    message: string,
  ): Promise<void> {
    await this.inner.markError(userId, provider, message);
    this.events.changed(userId, provider, "errored");
  }
}
