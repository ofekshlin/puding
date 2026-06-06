import WebSocket from "ws";
import {
  ClientMessage,
  ClientSetupConfig,
  GeminiClientMessage,
  GeminiServerMessage,
  ServerMessage,
} from "./types";

/**
 * Maps a client setup configuration to Gemini's expected BidiGenerateContentSetup structure.
 */
export function mapClientSetup(config: ClientSetupConfig): GeminiClientMessage {
  return {
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
}

/**
 * Maps binary PCM audio buffer from client into Gemini's realtimeInput media chunk structure.
 */
export function mapClientAudio(pcmData: Buffer): GeminiClientMessage {
  return {
    realtimeInput: {
      audio: {
        mimeType: "audio/pcm",
        data: pcmData.toString("base64"),
      },
    },
  };
}

/**
 * Handles a single client session, bridging the client WebSocket with a Gemini Live API WebSocket connection.
 * 
 * @param clientWs The WebSocket connection from the web client.
 * @param apiKey The Google Gemini API key.
 */
export function handleClientSession(clientWs: WebSocket, apiKey: string): void {
  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
  
  console.log("[Bridge] Connecting to Gemini Live API...");
  const geminiWs = new WebSocket(geminiUrl);

  // Buffer messages if the client sends them before Gemini socket is open
  const sendQueue: Array<string | Buffer> = [];
  let isGeminiReady = false;

  const sendToGemini = (message: GeminiClientMessage) => {
    const payload = JSON.stringify(message);
    if (isGeminiReady && geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(payload);
    } else {
      sendQueue.push(payload);
    }
  };

  const sendToClient = (message: ServerMessage) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(message));
    }
  };

  // 1. Handle Gemini Connection Lifecycle
  geminiWs.on("open", () => {
    console.log("[Bridge] Connected to Gemini Live API.");
    isGeminiReady = true;

    // Flush any queued setup or inputs
    while (sendQueue.length > 0) {
      const msg = sendQueue.shift();
      if (msg && geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.send(msg);
      }
    }
  });

  geminiWs.on("message", (data: WebSocket.Data) => {
    try {
      const rawText = data.toString();
      const response = JSON.parse(rawText) as GeminiServerMessage;

      // Check for setup complete
      if (response.setupComplete) {
        console.log("[Bridge] Setup completed by Gemini.");
        sendToClient({ type: "setup_complete" });
        return;
      }

      const content = response.serverContent;
      if (!content) return;

      // Handle user interruption / barge-in detection from Gemini
      if (content.interrupted) {
        console.log("[Bridge] Gemini interrupted by barge-in.");
        sendToClient({ type: "interrupted" });
        return;
      }

      // Extract and stream audio or text parts
      if (content.modelTurn?.parts) {
        for (const part of content.modelTurn.parts) {
          const text = part.text;
          const audio = part.inlineData?.data;

          if (text || audio) {
            sendToClient({
              type: "content",
              ...(text ? { text } : {}),
              ...(audio ? { audio } : {}),
            });
          }
        }
      }
    } catch (error) {
      console.error("[Bridge] Error parsing Gemini response:", error);
    }
  });

  geminiWs.on("close", (code, reason) => {
    console.log(`[Bridge] Gemini connection closed (code: ${code}, reason: ${reason.toString()})`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1000, "Gemini session ended");
    }
  });

  geminiWs.on("error", (error) => {
    console.error("[Bridge] Gemini WebSocket error:", error);
    sendToClient({ type: "content", text: "[System Error: Gemini connection failed]" });
    clientWs.close(1011, "Gemini connection error");
  });

  // 2. Handle Client Connection Lifecycle
  clientWs.on("message", (data: WebSocket.Data, isBinary: boolean) => {
    try {
      if (isBinary) {
        // Handle raw audio input
        const audioBuffer = data as Buffer;
        const geminiAudioMsg = mapClientAudio(audioBuffer);
        
        if (isGeminiReady && geminiWs.readyState === WebSocket.OPEN) {
          geminiWs.send(JSON.stringify(geminiAudioMsg));
        }
      } else {
        // Handle JSON client message (setup config)
        const textPayload = data.toString();
        const clientMsg = JSON.parse(textPayload) as ClientMessage;

        if (typeof clientMsg === "object" && clientMsg !== null && "type" in clientMsg) {
          if (clientMsg.type === "setup") {
            const geminiSetupMsg = mapClientSetup(clientMsg.config);
            sendToGemini(geminiSetupMsg);
          } else if (clientMsg.type === "client_content") {
            sendToGemini({
              clientContent: clientMsg.content,
            });
          }
        }
      }
    } catch (error) {
      console.error("[Bridge] Error processing client message:", error);
    }
  });

  clientWs.on("close", (code, reason) => {
    console.log(`[Bridge] Client connection closed (code: ${code}, reason: ${reason.toString()})`);
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close(1000, "Client session ended");
    }
  });

  clientWs.on("error", (error) => {
    console.error("[Bridge] Client WebSocket error:", error);
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close(1011, "Client connection error");
    }
  });
}
