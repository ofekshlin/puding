# Phase 2 Design: Central Interface & State Management

## 1. Overview
This phase focuses on enhancing user experience, brand identity, and application manageability. It consists of three primary components:
1. **PWA Manifest & Installability:** Configuring the Progressive Web Application parameters (manifest, service workers, and iOS/Android assets) to allow installing Puding as a standalone app.
2. **The "Orb" UI Component:** Replacing the basic indicator with a highly polished, glassmorphic, and state-driven visualizer representing Puding's conversation states (Gray for Sleeping, Blue for Listening, Purple/Green Gradient for Speaking).
3. **Session State Tracker:** Implementing an in-memory session manager service on the backend to monitor and report active WebSocket status, session IDs, client IPs, and Gemini API token usage.

---

## 2. Architecture & Monorepo Changes

```
puding/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── app.module.ts
│   │   │   ├── gateway/
│   │   │   │   └── proxy.gateway.ts           # Employs SessionTracker abstraction
│   │   │   ├── gemini/
│   │   │   │   └── gemini.session.ts          # Reports token usage
│   │   │   └── session/
│   │   │       ├── live-session.interface.ts
│   │   │       ├── live-session.service.ts
│   │   │       ├── session-state.interface.ts  # Session status and tokens schema
│   │   │       ├── session-tracker.interface.ts# Abstract token for DIP composition
│   │   │       ├── session-tracker.service.ts  # Concrete in-memory tracker implementation
│   │   │       ├── session.controller.ts       # GET /api/sessions endpoint
│   │   │       └── session.module.ts           # Exports SessionTracker provider
│   └── web/
│       ├── public/
│       │   ├── manifest.json                  # PWA Manifest
│       │   ├── sw.js                          # Service Worker for offline asset caching
│       │   ├── icon-192.png                   # 192px app icon
│       │   └── icon-512.png                   # 512px app icon
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx                 # Includes RegisterServiceWorker component
│       │   │   └── page.tsx                   # Renders new state-dependent layout
│       │   ├── components/
│       │   │   ├── RegisterServiceWorker.tsx  # Registers sw.js client-side
│       │   │   └── VisualizerOrb.tsx          # Animated state-dependent visualizer
│       │   └── hooks/
│       │       ├── useAudioPlayer.interface.ts# Declares `isSpeaking` property
│       │       ├── useAudioPlayer.ts          # Exposes active playback tracking
│       │       └── useLiveSession.ts          # Bridges `isSpeaking` and controls
```

---

## 3. Detailed Component Designs

### 3.1 PWA Manifest & Service Worker
To satisfy PWA installability requirements, we provide:
- **`apps/web/public/manifest.json`**: Upgraded to correctly reference high-resolution application icons and set standard display parameters (`standalone`, `portrait`).
- **`apps/web/public/sw.js`**: Standard service worker that caches crucial shell assets (`/`, `manifest.json`, and icons) and falls back to cached files in the event of offline usage.
- **`apps/web/src/components/RegisterServiceWorker.tsx`**: Client Component imported in the root Server Layout to register `/sw.js` in a non-blocking browser lifecycle hook.

### 3.2 The "Orb" UI Component (`VisualizerOrb.tsx`)
The Orb is Puding's core interactive element. Its presentation depends on Puding's current state:

| State | Condition | Visual Appearance | Animation |
|-------|-----------|-------------------|-----------|
| **Sleeping** | `status === 'disconnected'` or `status === 'failed'` | Monochromatic dark gray frosted glass circle | Slow, breathing scale pulse (1.0 to 1.03) |
| **Thinking** | `status === 'connecting'` | Dark gray with glowing inner white-blue core | Fast rotation of a subtle perimeter ring |
| **Listening** | `isRecording === true` | Vibrant sapphire blue frosted core | Pulse scale based on real-time microphone input volume |
| **Speaking** | `isSpeaking === true` | Morphing purple-and-green gradient wave | Wave distortion pattern simulating speech modulation |

#### Design & Styling Integration:
The visual transitions are controlled via CSS custom properties in `globals.css` and Canvas or animated SVGs to maintain extreme smoothness. An interactive click triggers microphone streaming or server connection depending on current context.

```typescript
export interface VisualizerOrbProps {
  status: "disconnected" | "connecting" | "connected" | "failed";
  isRecording: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  onOrbClick: () => void;
  disabled: boolean;
}
```

### 3.3 Audio Player Hook Upgrade (`useAudioPlayer.ts`)
To support the "Speaking" state, the audio player hook tracks active scheduled nodes:
- Maintains a reference count or state `isSpeaking`.
- Increments the count when a new chunk is scheduled.
- Decrements the count inside the `onended` handler of the `AudioBufferSourceNode`. If the count returns to `0`, `isSpeaking` becomes `false`.
- Resets the status to `false` inside the `stop()` method.
- Exposes `isSpeaking` to `useLiveSession`.

### 3.4 Backend Session State Tracker
To decouple Gateway and Session management from specific tracker implementations, we introduce an abstract token:

- **`SessionState` Interface (`session-state.interface.ts`)**:
  ```typescript
  export interface SessionState {
    sessionId: string;
    status: "connected" | "disconnected";
    createdAt: Date;
    disconnectedAt?: Date;
    clientIp: string;
    tokens: {
      promptTokenCount: number;
      candidatesTokenCount: number;
      totalTokenCount: number;
    };
  }
  ```

- **`SessionTracker` Abstraction (`session-tracker.interface.ts`)**:
  ```typescript
  export abstract class SessionTracker {
    abstract registerSession(sessionId: string, clientIp: string): void;
    abstract disconnectSession(sessionId: string): void;
    abstract updateTokens(
      sessionId: string,
      tokens: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number },
    ): void;
    abstract getAllSessions(): SessionState[];
    abstract getSession(sessionId: string): SessionState | undefined;
  }
  ```

- **`SessionTrackerService` (`session-tracker.service.ts`)**:
  Extends `SessionTracker` and implements in-memory tracking via a JavaScript `Map`.

- **`SessionController` (`session.controller.ts`)**:
  Rest endpoint (`/api/sessions`) exposing current session states.

#### Integration Flow:
1. **Connection Registration:** In `ProxyGateway.handleConnection()`, the client IP is extracted and the gateway invokes `sessionTracker.registerSession(sessionId, clientIp)`.
2. **Disconnection Tracking:** In `ProxyGateway.handleDisconnect()`, the gateway invokes `sessionTracker.disconnectSession(sessionId)`.
3. **Usage Logging:** When Gemini returns usage data over the WebSocket (checked inside `GeminiSession.handleGeminiMessage()`), the session retrieves the token values and calls `sessionTracker.updateTokens(sessionId, usageMetadata)`.

---

## 4. Implementation Steps

### Step 1: Backend Session Infrastructure
1. Create `session-state.interface.ts` and `session-tracker.interface.ts` in `apps/server/src/session/`.
2. Create `session-tracker.service.ts` implementing `SessionTracker`.
3. Create `session.controller.ts` with REST endpoints.
4. Create `session.module.ts` exporting `SessionTracker` custom provider.
5. Register `SessionModule` in `AppModule` and import it into `GatewayModule` and `GeminiModule`.
6. Update `ProxyGateway` to log session connections and disconnections in the tracker.
7. Update `GeminiSession` and its interface to accept `SessionTracker` and record token counts from `usageMetadata`.

### Step 2: Frontend PWA Config & Setup
1. Use `sips` on macOS to convert the generated `puding_icon` to PNG sizes (192px and 512px) in `apps/web/public/`.
2. Create `apps/web/public/sw.js` (Offline assets cache).
3. Create `apps/web/src/components/RegisterServiceWorker.tsx`.
4. Update `apps/web/src/app/layout.tsx` to include `RegisterServiceWorker`.

### Step 3: Interactive Orb & Audio Player Hook Upgrades
1. Update `useAudioPlayer.interface.ts` and `useAudioPlayer.ts` to track and return `isSpeaking`.
2. Update `useLiveSession.ts` to propagate `isSpeaking` and logs.
3. Update `VisualizerOrb.tsx` to display animations for each state (Gray pulse for Sleeping, perimeter spin for Thinking, active blue swell for Listening, purple-green morphing gradient wave for Speaking).
4. Update `globals.css` with transitions, custom keyframes, and neon styles.

---

## 5. Success Criteria & Verification

### PWA Configuration
- [ ] Service worker successfully registers in the browser console.
- [ ] Chrome DevTools Lighthouse audit confirms app installability (manifest details, theme colors, icons).

### The "Orb" Component
- [ ] Visual transitions match the target state:
  - Disconnected: Gray pulse.
  - Connecting: Spin ring.
  - Recording: Active Blue scaling with sound level.
  - Speaking: Purple/Green flowing gradient.
- [ ] The audio player correctly flags `isSpeaking` during playback and resets it on completion.

### Session State Tracker
- [ ] Connecting a client registers a session entry accessible at `GET http://localhost:3001/sessions`.
- [ ] Disconnecting a client marks the status as `"disconnected"` with a timestamp.
- [ ] Session tokens increments match response data from Gemini Live API.
