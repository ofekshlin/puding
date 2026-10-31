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
        type: "notion" | "spotify" | "search" | "devin";
        data: any;
      };
    }
  | {
      type: "interrupted";
    }
  | {
      /** Sent before closing with 4401: some proxies (Render) drop close codes. */
      type: "unauthorized";
    }
  | {
      /** A provider was connected or disconnected; the client should reconnect. */
      type: "connections_changed";
      provider: "spotify" | "notion" | "devin";
    }
  | {
      /** Sent before closing: the user already has `limit` sockets open. */
      type: "too_many_sessions";
      limit: number;
    };
