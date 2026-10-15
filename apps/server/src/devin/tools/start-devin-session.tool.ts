import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "../../config/config.service";
import { GeminiTool, ToolContext } from "../../gemini/gemini-tool.interface";
import {
  AgentIntent,
  AgentMode,
  CodingAgentService,
} from "../coding-agent.interface";
import { DEVIN_TOOL_INSTRUCTIONS } from "../devin-instructions";
import { SessionResolver } from "../session-resolver.service";
import { spokenState } from "./devin-tool.helpers";

@Injectable()
export class StartDevinSessionTool extends GeminiTool {
  readonly name = "start_devin_session";
  readonly instructions = DEVIN_TOOL_INSTRUCTIONS;

  readonly declaration = {
    name: this.name,
    description:
      "Starts a new Devin coding agent session. Call first with confirmed=false to get a read-back, read it to the user, and call again with confirmed=true only after they agree. Starting a session costs money.",
    parameters: {
      type: "OBJECT",
      properties: {
        task: {
          type: "STRING",
          description:
            "What Devin should do, in the user's words, with every detail they gave.",
        },
        intent: {
          type: "STRING",
          enum: ["plan", "build"],
          description:
            "'plan' (default): Devin investigates and sends a plan, then waits for approval. 'build': Devin implements and opens a PR.",
        },
        repo: {
          type: "STRING",
          description:
            "Optional repository: a spoken alias like 'puding' or 'owner/name'. Omit for the default repo.",
        },
        mode: {
          type: "STRING",
          enum: ["normal", "fast", "lite", "ultra", "fusion"],
          description:
            "Optional Devin mode. Omit unless the user asks for one.",
        },
        confirmed: {
          type: "BOOLEAN",
          description:
            "true only after the user explicitly agreed to the read-back.",
        },
      },
      required: ["task", "confirmed"],
    },
  };

  constructor(
    @Inject(CodingAgentService)
    private readonly codingAgent: CodingAgentService,
    @Inject(SessionResolver) private readonly resolver: SessionResolver,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    super();
  }

  async execute(
    args: {
      task: string;
      intent?: AgentIntent;
      repo?: string;
      mode?: AgentMode;
      confirmed?: boolean;
    },
    context?: ToolContext,
  ) {
    const intent: AgentIntent = args.intent === "build" ? "build" : "plan";
    const task = (args.task ?? "").trim();
    const repoLabel =
      args.repo?.trim() ||
      this.configService.getDevinDefaultRepo() ||
      "the default repo";

    if (args.confirmed !== true) {
      return {
        output: {
          status: "needs_confirmation",
          readBack: `Start a Devin ${intent} session on ${repoLabel}: "${task}"?`,
          instruction:
            "Read this back and call again with confirmed=true only after the user says yes.",
        },
      };
    }

    const session = await this.codingAgent.startSession({
      task,
      intent,
      repo: args.repo,
      mode: args.mode,
    });
    this.resolver.setFocus(context, session);

    return {
      output: {
        status: "started",
        title: session.title,
        intent,
        state: spokenState(session),
      },
    };
  }
}
