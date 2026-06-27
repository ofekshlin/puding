import { Injectable, Logger } from "@nestjs/common";
import { SessionTracker } from "./session-tracker.interface";
import { SessionState } from "./session-state.interface";

@Injectable()
export class SessionTrackerService implements SessionTracker {
  private readonly logger = new Logger(SessionTrackerService.name);
  private readonly sessions = new Map<string, SessionState>();

  /**
   * Registers a new active session connection.
   */
  public registerSession(sessionId: string, clientIp: string): void {
    this.logger.log(`Registering session [${sessionId}] from IP: ${clientIp}`);
    this.sessions.set(sessionId, {
      sessionId,
      status: "connected",
      createdAt: new Date(),
      clientIp,
      tokens: {
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
      },
    });
  }

  /**
   * Marks a session as disconnected.
   */
  public disconnectSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.logger.log(`Session [${sessionId}] disconnected.`);
      session.status = "disconnected";
      session.disconnectedAt = new Date();
    } else {
      this.logger.warn(`Attempted to disconnect unregistered session [${sessionId}].`);
    }
  }

  /**
   * Updates the accumulated token metrics for a session.
   */
  public updateTokens(
    sessionId: string,
    tokens: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    },
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const oldTokens = { ...session.tokens };
      session.tokens = {
        promptTokenCount: tokens.promptTokenCount ?? session.tokens.promptTokenCount,
        candidatesTokenCount: tokens.candidatesTokenCount ?? session.tokens.candidatesTokenCount,
        totalTokenCount: tokens.totalTokenCount ?? session.tokens.totalTokenCount,
      };
      this.logger.log(
        `Updated tokens for session [${sessionId}]: ` +
        `Prompt: ${oldTokens.promptTokenCount} -> ${session.tokens.promptTokenCount}, ` +
        `Candidates: ${oldTokens.candidatesTokenCount} -> ${session.tokens.candidatesTokenCount}, ` +
        `Total: ${oldTokens.totalTokenCount} -> ${session.tokens.totalTokenCount}`
      );
    } else {
      this.logger.warn(`Attempted to update tokens for unregistered session [${sessionId}].`);
    }
  }

  /**
   * Retrieves all registered session states.
   */
  public getAllSessions(): SessionState[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Retrieves the state of a specific session.
   */
  public getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }
}
