import { Injectable, Inject } from "@nestjs/common";
import { GeminiTool } from "../../gemini/gemini-tool.interface";
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
  ) {
    super();
  }

  async execute(args: { query: string }): Promise<{
    output: any;
    clientIntegration?: Extract<
      ServerMessage,
      { type: "content" }
    >["integration"];
  }> {
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
