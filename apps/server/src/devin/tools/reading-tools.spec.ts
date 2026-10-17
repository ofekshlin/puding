import { AgentSession, CodingAgentService } from "../coding-agent.interface";
import { DilemmaParser } from "../dilemma-parser.service";
import { SessionResolver } from "../session-resolver.service";
import { SpokenReader } from "../spoken-reader.service";
import { AnswerDevinQuestionTool } from "./answer-devin-question.tool";
import { ReadDevinMessageTool } from "./read-devin-message.tool";

const dark: AgentSession = {
  id: "devin-dark",
  title: "Add dark mode toggle",
  state: "waiting_for_user",
  url: "https://app.devin.ai/sessions/dark",
  tags: ["puding"],
  pullRequests: [],
  updatedAt: 0,
};

const PLAN =
  "## Plan\nThree stages.\n## Stage 1: CSS variables\nMove colours.\n## Stage 2: Toggle\nAdd it.\n## Stage 3: Persist\nSave it.";
const QUESTION =
  "Should the theme follow the system setting?\n1. Always follow the system.\n2. Default to the system but allow an override.\nI recommend option 2.";

describe("Devin reading tools", () => {
  const ctx = { sessionId: "conv" };
  let agent: jest.Mocked<CodingAgentService>;
  let resolver: SessionResolver;
  let reader: SpokenReader;
  let parser: DilemmaParser;
  let read: ReadDevinMessageTool;
  let answer: AnswerDevinQuestionTool;

  beforeEach(() => {
    agent = {
      isConfigured: jest.fn().mockReturnValue(true),
      listSessions: jest.fn().mockResolvedValue([dark]),
      getSession: jest.fn().mockResolvedValue(dark),
      getMessages: jest.fn().mockResolvedValue([
        { from: "user", text: "Plan dark mode", at: 1 },
        { from: "agent", text: PLAN, at: 2 },
        { from: "agent", text: QUESTION, at: 3 },
      ]),
      sendMessage: jest.fn().mockResolvedValue({ ...dark, state: "working" }),
      startSession: jest.fn(),
      stopSession: jest.fn(),
    } as any;
    resolver = new SessionResolver(agent);
    reader = new SpokenReader();
    parser = new DilemmaParser();
    read = new ReadDevinMessageTool(agent, resolver, reader, parser);
    answer = new AnswerDevinQuestionTool(agent, resolver, reader, parser);
  });

  it("reads the plan as an outline, then section by section", async () => {
    const outline = await read.execute({ session: "it", what: "plan" }, ctx);
    expect(outline.output).toMatchObject({
      kind: "outline",
      total: 4,
      verbatim: true,
    });

    const next = await read.execute({ session: "it", navigate: "next" }, ctx);
    expect(next.output).toMatchObject({
      title: "1 of 4: Plan",
      text: "Three stages.",
    });

    const skip = await read.execute(
      { session: "it", navigate: "stage 3" },
      ctx,
    );
    expect(skip.output).toMatchObject({
      title: "4 of 4: Stage 3: Persist",
      text: "Save it.",
    });
    expect(agent.getMessages).toHaveBeenCalledTimes(1);
  });

  it("reads Devin's question with every option", async () => {
    const { output } = await read.execute(
      { session: "it", what: "question" },
      ctx,
    );
    expect(output).toMatchObject({
      kind: "question",
      question: "Should the theme follow the system setting?",
      options: [
        { label: "1", text: "Always follow the system." },
        { label: "2", text: "Default to the system but allow an override." },
      ],
      recommendation: { label: "2" },
      verbatim: true,
    });
  });

  it("answers with the full option text plus the user's additions", async () => {
    await read.execute({ session: "it", what: "question" }, ctx);
    const { output } = await answer.execute(
      {
        session: "it",
        choice: "the one you recommended",
        extra: "and default to dark",
      },
      ctx,
    );
    expect(agent.sendMessage).toHaveBeenCalledWith(
      "devin-dark",
      "Option 2: Default to the system but allow an override.\n\nand default to dark",
    );
    expect(output).toMatchObject({ status: "sent", state: "working" });
  });

  it("parses the latest message when the question wasn't read first", async () => {
    await answer.execute({ session: "it", choice: "one" }, ctx);
    expect(agent.sendMessage).toHaveBeenCalledWith(
      "devin-dark",
      "Option 1: Always follow the system.",
    );
  });

  it("asks again for unclear choices and sends free-form answers as-is", async () => {
    const unclear = await answer.execute(
      { session: "it", choice: "redis" },
      ctx,
    );
    expect(unclear.output).toMatchObject({ status: "unclear_choice" });
    expect(agent.sendMessage).not.toHaveBeenCalled();

    await answer.execute({ session: "it", extra: "Neither, use Redis" }, ctx);
    expect(agent.sendMessage).toHaveBeenCalledWith(
      "devin-dark",
      "Neither, use Redis",
    );
  });
});
