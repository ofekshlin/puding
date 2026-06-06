# Phase 1 Design: Core Voice Infrastructure & WebSocket Bridge

## 1. Overview
This phase establishes the foundational real-time communication between the client (PWA) and the Gemini 2.0 Flash Multimodal Live API via a Node.js backend proxy. The primary goal is establishing full-duplex WebSocket connections, client-side 16kHz PCM audio capture, server-side streaming proxying to the Gemini API, and low-latency gapless 24kHz audio playback with interruption (barge-in) handling.

Target latency: **< 500ms** round-trip.

---

## 2. Architecture & Monorepo Structure

The project is structured as a **pnpm monorepo** managed by **Turborepo**.

```
puding/
├── apps/
│   ├── server/             # Node.js TypeScript WebSocket server
│   │   ├── src/
│   │   │   ├── index.ts    # Main server entrypoint & WebSocket handler
│   │   │   └── types.ts    # WebSocket and Gemini message types
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                # Next.js TypeScript PWA (React)
│       ├── public/
│       │   └── manifest.json
│       ├── src/
│       │   ├── app/
│       │   │   ├── page.tsx
│       │   │   └── layout.tsx
│       │   ├── hooks/
│       │   │   ├── useAudioRecorder.ts
│       │   │   └── useAudioPlayer.ts
│       │   └── workers/
│       │       └── audio-processor.js  # AudioWorkletProcessor for PCM
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   └── tsconfig/           # Shared TypeScript configurations
│       ├── base.json
│       ├── nextjs.json
│       └── package.json
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 3. Detailed Component Designs

### 3.1 TSConfig package (`packages/tsconfig`)
To ensure strict typing and consistent compilation behavior across the monorepo, we define a base TypeScript configuration in `packages/tsconfig`.

- **`base.json`**:
  - Enforces `strict` mode, `esModuleInterop`, `forceConsistentCasingInFileNames`.
  - Sets `target` to `ES2022` and `module` resolution to `bundler`/`node16`.

### 3.2 Backend WebSocket Proxy (`apps/server`)
The server acts as an orchestrator and security barrier. It keeps the Google Gemini API key secure on the server.

- **Technology Stack**: Node.js, TypeScript, `ws` library for fast WebSocket server implementation, `dotenv` for env configuration.
- **WebSocket Protocol (Client <-> Server)**:
  - We use standard WebSockets.
  - **Connection URL**: `ws://localhost:3001`
  - **Client-to-Server Messages**:
    - **Handshake/Setup**:
      ```json
      {
        "type": "setup",
        "config": {
          "model": "models/gemini-2.0-flash-exp",
          "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
              "voiceConfig": {
                "prebuiltVoiceConfig": {
                  "voiceName": "Puck"
                }
              }
            }
          },
          "systemInstruction": "You are Puding, an ultra-low-latency assistant..."
        }
      }
      ```
    - **Audio Input Chunks**: Binary frames representing raw `16kHz 16-bit Little-Endian mono PCM`.
  - **Server-to-Client Messages**:
    - **Setup Completed**: `{"type": "setup_complete"}`
    - **Gemini Session Data**:
      ```json
      {
        "type": "content",
        "text": "Optional text transcription",
        "audio": "Base64 encoded 24kHz 16-bit LE PCM chunk"
      }
      ```
    - **Interruption/Barge-in Signal**:
      ```json
      {
        "type": "interrupted"
      }
      ```
- **Gemini Live Connection (Server <-> Gemini)**:
  - **Protocol**: WebSockets over SSL.
  - **Endpoint**: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`
  - **On Client Connection**:
    1. Establish WebSocket client connection.
    2. Establish backend connection to Gemini Live API.
    3. Forward the setup configuration JSON to Gemini:
       ```json
       {
         "setup": {
           "model": "models/gemini-2.0-flash-exp",
           "generationConfig": {
             "responseModalities": ["AUDIO"]
           }
         }
       }
       ```
    4. Upon receiving binary PCM audio from the client:
       - Convert PCM binary to Base64.
       - Send the following message to Gemini:
         ```json
         {
           "realtimeInput": {
             "mediaChunks": [
               {
                 "mimeType": "audio/pcm",
                 "data": "<Base64EncodedPCM>"
               }
             ]
           }
         }
         ```
    5. Upon receiving server messages from Gemini:
       - Parse `serverContent` containing audio or text output.
       - If `serverContent.modelTurn` is received, extract the audio chunk and send it to the client.
       - If `interrupted: true` is received, immediately send a `{"type": "interrupted"}` message to the client.

---

### 3.3 Frontend Audio Capture (`apps/web`)

To record low-latency, high-fidelity audio without UI blockages:
- **Audio Recorder Hook (`useAudioRecorder.ts`)**:
  - Request user microphone permission via `navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 } })`.
  - Create an `AudioContext`.
  - Load and register an `AudioWorkletProcessor` (`audio-processor.js`) designed to perform efficient downsampling from the input sample rate (e.g. 48kHz) down to **16kHz**.
  - Collect downsampled mono channel float values and pack them into `Int16Array` (16-bit LE PCM).
  - Stream the binary PCM buffer chunks over the WebSocket to the server.

- **Audio Worklet Processor (`audio-processor.js`)**:
  - Operates inside the high-priority audio thread.
  - Accumulates 128-sample audio blocks, applies a decimation filter to convert to 16kHz, and posts the resulting `Float32Array` or `Int16Array` chunks back to the main thread (or sends it directly if using WebSockets inside worklet, but main-thread bridging is standard and highly reliable).

---

### 3.4 Audio Playback & Interruption

To achieve gapless audio playback and immediate interruption:
- **Audio Player Hook (`useAudioPlayer.ts`)**:
  - Maintain a queue of incoming **24kHz 16-bit LE PCM** chunks.
  - Playback via `Web Audio API`'s `AudioContext`.
  - Since Web Audio API plays `AudioBuffer`s of `Float32` samples, the player must convert incoming `Int16Array` PCM data to `Float32Array` (divide by `32768.0`) and schedule them back-to-back in the `AudioContext` timeline.
  - **Interruption Handling**:
    - The hook provides a `flush()` function.
    - When the client receives the `{"type": "interrupted"}` message from the server, it instantly halts the active playback, flushes the queue, and resets the playback timeline.
    - Additionally, if the user starts speaking (client-side detection or barge-in), the client will actively call `flush()` and notify the server to interrupt Gemini.

---

## 4. Stage-by-Stage Implementation Tasks

### Stage 1.1: Infrastructure & Backend Relay (Current Stage)
1. Set up the `packages/tsconfig` with the base TS configurations.
2. Initialize `apps/server` with TS, `ws`, `dotenv`, and developer packages.
3. Scaffold `apps/web` Next.js template and verify Turborepo integration.
4. Implement `apps/server/src/index.ts` containing the WebSocket relay server.
5. Create a standalone test client script `apps/server/src/test-connection.ts` that connects to the proxy, performs the handshake, sends a dummy audio packet, and verifies that Gemini replies with connection acknowledgment and response data.

---

## 5. Success Criteria & Verification

- [x] **Monorepo setup**: Running `pnpm build` at root builds all packages successfully.
- [x] **Relay connection**: Server connects to `generativelanguage.googleapis.com` Live API WebSocket.
- [x] **Handshake verification**: Standard test client receives a `setup_complete` type message.
- [x] **Data transmission**: Sending PCM-structured messages results in a clean response from Gemini.

