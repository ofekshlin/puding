import WebSocket from "ws";
import { LiveSession } from "./live-session.interface";
import { PudingUser } from "../users/user-directory";

/**
 * Abstract class representing a factory/manager for LiveSession instances.
 * This class serves as the NestJS Injection Token to decouple components from concrete providers.
 */
export abstract class LiveSessionService {
  /**
   * Spawns a stateful, isolated live model session.
   *
   * @param clientWs WebSocket connection from the client.
   * @param apiKey The API key for the live model provider.
   * @param sessionId A unique identifier for the session.
   * @param user The authenticated Puding user who owns the session.
   */
  abstract createSession(
    clientWs: WebSocket,
    apiKey: string,
    sessionId: string,
    user: PudingUser,
  ): LiveSession;
}
export { LiveSession };
