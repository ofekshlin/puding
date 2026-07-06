# Phase 2.5 Design: Bidirectional Text & Audio Interaction (Chat UI)

## 1. Overview

This phase introduces a dual-modality interaction system where the user can see Puding's spoken responses as text in real-time, and communicate with Puding using typed text in addition to spoken audio within the same session. Furthermore, the UI is built to be extensible, allowing the chat timeline to render custom visualization widgets for future integrations (e.g. Spotify player card or Notion document logger).

Key components:

1. **WebSocket Protocol Expansion:** Upgrade server-client message contracts to support streaming transcriptions and turn completion indicators.
2. **Multi-Modal Client State Hook:** Extend `useLiveSession` to manage a chronological chat history (`messages`) containing both user (spoken/typed) and Puding responses, handle text streaming aggregation, and manage an `isThinking` indicator.
3. **Extensible Chat Interface:** Build high-quality React chat components (`ChatWindow` and `ChatInput`) with glassmorphic bubbles and a dynamic sub-renderer for rendering specialized integration cards.

---

## 2. Architecture & Monorepo Changes

```
puding/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── gateway/
│   │   │   │   └── proxy.gateway.ts           # Handles JSON content message forwarding
│   │   │   ├── gemini/
│   │   │   │   └── gemini.session.ts          # Relays transcripts & turnComplete events
│   │   │   └── types/
│   │   │       ├── client-message.ts          # Contract for client_content (unchanged)
│   │   │       ├── gemini-server-message.ts   # Added transcription schema from Google
│   │   │       └── server-message.ts          # Added userTranscription and turnComplete
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   │   ├── globals.css                # Added chat bubble styles and animations
│       │   │   └── page.tsx                   # Renders ChatWindow and ChatInput components
│       │   ├── components/
│       │   │   ├── ChatInput.tsx              # Text message field and Send button
│       │   │   └── ChatWindow.tsx             # List of glassmorphic bubbles & integration router
│       │   └── hooks/
│       │       └── useLiveSession.ts          # Integrates text sending, state machine, and isThinking
```

---

## 3. Detailed Component Designs

### 3.1 Server-Client Message Contract Upgrade

We need to capture and propagate transcription data and turn completions. The following fields are added:

- **`gemini-server-message.ts`**:
  Extend `GeminiServerMessage` to parse the Google Live API outputs:

  ```typescript
  export interface GeminiServerMessage {
    setupComplete?: Record<string, never>;
    serverContent?: {
      modelTurn?: {
        parts?: Array<{
          text?: string;
          inlineData?: {
            mimeType?: string;
            data?: string;
          };
        }>;
      };
      inputTranscription?: {
        text?: string;
      };
      outputTranscription?: {
        text?: string;
      };
      turnComplete?: boolean;
      interrupted?: boolean;
    };
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  }
  ```

- **`server-message.ts`**:
  Extend `ServerMessage` to inform the frontend of user transcriptions and turn endings:
  ```typescript
  export type ServerMessage =
    | {
        type: "setup_complete";
      }
    | {
        type: "content";
        text?: string;
        audio?: string;
        userTranscription?: string;
        turnComplete?: boolean;
      }
    | {
        type: "interrupted";
      };
  ```

### 3.2 Backend Relaying (`gemini.session.ts`)

The `GeminiSession.handleGeminiMessage(data)` method must forward these new fields when present:

1. `content.inputTranscription?.text` $\rightarrow$ Relayed as `type: "content", userTranscription: text`.
2. `content.outputTranscription?.text` $\rightarrow$ Relayed as `type: "content", text: text`.
3. `content.turnComplete` $\rightarrow$ Relayed as `type: "content", turnComplete: true`.

---

### 3.3 Multi-Modal Client Hook (`useLiveSession.ts`)

We define the state structure for messages:

```typescript
export interface ChatMessage {
  id: string;
  sender: "user" | "puding" | "system";
  text: string;
  timestamp: string;
  isStreaming?: boolean;
  integration?: {
    type: string; // e.g. "spotify", "notion"
    data: any;
  };
}
```

The hook maintains `messages: ChatMessage[]` and `isThinking: boolean` state.

#### The Text Streaming State Machine (`ws.onmessage`):

- **`userTranscription` is received**:
  If the last message is a user message and `isStreaming` is true, append the chunk. Otherwise, create a new user message with `isStreaming: true`.
- **`text` (Puding response chunk) is received**:
  First, finalize any streaming user message (set `isStreaming: false`). If the last message is a Puding message and `isStreaming` is true, append the chunk. Otherwise, create a new Puding message with `isStreaming: true`.
- **`turnComplete` is received**:
  Map all messages in the list, set `isStreaming` to `false` for any streaming message. Set `isThinking` to `false`.
- **`interrupted` is received**:
  Stop audio player playback. Finalize all streaming messages. For streaming Puding messages, append ` [interrupted]`. Set `isThinking` to `false`.

#### Sending Text Turns:

`sendTextMessage(text: string)` callback:

1. Call `stopPlayback()` to stop any current speaking.
2. Construct and send `client_content` turn payload to WebSocket:
   ```json
   {
     "type": "client_content",
     "content": {
       "turns": [{ "role": "user", "parts": [{ "text": text }] }],
       "turnComplete": true
     }
   }
   ```
3. Append a user message immediately with `isStreaming: false` and the typed text.
4. Set `isThinking(true)`.

---

### 3.4 Extensible Chat UI Component (`ChatWindow.tsx`)

A scrollable container styled with thin glassmorphic borders that automatically scrolls to the bottom on new messages.

#### Extensibility Design:

To allow future integrations to render special custom visualizations in the chat stream, the component includes an integration renderer hook or registry:

```typescript
// Extensible component router inside ChatWindow.tsx
const renderIntegrationCard = (type: string, data: any) => {
  switch (type) {
    case "spotify":
      return (
        <div className="integration-card spotify-card">
          <div className="card-header">🎵 Spotify Playback</div>
          <div className="card-body">
            <strong>{data.track || "Unknown Track"}</strong>
            <span>{data.artist || "Unknown Artist"}</span>
          </div>
        </div>
      );
    case "notion":
      return (
        <div className="integration-card notion-card">
          <div className="card-header">📝 Notion Document Created</div>
          <div className="card-body">
            <strong>{data.title || "Untitled Page"}</strong>
            <p>{data.summary || "Summary..."}</p>
          </div>
        </div>
      );
    default:
      return (
        <div className="integration-card default-card">
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
      );
  }
};
```

---

### 3.5 Text Input Component (`ChatInput.tsx`)

A form positioned at the bottom of the card.

- Features a glassmorphic search-like input input bar.
- Includes a circular action button containing a vector SVG paper-plane icon.
- Dynamically disables when the connection status is not `"connected"`.

---

## 4. Implementation Steps

### Step 1: Server Upgrades (WebSocket Bridge & Types)

1. Modify `apps/server/src/types/gemini-server-message.ts` to include transcript fields.
2. Modify `apps/server/src/types/server-message.ts` to include user transcriptions and turn completes.
3. Update `GeminiSession.handleGeminiMessage()` in `apps/server/src/gemini/gemini.session.ts` to relay input/output transcriptions and turn completes.
4. Verify backend build with `pnpm --filter server build`.

### Step 2: Client Hook Integration (`useLiveSession.ts`)

1. Define `ChatMessage` interface.
2. Initialize `messages` state and `isThinking` state.
3. Update setup configuration payload to set `responseModalities: ["TEXT", "AUDIO"]` and `inputAudioTranscription: {}`.
4. Update WebSocket message handler with the streaming state machine.
5. Create `sendTextMessage` callback and export it from the hook.

### Step 3: Frontend UI Components

1. Create `apps/web/src/components/ChatWindow.tsx` with dynamic integration resolvers.
2. Create `apps/web/src/components/ChatInput.tsx` with layout controls.
3. Update `apps/web/src/components/VisualizerOrb.tsx` to utilize `isThinking` prop for spinner controls.
4. Update `apps/web/src/app/page.tsx` to lay out the new components and wrap the developer console in a `<details>` collapsible panel.

### Step 4: Styling Integration (`globals.css`)

1. Implement bubble styling rules for `.chat-message.user` and `.chat-message.puding`.
2. Style custom visualizer cards `.integration-card` for `spotify` and `notion` (using sleek, themed outlines and icons).
3. Apply animation keyframes for inline loading states.

---

## 5. Success Criteria & Verification

### WebSocket Upgrades

- [ ] Backend successfully forwards user spoken transcripts, model output transcripts, and turn completed events.
- [ ] Handshake succeeds without WebSocket connection closing (Error 1007/1008).

### Chat Interface

- [ ] Spoken words from the user are transcribed and streamed in real-time inside the chat view.
- [ ] Puding's response streams as text in real-time while voice audio is played gaplessly.
- [ ] Interrupted responses cease playback instantly and show the `[interrupted]` tag.
- [ ] Typing a text message and pressing Send sends it, triggers Puding's `isThinking` (orb spinning), and plays/shows the response.

### Extensibility Verification

- [ ] Injecting a mocked Spotify or Notion integration payload into the state results in a styled player or page log widget appearing in the timeline.
