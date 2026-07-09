import { Injectable, Inject } from "@nestjs/common";
import { GeminiTool } from "../../gemini/gemini-tool.interface";
import { NotionService } from "../notion.service";
import { ServerMessage } from "../../types";

@Injectable()
export class ReadNotionPageTool extends GeminiTool {
  readonly name = "read_notion_page";

  readonly declaration = {
    name: this.name,
    description:
      "Reads content (text blocks) from a Notion page by its title or hierarchical path.",
    parameters: {
      type: "OBJECT",
      properties: {
        page_identifier: {
          type: "STRING",
          description:
            "The title or path of the Notion page, e.g., 'Music' or 'Busking List under Music'.",
        },
      },
      required: ["page_identifier"],
    },
  };

  constructor(
    @Inject(NotionService) private readonly notionService: NotionService,
  ) {
    super();
  }

  async execute(args: { page_identifier: string }): Promise<{
    output: any;
    clientIntegration?: Extract<
      ServerMessage,
      { type: "content" }
    >["integration"];
  }> {
    const pageId = await this.notionService.resolveId(args.page_identifier);
    const output = await this.notionService.readPage(pageId);

    return {
      output,
      clientIntegration: {
        type: "notion",
        data: {
          title: output.title,
          summary: output.summary,
          action: "Page Read",
        },
      },
    };
  }
}
