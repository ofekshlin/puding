import { Injectable, Logger } from "@nestjs/common";
import WebSocket from "ws";
import { GeminiSession } from "./gemini.session";

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);

  /**
   * Spawns a stateful, isolated Gemini WebSocket bridge session.
   * 
   * @param clientWs WebSocket connection from the client.
   * @param apiKey The Google Gemini API key.
   * @param sessionId A unique identifier for the session.
   */
  public createSession(clientWs: WebSocket, apiKey: string, sessionId: string): GeminiSession {
    this.logger.log(`Spawning Gemini session for client [${sessionId}]`);
    return new GeminiSession(clientWs, apiKey, sessionId);
  }
}
