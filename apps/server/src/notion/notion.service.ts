import { Injectable, Logger, Inject } from "@nestjs/common";
import { Client } from "@notionhq/client";
import { ConnectionEvents } from "../credentials/connection-events";
import { CredentialStore } from "../credentials/credential-store";
import { NotionTokenManager } from "./notion-token-manager";

@Injectable()
export class NotionService {
  private readonly logger = new Logger(NotionService.name);
  private readonly clients = new Map<
    string,
    { token: string; client: Client }
  >();

  constructor(
    @Inject(CredentialStore) private readonly credentials: CredentialStore,
    @Inject(ConnectionEvents) connectionEvents: ConnectionEvents,
    @Inject(NotionTokenManager) private readonly tokens: NotionTokenManager,
  ) {
    connectionEvents.onChanged((userId, provider) => {
      if (provider === "notion") this.forget(userId);
    });
  }

  /** The Notion client for a user's own connection, cached per token. */
  private async clientFor(userId: string): Promise<Client> {
    const credential = await this.credentials.get(userId, "notion");
    if (!credential) {
      throw new Error(
        "Notion isn't connected for this user. They can connect it in Puding's Settings.",
      );
    }
    const token = await this.tokens.accessTokenFor(userId, credential);
    const cached = this.clients.get(userId);
    if (cached?.token === token) return cached.client;
    const client = new Client({ auth: token });
    this.clients.set(userId, { token, client });
    return client;
  }

  /** Drops a user's cached client, e.g. after their connection changed. */
  public forget(userId: string): void {
    this.clients.delete(userId);
  }

  /**
   * Resolves a human-readable page/database title or path to a Notion ID.
   */
  public async resolveId(userId: string, identifier: string): Promise<string> {
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
      const parentId = await this.resolveId(userId, parentTitle);
      this.logger.log(
        `Searching for "${targetTitle}" under parent ID: ${parentId}`,
      );

      const searchResponse = await (
        await this.clientFor(userId)
      ).search({ query: targetTitle });

      for (const result of searchResponse.results as any[]) {
        const resultTitle = this.extractTitle(result);
        if (resultTitle.toLowerCase() === targetTitle.toLowerCase()) {
          const resultParentId =
            result.parent?.page_id || result.parent?.database_id;
          if (resultParentId === parentId) {
            this.logger.log(`Resolved "${cleanId}" to ID: ${result.id}`);
            return result.id;
          }
        }
      }

      throw new Error(
        `Could not find page "${targetTitle}" under parent "${parentTitle}".`,
      );
    } else {
      const searchResponse = await (
        await this.clientFor(userId)
      ).search({ query: targetTitle });
      if (searchResponse.results.length === 0) {
        throw new Error(
          `Could not find Notion page or database matching: "${targetTitle}"`,
        );
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
      this.logger.log(
        `No exact match for "${targetTitle}". Falling back to first search result: ${fallbackId}`,
      );
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
      const titleProp = Object.values(result.properties).find(
        (p: any) => p.type === "title",
      ) as any;
      return titleProp?.title?.[0]?.plain_text || "Untitled Page";
    }
    return "Untitled";
  }

  /**
   * Reads blocks and page metadata from Notion.
   * Returns a markdown or structured text summary of the page content.
   */
  public async readPage(
    userId: string,
    pageId: string,
  ): Promise<{ title: string; content: string; summary: string }> {
    this.logger.log(`Reading Notion page: ${pageId}`);

    try {
      // 1. Retrieve page metadata to get the title
      const pageResponse = (await (
        await this.clientFor(userId)
      ).pages.retrieve({
        page_id: pageId,
      })) as any;
      const titleProp = Object.values(pageResponse.properties).find(
        (p: any) => p.type === "title",
      ) as any;
      const title = titleProp?.title?.[0]?.plain_text || "Untitled Page";

      // 2. Retrieve page blocks content
      const blocksResponse = await (
        await this.clientFor(userId)
      ).blocks.children.list({
        block_id: pageId,
      });
      let content = "";
      for (const block of blocksResponse.results as any[]) {
        const type = block.type;
        if (block[type]?.rich_text) {
          const text = block[type].rich_text
            .map((t: any) => t.plain_text)
            .join("");
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
      this.logger.error(
        `Failed to read Notion page: ${error.message || error}`,
      );
      throw error;
    }
  }

  /**
   * Creates a new page under a parent page or database.
   */
  public async createPage(
    userId: string,
    parentId: string,
    title: string,
    content: string,
  ): Promise<{ id: string; url: string; title: string; summary: string }> {
    this.logger.log(
      `Creating Notion page "${title}" under parent: ${parentId}`,
    );

    try {
      // Determine if parent is database or page
      let parentObj: any;
      try {
        await (
          await this.clientFor(userId)
        ).databases.retrieve({ database_id: parentId });
        parentObj = { database_id: parentId };
      } catch {
        parentObj = { page_id: parentId };
      }

      // Create page with title
      const response = (await (
        await this.clientFor(userId)
      ).pages.create({
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

      this.logger.log(
        `Created page "${title}" (ID: ${response.id}) successfully.`,
      );
      return {
        id: response.id,
        url: response.url,
        title,
        summary: `Created page "${title}" successfully`,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to create Notion page: ${error.message || error}`,
      );
      throw error;
    }
  }

  /**
   * Appends text blocks (content) to an existing page.
   */
  public async writePage(
    userId: string,
    pageId: string,
    content: string,
  ): Promise<{ id: string; title: string; summary: string }> {
    this.logger.log(`Writing content to Notion page: ${pageId}`);

    try {
      // 1. Retrieve page metadata to get the title
      const pageResponse = (await (
        await this.clientFor(userId)
      ).pages.retrieve({
        page_id: pageId,
      })) as any;
      const titleProp = Object.values(pageResponse.properties).find(
        (p: any) => p.type === "title",
      ) as any;
      const title = titleProp?.title?.[0]?.plain_text || "Untitled Page";

      // 2. Append block content
      await (
        await this.clientFor(userId)
      ).blocks.children.append({
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
      this.logger.error(
        `Failed to write to Notion page: ${error.message || error}`,
      );
      throw error;
    }
  }
}
