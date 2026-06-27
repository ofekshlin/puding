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
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}
