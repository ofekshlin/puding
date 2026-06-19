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
