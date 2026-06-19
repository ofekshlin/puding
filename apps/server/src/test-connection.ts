import dotenv from "dotenv";
import path from "path";
import WebSocket from "ws";
import { ClientMessage, ServerMessage } from "./types";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const proxyUrl = `ws://localhost:${port}`;

console.log(`[Test Client] Connecting to local proxy at ${proxyUrl}...`);
const ws = new WebSocket(proxyUrl);

let receivedResponse = false;
let timeoutId: NodeJS.Timeout;

// Set a timeout of 15 seconds to prevent the test from hanging indefinitely
timeoutId = setTimeout(() => {
  console.error("[Test Client] ERROR: Connection test timed out after 15 seconds.");
  ws.close();
  process.exit(1);
}, 15000);

ws.on("open", () => {
  console.log("[Test Client] WebSocket connection opened. Sending setup config...");
  
  // 1. Send Setup Config message
  const setupMsg: ClientMessage = {
    type: "setup",
    config: {
      model: "models/gemini-3.1-flash-live-preview",
      generationConfig: {
        responseModalities: ["AUDIO"],
      },
      systemInstruction: "You are Puding. Respond briefly to the user's greeting.",
    },
  };
  ws.send(JSON.stringify(setupMsg));
});

ws.on("message", (data: WebSocket.Data) => {
  try {
    const rawMsg = data.toString();
    const message = JSON.parse(rawMsg) as ServerMessage;
    console.log(`[Test Client] Received message type: "${message.type}"`);

    if (message.type === "setup_complete") {
      console.log("[Test Client] Handshake confirmed. Sending a dummy audio packet (silence) and text greeting...");

      // 2. Send a dummy audio chunk (16kHz 16-bit LE PCM, e.g., 0.5s of silence)
      // 16000 samples/sec * 0.5 sec * 2 bytes/sample = 16000 bytes
      const dummyAudio = Buffer.alloc(16000);
      ws.send(dummyAudio);

      // 3. Send a text greeting to ensure we trigger a response turn
      const greetingMsg: ClientMessage = {
        type: "client_content",
        content: {
          turns: [
            {
              role: "user",
              parts: [{ text: "Hello! This is a test connection from Puding test client. Can you hear me?" }],
            },
          ],
          turnComplete: true,
        },
      };
      ws.send(JSON.stringify(greetingMsg));
    } else if (message.type === "content") {
      receivedResponse = true;
      if (message.text) {
        console.log(`[Test Client] Gemini Text Response: "${message.text}"`);
      }
      if (message.audio) {
        console.log(`[Test Client] Gemini Audio Response: Received ${Buffer.from(message.audio, "base64").length} bytes of 24kHz PCM audio.`);
      }

      // Successful round-trip communication
      console.log("[Test Client] SUCCESS: Connection test completed successfully!");
      clearTimeout(timeoutId);
      ws.close();
      process.exit(0);
    } else if (message.type === "interrupted") {
      console.log("[Test Client] Gemini interrupted.");
    }
  } catch (error) {
    console.error("[Test Client] Error processing incoming message:", error);
  }
});

ws.on("close", (code, reason) => {
  console.log(`[Test Client] Connection closed (code: ${code}, reason: ${reason.toString()})`);
  clearTimeout(timeoutId);
  if (!receivedResponse) {
    console.error("[Test Client] ERROR: Socket closed without receiving any response content.");
    process.exit(1);
  }
});

ws.on("error", (error) => {
  console.error("[Test Client] WebSocket error:", error);
  clearTimeout(timeoutId);
  process.exit(1);
});
