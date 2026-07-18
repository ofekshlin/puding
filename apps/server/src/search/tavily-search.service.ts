import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "../config/config.service";
import { SearchService, SearchResult } from "./search-service.interface";

@Injectable()
export class TavilySearchService extends SearchService {
  private readonly logger = new Logger(TavilySearchService.name);

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    super();
    this.logger.log("TavilySearchService initialized.");
  }

  async search(query: string): Promise<SearchResult[]> {
    const apiKey = this.configService.getTavilyApiKey();
    if (!apiKey) {
      throw new Error("TAVILY_API_KEY is not defined in the environment.");
    }

    this.logger.log(`Performing Tavily search for: "${query}"`);
    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: "basic",
        }),
      });

      if (!response.ok) {
        throw new Error(`Tavily search failed with status ${response.status}`);
      }

      const data = (await response.json()) as any;
      const results: SearchResult[] = (data.results || []).map((r: any) => ({
        title: r.title || "Untitled",
        url: r.url || "",
        snippet: r.content || "",
      }));

      this.logger.log(`Tavily search returned ${results.length} results.`);
      return results;
    } catch (error: any) {
      this.logger.error(`Tavily search execution failed: ${error.message}`);
      throw error;
    }
  }
}
