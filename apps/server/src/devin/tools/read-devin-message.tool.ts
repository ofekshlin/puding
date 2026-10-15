import { Inject, Injectable } from "@nestjs/common";
import { GeminiTool, ToolContext } from "../../gemini/gemini-tool.interface";
import { AgentMessage, CodingAgentService } from "../coding-agent.interface";
import { DEVIN_TOOL_INSTRUCTIONS } from "../devin-instructions";
import { DilemmaParser } from "../dilemma-parser.service";
import { SessionResolver } from "../session-resolver.service";
import { ReadNavigation, SpokenReader } from "../spoken-reader.service";
import { SESSION_ARG, unresolvedOutput } from "./devin-tool.helpers";

type ReadWhat = "latest" | "plan" | "question";

const NAVIGATIONS = ["start", "next", "repeat", "previous", "outline"];

@Injectable()
export class ReadDevinMessageTool extends GeminiTool {
  readonly name = "read_devin_message";
  readonly instructions = DEVIN_TOOL_INSTRUCTIONS;

  readonly declaration = {
    name: this.name,
    description:
      "Reads a Devin message aloud word for word, one part at a time: the latest message, the latest plan, or Devin's open question with every option. Use navigate for 'next', 'repeat', 'go back', 'outline' or 'skip to stage 3'.",
    parameters: {
      type: "OBJECT",
      properties: {
        session: SESSION_ARG,
        what: {
          type: "STRING",
          enum: ["latest", "plan", "question"],
          description:
            "'latest' (default): Devin's latest message. 'plan': the latest plan. 'question': Devin's open question and its options.",
        },
        navigate: {
          type: "STRING",
          description:
            "Optional: 'start', 'next', 'repeat', 'previous', 'outline', or a stage/section number like '3'. Omit to start a new reading.",
        },
      },
      required: ["session"],
    },
  };

  constructor(
    @Inject(CodingAgentService)
    private readonly codingAgent: CodingAgentService,
    @Inject(SessionResolver) private readonly resolver: SessionResolver,
    @Inject(SpokenReader) private readonly reader: SpokenReader,
    @Inject(DilemmaParser) private readonly dilemmas: DilemmaParser,
  ) {
    super();
  }

  async execute(
    args: { session?: string; what?: ReadWhat; navigate?: string | number },
    context?: ToolContext,
  ) {
    const result = await this.resolver.resolve(context, args.session);
    if (result.status !== "resolved") {
      return { output: unresolvedOutput(result) };
    }
    const session = result.session;
    const navigate = ReadDevinMessageTool.parseNavigation(args.navigate);
    const what: ReadWhat = args.what ?? "latest";

    if (navigate !== undefined && navigate !== "start" && what !== "question") {
      const continued = this.reader.continueReading(
        context,
        session.id,
        navigate,
      );
      if (continued) {
        return { output: { session: session.title, ...continued } };
      }
    }

    const agentMessages = (
      await this.codingAgent.getMessages(session.id, { last: 30 })
    ).filter((m) => m.from === "agent");
    const message = this.pick(agentMessages, what);
    if (!message) {
      return {
        output: {
          status: "empty",
          message: "Devin hasn't sent a message yet.",
        },
      };
    }

    if (what === "question") {
      const dilemma = this.dilemmas.parse(message.text);
      if (dilemma) {
        this.reader.rememberDilemma(context, session.id, dilemma);
        return {
          output: {
            kind: "question",
            session: session.title,
            question: dilemma.question,
            options: dilemma.options,
            recommendation: dilemma.recommendation,
            verbatim: true,
            instruction:
              "Read the question, then every option word for word with its label, then Devin's recommendation, then ask 'Which one?'.",
          },
        };
      }
    }

    return {
      output: {
        session: session.title,
        ...this.reader.read(context, session.id, message, navigate),
      },
    };
  }

  private pick(
    messages: AgentMessage[],
    what: ReadWhat,
  ): AgentMessage | undefined {
    const latest = messages[messages.length - 1];
    if (what === "plan") {
      const newestFirst = [...messages].reverse();
      return (
        newestFirst.find((m) => /\bplan\b/i.test(m.text)) ??
        newestFirst.find((m) => SpokenReader.toSections(m.text).length >= 3) ??
        latest
      );
    }
    if (what === "question") {
      return (
        [...messages].reverse().find((m) => m.text.includes("?")) ?? latest
      );
    }
    return latest;
  }

  private static parseNavigation(
    raw?: string | number,
  ): ReadNavigation | undefined {
    if (raw === undefined || raw === null || raw === "") return undefined;
    if (typeof raw === "number") return raw;
    const value = raw.trim().toLowerCase();
    if (value === "back" || value === "go back") return "previous";
    if (NAVIGATIONS.includes(value)) return value as ReadNavigation;
    const number = value.match(/\d+/);
    return number ? parseInt(number[0], 10) : undefined;
  }
}
