import { Test, TestingModule } from "@nestjs/testing";
import { NotionService } from "./notion.service";
import { ConfigService } from "../config/config.service";

describe("NotionService", () => {
  let service: NotionService;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockConfigService = {
      getNotionToken: jest.fn().mockReturnValue(""),
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
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should run in mock mode when token is missing", async () => {
    const pageId = "some-page-id";
    const result = await service.readPage(pageId);
    expect(result.title).toBe("Mock Notion Page");
    expect(result.content).toContain("simulated Notion page");
  });

  it("should simulate creating a page in mock mode", async () => {
    const result = await service.createPage("parent-id", "Test Title", "Test Content");
    expect(result.title).toBe("Test Title");
    expect(result.id).toContain("mock-");
    expect(result.summary).toContain("Mock Mode");
  });

  it("should simulate writing to a page in mock mode", async () => {
    const result = await service.writePage("page-id", "New Content");
    expect(result.id).toBe("page-id");
    expect(result.summary).toContain("Mock Mode");
  });
});
