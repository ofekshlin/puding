import { Test, TestingModule } from "@nestjs/testing";
import { ProxyGateway } from "./proxy.gateway";
import {
  LiveSessionService,
  LiveSession,
} from "../session/live-session.service";
import { ConfigService } from "../config/config.service";
import { SessionTracker } from "../session/session-tracker.interface";
import { AuthService } from "../auth/auth.service";
import { UserAccessEvents } from "../auth/user-access-events";
import { LOCAL_USER } from "../users/env-user-directory";
import WebSocket from "ws";
import { EventEmitter } from "events";
import { IncomingMessage } from "http";

describe("ProxyGateway (Unit)", () => {
  let gateway: ProxyGateway;
  let mockLiveSessionService: jest.Mocked<LiveSessionService>;
  let mockLiveSession: jest.Mocked<LiveSession>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockSessionTracker: jest.Mocked<SessionTracker>;
  let mockAuthService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    mockLiveSession = {
      sessionId: "test-session-id",
      sendSetup: jest.fn(),
      sendClientContent: jest.fn(),
      sendAudio: jest.fn(),
      destroy: jest.fn(),
    } as any;

    mockLiveSessionService = {
      createSession: jest.fn().mockReturnValue(mockLiveSession),
    } as any;

    mockConfigService = {
      getGeminiApiKey: jest.fn().mockReturnValue("test-api-key"),
      getPort: jest.fn().mockReturnValue(6601),
    } as any;

    mockSessionTracker = {
      registerSession: jest.fn(),
      disconnectSession: jest.fn(),
      updateTokens: jest.fn(),
      getAllSessions: jest.fn(),
      getSession: jest.fn(),
    } as any;

    mockAuthService = {
      isEnabled: jest.fn().mockReturnValue(true),
      authenticate: jest.fn().mockResolvedValue({ ok: true, user: LOCAL_USER }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProxyGateway,
        {
          provide: LiveSessionService,
          useValue: mockLiveSessionService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: SessionTracker,
          useValue: mockSessionTracker,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        UserAccessEvents,
      ],
    }).compile();

    gateway = module.get<ProxyGateway>(ProxyGateway);
  });

  it("should create a session for the authenticated user", async () => {
    const mockSocket = new EventEmitter() as any;
    mockSocket.close = jest.fn();
    const mockReq = {
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    await gateway.handleConnection(mockSocket, mockReq);

    expect(mockConfigService.getGeminiApiKey).toHaveBeenCalled();
    expect(mockLiveSessionService.createSession).toHaveBeenCalledWith(
      mockSocket,
      "test-api-key",
      expect.any(String),
      LOCAL_USER,
    );
  });

  it("should reject connection if API key is missing", async () => {
    mockConfigService.getGeminiApiKey.mockReturnValueOnce("");
    const mockSocket = new EventEmitter() as any;
    mockSocket.close = jest.fn();
    const mockReq = {
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    await gateway.handleConnection(mockSocket, mockReq);

    expect(mockSocket.close).toHaveBeenCalledWith(1011, expect.any(String));
    expect(mockLiveSessionService.createSession).not.toHaveBeenCalled();
  });

  it("should reject unauthenticated clients with a reason before closing", async () => {
    mockAuthService.authenticate.mockResolvedValueOnce({
      ok: false,
      reason: "expired",
    });
    const mockSocket = new EventEmitter() as any;
    mockSocket.close = jest.fn();
    mockSocket.send = jest.fn();
    jest.useFakeTimers();
    const mockReq = {
      url: "/?token=abc.def.ghi",
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    await gateway.handleConnection(mockSocket, mockReq);

    expect(mockAuthService.authenticate).toHaveBeenCalledWith("abc.def.ghi");
    expect(mockSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "unauthorized", reason: "expired" }),
    );
    expect(mockSocket.close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(250);
    expect(mockSocket.close).toHaveBeenCalledWith(4401, "Unauthorized");
    jest.useRealTimers();
    expect(mockSessionTracker.registerSession).not.toHaveBeenCalled();
    expect(mockLiveSessionService.createSession).not.toHaveBeenCalled();

    mockSocket.emit("message", Buffer.alloc(10), true);
    expect(mockLiveSession.sendAudio).not.toHaveBeenCalled();
  });

  it("should reject pending users", async () => {
    mockAuthService.authenticate.mockResolvedValueOnce({
      ok: false,
      reason: "pending",
    });
    const mockSocket = new EventEmitter() as any;
    mockSocket.close = jest.fn();
    mockSocket.send = jest.fn();
    const mockReq = {
      url: "/?token=t",
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    await gateway.handleConnection(mockSocket, mockReq);

    expect(mockSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "unauthorized", reason: "pending" }),
    );
    expect(mockLiveSessionService.createSession).not.toHaveBeenCalled();
  });

  it("should replay messages sent while the token was being verified", async () => {
    let finish!: (value: any) => void;
    mockAuthService.authenticate.mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve)),
    );
    const mockSocket = new EventEmitter() as any;
    const mockReq = {
      url: "/?token=t",
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    const connecting = gateway.handleConnection(mockSocket, mockReq);
    mockSocket.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "setup", config: { model: "m" } })),
      false,
    );
    expect(mockLiveSession.sendSetup).not.toHaveBeenCalled();

    finish({ ok: true, user: LOCAL_USER });
    await connecting;

    expect(mockLiveSession.sendSetup).toHaveBeenCalledWith({ model: "m" });
    expect(mockSocket.listenerCount("message")).toBe(1);
  });

  it("should not open a session for a client that left during verification", async () => {
    const mockSocket = new EventEmitter() as any;
    mockSocket.readyState = WebSocket.CLOSED;
    const mockReq = {
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    await gateway.handleConnection(mockSocket, mockReq);

    expect(mockLiveSessionService.createSession).not.toHaveBeenCalled();
  });

  it("should close with 1011 when verification throws", async () => {
    mockAuthService.authenticate.mockRejectedValueOnce(new Error("db down"));
    const mockSocket = new EventEmitter() as any;
    mockSocket.close = jest.fn();
    const mockReq = {
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    await gateway.handleConnection(mockSocket, mockReq);

    expect(mockSocket.close).toHaveBeenCalledWith(1011, expect.any(String));
    expect(mockLiveSessionService.createSession).not.toHaveBeenCalled();
  });

  it("should relay setup message", async () => {
    const mockSocket = new EventEmitter() as any;
    const mockReq = {
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    await gateway.handleConnection(mockSocket, mockReq);

    const setupPayload = JSON.stringify({
      type: "setup",
      config: { model: "test-model" },
    });

    // Simulate receiving a setup text message
    mockSocket.emit("message", Buffer.from(setupPayload), false);

    expect(mockLiveSession.sendSetup).toHaveBeenCalledWith({
      model: "test-model",
    });
  });

  it("should relay client content message", async () => {
    const mockSocket = new EventEmitter() as any;
    const mockReq = {
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    await gateway.handleConnection(mockSocket, mockReq);

    const contentPayload = JSON.stringify({
      type: "client_content",
      content: { turns: [] },
    });

    // Simulate receiving a client_content text message
    mockSocket.emit("message", Buffer.from(contentPayload), false);

    expect(mockLiveSession.sendClientContent).toHaveBeenCalledWith({
      turns: [],
    });
  });

  it("should relay raw binary audio data", async () => {
    const mockSocket = new EventEmitter() as any;
    const mockReq = {
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    await gateway.handleConnection(mockSocket, mockReq);

    const dummyAudio = Buffer.alloc(100);

    // Simulate receiving raw binary audio
    mockSocket.emit("message", dummyAudio, true);

    expect(mockLiveSession.sendAudio).toHaveBeenCalledWith(dummyAudio);
  });

  it("should destroy session and clean up on disconnect", async () => {
    const mockSocket = new EventEmitter() as any;
    const mockReq = {
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    await gateway.handleConnection(mockSocket, mockReq);
    gateway.handleDisconnect(mockSocket);

    expect(mockLiveSession.destroy).toHaveBeenCalled();
  });

  it("closes a revoked user's sockets and leaves others alone", async () => {
    jest.useFakeTimers();
    const socketFor = () => {
      const socket = new EventEmitter() as any;
      socket.send = jest.fn();
      socket.close = jest.fn();
      return socket;
    };
    const mockReq = {
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;
    const mine = socketFor();
    const theirs = socketFor();
    await gateway.handleConnection(mine, mockReq);
    mockAuthService.authenticate.mockResolvedValueOnce({
      ok: true,
      user: { ...LOCAL_USER, id: "someone-else" },
    });
    await gateway.handleConnection(theirs, mockReq);

    gateway.disconnectUser(LOCAL_USER.id);
    jest.runAllTimers();
    jest.useRealTimers();

    expect(mine.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "unauthorized", reason: "rejected" }),
    );
    expect(mine.close).toHaveBeenCalled();
    expect(theirs.send).not.toHaveBeenCalled();
    expect(theirs.close).not.toHaveBeenCalled();
  });
});
