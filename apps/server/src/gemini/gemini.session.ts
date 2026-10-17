import WebSocket from "ws";
import { Logger } from "@nestjs/common";
import {
  ClientSetupConfig,
  GeminiClientMessage,
  GeminiServerMessage,
  ServerMessage,
} from "../types";
import { LiveSession } from "../session/live-session.interface";
import { SessionTracker } from "../session/session-tracker.interface";
import { GeminiTool } from "./gemini-tool.interface";
import {
  DevinSessionUpdate,
  DevinUpdateSubscriber,
} from "../devin/devin-watcher.service";

/** Source of proactive Devin updates for a voice session. */
export interface DevinUpdateSource {
  subscribe(subscriber: DevinUpdateSubscriber): () => void;
}

/** Quiet time after the user's last words before a system note may speak. */
export const USER_QUIET_MS = 1500;

/** RMS level (of 32768) above which a 16-bit PCM chunk counts as speech. */
export const SPEECH_RMS_THRESHOLD = 800;

function isSpeech(pcm: Buffer): boolean {
  const samples = Math.floor(pcm.length / 2);
  if (!samples) return false;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const sample = pcm.readInt16LE(i * 2);
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples) > SPEECH_RMS_THRESHOLD;
}

export class GeminiSession implements LiveSession, DevinUpdateSubscriber {
  private readonly logger: Logger;
  private readonly geminiWs: WebSocket;
  private isGeminiReady = false;
  private readonly sendQueue: Array<string | Buffer> = [];
  private isSetupComplete = false;
  private isModelBusy = false;
  private lastUserSpeechAt = 0;
  private readonly pendingNotes: string[] = [];
  private noteTimer?: NodeJS.Timeout;
  private readonly unsubscribeDevin?: () => void;

  constructor(
    private readonly clientWs: WebSocket,
    private readonly apiKey: string,
    public readonly sessionId: string,
    private readonly sessionTracker: SessionTracker,
    private readonly tools: GeminiTool[],
    devinUpdates?: DevinUpdateSource,
  ) {
    this.logger = new Logger(`${GeminiSession.name}[${sessionId}]`);
    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

    this.logger.log("Initiating connection to Gemini Live API...");
    this.geminiWs = new WebSocket(geminiUrl);

    this.initialize();
    this.unsubscribeDevin = devinUpdates?.subscribe(this);
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
      this.logger.log(
        `Gemini connection closed (code: ${code}, reason: ${reason.toString()})`,
      );
      this.closeClient(1000, "Gemini session ended");
    });

    this.geminiWs.on("error", (error) => {
      this.logger.error("Gemini WebSocket error:", error);
      this.sendToClient({
        type: "content",
        text: "[System Error: Gemini connection failed]",
      });
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

      if (response.usageMetadata) {
        this.sessionTracker.updateTokens(
          this.sessionId,
          response.usageMetadata,
        );
      }

      if (response.setupComplete) {
        this.logger.log("Setup handshake confirmed by Gemini.");
        this.sendToClient({ type: "setup_complete" });
        this.isSetupComplete = true;
        this.flushNotes();
        return;
      }

      if (response.toolCall) {
        this.isModelBusy = true;
        this.handleToolCall(response.toolCall);
      }

      const content = response.serverContent;
      if (!content) return;

      if (content.interrupted) {
        this.logger.log("Gemini model execution interrupted (barge-in).");
        this.sendToClient({ type: "interrupted" });
        this.isModelBusy = false;
        this.flushNotes();
        return;
      }

      if (content.inputTranscription?.text) {
        this.lastUserSpeechAt = Date.now();
        this.sendToClient({
          type: "content",
          userTranscription: content.inputTranscription.text,
        });
      }

      if (content.outputTranscription?.text) {
        this.sendToClient({
          type: "content",
          text: content.outputTranscription.text,
        });
      }

      if (content.modelTurn?.parts) {
        this.isModelBusy = true;
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

      if (content.turnComplete) {
        this.sendToClient({
          type: "content",
          turnComplete: true,
        });
        this.isModelBusy = false;
        this.flushNotes();
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
          responseModalities: config.generationConfig?.responseModalities || [
            "AUDIO",
          ],
          speechConfig: config.generationConfig?.speechConfig,
        },
        systemInstruction: this.buildSystemInstruction(
          config.systemInstruction,
        ),
        tools:
          this.tools.length > 0
            ? [
                {
                  functionDeclarations: this.tools.map((t) => t.declaration),
                },
              ]
            : undefined,
        inputAudioTranscription: config.inputAudioTranscription,
        outputAudioTranscription: config.outputAudioTranscription,
      },
    };

    this.sendToGemini(JSON.stringify(geminiSetupMsg));
  }

  /**
   * Appends the server-owned instructions of the registered tools to the
   * client's system instruction, so a stale client cannot drop them.
   */
  private buildSystemInstruction(
    clientInstruction?: string,
  ): { parts: { text: string }[] } | undefined {
    const toolInstructions = [
      ...new Set(
        this.tools
          .map((t) => t.instructions)
          .filter((text): text is string => Boolean(text)),
      ),
    ];
    const text = [clientInstruction, ...toolInstructions]
      .filter(Boolean)
      .join("\n\n");
    return text ? { parts: [{ text }] } : undefined;
  }

  /**
   * Processes a tool call from Gemini, executes it, and sends the response back.
   */
  private async handleToolCall(
    toolCall: NonNullable<GeminiServerMessage["toolCall"]>,
  ): Promise<void> {
    const functionCalls = toolCall.functionCalls;
    const functionResponses: any[] = [];

    for (const call of functionCalls) {
      try {
        this.logger.log(`Executing tool call: ${call.name} (ID: ${call.id})`);

        const tool = this.tools.find((t) => t.name === call.name);
        if (!tool) {
          throw new Error(`Unknown tool: ${call.name}`);
        }

        const { output, clientIntegration } = await tool.execute(call.args, {
          sessionId: this.sessionId,
        });

        if (clientIntegration) {
          this.sendToClient({
            type: "content",
            integration: clientIntegration,
          });
        }

        functionResponses.push({
          id: call.id,
          name: call.name,
          response: { output },
        });
      } catch (err: any) {
        this.logger.error(`Error executing tool ${call.name}:`, err);
        functionResponses.push({
          id: call.id,
          name: call.name,
          response: { error: err.message || "Failed to execute tool" },
        });
      }
    }

    // Send responses back to Gemini Live API
    const responsePayload = {
      toolResponse: {
        functionResponses,
      },
    };
    this.sendToGemini(JSON.stringify(responsePayload));
  }

  /**
   * Forwards general text turns to Gemini.
   */
  public sendClientContent(content: any): void {
    this.isModelBusy = true;
    const geminiContentMsg = {
      clientContent: content,
    };
    this.sendToGemini(JSON.stringify(geminiContentMsg));
  }

  /**
   * Shows a Devin update card and queues its note for the voice model.
   */
  public onDevinUpdate(update: DevinSessionUpdate): void {
    this.sendToClient({ type: "content", integration: update.card });
    this.injectSystemNote(update.note);
  }

  /**
   * Queues a system note; it is sent as a turn once the model is idle and the
   * user has been quiet, so it never talks over anyone.
   */
  public injectSystemNote(text: string): void {
    this.pendingNotes.push(text);
    this.flushNotes();
  }

  private flushNotes(): void {
    if (!this.pendingNotes.length || this.noteTimer) return;
    if (!this.isSetupComplete || this.isModelBusy) return;

    const quietFor = Date.now() - this.lastUserSpeechAt;
    if (quietFor < USER_QUIET_MS) {
      this.noteTimer = setTimeout(() => {
        this.noteTimer = undefined;
        this.flushNotes();
      }, USER_QUIET_MS - quietFor);
      return;
    }

    const text = this.pendingNotes.splice(0).join("\n\n");
    this.logger.log("Injecting system note into Gemini session.");
    this.isModelBusy = true;
    this.sendToGemini(
      JSON.stringify({
        clientContent: {
          turns: [{ role: "user", parts: [{ text }] }],
          turnComplete: true,
        },
      }),
    );
  }

  /**
   * Translates and sends raw PCM audio binary buffer to Gemini.
   */
  public sendAudio(pcmData: Buffer): void {
    if (isSpeech(pcmData)) this.lastUserSpeechAt = Date.now();
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
    this.unsubscribeDevin?.();
    if (this.noteTimer) clearTimeout(this.noteTimer);
    if (
      this.geminiWs.readyState === WebSocket.OPEN ||
      this.geminiWs.readyState === WebSocket.CONNECTING
    ) {
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
