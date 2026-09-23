# Phase 5 Design: Spotify Media Control

## 1. Overview

This phase gives Puding voice control over the user's Spotify playback. Three capabilities are in scope:

1. **Play a song** — "Puding, play Bohemian Rhapsody" → starts playback of the best matching track on the active device.
2. **Queue a song** — "Queue Californication after this" → appends the track to the current playback queue.
3. **Add a song to a playlist** — "Add this to my Focus playlist" → resolves the playlist by name and appends the track.

Design constraints inherited from `.agents/AGENTS.md`:

1. **Security & Isolation:** Spotify credentials (client ID/secret, refresh token) live strictly server-side, exposed only through `ConfigService`. No token ever reaches the browser.
2. **Dependency Inversion:** A runtime-persistent abstract class `MusicService` acts as the NestJS injection token; `SpotifyService` is the concrete implementation. Tools depend on the abstraction only.
3. **Gemini Tool Abstraction:** Each capability is a separate `GeminiTool` subclass registered under the `"GEMINI_TOOLS"` token — no schemas or execution inside `GeminiSession`.
4. **Structured Logging:** NestJS `Logger` only.

### 1.1 External prerequisites (non-code)

- A Spotify app registered at <https://developer.spotify.com/dashboard> with redirect URI `http://localhost:6601/spotify/callback`.
- **Spotify Premium is mandatory.** All `/me/player/*` control endpoints (play, queue) return `403` for free accounts. Since February 2026, Development Mode apps additionally require the *app owner* to hold an active Premium subscription, are limited to 5 users, and 25 client IDs per developer.
- The account must have an **active device** (desktop app, phone, or Web Playback SDK) — the Web API controls existing players, it does not stream audio itself.

---

## 2. Architecture & Monorepo Changes

```
puding/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   └── config.service.ts            # Exposes SPOTIFY_* env configuration
│   │   │   ├── gemini/
│   │   │   │   └── gemini.module.ts             # Imports SpotifyModule, registers the 3 new tools
│   │   │   ├── spotify/                         # NEW MODULE
│   │   │   │   ├── music-service.interface.ts   # Abstract class (NestJS token) + domain types
│   │   │   │   ├── spotify-auth.service.ts      # OAuth2 token lifecycle (refresh + cache)
│   │   │   │   ├── spotify.service.ts           # Web API implementation of MusicService
│   │   │   │   ├── spotify-auth.controller.ts   # GET /spotify/login, GET /spotify/callback (one-time setup)
│   │   │   │   ├── spotify.module.ts            # Provider mapping MusicService -> SpotifyService
│   │   │   │   └── tools/
│   │   │   │       ├── play-song.tool.ts
│   │   │   │       ├── queue-song.tool.ts
│   │   │   │       └── add-song-to-playlist.tool.ts
│   │   │   └── app.module.ts                    # Imports SpotifyModule
│   │   └── .env.example                         # Adds SPOTIFY_* placeholders
│   └── web/
│       └── src/
│           ├── components/ChatWindow.tsx        # SpotifyCard extended with action/playlist context
│           └── app/globals.css                  # Styles for the new card states
```

No new runtime dependency is required: all calls use global `fetch`, matching `TavilySearchService`.

---

## 3. Authentication Design

### 3.1 Flow choice

Playback control acts **on behalf of a user**, so Client Credentials is not usable — we need Authorization Code with a long-lived refresh token. Puding is a single-user assistant, so the refresh token is obtained **once** during setup and then stored as a server-side environment variable; runtime sessions never perform an interactive login.

```
[one-time, browser]  GET /spotify/login  -> 302 accounts.spotify.com/authorize
                     user approves       -> GET /spotify/callback?code=...
                     server exchanges code -> refresh_token printed to the setup page + logger
                     operator pastes it into apps/server/.env as SPOTIFY_REFRESH_TOKEN

[runtime, headless]  SpotifyAuthService.getAccessToken()
                     -> cached token if now < expiresAt - 60s
                     -> else POST accounts.spotify.com/api/token (grant_type=refresh_token)
```

The callback route exists purely for provisioning; it is guarded so it only runs when `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` are present.

### 3.2 Scopes

| Scope | Needed for |
| --- | --- |
| `user-read-playback-state` | Reading available/active devices |
| `user-modify-playback-state` | `play_song`, `queue_song` |
| `playlist-read-private` | Resolving a private playlist by name |
| `playlist-modify-private` | Adding to a private playlist |
| `playlist-modify-public` | Adding to a public playlist |

### 3.3 Token service (`spotify-auth.service.ts`)

```typescript
@Injectable()
export class SpotifyAuthService {
  private readonly logger = new Logger(SpotifyAuthService.name);
  private accessToken?: string;
  private expiresAt = 0;
  private inFlight?: Promise<string>; // de-duplicates concurrent refreshes

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  public async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt - 60_000) {
      return this.accessToken;
    }
    this.inFlight ??= this.refresh().finally(() => (this.inFlight = undefined));
    return this.inFlight;
  }

  /** Exchanges the stored refresh token for a fresh access token. */
  private async refresh(): Promise<string> { /* POST /api/token, grant_type=refresh_token */ }

  /** One-time authorization-code exchange used by the setup controller. */
  public async exchangeCode(code: string): Promise<{ refreshToken: string }> { /* ... */ }

  /** Builds the accounts.spotify.com/authorize URL with the scope list. */
  public buildAuthorizeUrl(state: string): string { /* ... */ }
}
```

Both token requests POST to `https://accounts.spotify.com/api/token` with
`Authorization: Basic base64(client_id:client_secret)` and
`Content-Type: application/x-www-form-urlencoded`.

Missing configuration throws a descriptive error (mirroring `NotionService`), so Gemini receives an actionable `toolResponse` such as *"Spotify is not connected: SPOTIFY_REFRESH_TOKEN is missing."* rather than a silent failure.

### 3.4 Config additions (`config.service.ts`)

`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`, and `SPOTIFY_REDIRECT_URI` (default `http://localhost:6601/spotify/callback`) are read as **optional** fields with dedicated getters, exactly like `TAVILY_API_KEY`. They are deliberately *not* added to `requiredEnvVars`: the server must still boot without Spotify configured, degrading only the media tools.

---

## 4. Service Design

### 4.1 Abstraction (`music-service.interface.ts`)

```typescript
export interface Track {
  id: string;
  uri: string;
  name: string;
  artist: string;
  album?: string;
  imageUrl?: string;
}

export interface PlaybackResult {
  track: Track;
  device?: string;
}

export abstract class MusicService {
  /** Finds the single best matching track for a free-text query. */
  abstract searchTrack(query: string): Promise<Track>;
  /** Starts playback of a track on the active (or explicitly chosen) device. */
  abstract playTrack(query: string, deviceName?: string): Promise<PlaybackResult>;
  /** Appends a track to the active device's playback queue. */
  abstract queueTrack(query: string): Promise<PlaybackResult>;
  /** Appends a track to a playlist resolved by name. */
  abstract addTrackToPlaylist(
    query: string,
    playlistName: string,
  ): Promise<{ track: Track; playlist: { id: string; name: string } }>;
}
```

### 4.2 Implementation (`spotify.service.ts`)

Base URL `https://api.spotify.com/v1`. A private `request<T>(method, path, init)` helper injects the bearer token, and on `401` refreshes the token and retries **once** before surfacing the error.

| Operation | Call | Notes |
| --- | --- | --- |
| Track search | `GET /search?q=<query>&type=track&limit=5` | Dev-mode `limit` max is **10** (default 5) since Feb 2026. First result wins; the query is passed through verbatim so Gemini can supply `track:… artist:…` filters. |
| Device lookup | `GET /me/player/devices` | Picks `is_active`, else the `deviceName` match, else the single available device. |
| Play | `PUT /me/player/play?device_id=<id>` body `{ "uris": [track.uri] }` | `204` on success. |
| Queue | `POST /me/player/queue?uri=<track.uri>&device_id=<id>` | `204` on success. |
| Playlist lookup | `GET /me/playlists?limit=50` (paginate via `next`) | Case-insensitive exact match first, then substring match. |
| Add to playlist | `POST /playlists/{playlist_id}/items` body `{ "uris": [track.uri] }` | **Use `/items`, not the removed `/tracks` variant** (Feb 2026 rename). Returns `snapshot_id`. |

Error translation (each mapped to a human-readable message returned to Gemini, and logged via `Logger`):

| Condition | Response | Message |
| --- | --- | --- |
| No active device | `404 NO_ACTIVE_DEVICE` | "No active Spotify device — open Spotify on a device and try again." |
| Free account / restricted | `403` | "Spotify playback control requires a Premium account." |
| Rate limited | `429` + `Retry-After` | Retry once after the header delay, then fail with a clear message. |
| No search hit | empty `tracks.items` | "I couldn't find a track matching '<query>' on Spotify." |

Note on removed fields: `popularity` and `available_markets` are no longer returned for tracks in Dev Mode, so match ranking must rely on Spotify's own search ordering.

### 4.3 Module wiring (`spotify.module.ts`)

```typescript
@Module({
  imports: [ConfigModule],
  controllers: [SpotifyAuthController],
  providers: [
    SpotifyAuthService,
    { provide: MusicService, useClass: SpotifyService },
    PlaySongTool,
    QueueSongTool,
    AddSongToPlaylistTool,
  ],
  exports: [MusicService, PlaySongTool, QueueSongTool, AddSongToPlaylistTool],
})
export class SpotifyModule {}
```

---

## 5. Gemini Tool Schemas

Three tools, each extending `GeminiTool` and injecting the `MusicService` abstraction.

### 5.1 `play_song`

```typescript
readonly declaration = {
  name: "play_song",
  description:
    "Plays a song on the user's active Spotify device. Use for requests like 'play <song>' or 'put on <artist>'.",
  parameters: {
    type: "OBJECT",
    properties: {
      query: {
        type: "STRING",
        description:
          "The song to play, e.g. 'Bohemian Rhapsody by Queen'. Include the artist when the user mentions one.",
      },
      device_name: {
        type: "STRING",
        description:
          "Optional device to play on, e.g. 'Kitchen speaker'. Omit to use the currently active device.",
      },
    },
    required: ["query"],
  },
};
```

### 5.2 `queue_song`

Same shape, single `query` parameter, description: *"Adds a song to the end of the user's current Spotify playback queue without interrupting the track that is playing."*

### 5.3 `add_song_to_playlist`

```typescript
parameters: {
  type: "OBJECT",
  properties: {
    query: { type: "STRING", description: "The song to add, e.g. 'Redbone by Childish Gambino'." },
    playlist_name: { type: "STRING", description: "The name of the target playlist, e.g. 'Focus'." },
  },
  required: ["query", "playlist_name"],
}
```

Each `execute()` returns `{ output, clientIntegration }`, e.g.:

```typescript
return {
  output: { track: track.name, artist: track.artist, device: result.device, status: "playing" },
  clientIntegration: {
    type: "spotify",
    data: {
      track: track.name,
      artist: track.artist,
      albumArt: track.imageUrl,
      action: "Playing",       // "Queued" | "Added to playlist"
      isPlaying: true,         // false for queue/playlist actions
      playlist: undefined,     // set by add_song_to_playlist
    },
  },
};
```

### 5.4 Registration (`gemini.module.ts`)

`SpotifyModule` is added to `imports`, and the three tools are appended to the `"GEMINI_TOOLS"` factory and its `inject` array alongside the Notion and search tools — no change to `GeminiSession`.

---

## 6. Client Integration

`ServerMessage.integration.type` already includes `"spotify"`, and `SpotifyCard` already exists in `ChatWindow.tsx`, so the client change is small:

- Render `data.action` ("Playing" / "Queued" / "Added to playlist") as a footer badge, reusing the `.badge` class from `NotionCard`.
- Render `data.playlist` when present ("→ Focus").
- Show the bouncing `.playback-indicator` bars only when `data.isPlaying` is true (already conditional).
- Optionally render `data.albumArt` as a 40×40 thumbnail; new `.spotify-card .album-art` rule in `globals.css`.

---

## 7. Implementation Stages

Mapped onto the README roadmap as Phase 5 (continuing the global numbering after stage 20):

| Stage | Work | Files |
| --- | --- | --- |
| **21. Spotify OAuth2 Provisioning & Token Service** | Register the Spotify app, add `SPOTIFY_*` config getters, implement `SpotifyAuthService` (authorize URL, code exchange, cached refresh) and the `/spotify/login` + `/spotify/callback` setup controller. | `config.service.ts`, `spotify-auth.service.ts`, `spotify-auth.controller.ts`, `.env.example` |
| **22. Spotify Web API Client** | Define the `MusicService` abstraction and implement `SpotifyService` (search, device resolution, play, queue, playlist resolve + add) with error translation and unit tests using a mocked `fetch`. | `music-service.interface.ts`, `spotify.service.ts`, `spotify.service.spec.ts`, `spotify.module.ts`, `app.module.ts` |
| **23. Spotify Tool Schema Declarations** | Implement `PlaySongTool`, `QueueSongTool`, `AddSongToPlaylistTool` and register them under `"GEMINI_TOOLS"`. | `spotify/tools/*.ts`, `gemini.module.ts` |
| **24. Playback Visualization** | Extend `SpotifyCard` with action badge, playlist name, and album art; add the matching CSS. | `ChatWindow.tsx`, `globals.css` |

Each stage is a separate branch/PR per the plan-driven workflow (`feature/stage-<n>-<slug>`), with `npm run build` verified before commit.

---

## 8. Verification Plan

1. **Build:** `pnpm run build` at the workspace root (no TS or lint errors).
2. **Unit tests:** `pnpm --filter @puding/server test` — `spotify.service.spec.ts` covers token refresh on `401`, no-active-device translation, playlist name resolution, and empty search results, following the `tavily-search.service.spec.ts` pattern.
3. **Auth setup:** visit `http://localhost:6601/spotify/login`, approve, confirm the refresh token is returned and that a subsequent server start performs a silent refresh.
4. **Live voice tests** (Spotify open on a device, Premium account):
   - "Play Bohemian Rhapsody" → track starts, `SpotifyCard` shows *Playing* with the animated bars.
   - "Queue Redbone by Childish Gambino" → current track continues; the queued track appears in Spotify's queue; card shows *Queued*.
   - "Add that song to my Focus playlist" → track appears at the end of the playlist; card shows *Added to playlist → Focus*.
5. **Failure paths:** close all Spotify clients and ask to play → Puding verbally reports that no active device was found; unset `SPOTIFY_REFRESH_TOKEN` → the server still boots and Puding reports Spotify is not connected.
6. **Latency:** tool round trip (search + control call) should stay well under 1s; confirm the audio pipeline's <500ms first-chunk target is unaffected since tool execution is asynchronous to streaming.

---

## 9. Open Questions / Future Work

- **Refresh-token persistence:** the current design stores it in `.env`. If token rotation is ever enabled on the account, a small encrypted file store (gitignored) would avoid manual re-provisioning.
- **"That song" anaphora:** `add_song_to_playlist` re-searches by text. A follow-up could add `get_current_track` (`GET /me/player/currently-playing`) so "add this song" works without a re-search.
- **Additional controls:** pause/resume/skip/volume are natural extensions once `MusicService` exists, but are out of scope for this phase.
