import WebSocket from "ws";
import { GeminiSession, USER_QUIET_MS } from "./gemini.session";

jest.mock("ws", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require("events");
  class FakeSocket extends EventEmitter {
    static OPEN = 1;
    static CONNECTING = 0;
    static instances: FakeSocket[] = [];
    readyState = 1;
    sent: any[] = [];
    constructor() {
      super();
      FakeSocket.instances.push(this);
    }
    send(payload: string) {
      this.sent.push(JSON.parse(payload));
    }
    close() {
      this.readyState = 3;
    }
  }
  return { __esModule: true, default: FakeSocket };
});

const FakeSocket = WebSocket as any;
type FakeSocket = any;

describe("GeminiSession system notes", () => {
  let client: FakeSocket;
  let gemini: FakeSocket;
  let session: GeminiSession;
  let unsubscribe: jest.Mock;

  const fromGemini = (msg: object) =>
    gemini.emit("message", Buffer.from(JSON.stringify(msg)));
  const notesSent = () =>
    gemini.sent.filter((m: any) =>
      m.clientContent?.turns?.[0]?.parts?.[0]?.text?.startsWith(
        "[Devin update]",
      ),
    );

  beforeEach(() => {
    jest.useFakeTimers();
    FakeSocket.instances = [];
    client = new FakeSocket();
    unsubscribe = jest.fn();
    session = new GeminiSession(
      client as any,
      "key",
      "conv",
      "user-1",
      { updateTokens: jest.fn() } as any,
      [],
      { subscribe: jest.fn().mockReturnValue(unsubscribe) },
    );
    gemini = FakeSocket.instances[1];
    gemini.emit("open");
    fromGemini({ setupComplete: {} });
  });

  afterEach(() => jest.useRealTimers());

  const update = {
    devinId: "devin-dark",
    state: "finished" as const,
    note: "[Devin update] Session is now finished.",
    card: { type: "devin" as const, data: { kind: "session" } },
  };

  it("sends the card to the client and the note when idle", () => {
    session.onDevinUpdate(update);
    expect(client.sent).toContainEqual({
      type: "content",
      integration: update.card,
    });
    expect(notesSent()).toHaveLength(1);
    expect(notesSent()[0].clientContent.turnComplete).toBe(true);
  });

  it("waits for the model to finish its turn", () => {
    fromGemini({ serverContent: { modelTurn: { parts: [{ text: "Hi" }] } } });
    session.onDevinUpdate(update);
    expect(notesSent()).toHaveLength(0);

    fromGemini({ serverContent: { turnComplete: true } });
    expect(notesSent()).toHaveLength(1);
  });

  it("waits until the user has been quiet", () => {
    fromGemini({ serverContent: { inputTranscription: { text: "so" } } });
    session.onDevinUpdate(update);
    expect(notesSent()).toHaveLength(0);

    jest.advanceTimersByTime(USER_QUIET_MS);
    expect(notesSent()).toHaveLength(1);
  });

  it("batches notes queued while busy into one turn", () => {
    fromGemini({ serverContent: { modelTurn: { parts: [{ text: "Hi" }] } } });
    session.onDevinUpdate(update);
    session.onDevinUpdate({ ...update, note: "[Devin update] Another." });
    fromGemini({ serverContent: { turnComplete: true } });
    expect(notesSent()).toHaveLength(1);
    expect(notesSent()[0].clientContent.turns[0].parts[0].text).toContain(
      "Another.",
    );
  });

  it("flushes queued notes after an interruption", () => {
    fromGemini({ serverContent: { modelTurn: { parts: [{ text: "Hi" }] } } });
    session.onDevinUpdate(update);
    fromGemini({ serverContent: { interrupted: true } });
    expect(notesSent()).toHaveLength(1);
  });

  it("treats loud microphone audio as speech, but not silence", () => {
    session.sendAudio(Buffer.alloc(3200));
    session.onDevinUpdate(update);
    expect(notesSent()).toHaveLength(1);

    const loud = Buffer.alloc(3200);
    for (let i = 0; i < 1600; i++)
      loud.writeInt16LE(i % 2 ? 8000 : -8000, i * 2);
    fromGemini({ serverContent: { modelTurn: { parts: [{ text: "Ok" }] } } });
    fromGemini({ serverContent: { turnComplete: true } });
    session.sendAudio(loud);
    session.onDevinUpdate({ ...update, note: "[Devin update] Second." });
    expect(notesSent()).toHaveLength(1);
    jest.advanceTimersByTime(USER_QUIET_MS);
    expect(notesSent()).toHaveLength(2);
  });

  it("unsubscribes on destroy", async () => {
    await Promise.resolve();
    session.destroy();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
