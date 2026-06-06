# Project Puding: Implementation & Architecture Guidelines

## Project Vision
Project **Puding** is an ultra-low-latency, stateful, multimodal AI Agent (Jarvis-like assistant) accessible via a PWA on mobile and desktop. It prioritizes seamless voice interaction, persistent semantic memory, and autonomous tool execution using the Gemini 2.0 Flash Multimodal Live API.

## Core Mandates & Conventions

### 1. Workspace & Package Management
- **Manager:** Use **pnpm** exclusively. A `preinstall` script enforces this.
- **Orchestration:** Use **Turborepo** for build pipelines and task execution (`turbo.json`).
- **Structure:** 
  - `apps/*` for deployable applications.
  - `packages/*` for shared libraries, types, and configurations.
- **Dependencies:** Use `workspace:*` for internal package references. Avoid "phantom dependencies" by strictly declaring all used packages in `package.json`.

### 2. Performance & Latency
- **Target:** Time-to-first-audio chunk must be **< 500ms**.
- **Optimization:** Use WebSocket streaming for full-duplex communication. Implement efficient PCM downsampling (16kHz for input) and upsampling (24kHz for output).
- **Audio Integrity:** Ensure smooth playback without clicks or distortion through proper buffer management.

### 3. Security & Credentials
- **Isolation:** Sensitive API tokens (Google AI, Spotify, Notion, etc.) MUST reside strictly on the server side.
- **Exposure:** Never expose internal credentials or backend logic directly to the client.

### 4. Architecture
- **Monorepo:** Standardized structure with `pnpm-workspace.yaml`.
- **Frontend:** React / Next.js (TypeScript) configured as a PWA.
- **Backend:** NestJS (TypeScript).
- **Database:** PostgreSQL with `pgvector` for semantic memory.
- **AI Integration:** Google Gemini 2.0 Flash via `ai.live.connect`.

### 5. Code Standards
- **Strict Typing:** Mandatory TypeScript across all packages and apps.
- **Shared Configs:** Extend base configurations from `packages/tsconfig`.
- **OOP & SOLID Principles:** Enforce strict Object-Oriented Programming (OOP) and SOLID principles. Encapsulate domain logic within NestJS Modules, Services, and Gateways, using dependency injection for composition.
- **Structured Logging:** Use the built-in NestJS `Logger` class for all logging. `console.log` is strictly forbidden.
- **Barge-In Handling:** The system must immediately stop audio output upon user input detection.

## Implementation Roadmap

### Phase 1: Core Voice Infrastructure & WebSocket Bridge
- WebSocket relay (Node.js -> Gemini Live API).
- Client-side PCM audio recording (16kHz, 16-bit LE).
- Server-to-client audio streaming (24kHz PCM).
- Interruption (Barge-in) logic.

### Phase 2: Central Interface & State Management
- PWA configuration (manifest, service workers).
- "The Orb" UI component (state-based animations).
- Ephemeral session tracking.

### Phase 3: Semantic Long-Term Memory (RAG)
- PostgreSQL + `pgvector` setup.
- Background summarization & embedding generation.
- Context injection into system prompts.

### Phase 4: Function Calling & Google Search
- `search_google` tool implementation (Serper/Tavily).
- Tool execution loop (call -> execute -> response).

### Phase 5: Spotify Media Control
- OAuth2 flow for Spotify.
- Playback control tools (`play`, `pause`, `get_track`).

### Phase 6: Notion Knowledge Management
- Notion SDK integration.
- Documentation tools (`create_page`, `append_to_log`).

## Plan-Driven Development Workflow

This project uses a **plan-driven development workflow** where features are implemented one stage at a time from a dedicated plan file.

### Plan File
**Current Plan**: `README.md`

### Build Command
**Build Command**: `npm run build`

### Branch Naming Convention
**Branch Format**: `feature/stage-<identifier>-<short-description>`

### Workflow Rules
1. **Single-stage enforcement**: When implementing from the plan, ONLY work on the specified stage. Never advance to the next stage.
2. **GitHub CLI (`gh`)**: All PR operations (create, comment, review) must use the `gh` CLI tool — not manual GitHub web UI.
3. **Branch per stage**: Each plan stage gets its own feature branch and PR.
4. **Build verification**: Always verify the project builds before committing. Use the build command above.
5. **Progress tracking**: After creating a PR for a stage, update the plan file to mark the stage as completed.
6. **CR workflow**: Code review fixes are committed to the same feature branch, never a new branch.

## Verification Requirements
- **Latency Audits:** Log and monitor response times.
- **Audio Verification:** Manual and automated checks for stream continuity.
- **Memory Consistency:** Verify that context is correctly retrieved across sessions.
