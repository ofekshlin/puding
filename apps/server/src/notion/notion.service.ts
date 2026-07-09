import { Injectable, Logger, Inject } from "@nestjs/common";
import { Client } from "@notionhq/client";
import { ConfigService } from "../config/config.service";

@Injectable()
export class NotionService {
  private readonly logger = new Logger(NotionService.name);
  private readonly client: Client | null = null;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    const token = this.configService.getNotionToken();
    if (token) {
      this.client = new Client({ auth: token });
      this.logger.log("Notion client initialized successfully.");
    } else {
      this.logger.warn("Notion token is missing. Notion operations will run in mock/dry-run mode.");
    }
  }

  /**
   * Reads blocks and page metadata from Notion.
   * Returns a markdown or structured text summary of the page content.
   */
  public async readPage(pageId: string): Promise<{ title: string; content: string; summary: string }> {
    this.logger.log(`Reading Notion page: ${pageId}`);

    if (!this.client) {
      // Mock / Dry-run implementation
      this.logger.log("[Mock Mode] Simulated reading page content.");
      return {
        title: "Mock Notion Page",
        content: "This is a simulated Notion page content for dry-run verification.",
        summary: `Successfully read mock page: ${pageId}`,
      };
    }

    try {
      // 1. Retrieve page metadata to get the title
      const pageResponse = (await this.client.pages.retrieve({ page_id: pageId })) as any;
      const titleProp = Object.values(pageResponse.properties).find((p: any) => p.type === "title") as any;
      const title = titleProp?.title?.[0]?.plain_text || "Untitled Page";

      // 2. Retrieve page blocks content
      const blocksResponse = await this.client.blocks.children.list({ block_id: pageId });
      let content = "";
      for (const block of blocksResponse.results as any[]) {
        const type = block.type;
        if (block[type]?.rich_text) {
          const text = block[type].rich_text.map((t: any) => t.plain_text).join("");
          content += text + "\n";
        }
      }

      this.logger.log(`Read page "${title}" successfully.`);
      return {
        title,
        content: content.trim(),
        summary: `Read page: "${title}"`,
      };
    } catch (error: any) {
      this.logger.error(`Failed to read Notion page: ${error.message || error}`);
      throw error;
    }
  }

  /**
   * Creates a new page under a parent page or database.
   */
  public async createPage(
    parentId: string,
    title: string,
    content: string,
  ): Promise<{ id: string; url: string; title: string; summary: string }> {
    this.logger.log(`Creating Notion page "${title}" under parent: ${parentId}`);

    if (!this.client) {
      // Mock / Dry-run implementation
      this.logger.log("[Mock Mode] Simulated creating page.");
      const mockId = `mock-${Math.random().toString(36).substring(2, 10)}`;
      return {
        id: mockId,
        url: `https://notion.so/${mockId}`,
        title,
        summary: `Created page "${title}" under parent ${parentId} (Mock Mode)`,
      };
    }

    try {
      // Determine if parent is database or page
      let parentObj: any;
      try {
        await this.client.databases.retrieve({ database_id: parentId });
        parentObj = { database_id: parentId };
      } catch {
        parentObj = { page_id: parentId };
      }

      // Create page with title
      const response = (await this.client.pages.create({
        parent: parentObj,
        properties: {
          title: {
            title: [{ type: "text", text: { content: title } }],
          },
        },
        children: content
          ? [
              {
                object: "block",
                type: "paragraph",
                paragraph: {
                  rich_text: [{ type: "text", text: { content } }],
                },
              },
            ]
          : [],
      })) as any;

      this.logger.log(`Created page "${title}" (ID: ${response.id}) successfully.`);
      return {
        id: response.id,
        url: response.url,
        title,
        summary: `Created page "${title}" successfully`,
      };
    } catch (error: any) {
      this.logger.error(`Failed to create Notion page: ${error.message || error}`);
      throw error;
    }
  }

  /**
   * Appends text blocks (content) to an existing page.
   */
  public async writePage(
    pageId: string,
    content: string,
  ): Promise<{ id: string; title: string; summary: string }> {
    this.logger.log(`Writing content to Notion page: ${pageId}`);

    if (!this.client) {
      // Mock / Dry-run implementation
      this.logger.log("[Mock Mode] Simulated appending content.");
      return {
        id: pageId,
        title: "Mock Notion Page",
        summary: `Appended content to page ${pageId} (Mock Mode)`,
      };
    }

    try {
      // 1. Retrieve page metadata to get the title
      const pageResponse = (await this.client.pages.retrieve({ page_id: pageId })) as any;
      const titleProp = Object.values(pageResponse.properties).find((p: any) => p.type === "title") as any;
      const title = titleProp?.title?.[0]?.plain_text || "Untitled Page";

      // 2. Append block content
      await this.client.blocks.children.append({
        block_id: pageId,
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", text: { content } }],
            },
          },
        ],
      });

      this.logger.log(`Appended content to page "${title}" successfully.`);
      return {
        id: pageId,
        title,
        summary: `Appended content to page "${title}"`,
      };
    } catch (error: any) {
      this.logger.error(`Failed to write to Notion page: ${error.message || error}`);
      throw error;
    }
  }
}
