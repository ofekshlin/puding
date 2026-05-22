# Phase 1 Design: Core Voice Infrastructure & WebSocket Bridge

## 1. Overview
This phase establishes the foundational real-time communication between the client (PWA) and the Gemini 2.0 Flash Multimodal Live API via a Node.js backend proxy. The goal is to achieve < 500ms latency for a natural conversation experience.

## 2. Architecture
The system follows a proxy architecture to ensure API key security and efficient stream handling.

- **Client (apps/web):** Next.js PWA. Captures audio, downsamples, and streams to the backend.
- **Server (apps/server):** Node.js (TypeScript) + WebSocket (`ws`). Acts as a secure bridge to Gemini Live API.
- **Shared (packages/*):** Shared configurations for TypeScript and potentially shared models/types.

## 3. Implementation Details

### 3.1 Backend (apps/server)
- **Framework:** Node.js with `ws` for WebSocket management.
- **Gemini SDK:** `@google/generative-ai` to connect to the Multimodal Live API.
- **Security:** API keys are stored in `.env` and never exposed to the frontend.
- **Stream Management:**
  - On client connection: Initialize a `LiveConfig` and establish a connection to Gemini.
  - Proxy `audio` messages from client to Gemini.
  - Proxy `audio` and `text` responses from Gemini back to the client.
  - Handle `interruption` events by notifying the client to stop playback.

### 3.2 Frontend (apps/web)
- **Audio Recording:**
  - Use `MediaDevices.getUserMedia` for microphone access.
  - Use `AudioContext` and `AudioWorklet` (preferred) or `ScriptProcessorNode` for real-time processing.
  - Downsample input to **16kHz 16-bit Little-Endian PCM**.
- **Communication:**
  - WebSocket connection to `apps/server`.
  - Send audio chunks as Base64 encoded strings.
- **Audio Playback:**
  - Ingest **24kHz 16-bit LE PCM** chunks.
  - Use a queuing mechanism with `AudioContext` to ensure gapless playback.
  - Implement a `flush()` method to handle barge-in/interruptions.

### 3.3 Monorepo Setup
- Initialize `apps/server` and `apps/web` with minimal boilerplates.
- Set up `packages/tsconfig` for consistent TypeScript rules.
- Configure `turbo.json` for orchestration.

## 4. Data Flow
1. **User Speaks** -> Client Captures (48kHz) -> Downsample (16kHz) -> Base64 -> WebSocket -> **Server**.
2. **Server** -> Gemini Live API -> **Gemini Engine**.
3. **Gemini Engine** -> Server (Audio/Text) -> **Server**.
4. **Server** -> WebSocket -> Client -> **Playback (24kHz)**.

## 5. Success Criteria
- [ ] Backend connects to Gemini Live API successfully.
- [ ] Client captures audio and sends valid 16kHz PCM to server.
- [ ] Server relays Gemini's 24kHz audio back to client.
- [ ] Client plays audio chunks without stuttering.
- [ ] Audio stops immediately when an interruption is detected.
