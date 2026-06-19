import { Test, TestingModule } from "@nestjs/testing";
import { WsAdapter } from "@nestjs/platform-ws";
import { ProxyGateway } from "./proxy.gateway";
import { LiveSessionService, LiveSession } from "../session/live-session.service";
import { ConfigService } from "../config/config.service";
import WebSocket from "ws";
import { ClientMessage } from "../types";

describe("ProxyGateway (Integration)", () => {
  let app: any;
  let mockLiveSessionService: jest.Mocked<LiveSessionService>;
  let mockLiveSession: jest.Mocked<LiveSession>;
  let serverPort: number;

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

    const mockConfigService = {
      getGeminiApiKey: jest.fn().mockReturnValue("mock-api-key"),
      getPort: jest.fn().mockReturnValue(0),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
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

    app = moduleFixture.createNestApplication();
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.init();

    // Bind to a dynamic port allocated by the OS (port 0)
    const httpServer = await app.listen(0);
    serverPort = httpServer.address().port;
  });

  afterEach(async () => {
    await app.close();
  });

  it("should establish connection, perform setup, and relay client messages", (done) => {
    const ws = new WebSocket(`ws://localhost:${serverPort}`);

    ws.on("open", () => {
      // 1. Send Setup Config message
      const setupMsg: ClientMessage = {
        type: "setup",
        config: {
          model: "models/gemini-3.1-flash-live-preview",
          systemInstruction: "You are a helpful assistant.",
        },
      };
      ws.send(JSON.stringify(setupMsg));

      // Wait briefly for WS message delivery and verify mocks
      setTimeout(() => {
        expect(mockLiveSessionService.createSession).toHaveBeenCalled();
        expect(mockLiveSession.sendSetup).toHaveBeenCalledWith(setupMsg.config);

        // 2. Send client text content
        const textMsg: ClientMessage = {
          type: "client_content",
          content: {
            turns: [{ role: "user", parts: [{ text: "Hello!" }] }],
          },
        };
        ws.send(JSON.stringify(textMsg));

        setTimeout(() => {
          expect(mockLiveSession.sendClientContent).toHaveBeenCalledWith(textMsg.content);

          // 3. Send binary audio data
          const dummyAudio = Buffer.alloc(100);
          ws.send(dummyAudio);

          setTimeout(() => {
            expect(mockLiveSession.sendAudio).toHaveBeenCalled();
            ws.close();
          }, 100);
        }, 100);
      }, 100);
    });

    ws.on("close", () => {
      // 4. Verify that the session is destroyed on disconnect
      expect(mockLiveSession.destroy).toHaveBeenCalled();
      done();
    });

    ws.on("error", (error) => {
      done(error);
    });
  });
});
