import dotenv from "dotenv";
import { WebSocketServer } from "ws";
import { handleClientSession } from "./bridge";

// 1. Initialize environment variables
dotenv.config();

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("CRITICAL ERROR: GEMINI_API_KEY is not defined in the environment variables.");
  process.exit(1);
}

// 2. Start WebSocket server
const wss = new WebSocketServer({ port });

console.log(`[Server] Puding WebSocket Proxy running on ws://localhost:${port}`);

wss.on("connection", (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[Server] New client connected from IP: ${clientIp}`);

  // Hand over the connection to the Gemini Live session bridge
  handleClientSession(ws, apiKey);
});

wss.on("error", (error) => {
  console.error("[Server] WebSocket Server error:", error);
});
