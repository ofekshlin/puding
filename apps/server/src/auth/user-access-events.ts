import { Injectable } from "@nestjs/common";

type RevokedListener = (userId: string) => void;

/** Tells live connections that a user lost access, so their sockets close. */
@Injectable()
export class UserAccessEvents {
  private readonly listeners = new Set<RevokedListener>();

  public onRevoked(listener: RevokedListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public revoked(userId: string): void {
    for (const listener of this.listeners) listener(userId);
  }
}
