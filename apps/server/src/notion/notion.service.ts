import { Injectable, Logger, Inject } from "@nestjs/common";
import { Client } from "@notionhq/client";
import { ConfigService } from "../config/config.service";

@Injectable()
export class NotionService {
  private readonly logger = new Logger(NotionService.name);
  private readonly client: Client;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    const token = this.configService.getNotionToken();
    if (!token) {
      throw new Error("NOTION_TOKEN is not defined in the environment. Notion integration requires a valid token.");
    }
    this.client = new Client({ auth: token });
    this.logger.log("Notion client initialized successfully.");
  }

  /**
   * Resolves a human-readable page/database title or path to a Notion ID.
   */
  public async resolveId(identifier: string): Promise<string> {
    const cleanId = identifier.trim();
    this.logger.log(`Resolving identifier to Notion ID: "${cleanId}"`);

    // Parse hierarchy
    let targetTitle = cleanId;
    let parentTitle: string | undefined;

    if (cleanId.toLowerCase().includes(" under ")) {
      const index = cleanId.toLowerCase().indexOf(" under ");
      targetTitle = cleanId.substring(0, index).trim();
      parentTitle = cleanId.substring(index + 7).trim();
    } else if (cleanId.includes("/")) {
      const parts = cleanId.split("/");
      parentTitle = parts[0].trim();
      targetTitle = parts[1].trim();
    }

    if (parentTitle) {
      const parentId = await this.resolveId(parentTitle);
      this.logger.log(`Searching for "${targetTitle}" under parent ID: ${parentId}`);

      const searchResponse = await this.client.search({ query: targetTitle });

      for (const result of searchResponse.results as any[]) {
        const resultTitle = this.extractTitle(result);
        if (resultTitle.toLowerCase() === targetTitle.toLowerCase()) {
          const resultParentId = result.parent?.page_id || result.parent?.database_id;
          if (resultParentId === parentId) {
            this.logger.log(`Resolved "${cleanId}" to ID: ${result.id}`);
            return result.id;
          }
        }
      }

      throw new Error(`Could not find page "${targetTitle}" under parent "${parentTitle}".`);
    } else {
      const searchResponse = await this.client.search({ query: targetTitle });
      if (searchResponse.results.length === 0) {
        throw new Error(`Could not find Notion page or database matching: "${targetTitle}"`);
      }

      // Try exact match first
      for (const result of searchResponse.results as any[]) {
        const resultTitle = this.extractTitle(result);
        if (resultTitle.toLowerCase() === targetTitle.toLowerCase()) {
          this.logger.log(`Resolved "${cleanId}" to ID: ${result.id}`);
          return result.id;
        }
      }

      // Fallback to first search result
      const fallbackId = searchResponse.results[0].id;
      this.logger.log(`No exact match for "${targetTitle}". Falling back to first search result: ${fallbackId}`);
      return fallbackId;
    }
  }

  /**
   * Extracts the title text from a search result object (page or database).
   */
  private extractTitle(result: any): string {
    if (result.object === "database") {
      return result.title?.[0]?.plain_text || "Untitled Database";
    } else if (result.object === "page") {
      const titleProp = Object.values(result.properties).find((p: any) => p.type === "title") as any;
      return titleProp?.title?.[0]?.plain_text || "Untitled Page";
    }
    return "Untitled";
  }

  /**
   * Reads blocks and page metadata from Notion.
   * Returns a markdown or structured text summary of the page content.
   */
  public async readPage(pageId: string): Promise<{ title: string; content: string; summary: string }> {
    this.logger.log(`Reading Notion page: ${pageId}`);

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
