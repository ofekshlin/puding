import WebSocket from "ws";
import { Logger } from "@nestjs/common";
import {
  ClientSetupConfig,
  GeminiClientMessage,
  GeminiServerMessage,
  ServerMessage,
} from "../types";

export class GeminiSession {
  private readonly logger: Logger;
  private readonly geminiWs: WebSocket;
  private isGeminiReady = false;
  private readonly sendQueue: Array<string | Buffer> = [];

  constructor(
    private readonly clientWs: WebSocket,
    private readonly apiKey: string,
    private readonly sessionId: string,
  ) {
    this.logger = new Logger(`${GeminiSession.name}[${sessionId}]`);
    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

    this.logger.log("Initiating connection to Gemini Live API...");
    this.geminiWs = new WebSocket(geminiUrl);

    this.initialize();
  }

  /**
   * Binds lifecycle event listeners to the Gemini WebSocket connection.
   */
  private initialize(): void {
    this.geminiWs.on("open", () => {
      this.logger.log("Connected to Gemini Live API.");
      this.isGeminiReady = true;
      this.flushQueue();
    });

    this.geminiWs.on("message", (data: WebSocket.Data) => {
      this.handleGeminiMessage(data);
    });

    this.geminiWs.on("close", (code, reason) => {
      this.logger.log(`Gemini connection closed (code: ${code}, reason: ${reason.toString()})`);
      this.closeClient(1000, "Gemini session ended");
    });

    this.geminiWs.on("error", (error) => {
      this.logger.error("Gemini WebSocket error:", error);
      this.sendToClient({ type: "content", text: "[System Error: Gemini connection failed]" });
      this.closeClient(1011, "Gemini connection error");
    });
  }

  /**
   * Processes a message received from Gemini and maps/forwards it to the client.
   */
  private handleGeminiMessage(data: WebSocket.Data): void {
    try {
      const rawText = data.toString();
      const response = JSON.parse(rawText) as GeminiServerMessage;

      if (response.setupComplete) {
        this.logger.log("Setup handshake confirmed by Gemini.");
        this.sendToClient({ type: "setup_complete" });
        return;
      }

      const content = response.serverContent;
      if (!content) return;

      if (content.interrupted) {
        this.logger.log("Gemini model execution interrupted (barge-in).");
        this.sendToClient({ type: "interrupted" });
        return;
      }

      if (content.modelTurn?.parts) {
        for (const part of content.modelTurn.parts) {
          const text = part.text;
          const audio = part.inlineData?.data;

          if (text || audio) {
            this.sendToClient({
              type: "content",
              ...(text ? { text } : {}),
              ...(audio ? { audio } : {}),
            });
          }
        }
      }
    } catch (error) {
      this.logger.error("Error parsing Gemini message payload:", error);
    }
  }

  /**
   * Forwards a setup configuration payload to Gemini.
   */
  public sendSetup(config: ClientSetupConfig): void {
    const geminiSetupMsg: GeminiClientMessage = {
      setup: {
        model: config.model || "models/gemini-3.1-flash-live-preview",
        generationConfig: {
          responseModalities: config.generationConfig?.responseModalities || ["AUDIO"],
          speechConfig: config.generationConfig?.speechConfig,
        },
        systemInstruction: config.systemInstruction
          ? {
              parts: [{ text: config.systemInstruction }],
            }
          : undefined,
      },
    };

    this.sendToGemini(JSON.stringify(geminiSetupMsg));
  }

  /**
   * Forwards general text turns to Gemini.
   */
  public sendClientContent(content: any): void {
    const geminiContentMsg = {
      clientContent: content,
    };
    this.sendToGemini(JSON.stringify(geminiContentMsg));
  }

  /**
   * Translates and sends raw PCM audio binary buffer to Gemini.
   */
  public sendAudio(pcmData: Buffer): void {
    const geminiAudioMsg: GeminiClientMessage = {
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm",
          data: pcmData.toString("base64"),
        },
      },
    };

    this.sendToGemini(JSON.stringify(geminiAudioMsg));
  }

  /**
   * Cleans up the Gemini connection.
   */
  public destroy(): void {
    if (this.geminiWs.readyState === WebSocket.OPEN || this.geminiWs.readyState === WebSocket.CONNECTING) {
      this.logger.log("Closing active Gemini connection...");
      this.geminiWs.close(1000, "Client session terminated");
    }
  }

  /**
   * Helper to write payloads to Gemini, queueing them if connection is not yet ready.
   */
  private sendToGemini(payload: string | Buffer): void {
    if (this.isGeminiReady && this.geminiWs.readyState === WebSocket.OPEN) {
      this.geminiWs.send(payload);
    } else {
      this.sendQueue.push(payload);
    }
  }

  /**
   * Helper to write payloads to client.
   */
  private sendToClient(message: ServerMessage): void {
    if (this.clientWs.readyState === WebSocket.OPEN) {
      this.clientWs.send(JSON.stringify(message));
    }
  }

  /**
   * Flushes the message queue when connection is established.
   */
  private flushQueue(): void {
    while (this.sendQueue.length > 0) {
      const msg = this.sendQueue.shift();
      if (msg && this.geminiWs.readyState === WebSocket.OPEN) {
        this.geminiWs.send(msg);
      }
    }
  }

  /**
   * Cleanly closes the client connection.
   */
  private closeClient(code: number, reason: string): void {
    if (this.clientWs.readyState === WebSocket.OPEN) {
      this.clientWs.close(code, reason);
    }
  }
}
