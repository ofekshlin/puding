import { CredentialStore } from "../credentials/credential-store";
import { EnvCredentialStore } from "../credentials/env-credential-store";
import { ConnectionEvents } from "../credentials/connection-events";
import { Test, TestingModule } from "@nestjs/testing";
import { NotionService } from "./notion.service";
import { NotionTokenManager } from "./notion-token-manager";
import { ConfigService } from "../config/config.service";

describe("NotionService", () => {
  let service: NotionService;
  let mockCredentials: any;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockClient: any;

  beforeEach(async () => {
    mockConfigService = {
      getNotionToken: jest.fn().mockReturnValue("dummy-token"),
    } as any;
    mockCredentials = {
      get: jest.fn().mockResolvedValue({
        provider: "notion",
        kind: "static_token",
        secret: { accessToken: "dummy-token" },
        settings: {},
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotionService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        { provide: CredentialStore, useValue: mockCredentials },
        ConnectionEvents,
        NotionTokenManager,
      ],
    }).compile();

    service = module.get<NotionService>(NotionService);

    // Inject mock methods on the internal client
    mockClient = {
      search: jest.fn(),
      pages: {
        retrieve: jest.fn(),
        create: jest.fn(),
      },
      databases: {
        retrieve: jest.fn(),
      },
      blocks: {
        children: {
          list: jest.fn(),
          append: jest.fn(),
        },
      },
    };
    jest.spyOn(service as any, "clientFor").mockResolvedValue(mockClient);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("tells the user to connect Notion when they have no credential", async () => {
    mockCredentials.get.mockResolvedValueOnce(null);
    jest.restoreAllMocks();
    await expect(service.resolveId("u1", "Ideas")).rejects.toThrow(
      "Notion isn't connected",
    );
  });

  it("should resolve simple page title", async () => {
    mockClient.search.mockResolvedValue({
      results: [
        {
          object: "page",
          id: "target-page-id",
          properties: {
            Name: {
              type: "title",
              title: [{ plain_text: "Music" }],
            },
          },
        },
      ],
    });

    const id = await service.resolveId("u1", "Music");
    expect(id).toBe("target-page-id");
    expect(mockClient.search).toHaveBeenCalledWith({ query: "Music" });
  });

  it("should resolve hierarchical path (under)", async () => {
    mockClient.search.mockImplementation(
      async ({ query }: { query: string }) => {
        if (query === "Music") {
          return {
            results: [
              {
                object: "page",
                id: "parent-music-id",
                properties: {
                  Name: {
                    type: "title",
                    title: [{ plain_text: "Music" }],
                  },
                },
              },
            ],
          };
        }
        if (query === "Busking List") {
          return {
            results: [
              {
                object: "page",
                id: "child-busking-id",
                parent: { page_id: "parent-music-id" },
                properties: {
                  Name: {
                    type: "title",
                    title: [{ plain_text: "Busking List" }],
                  },
                },
              },
            ],
          };
        }
        return { results: [] };
      },
    );

    const id = await service.resolveId("u1", "Busking List under Music");
    expect(id).toBe("child-busking-id");
  });

  it("should read page content and blocks", async () => {
    mockClient.pages.retrieve.mockResolvedValue({
      properties: {
        Name: {
          type: "title",
          title: [{ plain_text: "Music Page" }],
        },
      },
    });

    mockClient.blocks.children.list.mockResolvedValue({
      results: [
        {
          type: "paragraph",
          paragraph: {
            rich_text: [{ plain_text: "First block content" }],
          },
        },
      ],
    });

    const result = await service.readPage("u1", "some-page-id");
    expect(result.title).toBe("Music Page");
    expect(result.content).toBe("First block content");
  });

  it("should create page under parent page", async () => {
    mockClient.databases.retrieve.mockRejectedValue(
      new Error("Not a database"),
    );
    mockClient.pages.create.mockResolvedValue({
      id: "new-page-id",
      url: "https://notion.so/new-page-id",
    });

    const result = await service.createPage(
      "u1",
      "parent-page-id",
      "New Page Title",
      "New content",
    );
    expect(result.id).toBe("new-page-id");
    expect(result.title).toBe("New Page Title");
    expect(mockClient.pages.create).toHaveBeenCalledWith({
      parent: { page_id: "parent-page-id" },
      properties: {
        title: {
          title: [{ type: "text", text: { content: "New Page Title" } }],
        },
      },
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: "New content" } }],
          },
        },
      ],
    });
  });

  it("should write content to page", async () => {
    mockClient.pages.retrieve.mockResolvedValue({
      properties: {
        Name: {
          type: "title",
          title: [{ plain_text: "Target Page" }],
        },
      },
    });

    mockClient.blocks.children.append.mockResolvedValue({});

    const result = await service.writePage("u1", "page-id", "Appended line");
    expect(result.id).toBe("page-id");
    expect(result.title).toBe("Target Page");
    expect(mockClient.blocks.children.append).toHaveBeenCalledWith({
      block_id: "page-id",
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: "Appended line" } }],
          },
        },
      ],
    });
  });

  it("should resolve real page title 'Ideas' using Notion API", async () => {
    const realConfigService = new ConfigService();
    const envStore = new EnvCredentialStore(realConfigService);
    const events = new ConnectionEvents();
    const realService = new NotionService(
      envStore,
      events,
      new NotionTokenManager(realConfigService, envStore),
    );

    // List all shared pages first to debug
    const searchResponse = await (
      await (realService as any).clientFor("local")
    ).search({});
    const titles = searchResponse.results.map((r: any) =>
      (realService as any).extractTitle(r),
    );
    console.log(`[Integration Test] Shared pages in Notion workspace:`, titles);

    const id = await realService.resolveId("u1", "Ideas");
    console.log(`[Integration Test] Resolved 'Ideas' to ID: ${id}`);
    expect(id).toBeDefined();
    expect(id.replace(/-/g, "")).toHaveLength(32);
  });
});
