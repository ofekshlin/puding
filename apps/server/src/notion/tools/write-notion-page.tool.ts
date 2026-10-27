import { Injectable, Inject } from "@nestjs/common";
import {
  GeminiTool,
  ToolContext,
  requireUserId,
} from "../../gemini/gemini-tool.interface";
import { NotionService } from "../notion.service";
import { ServerMessage } from "../../types";

@Injectable()
export class WriteNotionPageTool extends GeminiTool {
  readonly name = "write_notion_page";
  readonly requires = "notion" as const;

  readonly declaration = {
    name: this.name,
    description:
      "Appends text content or bullet points to an existing Notion page by its title or path.",
    parameters: {
      type: "OBJECT",
      properties: {
        page_identifier: {
          type: "STRING",
          description:
            "The title or path of the Notion page to write content into, e.g., 'Music/Busking List'.",
        },
        content: {
          type: "STRING",
          description:
            "The text content or bullet points to append to the page.",
        },
      },
      required: ["page_identifier", "content"],
    },
  };

  constructor(
    @Inject(NotionService) private readonly notionService: NotionService,
  ) {
    super();
  }

  async execute(
    args: { page_identifier: string; content: string },
    context?: ToolContext,
  ): Promise<{
    output: any;
    clientIntegration?: Extract<
      ServerMessage,
      { type: "content" }
    >["integration"];
  }> {
    const pageId = await this.notionService.resolveId(
      requireUserId(context),
      args.page_identifier,
    );
    const output = await this.notionService.writePage(
      requireUserId(context),
      pageId,
      args.content,
    );

    return {
      output,
      clientIntegration: {
        type: "notion",
        data: {
          title: output.title,
          summary: output.summary,
          action: "Page Appended",
        },
      },
    };
  }
}
