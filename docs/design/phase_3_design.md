# Phase 3 Design: Notion Connection & Knowledge Management

## 1. Overview

This phase introduces Notion integration into Puding, enabling the AI agent to interact directly with the user's Notion workspace. By connecting to Notion's API, Puding will be able to read page contents, append new text content to existing pages, and create new pages.

Key requirements:
1. **Security & Isolation:** The Notion SDK and active Integration Tokens must reside strictly on the server side and never be exposed to the client.
2. **Simplified Service Architecture:** Define `NotionService` as a direct NestJS Injectable service. This avoids unnecessary interface/class splits while preserving standard NestJS dependency injection.
3. **Function Calling over WebSocket:** Register Notion tools (`read_notion_page`, `create_notion_page`, `write_notion_page`) in the Gemini Live API initialization.
4. **Execution Loop & Client Relay:** Intercept `toolCall` from Gemini, execute them via the Notion Service, send `toolResponse` back to Gemini, and push structured integration cards to the client so that the UI can visualize active workspace actions.

---

## 2. Architecture & Monorepo Changes

We will introduce a new NestJS module `NotionModule` in the server and expand existing WebSocket message types.

```
puding/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   └── config.service.ts          # Exposes NOTION_TOKEN env configuration
│   │   │   ├── gemini/
│   │   │   │   ├── gemini.module.ts           # Imports NotionModule & injects NotionService
│   │   │   │   ├── gemini.service.ts          # Updates createSession to pass NotionService
│   │   │   │   └── gemini.session.ts          # Declares tools, intercept toolCall, executes & responds
│   │   │   ├── notion/                        # NEW MODULE
│   │   │   │   ├── notion.module.ts           # Bundles Notion providers and configurations
│   │   │   │   └── notion.service.ts          # NotionService using @notionhq/client
│   │   │   ├── types/
│   │   │   │   ├── gemini-client-message.ts   # Supports toolResponse and setup tools
│   │   │   │   ├── gemini-server-message.ts   # Supports toolCall payloads
│   │   │   │   └── server-message.ts          # Supports integration payloads to client
│   │   │   └── app.module.ts                  # Imports NotionModule
│   │   └── package.json                       # Added @notionhq/client dependency
│   └── web/
│       ├── src/
│       │   └── hooks/
│       │       └── useLiveSession.ts          # Processes integration payloads to populate ChatMessage
```

---

## 3. Service Design: `NotionService`

`NotionService` will be defined as an injectable class directly, acting as its own NestJS injection token.

### 3.1 Notion Service (`notion.service.ts`)
Implement the service using `@notionhq/client`:

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { Client } from "@notionhq/client";
import { ConfigService } from "../config/config.service";

@Injectable()
export class NotionService {
  private readonly logger = new Logger(NotionService.name);
  private readonly client: Client | null = null;

  constructor(private readonly configService: ConfigService) {
    const token = this.configService.getNotionToken();
    if (token) {
      this.client = new Client({ auth: token });
      this.logger.log("Notion client initialized successfully.");
    } else {
      this.logger.warn("Notion token is missing. Notion operations will run in mock/dry-run mode.");
    }
  }

  /**
   * Reads blocks and page metadata from Notion.
   * Returns a markdown or structured text summary of the page content.
   */
  public async readPage(pageId: string): Promise<{ title: string; content: string; summary: string }> {
    // ...
  }

  /**
   * Creates a new page under a parent page or database.
   */
  public async createPage(
    parentId: string,
    title: string,
    content: string,
  ): Promise<{ id: string; url: string; title: string; summary: string }> {
    // ...
  }

  /**
   * Appends text blocks (content) to an existing page.
   */
  public async writePage(
    pageId: string,
    content: string,
  ): Promise<{ id: string; title: string; summary: string }> {
    // ...
  }
}
```

### 3.2 Notion Module Declaration (`notion.module.ts`)

```typescript
import { Module } from "@nestjs/common";
import { NotionService } from "./notion.service";

@Module({
  providers: [NotionService],
  exports: [NotionService],
})
export class NotionModule {}
```

---

## 4. Notion Tool Schema Declarations

We will update the Gemini Live API initializer to pass tool declarations during setup.

### 4.1 Schema Definition
We define the function parameters and descriptions using the Gemini schema format:

```typescript
const NOTION_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "read_notion_page",
        description: "Reads content (text blocks) from a Notion page by its ID.",
        parameters: {
          type: "OBJECT",
          properties: {
            page_id: {
              type: "STRING",
              description: "The Notion Page ID (UUID string without hyphens or with hyphens).",
            },
          },
          required: ["page_id"],
        },
      },
      {
        name: "create_notion_page",
        description: "Creates a new Notion page under a parent page or database ID with initial content.",
        parameters: {
          type: "OBJECT",
          properties: {
            parent_id: {
              type: "STRING",
              description: "The Parent Page ID or Database ID under which to create the new page.",
            },
            title: {
              type: "STRING",
              description: "The title of the new Notion page.",
            },
            content: {
              type: "STRING",
              description: "The initial text content (markdown or plain text) to append into the new page.",
            },
          },
          required: ["parent_id", "title"],
        },
      },
      {
        name: "write_notion_page",
        description: "Appends text content or bullet points to an existing Notion page by its ID.",
        parameters: {
          type: "OBJECT",
          properties: {
            page_id: {
              type: "STRING",
              description: "The ID of the Notion page to write content into.",
            },
            content: {
              type: "STRING",
              description: "The text content or bullet points to append to the page.",
            },
          },
          required: ["page_id", "content"],
        },
      },
    ],
  },
];
```

We will inject `tools: NOTION_TOOLS` into the setup configuration sent by `GeminiSession.sendSetup`.

---

## 5. WebSocket Protocol Upgrade & Execution Loop

### 5.1 Type Updates

- **`gemini-server-message.ts`**:
  Extend `GeminiServerMessage` to parse tool calls sent by Gemini:
  ```typescript
  export interface GeminiServerMessage {
    // ... other fields
    toolCall?: {
      functionCalls: Array<{
        name: string;
        id: string;
        args: Record<string, any>;
      }>;
    };
  }
  ```

- **`gemini-client-message.ts`**:
  Extend `GeminiClientMessage` to support tool responses and tools initialization:
  ```typescript
  export type GeminiClientMessage =
    | {
        setup: {
          model: string;
          generationConfig?: any;
          systemInstruction?: any;
          tools?: any[]; // Added for tool declaration
          inputAudioTranscription?: any;
          outputAudioTranscription?: any;
        };
      }
    | {
        clientContent: any;
      }
    | {
        realtimeInput: any;
      }
    | {
        toolResponse: {
          functionResponses: Array<{
            id: string;
            name: string;
            response: { output: any };
          }>;
        };
      };
  ```

- **`server-message.ts`**:
  Extend `ServerMessage` to support the custom integration card pushed to the client:
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
          type: "notion" | "spotify";
          data: any;
        };
      }
    | { type: "interrupted" };
  ```

### 5.2 Tool Call Handling Loop in `GeminiSession`

1. **Detection:** When `handleGeminiMessage` receives a payload containing `toolCall`, parse the function calls.
2. **Execution:** For each function call:
   - Match the name (e.g., `create_notion_page`).
   - Extract parameters.
   - Invoke the corresponding `NotionService` method inside a `try/catch` block.
3. **Response:** Compile the output of the tool into a `toolResponse` payload, and send it to the Gemini WebSocket using `this.sendToGemini()`.
4. **Client Notification:** If the tool completes successfully, send a client-side update with the `integration` details (e.g. `{ type: "notion", data: { title: "My Page", summary: "Content appended..." } }`) so the user's chat panel displays a visual card representing the action.

---

## 6. Client Hook Upgrade (`useLiveSession.ts`)

In the frontend client hook, update `ws.onmessage` to check if `msg.integration` is present. If it is, store it in the chat messages array:

```typescript
if (msg.integration) {
  setMessages((prev) => [
    ...prev,
    {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
      sender: "puding",
      text: "", // Renders integration card instead of plain text
      timestamp: new Date().toLocaleTimeString(),
      integration: msg.integration,
    }
  ]);
}
```

---

## 7. Verification Plan

1. **Dry-Run / Mock Verification:** If `NOTION_TOKEN` is not provided, the `NotionService` will operate in mock mode, logging simulated page reads and creations, and returning mock objects to verify the WebSockets function calling loop end-to-end.
2. **Workspace Verification:** Run the server with a valid Notion integration token, create/append text to a designated parent page, and verify the changes populate live in the Notion app.
3. **Build Integrity:** Run `pnpm run build` at the workspace root to ensure typescript checks and bundling compile without error.
