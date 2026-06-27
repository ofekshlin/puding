import { Injectable, Logger, Inject } from "@nestjs/common";
import WebSocket from "ws";
import { GeminiSession } from "./gemini.session";
import { LiveSessionService, LiveSession } from "../session/live-session.service";
import { SessionTracker } from "../session/session-tracker.interface";

@Injectable()
export class GeminiService extends LiveSessionService {
  private readonly logger = new Logger(GeminiService.name);

  constructor(
    @Inject(SessionTracker) private readonly sessionTracker: SessionTracker,
  ) {
    super();
  }

  /**
   * Spawns a stateful, isolated Gemini WebSocket bridge session.
   * 
   * @param clientWs WebSocket connection from the client.
   * @param apiKey The Google Gemini API key.
   * @param sessionId A unique identifier for the session.
   */
  public override createSession(clientWs: WebSocket, apiKey: string, sessionId: string): LiveSession {
    this.logger.log(`Spawning Gemini session for client [${sessionId}]`);
    return new GeminiSession(clientWs, apiKey, sessionId, this.sessionTracker);
  }
}
