import { Inject, Injectable } from "@nestjs/common";
import {
  GeminiTool,
  ToolContext,
  requireUserId,
} from "../../gemini/gemini-tool.interface";
import { sessionCard } from "../devin-card";
import { CodingAgentService } from "../coding-agent.interface";
import { DEVIN_TOOL_INSTRUCTIONS } from "../devin-instructions";
import { DilemmaParser } from "../dilemma-parser.service";
import { SessionResolver } from "../session-resolver.service";
import { SpokenReader } from "../spoken-reader.service";
import {
  SESSION_ARG,
  spokenState,
  unresolvedOutput,
} from "./devin-tool.helpers";

@Injectable()
export class AnswerDevinQuestionTool extends GeminiTool {
  readonly name = "answer_devin_question";
  readonly requires = "devin" as const;
  readonly instructions = DEVIN_TOOL_INSTRUCTIONS;

  readonly declaration = {
    name: this.name,
    description:
      "Answers Devin's open question. Resolves the user's choice ('option two', 'B', 'the one you recommended') and sends Devin the full option text plus anything the user added.",
    parameters: {
      type: "OBJECT",
      properties: {
        session: SESSION_ARG,
        choice: {
          type: "STRING",
          description:
            "The chosen option as the user said it: a number, a letter, 'recommended', or words from the option. Omit for a free-form answer.",
        },
        extra: {
          type: "STRING",
          description:
            "Anything the user added or changed, in their words (e.g. 'and default to dark'), or the whole free-form answer.",
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
    args: { session?: string; choice?: string | number; extra?: string },
    context?: ToolContext,
  ) {
    const result = await this.resolver.resolve(context, args.session);
    if (result.status !== "resolved") {
      return { output: unresolvedOutput(result) };
    }
    const session = result.session;
    const extra = args.extra?.trim();
    const hasChoice =
      args.choice !== undefined && String(args.choice).trim() !== "";

    let reply: string;
    if (hasChoice) {
      const dilemma =
        this.reader.lastDilemma(context, session.id) ??
        (await this.latestDilemma(requireUserId(context), session.id));
      if (!dilemma) {
        return {
          output: {
            status: "no_question",
            message:
              "I couldn't find options in Devin's latest message. Send the answer as a free-form message instead.",
          },
        };
      }
      const option = this.dilemmas.resolveChoice(dilemma, args.choice!);
      if (!option) {
        return {
          output: {
            status: "unclear_choice",
            options: dilemma.options,
            instruction: "Ask the user which option they mean.",
          },
        };
      }
      reply = `Option ${option.label}: ${option.text}${extra ? `\n\n${extra}` : ""}`;
    } else if (extra) {
      reply = extra;
    } else {
      return {
        output: { status: "no_answer", message: "What should I tell Devin?" },
      };
    }

    const updated = await this.codingAgent.sendMessage(
      requireUserId(context),
      session.id,
      reply,
    );
    return {
      clientIntegration: sessionCard(updated),
      output: { status: "sent", sent: reply, state: spokenState(updated) },
    };
  }

  private async latestDilemma(userId: string, devinId: string) {
    const messages = await this.codingAgent.getMessages(userId, devinId, {
      last: 10,
    });
    const latest = [...messages].reverse().find((m) => m.from === "agent");
    return latest ? this.dilemmas.parse(latest.text) : undefined;
  }
}
