import { ConfigService } from "../../config/config.service";
import {
  InMemoryUsageLimiter,
  UsageLimiter,
} from "../../database/usage-limiter";
import { Test, TestingModule } from "@nestjs/testing";
import { SearchWebTool } from "./search-web.tool";
import { SearchService } from "../search-service.interface";

describe("SearchWebTool", () => {
  const ctx = { sessionId: "s", userId: "u1" };
  let tool: SearchWebTool;
  let mockSearchService: jest.Mocked<SearchService>;

  beforeEach(async () => {
    mockSearchService = {
      search: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchWebTool,
        { provide: UsageLimiter, useValue: new InMemoryUsageLimiter() },
        {
          provide: ConfigService,
          useValue: { getTavilyDailyLimitPerUser: () => 2 },
        },
        {
          provide: SearchService,
          useValue: mockSearchService,
        },
      ],
    }).compile();

    tool = module.get<SearchWebTool>(SearchWebTool);
  });

  it("should be defined", () => {
    expect(tool).toBeDefined();
    expect(tool.name).toBe("search_web");
    expect(tool.declaration.name).toBe("search_web");
  });

  it("should execute search and return sliced results for clientIntegration", async () => {
    const mockResults = [
      { title: "R1", url: "U1", snippet: "S1" },
      { title: "R2", url: "U2", snippet: "S2" },
      { title: "R3", url: "U3", snippet: "S3" },
      { title: "R4", url: "U4", snippet: "S4" },
    ];
    mockSearchService.search.mockResolvedValue(mockResults);

    const result = await tool.execute({ query: "puding recipe" }, ctx);

    expect(mockSearchService.search).toHaveBeenCalledWith("puding recipe");
    expect(result.output).toEqual({ results: mockResults });
    expect(result.clientIntegration).toEqual({
      type: "search",
      data: {
        query: "puding recipe",
        results: [
          { title: "R1", url: "U1", snippet: "S1" },
          { title: "R2", url: "U2", snippet: "S2" },
          { title: "R3", url: "U3", snippet: "S3" },
        ],
      },
    });
  });

  it("stops searching once the user's daily limit is used up", async () => {
    mockSearchService.search.mockResolvedValue([]);
    await tool.execute({ query: "a" }, ctx);
    await tool.execute({ query: "b" }, ctx);
    const result = await tool.execute({ query: "c" }, ctx);
    expect(result.output).toEqual({ error: expect.stringContaining("limit") });
    expect(mockSearchService.search).toHaveBeenCalledTimes(2);
    const other = await tool.execute(
      { query: "d" },
      { sessionId: "s2", userId: "u2" },
    );
    expect(other.output).not.toHaveProperty("error");
  });
});
