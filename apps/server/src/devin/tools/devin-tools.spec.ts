import { ConfigService } from "../../config/config.service";
import { AgentSession, CodingAgentService } from "../coding-agent.interface";
import { DEVIN_TOOL_INSTRUCTIONS } from "../devin-instructions";
import { SessionResolver } from "../session-resolver.service";
import { GetDevinSessionTool } from "./get-devin-session.tool";
import { ListDevinSessionsTool } from "./list-devin-sessions.tool";
import { MessageDevinSessionTool } from "./message-devin-session.tool";
import { StartDevinSessionTool } from "./start-devin-session.tool";
import { StopDevinSessionTool } from "./stop-devin-session.tool";

function session(
  id: string,
  title: string,
  state: AgentSession["state"] = "working",
): AgentSession {
  return {
    id,
    title,
    state,
    url: `https://app.devin.ai/sessions/${id}`,
    tags: ["puding"],
    pullRequests: [],
    updatedAt: 0,
  };
}

describe("Devin tools", () => {
  const ctx = { sessionId: "conv-1" };
  const darkMode = session("devin-dark", "Add dark mode toggle");

  let agent: jest.Mocked<CodingAgentService>;
  let resolver: SessionResolver;
  let config: jest.Mocked<ConfigService>;

  beforeEach(() => {
    agent = {
      isConfigured: jest.fn().mockReturnValue(true),
      startSession: jest.fn().mockResolvedValue(darkMode),
      listSessions: jest.fn().mockResolvedValue([darkMode]),
      getSession: jest.fn().mockResolvedValue(darkMode),
      getMessages: jest.fn().mockResolvedValue([]),
      sendMessage: jest.fn().mockResolvedValue(darkMode),
      stopSession: jest.fn().mockResolvedValue(undefined),
    } as any;
    resolver = new SessionResolver(agent);
    config = {
      getDevinDefaultRepo: jest.fn().mockReturnValue("ofekshlin/puding"),
    } as any;
  });

  it("declares names matching declarations and shares server instructions", () => {
    const tools = [
      new StartDevinSessionTool(agent, resolver, config),
      new ListDevinSessionsTool(agent, resolver),
      new GetDevinSessionTool(agent, resolver),
      new MessageDevinSessionTool(agent, resolver),
      new StopDevinSessionTool(agent, resolver),
    ];
    for (const tool of tools) {
      expect(tool.declaration.name).toBe(tool.name);
      expect(tool.instructions).toBe(DEVIN_TOOL_INSTRUCTIONS);
    }
  });

  describe("start_devin_session", () => {
    let tool: StartDevinSessionTool;
    beforeEach(() => {
      tool = new StartDevinSessionTool(agent, resolver, config);
    });

    it("only reads back when not confirmed", async () => {
      const { output } = await tool.execute(
        { task: "Add dark mode toggle", confirmed: false },
        ctx,
      );
      expect(output).toMatchObject({
        status: "needs_confirmation",
        readBack:
          'Start a Devin plan session on ofekshlin/puding: "Add dark mode toggle"?',
      });
      expect(agent.startSession).not.toHaveBeenCalled();
    });

    it("treats a missing confirmed flag as not confirmed", async () => {
      await tool.execute({ task: "x", intent: "build" } as any, ctx);
      expect(agent.startSession).not.toHaveBeenCalled();
    });

    it("starts the session once confirmed and focuses it", async () => {
      const { output } = await tool.execute(
        {
          task: "Add dark mode toggle",
          intent: "build",
          repo: "site",
          confirmed: true,
        },
        ctx,
      );
      expect(agent.startSession).toHaveBeenCalledWith({
        task: "Add dark mode toggle",
        intent: "build",
        repo: "site",
        mode: undefined,
      });
      expect(output).toMatchObject({ status: "started", intent: "build" });
      expect(await resolver.resolve(ctx, "it")).toMatchObject({
        status: "resolved",
        session: darkMode,
      });
    });
  });

  it("list_devin_sessions filters, numbers rows and remembers them for ordinals", async () => {
    const waiting = session("devin-w", "Fix login", "waiting_for_user");
    const done = session("devin-f", "Old task", "finished");
    agent.listSessions.mockResolvedValue([waiting, darkMode, done]);
    const tool = new ListDevinSessionsTool(agent, resolver);

    const { output } = await tool.execute({ filter: "needs_me" }, ctx);
    expect(output.sessions).toEqual([
      { index: 1, title: "Fix login", state: "waiting for you", prCount: 0 },
    ]);

    const active = await tool.execute({}, ctx);
    expect(active.output.sessions.map((s: any) => s.title)).toEqual([
      "Fix login",
      "Add dark mode toggle",
    ]);
    expect(await resolver.resolve(ctx, "the second one")).toMatchObject({
      session: darkMode,
    });
  });

  it("get_devin_session summarises Devin's latest message without code or links", async () => {
    agent.getSession.mockResolvedValue(
      session("devin-dark", "Add dark mode toggle", "waiting_for_user"),
    );
    agent.getMessages.mockResolvedValue([
      { from: "user", text: "Plan it", at: 1 },
      {
        from: "agent",
        text: "## Plan\nI'll add **CSS variables** in [globals](https://x.y).\n```css\n:root{}\n```\nShould I persist the choice?",
        at: 2,
      },
    ]);
    const tool = new GetDevinSessionTool(agent, resolver);

    const { output } = await tool.execute({ session: "devin-dark" }, ctx);
    expect(output).toMatchObject({
      title: "Add dark mode toggle",
      state: "waiting for you",
      hasQuestion: true,
      spokenSummary:
        "Plan I'll add CSS variables in globals. Should I persist the choice?",
    });
  });

  it("returns ambiguity to Gemini instead of acting", async () => {
    agent.listSessions.mockResolvedValue([
      session("devin-1", "Fix the login bug"),
      session("devin-2", "Redesign the login page"),
    ]);
    const tool = new MessageDevinSessionTool(agent, resolver);

    const { output } = await tool.execute(
      { session: "the login one", message: "go ahead" },
      ctx,
    );
    expect(output).toMatchObject({
      status: "ambiguous",
      candidates: ["Fix the login bug", "Redesign the login page"],
    });
    expect(agent.sendMessage).not.toHaveBeenCalled();
  });

  it("message_devin_session sends the message to the resolved session", async () => {
    resolver.setFocus(ctx, darkMode);
    const tool = new MessageDevinSessionTool(agent, resolver);
    const { output } = await tool.execute(
      { session: "it", message: "Go ahead, but skip the settings page" },
      ctx,
    );
    expect(agent.sendMessage).toHaveBeenCalledWith(
      "devin-dark",
      "Go ahead, but skip the settings page",
    );
    expect(output).toMatchObject({ status: "sent" });
  });

  it("stop_devin_session needs confirmation before terminating", async () => {
    const tool = new StopDevinSessionTool(agent, resolver);

    const first = await tool.execute({ session: "devin-dark" }, ctx);
    expect(first.output).toMatchObject({
      status: "needs_confirmation",
      readBack: `Stop the Devin session "Add dark mode toggle"? This can't be undone.`,
    });
    expect(agent.stopSession).not.toHaveBeenCalled();

    const second = await tool.execute(
      { session: "devin-dark", confirmed: true },
      ctx,
    );
    expect(agent.stopSession).toHaveBeenCalledWith("devin-dark");
    expect(second.output).toEqual({
      status: "stopped",
      title: "Add dark mode toggle",
    });
  });
});
