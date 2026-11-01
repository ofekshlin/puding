import { Injectable } from "@nestjs/common";

type UserListener = (userId: string) => void;

/** Tells live connections that a user lost access or deleted their account, so their sockets close. */
@Injectable()
export class UserAccessEvents {
  private readonly listeners = new Set<UserListener>();
  private readonly deletedListeners = new Set<UserListener>();

  public onRevoked(listener: UserListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public revoked(userId: string): void {
    for (const listener of this.listeners) listener(userId);
  }

  public onDeleted(listener: UserListener): () => void {
    this.deletedListeners.add(listener);
    return () => this.deletedListeners.delete(listener);
  }

  public deleted(userId: string): void {
    for (const listener of this.deletedListeners) listener(userId);
  }
}
