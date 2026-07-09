import { Test, TestingModule } from "@nestjs/testing";
import { NotionService } from "./notion.service";
import { ConfigService } from "../config/config.service";

describe("NotionService", () => {
  let service: NotionService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockClient: any;

  beforeEach(async () => {
    mockConfigService = {
      getNotionToken: jest.fn().mockReturnValue("dummy-token"),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotionService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
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
    (service as any).client = mockClient;
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should throw error if token is missing on construction", async () => {
    mockConfigService.getNotionToken.mockReturnValueOnce("");
    expect(() => new NotionService(mockConfigService)).toThrow("NOTION_TOKEN");
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

    const id = await service.resolveId("Music");
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

    const id = await service.resolveId("Busking List under Music");
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

    const result = await service.readPage("some-page-id");
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

    const result = await service.writePage("page-id", "Appended line");
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
    const realService = new NotionService(realConfigService);

    // List all shared pages first to debug
    const searchResponse = await (realService as any).client.search({});
    const titles = searchResponse.results.map((r: any) =>
      (realService as any).extractTitle(r),
    );
    console.log(`[Integration Test] Shared pages in Notion workspace:`, titles);

    const id = await realService.resolveId("Ideas");
    console.log(`[Integration Test] Resolved 'Ideas' to ID: ${id}`);
    expect(id).toBeDefined();
    expect(id.replace(/-/g, "")).toHaveLength(32);
  });
});
