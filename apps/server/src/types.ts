// TypeScript type definitions for the Puding WebSocket proxy server and client

/**
 * Message types received from the client (web application) by the server proxy.
 */
export type ClientMessage =
  | {
      type: "setup";
      config: ClientSetupConfig;
    }
  | {
      type: "client_content";
      content: {
        turns: Array<{
          role: string;
          parts: Array<{ text: string }>;
        }>;
        turnComplete?: boolean;
      };
    }
  | Buffer; // Binary raw 16kHz PCM audio chunk

/**
 * Setup configuration sent by the client.
 */
export interface ClientSetupConfig {
  model?: string;
  generationConfig?: {
    responseModalities?: string[];
    speechConfig?: {
      voiceConfig?: {
        prebuiltVoiceConfig?: {
          voiceName?: string;
        };
      };
    };
  };
  systemInstruction?: string;
}

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
    }
  | {
      type: "interrupted";
    };

/**
 * Message types sent by the server proxy to Gemini.
 */
export type GeminiClientMessage =
  | {
      setup: {
        model: string;
        generationConfig?: {
          responseModalities?: string[];
          speechConfig?: {
            voiceConfig?: {
              prebuiltVoiceConfig?: {
                voiceName?: string;
              };
            };
          };
        };
        systemInstruction?: {
          parts: Array<{ text: string }>;
        };
      };
    }
  | {
      clientContent: {
        turns: Array<{
          role: string;
          parts: Array<{ text: string }>;
        }>;
        turnComplete?: boolean;
      };
    }
  | {
      realtimeInput: {
        audio: {
          mimeType: string; // "audio/pcm"
          data: string; // Base64 PCM data
        };
      };
    };

/**
 * Message types received by the server proxy from Gemini.
 */
export interface GeminiServerMessage {
  setupComplete?: Record<string, never>;
  serverContent?: {
    modelTurn?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string; // Base64 PCM data
        };
      }>;
    };
    turnComplete?: boolean;
    interrupted?: boolean;
  };
}
