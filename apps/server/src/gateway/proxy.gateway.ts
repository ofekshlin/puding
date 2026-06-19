import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import WebSocket from "ws";
import { IncomingMessage } from "http";
import { LiveSessionService, LiveSession } from "../session/live-session.service";
import { ConfigService } from "../config/config.service";
import { Logger, Inject } from "@nestjs/common";
import { ClientMessage } from "../types";
import { randomUUID } from "crypto";

@WebSocketGateway({ path: "/" })
export class ProxyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ProxyGateway.name);
  private readonly sessions = new Map<WebSocket, LiveSession>();

  constructor(
    @Inject(LiveSessionService) private readonly liveSessionService: LiveSessionService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  /**
   * Fires when a new client connects to the WebSocket proxy gateway.
   */
  public handleConnection(client: WebSocket, req: IncomingMessage): void {
    const clientIp = req.socket.remoteAddress;
    const sessionId = randomUUID().substring(0, 8);
    this.logger.log(`New client connected [${sessionId}] from IP: ${clientIp}`);

    const apiKey = this.configService.getGeminiApiKey();
    if (!apiKey) {
      this.logger.error(`Rejecting connection [${sessionId}] due to missing GEMINI_API_KEY config.`);
      client.close(1011, "Server API key configuration missing");
      return;
    }

    const session = this.liveSessionService.createSession(client, apiKey, sessionId);
    this.sessions.set(client, session);

    // Bind event listener directly to socket to support raw PCM binary streaming
    client.on("message", (data: WebSocket.Data, isBinary: boolean) => {
      this.handleClientMessage(client, data, isBinary);
    });
  }

  /**
   * Fires when a client connection closes.
   */
  public handleDisconnect(client: WebSocket): void {
    const session = this.sessions.get(client);
    if (session) {
      session.destroy();
      this.sessions.delete(client);
      this.logger.log("Client session terminated and cleaned up.");
    } else {
      this.logger.log("Unregistered client connection closed.");
    }
  }

  /**
   * Dispatches client messages (binary PCM streaming vs JSON handshakes) to the Gemini session.
   */
  private handleClientMessage(client: WebSocket, data: WebSocket.Data, isBinary: boolean): void {
    const session = this.sessions.get(client);
    if (!session) return;

    try {
      if (isBinary) {
        session.sendAudio(data as Buffer);
      } else {
        const textPayload = data.toString();
        const clientMsg = JSON.parse(textPayload) as ClientMessage;

        if (typeof clientMsg === "object" && clientMsg !== null && "type" in clientMsg) {
          if (clientMsg.type === "setup") {
            session.sendSetup(clientMsg.config);
          } else if (clientMsg.type === "client_content") {
            session.sendClientContent(clientMsg.content);
          }
        }
      }
    } catch (error) {
      this.logger.error("Error handling incoming client payload:", error);
    }
  }
}
