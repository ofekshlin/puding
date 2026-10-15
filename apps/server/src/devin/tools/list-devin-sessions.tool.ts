import { Inject, Injectable } from "@nestjs/common";
import { GeminiTool, ToolContext } from "../../gemini/gemini-tool.interface";
import { devinCard } from "../devin-card";
import { AgentSession, CodingAgentService } from "../coding-agent.interface";
import { DEVIN_TOOL_INSTRUCTIONS } from "../devin-instructions";
import { SessionResolver } from "../session-resolver.service";
import { spokenState } from "./devin-tool.helpers";

type ListFilter = "active" | "needs_me" | "all";

const FILTERS: Record<ListFilter, (s: AgentSession) => boolean> = {
  active: (s) =>
    s.state === "working" ||
    s.state === "waiting_for_user" ||
    s.state === "waiting_for_approval",
  needs_me: (s) =>
    s.state === "waiting_for_user" || s.state === "waiting_for_approval",
  all: () => true,
};

@Injectable()
export class ListDevinSessionsTool extends GeminiTool {
  readonly name = "list_devin_sessions";
  readonly instructions = DEVIN_TOOL_INSTRUCTIONS;

  readonly declaration = {
    name: this.name,
    description:
      "Lists the user's Devin sessions started from Puding, newest first, numbered so the user can say 'the second one'.",
    parameters: {
      type: "OBJECT",
      properties: {
        filter: {
          type: "STRING",
          enum: ["active", "needs_me", "all"],
          description:
            "'active' (default): working or waiting. 'needs_me': waiting for the user. 'all': including finished and stopped.",
        },
        limit: {
          type: "NUMBER",
          description: "How many sessions to return (default 5).",
        },
      },
    },
  };

  constructor(
    @Inject(CodingAgentService)
    private readonly codingAgent: CodingAgentService,
    @Inject(SessionResolver) private readonly resolver: SessionResolver,
  ) {
    super();
  }

  async execute(
    args: { filter?: ListFilter; limit?: number },
    context?: ToolContext,
  ) {
    const filter: ListFilter =
      args.filter && args.filter in FILTERS ? args.filter : "active";
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 5), 1), 20);

    const sessions = (await this.codingAgent.listSessions({ limit: 50 }))
      .filter(FILTERS[filter])
      .slice(0, limit);
    this.resolver.rememberList(context, sessions);

    return {
      clientIntegration: devinCard({
        kind: "list",
        filter,
        sessions: sessions.map((s, i) => ({
          index: i + 1,
          title: s.title,
          state: s.state,
          url: s.url,
        })),
      }),
      output: {
        filter,
        count: sessions.length,
        sessions: sessions.map((s, i) => ({
          index: i + 1,
          title: s.title,
          state: spokenState(s),
          prCount: s.pullRequests.length,
        })),
      },
    };
  }
}
