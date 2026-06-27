import { ClientSetupConfig } from "../types";

/**
 * Interface representing a generic live AI model session (e.g., Gemini Live, OpenAI Realtime).
 */
export interface LiveSession {
  /**
   * The unique identifier for the session.
   */
  readonly sessionId: string;

  /**
   * Forwards a setup configuration payload to the live API.
   */
  sendSetup(config: ClientSetupConfig): void;

  /**
   * Forwards client conversational turns/content to the live API.
   */
  sendClientContent(content: any): void;

  /**
   * Translates and sends raw PCM audio binary buffer to the live API.
   */
  sendAudio(pcmData: Buffer): void;

  /**
   * Cleans up all connections and resources associated with the session.
   */
  destroy(): void;
}
