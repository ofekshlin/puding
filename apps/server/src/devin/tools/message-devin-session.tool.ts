import { Inject, Injectable } from "@nestjs/common";
import {
  GeminiTool,
  ToolContext,
  requireUserId,
} from "../../gemini/gemini-tool.interface";
import { sessionCard } from "../devin-card";
import { CodingAgentService } from "../coding-agent.interface";
import { DEVIN_TOOL_INSTRUCTIONS } from "../devin-instructions";
import { SessionResolver } from "../session-resolver.service";
import {
  SESSION_ARG,
  spokenState,
  unresolvedOutput,
} from "./devin-tool.helpers";

@Injectable()
export class MessageDevinSessionTool extends GeminiTool {
  readonly name = "message_devin_session";
  readonly requires = "devin" as const;
  readonly instructions = DEVIN_TOOL_INSTRUCTIONS;

  readonly declaration = {
    name: this.name,
    description:
      "Sends a message to a Devin session: approving a plan ('go ahead'), answering, or steering. Wakes the session if it is asleep.",
    parameters: {
      type: "OBJECT",
      properties: {
        session: SESSION_ARG,
        message: {
          type: "STRING",
          description:
            "The message for Devin, keeping every detail and condition the user gave.",
        },
      },
      required: ["session", "message"],
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
    args: { session?: string; message: string },
    context?: ToolContext,
  ) {
    const result = await this.resolver.resolve(context, args.session);
    if (result.status !== "resolved") {
      return { output: unresolvedOutput(result) };
    }

    const updated = await this.codingAgent.sendMessage(
      requireUserId(context),
      result.session.id,
      args.message,
    );
    return {
      clientIntegration: sessionCard(updated),
      output: {
        status: "sent",
        title: updated.title,
        state: spokenState(updated),
      },
    };
  }
}
