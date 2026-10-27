import { AgentSession, CodingAgentService } from "./coding-agent.interface";
import { SessionResolver } from "./session-resolver.service";

function session(id: string, title: string, updatedAt = 0): AgentSession {
  return {
    id,
    title,
    state: "working",
    url: `https://app.devin.ai/sessions/${id}`,
    tags: ["puding"],
    pullRequests: [],
    updatedAt,
  };
}

describe("SessionResolver", () => {
  const login = session("devin-login", "Fix the login bug", 300);
  const loginPage = session("devin-page", "Redesign the login page", 200);
  const darkMode = session("devin-dark", "Add dark mode toggle", 100);
  const ctxA = { sessionId: "a", userId: "u1" };
  const ctxB = { sessionId: "b", userId: "u1" };

  let agent: jest.Mocked<CodingAgentService>;
  let resolver: SessionResolver;

  beforeEach(() => {
    agent = {
      isConfigured: jest.fn().mockReturnValue(true),
      startSession: jest.fn(),
      listSessions: jest.fn().mockResolvedValue([login, loginPage, darkMode]),
      getSession: jest.fn(
        async (_userId: string, id: string) =>
          [login, loginPage, darkMode].find((s) => s.id === id) ??
          session(id, "Other"),
      ),
      getMessages: jest.fn(),
      sendMessage: jest.fn(),
      stopSession: jest.fn(),
    } as any;
    resolver = new SessionResolver(agent);
  });

  it("resolves literal devin ids", async () => {
    const result = await resolver.resolve(ctxA, "check devin-dark please");
    expect(result).toEqual({ status: "resolved", session: darkMode });
    expect(agent.getSession).toHaveBeenCalledWith("u1", "devin-dark");
  });

  it("resolves 'it' to the focused session of the same conversation only", async () => {
    resolver.setFocus(ctxA, darkMode);

    expect(await resolver.resolve(ctxA, "it")).toEqual({
      status: "resolved",
      session: darkMode,
    });
    // Conversation B has no focus, so it falls back to the latest session.
    expect(await resolver.resolve(ctxB, "that one")).toEqual({
      status: "resolved",
      session: login,
    });
  });

  it("resolves recency words to the latest puding session", async () => {
    agent.listSessions.mockResolvedValueOnce([login]);
    expect(await resolver.resolve(ctxA, "the latest one")).toEqual({
      status: "resolved",
      session: login,
    });
    expect(agent.listSessions).toHaveBeenCalledWith("u1", { limit: 1 });
  });

  it("reports when there are no sessions", async () => {
    agent.listSessions.mockResolvedValueOnce([]);
    expect(await resolver.resolve(ctxA, "latest")).toMatchObject({
      status: "not_found",
    });
  });

  it("resolves ordinals against the last list shown", async () => {
    resolver.rememberList(ctxA, [darkMode, login]);
    expect(await resolver.resolve(ctxA, "the second one")).toEqual({
      status: "resolved",
      session: login,
    });
    expect(await resolver.resolve(ctxA, "number 1")).toEqual({
      status: "resolved",
      session: darkMode,
    });
    expect(await resolver.resolve(ctxA, "3rd")).toMatchObject({
      status: "not_found",
    });
  });

  it("fuzzy-matches titles and sets focus", async () => {
    const result = await resolver.resolve(ctxA, "the dark mode one");
    expect(result).toEqual({ status: "resolved", session: darkMode });
    expect(agent.listSessions).toHaveBeenCalledWith("u1", {
      onlyPuding: false,
      limit: 20,
    });
    expect(await resolver.resolve(ctxA, "it")).toEqual({
      status: "resolved",
      session: darkMode,
    });
  });

  it("reports ambiguity instead of guessing", async () => {
    expect(await resolver.resolve(ctxA, "the login one")).toEqual({
      status: "ambiguous",
      candidates: ["Fix the login bug", "Redesign the login page"],
    });
  });

  it("prefers the clearly better fuzzy match", async () => {
    expect(await resolver.resolve(ctxA, "login bug")).toEqual({
      status: "resolved",
      session: login,
    });
  });

  it("reports when nothing matches", async () => {
    expect(await resolver.resolve(ctxA, "spotify playlists")).toMatchObject({
      status: "not_found",
    });
  });
});
