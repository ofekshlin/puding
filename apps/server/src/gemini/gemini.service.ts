import { Injectable, Logger, Inject } from "@nestjs/common";
import WebSocket from "ws";
import { GeminiSession } from "./gemini.session";
import {
  LiveSessionService,
  LiveSession,
} from "../session/live-session.service";
import { SessionTracker } from "../session/session-tracker.interface";
import { SessionToolResolver } from "./session-tool-resolver";
import { DevinWatcher } from "../devin/devin-watcher.service";
import { PudingUser } from "../users/user-directory";

@Injectable()
export class GeminiService extends LiveSessionService {
  private readonly logger = new Logger(GeminiService.name);

  constructor(
    @Inject(SessionTracker) private readonly sessionTracker: SessionTracker,
    @Inject(SessionToolResolver)
    private readonly toolResolver: SessionToolResolver,
    @Inject(DevinWatcher) private readonly devinWatcher: DevinWatcher,
  ) {
    super();
  }

  /**
   * Spawns a stateful, isolated Gemini WebSocket bridge session.
   *
   * @param clientWs WebSocket connection from the client.
   * @param apiKey The Google Gemini API key.
   * @param sessionId A unique identifier for the session.
   * @param user The authenticated Puding user who owns the session.
   */
  public override createSession(
    clientWs: WebSocket,
    apiKey: string,
    sessionId: string,
    user: PudingUser,
  ): LiveSession {
    this.logger.log(
      `Spawning Gemini session for client [${sessionId}] (user ${user.id})`,
    );
    return new GeminiSession(
      clientWs,
      apiKey,
      sessionId,
      user.id,
      this.sessionTracker,
      this.toolResolver.resolve(user.id),
      this.devinWatcher.isEnabled() ? this.devinWatcher : undefined,
    );
  }
}
