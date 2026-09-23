# Project Puding (🍮) - Comprehensive Project Specification & Architecture Design

## 1. Executive Summary

Project **Puding** is an advanced, high-performance, interactive AI Agent designed to emulate the seamless, responsive, and cross-platform experience of an intelligent assistant (akin to Iron Man's Jarvis). Unlike traditional chat interfaces that suffer from statelessness, high latency, and lack of continuity, Puding leverages cutting-edge real-time multimodal streaming and automated function execution to serve as an intuitive intellectual partner and task automation engine.

---

## 2. Project Goal & Core Purpose

The primary objective of Project Puding is to deliver a low-latency, stateful, and voice-first AI companion accessible on both mobile and desktop environments. Puding will be capable of:

- **Natural Conversation:** Real-time, continuous voice interaction with human-like interruption capabilities.
- **Persistent Context:** Short-term session tracking and long-term semantic memory to recall user preferences, past discussions, and project states.
- **Autonomous Tool Execution:** Interacting with external web services, productivity software, and media applications via secure backend function calling.

---

## 3. System Requirements & Specifications

### 3.1 Functional Requirements

- **Bi-directional Voice Streaming:** Continuous full-duplex audio stream between the client application and the AI engine.
- **Barge-in (Interruption Handling):** The AI must immediately cease audio playback the moment the user begins speaking.
- **State & Memory Management:** The agent must summarize key conversational takeaways and store them semantically for future retrieval.
- **Dynamic Sourcing & Tool Integration:** The agent must automatically decide when to search the live web, log documentation, or control external software based on conversational context.

### 3.2 Non-Functional Requirements

- **Ultra-low Latency:** Audio response delay must be under 500ms to mimic natural human speech patterns.
- **Cross-Platform Accessibility:** Single codebase deployable to desktop browsers and installable on iOS/Android devices without App Store dependencies.
- **Security & Credential Isolation:** Sensitive API tokens (Google AI, Spotify, Notion) must reside strictly on the server side and never be exposed to the client.

---

## 4. Technology Selection & Rationale

### 4.1 Core AI Engine: Google Gemini Multimodal Live API

- **Selection:** Gemini 2.0 Flash (via the Live API over WebSockets).
- **Rationale:** \* **Cost Efficiency:** At orders of magnitude cheaper than OpenAI's Realtime API ($0.01 vs $0.06-$0.20 per minute), Gemini allows for extensive experimental usage and long-running ambient sessions.
  - **Massive Context Window:** Gemini’s native large context window facilitates rich, data-heavy prompt injections.
  - **Native Multimodality:** Supports audio and video input stream handling natively, opening the door for future webcam and screen-sharing enhancements.

### 4.2 Application Architecture

- **Frontend:** **React / Next.js** configured as a **Progressive Web App (PWA)**.
  - _Rationale:_ PWAs allow a web application to be saved to a mobile home screen, providing an app-like fullscreen wrapper, native microphone/speaker permissions, and offline capability across iOS, Android, macOS, and Windows.
- **Backend:** **Node.js with TypeScript** (Express or NestJS).
  - _Rationale:_ Node.js handles asynchronous I/O and WebSocket streaming efficiently. TypeScript ensures strict data typing for complex structured JSON payloads used during Function Calling.
- **Long-Term Memory Vault:** **PostgreSQL with `pgvector`** (or Pinecone).
  - _Rationale:_ Enables semantic storage of user context and past interactions via text embeddings, allowing Puding to search historical memory contextually.

---

## 5. Comprehensive, Phased Implementation Roadmap

The development of Project Puding is divided into sequential, numbered phases to ensure structural stability before adding external system integrations.

### Phase 1: Core Voice Infrastructure & WebSocket Bridge

Focuses on establishing the real-time full-duplex communication pipelines.

#### Stage 1.1: Infrastructure & Backend Relay

- [x] **1. Monorepo Scaffolding:** Initialize `apps/server`, `apps/web`, and `packages/tsconfig`. Configure `pnpm-workspace.yaml` and `turbo.json`.
- [x] **2. Backend Setup:** Initialize Node.js TypeScript environment in `apps/server` with `ws` and `@google/generative-ai`.
- [x] **3. WebSocket Proxy:** Implement a server that accepts client connections and establishes a secure `live.connect` session with Gemini.
- [x] **4. Connectivity Test:** Verify that the server can send/receive a handshake with the Gemini Live API.

#### Stage 1.2: Frontend Audio Capture

- [x] **5. Next.js PWA Boilerplate:** Setup `apps/web` with TypeScript and basic PWA configuration.
- [x] **6. Micro-Recorder Module:** Implement client-side audio capture using `Navigator.mediaDevices`.
- [x] **7. Downsampling Pipeline:** Build the `AudioWorklet` or `Processor` to convert audio to 16kHz 16-bit LE PCM.
- [x] **8. Streaming Bridge:** Connect the frontend to the backend WebSocket and stream Base64-encoded PCM chunks.

#### Stage 1.3: Audio Playback & Interruption

- [x] **9. Audio Output Streamer:** Implement a playback queue for incoming 24kHz PCM chunks from Gemini.
- [x] **10. Gapless Playback Engine:** Ensure smooth audio delivery using the Web Audio API.
- [x] **11. Interruption (Barge-In) Logic:** Listen for Gemini's interruption signals; flush the frontend audio buffer immediately when user input is detected.
- [x] **12. Latency Audit:** Measure and optimize the round-trip time to ensure it remains < 500ms.

### Phase 2: Central Interface & State Management

Focuses on building the interactive user interface and immediate context tracking.

- [x] **8. PWA Manifest Configuration:** Configure `manifest.json`, service workers, and iOS/Android asset parameters to make the app installable.
- [x] **9. The "Orb" UI Component:** Create an interactive, animated graphical element representing Puding’s current state (Gray = Sleeping/Thinking, Blue = Listening, Purple/Green Gradient Wave = Speaking).
- [x] **10. Session State Tracker:** Create an ephemeral database or in-memory session object on the backend to manage current session IDs, token lengths, and active websocket statuses.

### Phase 2.5: Bidirectional Text & Audio Interaction (Chat UI)

Focuses on enabling multi-modal text and audio chat sessions with extensible visualization layouts.

- [x] **11. WebSocket Integration Upgrade:** Configure NestJS server proxy to parse and relay audio transcripts (`inputTranscription`, `outputTranscription`) and turn boundaries (`turnComplete`) from Gemini Live API.
- [x] **12. Multi-Modal Client Hook:** Implement `useLiveSession` hook upgrade to track conversation message history, coordinate raw text turns, and manage thinking states.
- [x] **13. Extensible Chat UI:** Build scrollable `ChatWindow` and `ChatInput` components with support for dynamic integration visualization widgets.

### Phase 3: Notion Connection & Knowledge Management

Allows Puding to read pages, write to pages, and create pages within a Notion Workspace.

- [x] **14. Notion Integration Provisioning:** Generate an Internal Integration Token within the Notion Developer settings and share designated pages/databases with the integration.
- [x] **15. Notion SDK Client Integration:** Implement a dedicated Notion API service in the backend using `@notionhq/client` that supports reading page content/blocks, creating new pages, and writing (appending) blocks to pages.
- [x] **16. Notion Tool Schema Declarations:** Declare function schemas for Notion tools (`read_notion_page(page_id: string)`, `create_notion_page(parent_id: string, title: string, content: string)`, and `write_notion_page(page_id: string, content: string)`) in the Gemini Live API initializer.
- [x] **17. Notion Tool Execution Loop:** Implement backend tool handlers to intercept Notion tool calls from Gemini, execute corresponding API calls via the Notion service, and return the `toolResponse`.

### Phase 4: Web Search Integration

Empowers Puding to autonomously fetch real-time facts from the live internet.

- [x] **18. Web Search Function Declaration:** Register a structured tool configuration schema for `search_web(query: string)` inside the Gemini Live API initializer.
- [x] **19. Web Search API Client:** Integrate a search API (e.g., Serper or Tavily) client on the backend.
- [x] **20. Web Search Tool Execution Loop:** Implement the backend interceptor to handle `search_web` tool calls, execute the query, and return the search results back to Gemini.

### Phase 5: Spotify Media Control

Gives Puding voice control over Spotify playback: playing a song, queueing a song, and adding a song to a playlist. Detailed design: `docs/design/phase_5_design.md`.

- [x] **21. Spotify OAuth2 Provisioning & Token Service:** Register a Spotify app (redirect URI `http://localhost:6601/spotify/callback`, scopes `user-read-playback-state`, `user-modify-playback-state`, `playlist-read-private`, `playlist-modify-private`, `playlist-modify-public`), expose optional `SPOTIFY_*` variables via `ConfigService`, and implement `SpotifyAuthService` (authorize URL, one-time code exchange, cached refresh-token grant) plus the `/spotify/login` and `/spotify/callback` setup routes.
- [ ] **22. Spotify Web API Client:** Define the abstract `MusicService` injection token and implement `SpotifyService` against the Spotify Web API — track search, active-device resolution, start playback, enqueue, playlist lookup by name, and add to playlist (`POST /playlists/{id}/items`) — with 401 refresh-and-retry and human-readable error translation.
- [ ] **23. Spotify Tool Schema Declarations:** Declare and register `play_song(query, device_name?)`, `queue_song(query)`, and `add_song_to_playlist(query, playlist_name)` as `GeminiTool` subclasses under the `"GEMINI_TOOLS"` token.
- [ ] **24. Playback Visualization:** Extend the existing `SpotifyCard` with an action badge (Playing / Queued / Added to playlist), the target playlist name, and album art.

> Requires a Spotify **Premium** account with an active device; Web API player endpoints control existing players and reject free accounts.

---

## Future Features

These features are excluded from the active roadmap stages and will be planned in detail in the future:

- **Semantic Long-Term Memory (RAG Integration):**
  - PostgreSQL with `pgvector` for storing and retrieving semantic context across separate sessions.
  - Asynchronous background session summarizer.
  - Context injection pipeline to insert memory directly into the initial system prompt.
- **Extended Spotify Transport Controls:**
  - `pause_music`, `resume_music`, `skip_track`, and `set_volume` tools.
  - `get_current_track` for anaphoric requests ("add this song to my playlist").

---

## 6. Verification & Testing Strategy

- **Latency Check:** Measure time-to-first-audio chunk using server logs to ensure performance stays under the 500ms threshold.
- **Audio Artifact Audits:** Verify that downsampling and upsampling rates prevent popping, clicking, or robotic distortion in the conversation loop.
- **Interruption Integrity:** Confirm that audio streaming immediately cuts off upon vocal input without dropping subsequent packets.
