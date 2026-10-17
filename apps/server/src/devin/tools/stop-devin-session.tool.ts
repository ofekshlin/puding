import { Inject, Injectable } from "@nestjs/common";
import { GeminiTool, ToolContext } from "../../gemini/gemini-tool.interface";
import { devinCard, sessionCard } from "../devin-card";
import { CodingAgentService } from "../coding-agent.interface";
import { DEVIN_TOOL_INSTRUCTIONS } from "../devin-instructions";
import { SessionResolver } from "../session-resolver.service";
import { SESSION_ARG, unresolvedOutput } from "./devin-tool.helpers";

@Injectable()
export class StopDevinSessionTool extends GeminiTool {
  readonly name = "stop_devin_session";
  readonly instructions = DEVIN_TOOL_INSTRUCTIONS;

  readonly declaration = {
    name: this.name,
    description:
      "Permanently stops a Devin session. Call first with confirmed=false to get a read-back, read it to the user, and call again with confirmed=true only after they agree. This cannot be undone.",
    parameters: {
      type: "OBJECT",
      properties: {
        session: SESSION_ARG,
        confirmed: {
          type: "BOOLEAN",
          description:
            "true only after the user explicitly agreed to the read-back.",
        },
      },
      required: ["session", "confirmed"],
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
    args: { session?: string; confirmed?: boolean },
    context?: ToolContext,
  ) {
    const result = await this.resolver.resolve(context, args.session);
    if (result.status !== "resolved") {
      return { output: unresolvedOutput(result) };
    }
    const { session } = result;

    if (args.confirmed !== true) {
      const readBack = `Stop the Devin session "${session.title}"? This can't be undone.`;
      return {
        clientIntegration: devinCard({
          kind: "confirm",
          action: "stop",
          readBack,
        }),
        output: {
          status: "needs_confirmation",
          readBack,
          instruction:
            "Read this back and call again with confirmed=true only after the user says yes.",
        },
      };
    }

    await this.codingAgent.stopSession(session.id);
    return {
      clientIntegration: sessionCard({
        ...session,
        state: "stopped",
        stateReason: undefined,
      }),
      output: { status: "stopped", title: session.title },
    };
  }
}
