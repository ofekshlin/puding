import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import WebSocket from "ws";
import { IncomingMessage } from "http";
import {
  LiveSessionService,
  LiveSession,
} from "../session/live-session.service";
import { ConfigService } from "../config/config.service";
import { Logger, Inject } from "@nestjs/common";
import { ClientMessage } from "../types";
import { randomUUID } from "crypto";
import { SessionTracker } from "../session/session-tracker.interface";
import {
  UNAUTHORIZED_CLOSE_CODE,
  readQueryToken,
} from "../auth/access-guard.service";
import { AuthFailureReason, AuthService } from "../auth/auth.service";

/** Lets the "unauthorized" message reach the client before the close frame. */
const UNAUTHORIZED_CLOSE_DELAY_MS = 250;

@WebSocketGateway({ path: "/" })
export class ProxyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ProxyGateway.name);
  private readonly sessions = new Map<WebSocket, LiveSession>();

  constructor(
    @Inject(LiveSessionService)
    private readonly liveSessionService: LiveSessionService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(SessionTracker) private readonly sessionTracker: SessionTracker,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  /**
   * Fires when a new client connects to the WebSocket proxy gateway.
   */
  public async handleConnection(
    client: WebSocket,
    req: IncomingMessage,
  ): Promise<void> {
    const clientIp = req.socket.remoteAddress;
    const sessionId = randomUUID().substring(0, 8);

    // The client sends its setup as soon as the socket opens, which can be
    // before the token is verified; hold those messages until the session exists.
    const early: Array<[WebSocket.Data, boolean]> = [];
    const hold = (data: WebSocket.Data, isBinary: boolean) =>
      early.push([data, isBinary]);
    client.on("message", hold);

    const result = await this.authService
      .authenticate(readQueryToken(req))
      .catch((error: unknown) => {
        this.logger.error(`Authentication failed [${sessionId}]:`, error);
        return null;
      });
    client.off("message", hold);

    if (!result) {
      client.close(1011, "Authentication unavailable");
      return;
    }
    if (!result.ok) {
      this.reject(client, sessionId, clientIp, result.reason);
      return;
    }
    if (
      client.readyState === WebSocket.CLOSING ||
      client.readyState === WebSocket.CLOSED
    ) {
      return;
    }

    this.logger.log(
      `New client connected [${sessionId}] from IP: ${clientIp} (user ${result.user.id})`,
    );

    const apiKey = this.configService.getGeminiApiKey();
    if (!apiKey) {
      this.logger.error(
        `Rejecting connection [${sessionId}] due to missing GEMINI_API_KEY config.`,
      );
      client.close(1011, "Server API key configuration missing");
      return;
    }

    this.sessionTracker.registerSession(sessionId, clientIp || "unknown");

    const session = this.liveSessionService.createSession(
      client,
      apiKey,
      sessionId,
      result.user,
    );
    this.sessions.set(client, session);

    // Bind event listener directly to socket to support raw PCM binary streaming
    client.on("message", (data: WebSocket.Data, isBinary: boolean) => {
      this.handleClientMessage(client, data, isBinary);
    });
    for (const [data, isBinary] of early) {
      this.handleClientMessage(client, data, isBinary);
    }
  }

  /**
   * Render's proxy drops close codes, so the reason travels as a message first.
   */
  private reject(
    client: WebSocket,
    sessionId: string,
    clientIp: string | undefined,
    reason: AuthFailureReason,
  ): void {
    this.logger.warn(
      `Rejecting client [${sessionId}] from IP: ${clientIp} (${reason})`,
    );
    client.send(JSON.stringify({ type: "unauthorized", reason }));
    setTimeout(
      () => client.close(UNAUTHORIZED_CLOSE_CODE, "Unauthorized"),
      UNAUTHORIZED_CLOSE_DELAY_MS,
    );
  }

  /**
   * Fires when a client connection closes.
   */
  public handleDisconnect(client: WebSocket): void {
    const session = this.sessions.get(client);
    if (session) {
      this.sessionTracker.disconnectSession(session.sessionId);
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
  private handleClientMessage(
    client: WebSocket,
    data: WebSocket.Data,
    isBinary: boolean,
  ): void {
    const session = this.sessions.get(client);
    if (!session) return;

    try {
      if (isBinary) {
        session.sendAudio(data as Buffer);
      } else {
        const textPayload = data.toString();
        const clientMsg = JSON.parse(textPayload) as ClientMessage;

        if (
          typeof clientMsg === "object" &&
          clientMsg !== null &&
          "type" in clientMsg
        ) {
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
