# Phase 4 Design: Web Search Integration

## 1. Overview

This phase introduces real-time web search capabilities to Puding, allowing the agent to fetch facts, news, and search queries from the live internet during a live session.

Key requirements:
1. **Security & Isolation:** API keys for search providers must reside strictly on the server-side, loaded via `ConfigService`.
2. **Dependency Inversion Principle (DIP):** Introduce a runtime-persistent abstract class `SearchService` that serves as a NestJS injection token. The search implementation will depend on this abstraction.
3. **Web Search Provider:** Provide a concrete implementation for Tavily API search provider (`TavilySearchService`).
4. **Function Calling over WebSocket:** Register the `search_web` tool in the Gemini Live API session.
5. **Execution Loop & Client Relay:** Intercept `toolCall` from Gemini, execute the query, and send a `toolResponse` back. Push custom integration events to the client so that the UI can visualize search activity.

---

## 2. Architecture & Monorepo Changes

We will introduce a new NestJS module `SearchModule` in the server, register the new tool in `GeminiModule`, and update the client-side visual cards.

```
puding/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   └── config.service.ts          # Exposes TAVILY_API_KEY env configuration
│   │   │   ├── gemini/
│   │   │   │   └── gemini.module.ts           # Imports SearchModule and injects SearchWebTool
│   │   │   ├── search/                        # NEW MODULE
│   │   │   │   ├── search-service.interface.ts # Abstract class (NestJS token)
│   │   │   │   ├── search.module.ts           # Configures SearchService provider mapping
│   │   │   │   ├── tavily-search.service.ts   # Live Tavily Search API implementation
│   │   │   │   └── tools/
│   │   │   │       └── search-web.tool.ts     # SearchWebTool implementing GeminiTool
│   │   │   ├── types/
│   │   │   │   └── server-message.ts          # Updates integration type to include 'search'
│   │   │   └── app.module.ts                  # Imports SearchModule
│   │   └── .env.example                       # Adds TAVILY_API_KEY placeholder
│   └── web/
│       ├── src/
│       │   ├── components/
│       │   │   └── ChatWindow.tsx             # Renders SearchCard for search integrations
│       │   └── app/
│       │       └── globals.css                # Styles for the .search-card CSS component
```

---

## 3. Service Design: `SearchService`

Following the **Dependency Inversion Principle (DIP)** and the **Abstraction using NestJS Injection Tokens** guideline, we will define an abstract class `SearchService` as an injection token.

### 3.1 Search Abstraction (`search-service.interface.ts`)

```typescript
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
```

### 3.2 Tavily Implementation (`tavily-search.service.ts`)

Calls the Tavily API via global `fetch`, injecting `ConfigService` directly:

```typescript
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

      const data = await response.json();
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
```

### 3.3 Search Module Configuration (`search.module.ts`)

The module maps the `SearchService` injection token directly to `TavilySearchService`:

```typescript
import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { SearchService } from "./search-service.interface";
import { TavilySearchService } from "./tavily-search.service";
import { SearchWebTool } from "./tools/search-web.tool";

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SearchService,
      useClass: TavilySearchService,
    },
    SearchWebTool,
  ],
  exports: [SearchService, SearchWebTool],
})
export class SearchModule {}
```

---

## 4. Search Tool Schema & Integration

We will define `SearchWebTool` extending `GeminiTool`.

### 4.1 Tool Definition (`search-web.tool.ts`)

```typescript
import { Injectable, Inject } from "@nestjs/common";
import { GeminiTool } from "../../gemini/gemini-tool.interface";
import { SearchService } from "../search-service.interface";
import { ServerMessage } from "../../types";

@Injectable()
export class SearchWebTool extends GeminiTool {
  readonly name = "search_web";

  readonly declaration = {
    name: this.name,
    description: "Searches the live web/internet for facts, news, or general search queries.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: {
          type: "STRING",
          description: "The search query to look up on the internet.",
        },
      },
      required: ["query"],
    },
  };

  constructor(
    @Inject(SearchService) private readonly searchService: SearchService,
  ) {
    super();
  }

  async execute(args: { query: string }): Promise<{
    output: any;
    clientIntegration?: Extract<ServerMessage, { type: "content" }>["integration"];
  }> {
    const results = await this.searchService.search(args.query);

    return {
      output: { results },
      clientIntegration: {
        type: "search",
        data: {
          query: args.query,
          results: results.slice(0, 3), // Send top 3 results to UI
        },
      },
    };
  }
}
```

---

## 5. WebSocket Protocol Upgrade & Execution Loop

### 5.1 Type Updates (`server-message.ts`)

Update `ServerMessage` to include `"search"` in the `integration` union:

```typescript
export type ServerMessage =
  | { type: "setup_complete" }
  | {
      type: "content";
      text?: string;
      audio?: string;
      userTranscription?: string;
      turnComplete?: boolean;
      integration?: {
        type: "notion" | "spotify" | "search";
        data: any;
      };
    }
  | { type: "interrupted" };
```

### 5.2 Tool Registration in `GeminiModule`

Register `SearchWebTool` alongside Notion tools in the `"GEMINI_TOOLS"` custom provider:

```typescript
import { SearchModule } from "../search/search.module";
import { SearchWebTool } from "../search/tools/search-web.tool";

@Module({
  imports: [SessionModule, NotionModule, SearchModule],
  providers: [
    {
      provide: LiveSessionService,
      useClass: GeminiService,
    },
    {
      provide: "GEMINI_TOOLS",
      useFactory: (
        read: ReadNotionPageTool,
        create: CreateNotionPageTool,
        write: WriteNotionPageTool,
        search: SearchWebTool,
      ): GeminiTool[] => [read, create, write, search],
      inject: [
        ReadNotionPageTool,
        CreateNotionPageTool,
        WriteNotionPageTool,
        SearchWebTool,
      ],
    },
  ],
  exports: [LiveSessionService],
})
export class GeminiModule {}
```

---

## 6. Client Integration & Custom Renderers

### 6.1 ChatWindow Update (`ChatWindow.tsx`)

Add a new custom renderer `SearchCard` and register it in `INTEGRATION_RENDERERS`:

```tsx
const SearchCard: React.FC<IntegrationCardProps> = ({ data }) => (
  <div className="integration-card search-card">
    <div className="card-header">
      <span className="card-icon">🔍</span>
      <span className="card-title">Web Search</span>
    </div>
    <div className="card-body">
      <strong className="search-query">Query: "{data.query}"</strong>
      <div className="search-results-list">
        {data.results && data.results.length > 0 ? (
          data.results.map((res: any, idx: number) => (
            <div key={idx} className="search-result-item">
              <a href={res.url} target="_blank" rel="noopener noreferrer" className="search-result-link">
                {res.title}
              </a>
              <p className="search-result-snippet">{res.snippet}</p>
            </div>
          ))
        ) : (
          <p className="search-no-results">No results found.</p>
        )}
      </div>
    </div>
  </div>
);

const INTEGRATION_RENDERERS: Record<string, React.FC<IntegrationCardProps>> = {
  spotify: SpotifyCard,
  notion: NotionCard,
  search: SearchCard,
};
```

### 6.2 CSS Styling (`globals.css`)

```css
/* Search custom theme */
.search-card {
  border-color: rgba(66, 133, 244, 0.25);
  background: linear-gradient(135deg, rgba(66, 133, 244, 0.08) 0%, rgba(0, 0, 0, 0.4) 100%);
}

.search-card .card-title {
  color: #4285f4;
}

.search-card .search-query {
  font-size: 0.85rem;
  color: #fff;
  margin-bottom: 0.4rem;
}

.search-card .search-results-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.search-card .search-result-item {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  padding-top: 0.4rem;
}

.search-card .search-result-item:first-child {
  border-top: none;
  padding-top: 0;
}

.search-card .search-result-link {
  font-size: 0.8rem;
  color: #8ab4f8;
  text-decoration: none;
  font-weight: 500;
}

.search-card .search-result-link:hover {
  text-decoration: underline;
}

.search-card .search-result-snippet {
  font-size: 0.7rem;
  color: var(--text-secondary);
  line-height: 1.3;
}
```

---

## 7. Verification Plan

1. **Build Verification:** Run `pnpm run build` from the workspace root to ensure no linting or compilation errors are present.
2. **Live API Integration Test:** Inject a valid `TAVILY_API_KEY` into `apps/server/.env`, trigger the tool via voice/text query, and confirm the top 3 live results are rendered correctly in the UI and used by Gemini for context.
