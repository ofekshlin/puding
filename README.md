# Project Puding (🍮) - Comprehensive Project Specification & Architecture Design

## 1. Executive Summary
Project **Puding** is an advanced, high-performance, interactive AI Agent designed to emulate the seamless, responsive, and cross-platform experience of an intelligent assistant (akin to Iron Man's Jarvis). Unlike traditional chat interfaces that suffer from statelessness, high latency, and lack of continuity, Puding leverages cutting-edge real-time multimodal streaming and automated function execution to serve as an intuitive intellectual partner and task automation engine.

---

## 2. Project Goal & Core Purpose
The primary objective of Project Puding is to deliver a low-latency, stateful, and voice-first AI companion accessible on both mobile and desktop environments. Puding will be capable of:
* **Natural Conversation:** Real-time, continuous voice interaction with human-like interruption capabilities.
* **Persistent Context:** Short-term session tracking and long-term semantic memory to recall user preferences, past discussions, and project states.
* **Autonomous Tool Execution:** Interacting with external web services, productivity software, and media applications via secure backend function calling.

---

## 3. System Requirements & Specifications

### 3.1 Functional Requirements
* **Bi-directional Voice Streaming:** Continuous full-duplex audio stream between the client application and the AI engine.
* **Barge-in (Interruption Handling):** The AI must immediately cease audio playback the moment the user begins speaking.
* **State & Memory Management:** The agent must summarize key conversational takeaways and store them semantically for future retrieval.
* **Dynamic Sourcing & Tool Integration:** The agent must automatically decide when to search the live web, log documentation, or control external software based on conversational context.

### 3.2 Non-Functional Requirements
* **Ultra-low Latency:** Audio response delay must be under 500ms to mimic natural human speech patterns.
* **Cross-Platform Accessibility:** Single codebase deployable to desktop browsers and installable on iOS/Android devices without App Store dependencies.
* **Security & Credential Isolation:** Sensitive API tokens (Google AI, Spotify, Notion) must reside strictly on the server side and never be exposed to the client.

---

## 4. Technology Selection & Rationale

### 4.1 Core AI Engine: Google Gemini Multimodal Live API
* **Selection:** Gemini 2.0 Flash (via the Live API over WebSockets).
* **Rationale:** * **Cost Efficiency:** At orders of magnitude cheaper than OpenAI's Realtime API ($0.01 vs $0.06-$0.20 per minute), Gemini allows for extensive experimental usage and long-running ambient sessions.
  * **Massive Context Window:** Gemini’s native large context window facilitates rich, data-heavy prompt injections.
  * **Native Multimodality:** Supports audio and video input stream handling natively, opening the door for future webcam and screen-sharing enhancements.

### 4.2 Application Architecture
* **Frontend:** **React / Next.js** configured as a **Progressive Web App (PWA)**. 
  * *Rationale:* PWAs allow a web application to be saved to a mobile home screen, providing an app-like fullscreen wrapper, native microphone/speaker permissions, and offline capability across iOS, Android, macOS, and Windows.
* **Backend:** **Node.js with TypeScript** (Express or NestJS).
  * *Rationale:* Node.js handles asynchronous I/O and WebSocket streaming efficiently. TypeScript ensures strict data typing for complex structured JSON payloads used during Function Calling.
* **Long-Term Memory Vault:** **PostgreSQL with `pgvector`** (or Pinecone).
  * *Rationale:* Enables semantic storage of user context and past interactions via text embeddings, allowing Puding to search historical memory contextually.

---

## 5. Comprehensive, Phased Implementation Roadmap

The development of Project Puding is divided into sequential, numbered phases to ensure structural stability before adding external system integrations.

### Phase 1: Core Voice Infrastructure & WebSocket Bridge
Focuses on establishing the real-time full-duplex communication pipelines.

#### Stage 1.1: Infrastructure & Backend Relay
* [x] **1. Monorepo Scaffolding:** Initialize `apps/server`, `apps/web`, and `packages/tsconfig`. Configure `pnpm-workspace.yaml` and `turbo.json`.
* [x] **2. Backend Setup:** Initialize Node.js TypeScript environment in `apps/server` with `ws` and `@google/generative-ai`.
* [x] **3. WebSocket Proxy:** Implement a server that accepts client connections and establishes a secure `live.connect` session with Gemini.
* [x] **4. Connectivity Test:** Verify that the server can send/receive a handshake with the Gemini Live API.

#### Stage 1.2: Frontend Audio Capture
* [x] **5. Next.js PWA Boilerplate:** Setup `apps/web` with TypeScript and basic PWA configuration.
* [x] **6. Micro-Recorder Module:** Implement client-side audio capture using `Navigator.mediaDevices`.
* [x] **7. Downsampling Pipeline:** Build the `AudioWorklet` or `Processor` to convert audio to 16kHz 16-bit LE PCM.
* [x] **8. Streaming Bridge:** Connect the frontend to the backend WebSocket and stream Base64-encoded PCM chunks.

#### Stage 1.3: Audio Playback & Interruption
* [ ] **9. Audio Output Streamer:** Implement a playback queue for incoming 24kHz PCM chunks from Gemini.
* [ ] **10. Gapless Playback Engine:** Ensure smooth audio delivery using the Web Audio API.
* [ ] **11. Interruption (Barge-In) Logic:** Listen for Gemini's interruption signals; flush the frontend audio buffer immediately when user input is detected.
* [ ] **12. Latency Audit:** Measure and optimize the round-trip time to ensure it remains < 500ms.

### Phase 2: Central Interface & State Management
Focuses on building the interactive user interface and immediate context tracking.

* [ ] **8. PWA Manifest Configuration:** Configure `manifest.json`, service workers, and iOS/Android asset parameters to make the app installable.
* [ ] **9. The "Orb" UI Component:** Create an interactive, animated graphical element representing Puding’s current state (Gray = Sleeping/Thinking, Blue = Listening, Purple/Green Gradient Wave = Speaking).
* [ ] **10. Session State Tracker:** Create an ephemeral database or in-memory session object on the backend to manage current session IDs, token lengths, and active websocket statuses.

### Phase 3: Semantic Long-Term Memory (RAG Integration)
Focuses on making Puding recall facts across completely separate conversation instances.

* [ ] **11. Vector DB Provisioning:** Deploy a PostgreSQL instance with the `pgvector` extension enabled, or provision a Pinecone vector index.
* [ ] **12. Asynchronous Conversation Summarizer:** Write a background worker that triggers when a user session disconnects, summarizing key facts about the user (e.g., identity, preferences, ongoing tasks).
* [ ] **13. Embedding Generation Engine:** Connect the summary engine to text embedding APIs to transform text insights into high-dimensional vectors.
* [ ] **14. Context Injection Pipeline:** Develop a pre-session retrieval function that queries the Vector DB during initialization and appends historical data directly into Puding's initial system prompt.

### Phase 4: Function Calling & Google Search Integration
Empowers Puding to autonomously fetch real-time facts from the live internet.

* [ ] **15. Function Calling Declaration:** Register a structured tool configuration Schema for `search_google(query: string)` inside the Gemini Live API initializer.
* [ ] **16. Serper / Tavily API Client:** Integrate a dedicated web-scraping/search API on the Node.js backend.
* [ ] **17. Tool Execution Loop:** Implement the backend interceptor: when Gemini stops speaking and sends a `toolCall` payload, parse the JSON, execute the search API, and stream the text results back as a `toolResponse`.

### Phase 5: Spotify Media Control Integration
Enables Puding to manage music playback and query song metadata.

* [ ] **18. Spotify Developer Portal Setup:** Register Project Puding in the Spotify Developer Dashboard to acquire a `Client ID` and `Client Secret`.
* [ ] **19. OAuth2 Authentication Flow:** Implement a secure authorization route allowing the user to log in via Spotify once and securely store the `Access Token` and `Refresh Token`.
* [ ] **20. Spotify Tool Schema:** Declare function schemas for `play_music(genre_or_artist: string)`, `pause_music()`, and `get_current_track()`.
* [ ] **21. Web API Execution:** Code the backend wrappers using the official Spotify Web API endpoints to programmatically control active playback devices.

### Phase 6: Notion Documentation & Knowledge Management
Allows Puding to write structured notes, logs, and brain-dumps into a Notion Workspace.

* [ ] **22. Notion Integration Provisioning:** Generate an Internal Integration Token within the Notion Developer settings and share a designated master database with the integration.
* [ ] **23. Notion Tool Schema:** Create schemas for `create_notion_page(title: string, content: string)` and `append_to_log(text: string)`.
* [ ] **24. Notion SDK Client:** Build backend methods using `@notionhq/client` to dynamically generate pages, block components, and bulleted lists on your personal workspace based on verbal summaries.

---

## 6. Verification & Testing Strategy
* **Latency Check:** Measure time-to-first-audio chunk using server logs to ensure performance stays under the 500ms threshold.
* **Audio Artifact Audits:** Verify that downsampling and upsampling rates prevent popping, clicking, or robotic distortion in the conversation loop.
* **Interruption Integrity:** Confirm that audio streaming immediately cuts off upon vocal input without dropping subsequent packets.
