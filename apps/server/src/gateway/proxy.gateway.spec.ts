import { Test, TestingModule } from "@nestjs/testing";
import { ProxyGateway } from "./proxy.gateway";
import { LiveSessionService, LiveSession } from "../session/live-session.service";
import { ConfigService } from "../config/config.service";
import WebSocket from "ws";
import { EventEmitter } from "events";
import { IncomingMessage } from "http";

describe("ProxyGateway (Unit)", () => {
  let gateway: ProxyGateway;
  let mockLiveSessionService: jest.Mocked<LiveSessionService>;
  let mockLiveSession: jest.Mocked<LiveSession>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockLiveSession = {
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
      getPort: jest.fn().mockReturnValue(3001),
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
      ],
    }).compile();

    gateway = module.get<ProxyGateway>(ProxyGateway);
  });

  it("should create a session on connection", () => {
    const mockSocket = new EventEmitter() as any;
    mockSocket.close = jest.fn();
    const mockReq = {
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    gateway.handleConnection(mockSocket, mockReq);

    expect(mockConfigService.getGeminiApiKey).toHaveBeenCalled();
    expect(mockLiveSessionService.createSession).toHaveBeenCalledWith(
      mockSocket,
      "test-api-key",
      expect.any(String),
    );
  });

  it("should reject connection if API key is missing", () => {
    mockConfigService.getGeminiApiKey.mockReturnValueOnce("");
    const mockSocket = new EventEmitter() as any;
    mockSocket.close = jest.fn();
    const mockReq = {
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    gateway.handleConnection(mockSocket, mockReq);

    expect(mockSocket.close).toHaveBeenCalledWith(1011, expect.any(String));
    expect(mockLiveSessionService.createSession).not.toHaveBeenCalled();
  });

  it("should relay setup message", () => {
    const mockSocket = new EventEmitter() as any;
    const mockReq = {
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    gateway.handleConnection(mockSocket, mockReq);

    const setupPayload = JSON.stringify({
      type: "setup",
      config: { model: "test-model" },
    });

    // Simulate receiving a setup text message
    mockSocket.emit("message", Buffer.from(setupPayload), false);

    expect(mockLiveSession.sendSetup).toHaveBeenCalledWith({ model: "test-model" });
  });

  it("should relay client content message", () => {
    const mockSocket = new EventEmitter() as any;
    const mockReq = {
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    gateway.handleConnection(mockSocket, mockReq);

    const contentPayload = JSON.stringify({
      type: "client_content",
      content: { turns: [] },
    });

    // Simulate receiving a client_content text message
    mockSocket.emit("message", Buffer.from(contentPayload), false);

    expect(mockLiveSession.sendClientContent).toHaveBeenCalledWith({ turns: [] });
  });

  it("should relay raw binary audio data", () => {
    const mockSocket = new EventEmitter() as any;
    const mockReq = {
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    gateway.handleConnection(mockSocket, mockReq);

    const dummyAudio = Buffer.alloc(100);

    // Simulate receiving raw binary audio
    mockSocket.emit("message", dummyAudio, true);

    expect(mockLiveSession.sendAudio).toHaveBeenCalledWith(dummyAudio);
  });

  it("should destroy session and clean up on disconnect", () => {
    const mockSocket = new EventEmitter() as any;
    const mockReq = {
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;

    gateway.handleConnection(mockSocket, mockReq);
    gateway.handleDisconnect(mockSocket);

    expect(mockLiveSession.destroy).toHaveBeenCalled();
  });
});
