import { Test, TestingModule } from "@nestjs/testing";
import { TavilySearchService } from "./tavily-search.service";
import { ConfigService } from "../config/config.service";

describe("TavilySearchService", () => {
  let service: TavilySearchService;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockConfigService = {
      getTavilyApiKey: jest.fn().mockReturnValue("mock-api-key"),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TavilySearchService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<TavilySearchService>(TavilySearchService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should throw error if apiKey is missing", async () => {
    mockConfigService.getTavilyApiKey.mockReturnValueOnce(undefined);
    await expect(service.search("test query")).rejects.toThrow(
      "TAVILY_API_KEY is not defined in the environment.",
    );
  });

  it("should return parsed search results on success", async () => {
    const mockResults = [
      { title: "Result 1", url: "https://test1.com", content: "Snippet 1" },
      { title: "Result 2", url: "https://test2.com", content: "Snippet 2" },
    ];

    const mockResponse = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ results: mockResults }),
    };

    jest.spyOn(global, "fetch").mockResolvedValue(mockResponse as any);

    const results = await service.search("nest js");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          api_key: "mock-api-key",
          query: "nest js",
          search_depth: "basic",
        }),
      }),
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: "Result 1",
      url: "https://test1.com",
      snippet: "Snippet 1",
    });
  });

  it("should throw error on non-ok fetch response", async () => {
    const mockResponse = {
      ok: false,
      status: 500,
    };

    jest.spyOn(global, "fetch").mockResolvedValue(mockResponse as any);

    await expect(service.search("error query")).rejects.toThrow(
      "Tavily search failed with status 500",
    );
  });
});
