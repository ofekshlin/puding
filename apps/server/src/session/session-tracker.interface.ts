import { SessionState } from "./session-state.interface";

/**
 * Abstract class representing a tracker for active sessions and their metadata/tokens.
 * This class serves as the NestJS Injection Token to decouple components from concrete providers.
 */
export abstract class SessionTracker {
  /**
   * Registers a new active session connection.
   */
  abstract registerSession(sessionId: string, clientIp: string): void;

  /**
   * Marks a session as disconnected.
   */
  abstract disconnectSession(sessionId: string): void;

  /**
   * Updates the accumulated token metrics for a session.
   */
  abstract updateTokens(
    sessionId: string,
    tokens: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    },
  ): void;

  /**
   * Retrieves all registered session states.
   */
  abstract getAllSessions(): SessionState[];

  /**
   * Retrieves the state of a specific session.
   */
  abstract getSession(sessionId: string): SessionState | undefined;
}
