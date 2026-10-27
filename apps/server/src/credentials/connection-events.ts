import { Injectable } from "@nestjs/common";
import { Provider } from "./credential.types";

/** `errored` keeps the connection listed; live sessions are left alone. */
export type ConnectionChange = "saved" | "deleted" | "errored";

type ConnectionListener = (
  userId: string,
  provider: Provider,
  change: ConnectionChange,
) => void;

/**
 * Tells caches and live sessions that a user's provider connection changed
 * (connected, disconnected or marked as errored).
 */
@Injectable()
export class ConnectionEvents {
  private readonly listeners = new Set<ConnectionListener>();

  public onChanged(listener: ConnectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public changed(
    userId: string,
    provider: Provider,
    change: ConnectionChange,
  ): void {
    for (const listener of this.listeners) listener(userId, provider, change);
  }
}
