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
