import { Inject, Injectable } from "@nestjs/common";
import { GeminiTool, ToolContext } from "../../gemini/gemini-tool.interface";
import { sessionCard } from "../devin-card";
import { CodingAgentService } from "../coding-agent.interface";
import { DEVIN_TOOL_INSTRUCTIONS } from "../devin-instructions";
import { SessionResolver } from "../session-resolver.service";
import {
  SESSION_ARG,
  spokenState,
  unresolvedOutput,
} from "./devin-tool.helpers";

const SUMMARY_MAX_CHARS = 240;

@Injectable()
export class GetDevinSessionTool extends GeminiTool {
  readonly name = "get_devin_session";
  readonly instructions = DEVIN_TOOL_INSTRUCTIONS;

  readonly declaration = {
    name: this.name,
    description:
      "Gets a quick status of one Devin session: its state, pull requests, and a one-line summary of Devin's latest message.",
    parameters: {
      type: "OBJECT",
      properties: { session: SESSION_ARG },
      required: ["session"],
    },
  };

  constructor(
    @Inject(CodingAgentService)
    private readonly codingAgent: CodingAgentService,
    @Inject(SessionResolver) private readonly resolver: SessionResolver,
  ) {
    super();
  }

  async execute(args: { session?: string }, context?: ToolContext) {
    const result = await this.resolver.resolve(context, args.session);
    if (result.status !== "resolved") {
      return { output: unresolvedOutput(result) };
    }

    const session = result.session;
    const messages = await this.codingAgent.getMessages(session.id, {
      last: 10,
    });
    const latest = [...messages].reverse().find((m) => m.from === "agent");
    const waiting =
      session.state === "waiting_for_user" ||
      session.state === "waiting_for_approval";

    return {
      clientIntegration: sessionCard(session, latest?.text),
      output: {
        title: session.title,
        state: spokenState(session),
        pullRequests: session.pullRequests.map((pr) => ({
          state: pr.state ?? "unknown",
        })),
        ...(session.acusConsumed !== undefined && {
          acusUsed: Math.round(session.acusConsumed * 10) / 10,
        }),
        spokenSummary: latest
          ? GetDevinSessionTool.summarize(latest.text)
          : "Devin hasn't said anything yet.",
        hasQuestion: Boolean(waiting && latest?.text.includes("?")),
      },
    };
  }

  /**
   * First sentence or two of a Markdown message, without code, links or markup.
   */
  public static summarize(markdown: string): string {
    const plain = markdown
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/^\s*(#+|[-*+]|\d+\.|>)\s*/gm, "")
      .replace(/[*_~|]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (plain.length <= SUMMARY_MAX_CHARS) return plain;
    const cut = plain.slice(0, SUMMARY_MAX_CHARS);
    const sentenceEnd = Math.max(
      cut.lastIndexOf(". "),
      cut.lastIndexOf("? "),
      cut.lastIndexOf("! "),
    );
    return sentenceEnd > 40
      ? cut.slice(0, sentenceEnd + 1)
      : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
  }
}
