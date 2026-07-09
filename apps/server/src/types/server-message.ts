/**
 * Message types sent by the server proxy to the client (web application).
 */
export type ServerMessage =
  | {
      type: "setup_complete";
    }
  | {
      type: "content";
      text?: string;
      audio?: string; // Base64 encoded 24kHz PCM audio chunk
      userTranscription?: string;
      turnComplete?: boolean;
      integration?: {
        type: "notion" | "spotify";
        data: any;
      };
    }
  | {
      type: "interrupted";
    };
