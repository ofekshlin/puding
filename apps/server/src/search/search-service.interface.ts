export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export abstract class SearchService {
  /**
   * Executes a web search query and returns structured results.
   */
  abstract search(query: string): Promise<SearchResult[]>;
}
