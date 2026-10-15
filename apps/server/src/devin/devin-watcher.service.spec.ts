import { ConfigService } from "../config/config.service";
import { AgentSession, CodingAgentService } from "./coding-agent.interface";
import { DevinUpdateSubscriber, DevinWatcher } from "./devin-watcher.service";
import { DilemmaParser } from "./dilemma-parser.service";
import { SpokenReader } from "./spoken-reader.service";

const session = (state: AgentSession["state"]): AgentSession => ({
  id: "devin-dark",
  title: "Add dark mode toggle",
  state,
  url: "https://app.devin.ai/sessions/dark",
  tags: ["puding"],
  pullRequests: [],
  updatedAt: 0,
});

describe("DevinWatcher", () => {
  let agent: jest.Mocked<CodingAgentService>;
  let config: jest.Mocked<ConfigService>;
  let reader: SpokenReader;
  let watcher: DevinWatcher;
  let subscriber: DevinUpdateSubscriber & { onDevinUpdate: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    agent = {
      isConfigured: jest.fn().mockReturnValue(true),
      listSessions: jest.fn().mockResolvedValue([session("working")]),
      getMessages: jest.fn().mockResolvedValue([]),
    } as any;
    config = {
      isPreview: jest.fn().mockReturnValue(false),
      isDevinEnabledInPreview: jest.fn().mockReturnValue(false),
      getDevinPollIntervalMs: jest.fn().mockReturnValue(20000),
    } as any;
    reader = new SpokenReader();
    watcher = new DevinWatcher(agent, config, new DilemmaParser(), reader);
    subscriber = { sessionId: "conv", onDevinUpdate: jest.fn() };
  });

  afterEach(() => {
    watcher.onModuleDestroy();
    jest.useRealTimers();
  });

  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  it("seeds state on the first poll without announcing", async () => {
    agent.listSessions.mockResolvedValue([session("finished")]);
    watcher.subscribe(subscriber);
    await flush();
    expect(agent.listSessions).toHaveBeenCalledTimes(1);
    expect(subscriber.onDevinUpdate).not.toHaveBeenCalled();
  });

  it("announces a transition into a waiting state with a card and a note", async () => {
    watcher.subscribe(subscriber);
    await flush();

    agent.listSessions.mockResolvedValue([session("finished")]);
    agent.getMessages.mockResolvedValue([
      { from: "agent", text: "I opened the PR. All checks pass.", at: 1 },
    ]);
    await watcher.poll();

    expect(subscriber.onDevinUpdate).toHaveBeenCalledTimes(1);
    const update = subscriber.onDevinUpdate.mock.calls[0][0];
    expect(update.note).toContain(
      '[Devin update] Session "Add dark mode toggle" is now finished.',
    );
    expect(update.note).toContain(
      "Devin said: I opened the PR. All checks pass.",
    );
    expect(update.card.data).toMatchObject({
      kind: "session",
      state: "finished",
    });

    await watcher.poll();
    expect(subscriber.onDevinUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not announce transitions into working or asleep", async () => {
    agent.listSessions.mockResolvedValue([session("waiting_for_user")]);
    watcher.subscribe(subscriber);
    await flush();
    agent.listSessions.mockResolvedValue([session("working")]);
    await watcher.poll();
    agent.listSessions.mockResolvedValue([session("sleeping")]);
    await watcher.poll();
    expect(subscriber.onDevinUpdate).not.toHaveBeenCalled();
  });

  it("flags questions and primes the reader for each subscriber", async () => {
    watcher.subscribe(subscriber);
    await flush();

    agent.listSessions.mockResolvedValue([session("waiting_for_user")]);
    agent.getMessages.mockResolvedValue([
      { from: "agent", text: "Which database?\nA) Postgres\nB) SQLite", at: 1 },
    ]);
    await watcher.poll();

    const update = subscriber.onDevinUpdate.mock.calls[0][0];
    expect(update.note).toContain("Devin has a question with 2 options");
    expect(
      reader.lastDilemma({ sessionId: "conv" }, "devin-dark")?.options,
    ).toHaveLength(2);
  });

  it("polls on an interval only while someone is subscribed", async () => {
    const unsubscribe = watcher.subscribe(subscriber);
    await flush();
    jest.advanceTimersByTime(20000);
    await flush();
    expect(agent.listSessions).toHaveBeenCalledTimes(2);

    unsubscribe();
    jest.advanceTimersByTime(60000);
    await flush();
    expect(agent.listSessions).toHaveBeenCalledTimes(2);
  });

  it("does nothing when Devin is disabled", () => {
    agent.isConfigured.mockReturnValue(false);
    watcher.subscribe(subscriber);
    expect(agent.listSessions).not.toHaveBeenCalled();
  });

  it("swallows polling errors", async () => {
    agent.listSessions.mockRejectedValue(new Error("Devin is down"));
    await expect(watcher.poll()).resolves.toBeUndefined();
  });
});
