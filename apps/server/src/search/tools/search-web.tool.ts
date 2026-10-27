import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "../../config/config.service";
import { UsageLimiter } from "../../database/usage-limiter";
import {
  GeminiTool,
  ToolContext,
  requireUserId,
} from "../../gemini/gemini-tool.interface";

export const SEARCH_METRIC = "tavily_search";
import { SearchService } from "../search-service.interface";
import { ServerMessage } from "../../types";

@Injectable()
export class SearchWebTool extends GeminiTool {
  readonly name = "search_web";

  readonly declaration = {
    name: this.name,
    description:
      "Searches the live web/internet for facts, news, or general search queries.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: {
          type: "STRING",
          description: "The search query to look up on the internet.",
        },
      },
      required: ["query"],
    },
  };

  constructor(
    @Inject(SearchService) private readonly searchService: SearchService,
    @Inject(UsageLimiter) private readonly usage: UsageLimiter,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {
    super();
  }

  async execute(
    args: { query: string },
    context?: ToolContext,
  ): Promise<{
    output: any;
    clientIntegration?: Extract<
      ServerMessage,
      { type: "content" }
    >["integration"];
  }> {
    const allowed = await this.usage.tryConsume(
      requireUserId(context),
      SEARCH_METRIC,
      this.config.getTavilyDailyLimitPerUser(),
    );
    if (!allowed) {
      return {
        output: {
          error:
            "The daily web search limit for this user is used up. Tell the user it resets tomorrow.",
        },
      };
    }
    const results = await this.searchService.search(args.query);

    return {
      output: { results },
      clientIntegration: {
        type: "search",
        data: {
          query: args.query,
          results: results.slice(0, 3), // Send top 3 results to UI
        },
      },
    };
  }
}
