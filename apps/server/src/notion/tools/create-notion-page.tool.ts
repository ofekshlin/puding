import { Injectable, Inject } from "@nestjs/common";
import {
  GeminiTool,
  ToolContext,
  requireUserId,
} from "../../gemini/gemini-tool.interface";
import { NotionService } from "../notion.service";
import { ServerMessage } from "../../types";

@Injectable()
export class CreateNotionPageTool extends GeminiTool {
  readonly name = "create_notion_page";
  readonly requires = "notion" as const;

  readonly declaration = {
    name: this.name,
    description:
      "Creates a new Notion page under a parent page or database title with initial content.",
    parameters: {
      type: "OBJECT",
      properties: {
        parent_identifier: {
          type: "STRING",
          description:
            "The parent page or database title or path, e.g., 'Music'.",
        },
        title: {
          type: "STRING",
          description: "The title of the new Notion page.",
        },
        content: {
          type: "STRING",
          description:
            "The initial text content (markdown or plain text) to append into the new page.",
        },
      },
      required: ["parent_identifier", "title"],
    },
  };

  constructor(
    @Inject(NotionService) private readonly notionService: NotionService,
  ) {
    super();
  }

  async execute(
    args: {
      parent_identifier: string;
      title: string;
      content?: string;
    },
    context?: ToolContext,
  ): Promise<{
    output: any;
    clientIntegration?: Extract<
      ServerMessage,
      { type: "content" }
    >["integration"];
  }> {
    const parentId = await this.notionService.resolveId(
      requireUserId(context),
      args.parent_identifier,
    );
    const output = await this.notionService.createPage(
      requireUserId(context),
      parentId,
      args.title,
      args.content || "",
    );

    return {
      output,
      clientIntegration: {
        type: "notion",
        data: {
          title: output.title,
          summary: output.summary,
          action: "Page Created",
        },
      },
    };
  }
}
