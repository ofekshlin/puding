import { ConfigService } from "../../config/config.service";
import { AgentSession, CodingAgentService } from "../coding-agent.interface";
import { DilemmaParser } from "../dilemma-parser.service";
import { SessionResolver } from "../session-resolver.service";
import { SpokenReader } from "../spoken-reader.service";
import { GetDevinSessionTool } from "./get-devin-session.tool";
import { ListDevinSessionsTool } from "./list-devin-sessions.tool";
import { ReadDevinMessageTool } from "./read-devin-message.tool";
import { StartDevinSessionTool } from "./start-devin-session.tool";
import { StopDevinSessionTool } from "./stop-devin-session.tool";

const dark: AgentSession = {
  id: "devin-dark",
  title: "Add dark mode toggle",
  state: "waiting_for_user",
  url: "https://app.devin.ai/sessions/dark",
  tags: ["puding"],
  pullRequests: [{ url: "https://github.com/o/r/pull/1", state: "open" }],
  updatedAt: 0,
};

const PLAN = "## Stage 1\nOne.\n## Stage 2\nTwo.";
const QUESTION = "Which one?\nA) Postgres\nB) SQLite\nI recommend option B.";

describe("Devin client cards", () => {
  const ctx = { sessionId: "conv", userId: "u1" };
  let agent: jest.Mocked<CodingAgentService>;
  let resolver: SessionResolver;
  let config: jest.Mocked<ConfigService>;

  beforeEach(() => {
    agent = {
      isConfigured: jest.fn().mockReturnValue(true),
      listSessions: jest.fn().mockResolvedValue([dark]),
      getSession: jest.fn().mockResolvedValue(dark),
      getMessages: jest.fn().mockResolvedValue([
        { from: "agent", text: PLAN, at: 1 },
        { from: "agent", text: QUESTION, at: 2 },
      ]),
      sendMessage: jest.fn(),
      startSession: jest.fn().mockResolvedValue(dark),
      stopSession: jest.fn().mockResolvedValue(undefined),
    } as any;
    resolver = new SessionResolver(agent);
    config = {
      getDevinDefaultRepo: jest.fn().mockReturnValue("ofekshlin/puding"),
    } as any;
  });

  it("shows a pending confirm card, then the started session", async () => {
    const tool = new StartDevinSessionTool(agent, resolver, config);
    const pending = await tool.execute({ task: "Add dark mode" }, ctx);
    expect(pending.clientIntegration).toEqual({
      type: "devin",
      data: {
        kind: "confirm",
        action: "start",
        readBack:
          'Start a Devin plan session on ofekshlin/puding: "Add dark mode"?',
      },
    });

    const started = await tool.execute(
      { task: "Add dark mode", confirmed: true },
      ctx,
    );
    expect(started.clientIntegration?.data).toMatchObject({
      kind: "session",
      title: "Add dark mode toggle",
      state: "waiting_for_user",
      url: dark.url,
      pullRequests: dark.pullRequests,
    });
  });

  it("shows numbered list rows matching the spoken ordinals", async () => {
    const { clientIntegration } = await new ListDevinSessionsTool(
      agent,
      resolver,
    ).execute({}, ctx);
    expect(clientIntegration?.data).toEqual({
      kind: "list",
      filter: "active",
      sessions: [
        { index: 1, title: dark.title, state: dark.state, url: dark.url },
      ],
    });
  });

  it("puts Devin's full latest message on the session card", async () => {
    const { clientIntegration } = await new GetDevinSessionTool(
      agent,
      resolver,
    ).execute({ session: "it" }, ctx);
    expect(clientIntegration?.data).toMatchObject({
      kind: "session",
      latestMessage: QUESTION,
    });
  });

  it("marks the stopped session on the card after confirmation", async () => {
    const tool = new StopDevinSessionTool(agent, resolver);
    const pending = await tool.execute({ session: "it" }, ctx);
    expect(pending.clientIntegration?.data).toMatchObject({
      kind: "confirm",
      action: "stop",
    });

    const stopped = await tool.execute({ session: "it", confirmed: true }, ctx);
    expect(stopped.clientIntegration?.data).toMatchObject({
      kind: "session",
      state: "stopped",
    });
  });

  it("highlights the section being read and shows question options", async () => {
    const tool = new ReadDevinMessageTool(
      agent,
      resolver,
      new SpokenReader(),
      new DilemmaParser(),
    );
    await tool.execute({ session: "it", what: "plan" }, ctx);
    const next = await tool.execute({ session: "it", navigate: "next" }, ctx);
    expect(next.clientIntegration?.data).toEqual({
      kind: "reading",
      title: dark.title,
      url: dark.url,
      sections: [
        { heading: "Stage 1", text: "One." },
        { heading: "Stage 2", text: "Two." },
      ],
      current: 1,
    });

    const question = await tool.execute(
      { session: "it", what: "question" },
      ctx,
    );
    expect(question.clientIntegration?.data).toMatchObject({
      kind: "question",
      question: "Which one?",
      options: [
        { label: "A", text: "Postgres" },
        { label: "B", text: "SQLite" },
      ],
      recommendation: { label: "B" },
    });
  });
});
