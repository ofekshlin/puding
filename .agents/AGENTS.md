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
  - _Dependency Inversion Principle (DIP):_ High-level modules (such as Gateways/Controllers) must not depend on low-level modules (such as specific API client implementations). Both must depend on abstractions (interfaces or abstract classes).
  - _Abstraction using NestJS Injection Tokens:_ Define runtime-persistent abstract classes to serve as NestJS dependency injection tokens. Subclasses implementing these abstractions can then be mapped via custom providers (e.g., `useClass`) in NestJS modules to decouple components across boundaries.
  - _Gemini Tool Abstraction:_ All function tools (e.g., Notion, Spotify, Web Search) must extend the abstract `GeminiTool` class. Do not define tool schemas or execute them directly inside `GeminiSession`. Instead, register them under the `"GEMINI_TOOLS"` token to keep session management decoupled and open for extension.

- **Structured Logging:** Use the built-in NestJS `Logger` class for all logging. `console.log` is strictly forbidden.
- **Barge-In Handling:** The system must immediately stop audio output upon user input detection.
- **React & Frontend Best Practices:**
  - _Separation of Concerns:_ Decouple presentational UI components from state management, APIs, and stream connections. Put session orchestration, audio graphs, and side-effects in custom React hooks (e.g., `useLiveSession`, `useAudioRecorder`).
  - _Component Modularity:_ Avoid giant page files or nested visual templates. Split views into highly cohesive, single-responsibility components with strict TypeScript prop definitions.
  - _Resource Cleanup:_ Explicitly close, stop, and clean up active resources (WebSockets, Web Audio context, mic streams/media tracks) inside hooks or `useEffect` cleanup return functions to prevent memory leaks and background resource drain.
  - _State & Render Optimization:_ Memoize callbacks with `useCallback` when passed as props to subcomponents, and store non-rendering mutable session structures in `useRef` to eliminate redundant component lifecycle runs.
  - _Clean Styling:_ Isolate visual layout rules to stylesheets (e.g., `globals.css` or CSS modules) using semantic CSS custom properties (variables) rather than inline JSX style definitions.

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

### Phase 3: Notion Connection & Knowledge Management

- Notion SDK client & workspace integration.
- Tool schemas for reading, writing, and creating pages.
- Bidirectional Notion page management tool execution loop.

### Phase 4: Web Search Integration

- Web search API client (Serper/Tavily) setup.
- Web search tool schema declaration.
- Web search tool execution loop.

## Future Features

- **Semantic Long-Term Memory (RAG):** PostgreSQL + `pgvector` setup, background summarization, and context injection.
- **Spotify Media Control:** Spotify OAuth2, playback control tools (`play`, `pause`, `get_track`).

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
