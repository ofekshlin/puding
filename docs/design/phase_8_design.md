# Phase 8 Design: Accounts, Sign-Up & Per-User Connections

## 1. Overview

Until now Puding has been a single-owner app. One set of server env vars (`NOTION_TOKEN`, `SPOTIFY_REFRESH_TOKEN`, `DEVIN_API_KEY`/`DEVIN_ORG_ID`) is shared by everyone who knows `PUDING_ACCESS_TOKEN`. This phase turns Puding into a small multi-user app:

1. **Sign in** with Google from the PWA.
2. **Sign-up gate.** New accounts are allowlisted, ask for access and wait for an admin's approval, or are approved automatically, depending on `SIGNUP_MODE`. Moving from allowlist to open sign-up is a config change.
3. **Connect your own accounts** on a Settings page:
   - **Spotify:** "Connect Spotify" (OAuth).
   - **Notion:** "Connect Notion" (OAuth, with a paste-a-token fallback).
   - **Devin:** paste a Personal Access Token and org ID.
4. **Shared services** stay server-owned: Tavily web search and the Gemini API key.
5. **Each voice session runs as its user.** Tools use that user's credentials, only the tools for services the user connected are registered, and Devin updates come from that user's own sessions.

Design constraints inherited from `.agents/AGENTS.md`:

1. **Security & Isolation.** Third-party tokens live only on the server, encrypted at rest. The browser never receives them back, not even its own user's.
2. **Dependency Inversion.** `CredentialStore` and `UserDirectory` are abstract injection tokens. Postgres-backed classes implement them, and an env-backed fallback keeps local dev and PR previews working without a database.
3. **Gemini Tool Abstraction.** Tools stay `GeminiTool` subclasses under `"GEMINI_TOOLS"`. They declare which provider they need, and the per-session filter lives outside the tools.
4. **Structured Logging.** NestJS `Logger` only. Tokens and authorization codes are never logged.

### 1.1 How each service connects

| Service     | Mechanism                                                                                                                                    | Why                                                                                                                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spotify** | OAuth 2.0 authorization-code flow per user (extends the existing `SpotifyAuthService`)                                                       | Already implemented for one user. Only the storage (DB instead of `SPOTIFY_REFRESH_TOKEN`) and the redirect (HTTPS on the backend instead of `127.0.0.1`) change.                                                                               |
| **Notion**  | OAuth 2.0 with a **public connection** (access + refresh token). Fallback: paste a Notion personal access token / internal integration token | During consent, the user picks which pages Puding may access, so the manual "share page with integration" step goes away. The paste option keeps the owner's existing token usable and covers workspaces whose admin blocks public connections. |
| **Devin**   | User pastes a `cog_` **Personal Access Token** + `org-…` ID; validated live before saving                                                    | Devin has no third-party OAuth. A PAT acts as the user, so sessions, ACUs and repo access are that user's own.                                                                                                                                  |
| **Tavily**  | Shared server key (`TAVILY_API_KEY`)                                                                                                         | Per user requirement. Protected by the sign-up gate and a per-user daily cap (§7).                                                                                                                                                              |
| **Gemini**  | Shared server key (`GEMINI_API_KEY`)                                                                                                         | Same as today. Bring-your-own-key is listed in §12.                                                                                                                                                                                             |

**Why not MCP?** Notion offers a hosted MCP server with its own OAuth, and the Gemini SDKs can turn MCP tools into function declarations. We still keep our own `GeminiTool`s for now:

- Every MCP tool call adds a network round trip to the voice turn.
- MCP servers expose large, generic tool surfaces that Gemini Live picks from less reliably.
- MCP would bypass the speech-specific layer built in Phases 5 and 7 (`SessionResolver`, `SpokenReader`, `DilemmaParser`, code-enforced confirmation).

The per-user credentials stored in this phase are the same OAuth tokens an MCP client would need, so moving later is a matter of adding an implementation.

### 1.2 Provider limits (from current provider docs)

- **Spotify development mode allows at most 5 authenticated users**, including the owner.
  - Each user must be added by name and email under **Users Management** in the Spotify developer dashboard, and the app owner must have Premium.
  - Extended quota requires a registered business and at least 250k monthly active users. Puding should therefore plan to stay at **5 Spotify users**.
  - Users beyond the cap can still use every other integration. The Settings page explains why Spotify is unavailable for them.
- **Notion public connections** need a name, icon, redirect URI, and links to a privacy policy and terms of use. Puding serves minimal `/privacy` and `/terms` pages for this. The connection is not listed in the Notion Marketplace.
- **Google OAuth** needs a Google Cloud OAuth client (Web application) with the production callback URL registered exactly. Wildcards are not allowed, which drives the preview strategy in §9.

---

## 2. Identity & Sign-Up

### 2.1 Login flow

Puding has two origins: the PWA on Vercel and the NestJS backend on Render. Browser WebSockets cannot send headers, and the backend is a different site, so a Vercel session cookie never reaches it. Instead:

1. **Auth.js (`next-auth` v5) with the Google provider** runs on the Next.js app with the JWT session strategy and no database adapter. It only proves "this browser is Google user X".
2. **`GET /api/puding-token`** (Next.js route, requires an Auth.js session) mints a **short-lived Puding token**:
   - an HS256 JWT signed with `PUDING_AUTH_SECRET`, a secret shared by Vercel and Render;
   - claims `sub` (Google `sub`), `email`, `name`, `picture`, `aud: "puding-backend"`;
   - a **5-minute** expiry.
3. The client sends this token as `?token=` on the WebSocket URL (reusing `withAccessToken` from stage 29) and as `Authorization: Bearer` on backend REST calls. `useLiveSession` fetches a fresh token right before every (re)connect, so expiry never interrupts a live socket. The token is checked only at upgrade time.
4. **Backend `AuthService`** verifies the JWT with `jose` (signature, `aud`, `exp`). It then resolves the user through `UserDirectory`, which upserts on first sight, and checks `status === "approved"`.
   - It replaces `AccessGuard` in `ProxyGateway.handleConnection`.
   - A rejected socket gets `{ type: "unauthorized", reason }` before the close. This follows the Render close-code gotcha: a server-side `close(4401)` reaches the browser as `1006`.
5. **`UserGuard`** (Nest `CanActivate`) does the same for REST controllers and attaches `req.user`.

`PUDING_ACCESS_TOKEN` and `AccessTokenPrompt` are removed in stage 42, once Google sign-in is live in production.

### 2.2 Sign-up modes

`SIGNUP_MODE` (server env, default `request`):

| Mode        | New Google account…                                                                                  | UI                                     |
| ----------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `allowlist` | approved if its email is in `ALLOWED_EMAILS`, otherwise `rejected`                                   | "Puding is invite-only" screen         |
| `request`   | created as `pending` → user can submit an optional note ("who are you?") → admin approves or rejects | "Request access" form → "Request sent" |
| `open`      | approved immediately                                                                                 | straight to onboarding                 |

- Emails in `ADMIN_EMAILS` are always `approved` with `role = "admin"`, in every mode.
- Status is stored, not recomputed. Switching modes never locks out someone already approved, and switching from `allowlist` to `request` turns earlier rejected sign-ins into requests an admin can approve.
- **Revoke:** an admin can set an approved user back to `rejected`. `AuthService` caches user status for at most 30s, and the gateway closes that user's live sockets on revoke.

### 2.3 Admin page (`/admin`)

- Visible only to `role = "admin"`.
- Lists pending requests (email, name, note, requested at) with **Approve** / **Reject** buttons, followed by approved and rejected users with **Revoke** / **Approve**.
- The header shows a pending-count badge so the admin sees new requests on the next visit. Email or push notification is future work (§12).
- On approval, the page shows a reminder: _"Spotify: add <email> under Users Management in the Spotify dashboard (X of 5 used)"_ with a link to the dashboard. Spotify has no API for its allowlist.

---

## 3. Data Model (Neon Postgres)

Neon's free tier hosts the database (`DATABASE_URL`). Render's free Postgres is deleted after 30 days. The same database can later host the `pgvector` memory from the Future Features list. Access goes through **Drizzle ORM** (`drizzle-orm` + `pg`), with SQL migrations generated by `drizzle-kit` and applied at server start.

```sql
users (
  id            uuid primary key default gen_random_uuid(),
  google_sub    text unique not null,
  email         text unique not null,
  name          text,
  picture_url   text,
  role          text not null default 'user',      -- 'user' | 'admin'
  status        text not null,                     -- 'pending' | 'approved' | 'rejected'
  request_note  text,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references users(id)
)

connections (
  user_id        uuid references users(id) on delete cascade,
  provider       text not null,                    -- 'spotify' | 'notion' | 'devin'
  kind           text not null,                    -- 'oauth' | 'static_token'
  secret_cipher  bytea not null,                   -- encrypted JSON (see §4)
  key_version    smallint not null,
  account_label  text,                             -- "Ofek's workspace", Spotify display name, "org-… (cog_…abcd)"
  settings       jsonb not null default '{}',      -- non-secret: Devin default repo / aliases, Notion workspace id
  expires_at     timestamptz,                      -- access-token expiry for oauth kinds
  connected_at   timestamptz not null default now(),
  last_error     text,                             -- e.g. "refresh token revoked" -> UI shows "Reconnect"
  primary key (user_id, provider)
)

usage_counters (
  user_id   uuid references users(id) on delete cascade,
  metric    text not null,                         -- 'tavily_search'
  day       date not null,
  count     integer not null default 0,
  primary key (user_id, metric, day)
)
```

OAuth `state` is a signed, 10-minute JWT carrying `{ userId, provider, nonce }`, so it needs no table. This also fixes the current `SpotifyAuthController.pendingState`, a single in-memory field that only works for one user at a time.

---

## 4. Credential Store

```typescript
export type Provider = "spotify" | "notion" | "devin";

export interface StoredCredential<TSecret> {
  provider: Provider;
  kind: "oauth" | "static_token";
  secret: TSecret; // decrypted, server memory only
  settings: Record<string, unknown>;
  accountLabel?: string;
  expiresAt?: Date;
}

export abstract class CredentialStore {
  abstract get<T>(
    userId: string,
    provider: Provider,
  ): Promise<StoredCredential<T> | null>;
  abstract save<T>(
    userId: string,
    credential: StoredCredential<T>,
  ): Promise<void>;
  abstract delete(userId: string, provider: Provider): Promise<void>;
  abstract listConnected(userId: string): Promise<ConnectionSummary[]>; // no secrets
  abstract markError(
    userId: string,
    provider: Provider,
    message: string,
  ): Promise<void>;
}
```

- **`PostgresCredentialStore`** encrypts with `CredentialCipher`:
  - **AES-256-GCM**, a random 96-bit IV per write, and `user_id:provider` as additional authenticated data, so a ciphertext copied into another user's row fails to decrypt.
  - Keys come from `CREDENTIALS_ENCRYPTION_KEYS` (comma-separated `version:base64key`). The newest key encrypts and any listed key decrypts, which allows rotation without downtime.
- **`EnvCredentialStore`** is used when `DATABASE_URL` is unset (local dev, tests, previews without a DB). It serves today's env vars to a single implicit `local` user, so `pnpm dev` keeps working with only `apps/server/.env`.
- **Provider token managers** sit on top of the store and own refresh:
  - **`SpotifyTokenManager`** is today's `SpotifyAuthService` logic, keyed by `userId`:
    - per-user in-memory access-token cache and in-flight refresh de-duplication;
    - persists rotated refresh tokens when Spotify returns one;
    - on `invalid_grant`, calls `markError` and asks the user to reconnect.
  - **`NotionTokenManager`** works the same way for OAuth Notion connections, using the Notion `refresh_token` grant. Static tokens pass through unchanged.
  - **Devin** has nothing to refresh. A `401`/`403` calls `markError` with "Devin rejected the token".

---

## 5. Per-User Tool Execution

### 5.1 User context

```typescript
export interface ToolContext {
  sessionId: string;
  userId: string; // NEW — set by ProxyGateway from the verified Puding token
}
```

- `LiveSessionService.createSession(client, apiKey, sessionId, user)` receives the authenticated user.
- `GeminiSession` passes `userId` to every `execute()` call, along with the existing `sessionId`.

### 5.2 Services resolve credentials per call

| Today (singleton, env-bound)                                                                     | After                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NotionService` builds one `Client` in its constructor and throws at boot without `NOTION_TOKEN` | `NotionClientProvider.forUser(userId)` returns a cached `@notionhq/client` `Client` (small LRU keyed by user + token hash); `NotionService` methods take `userId`; boot never throws |
| `SpotifyAuthService` caches one access token                                                     | `SpotifyTokenManager.getAccessToken(userId)`; `SpotifyService` methods take `userId`                                                                                                 |
| `DevinService.request()` reads `DEVIN_API_KEY`/`DEVIN_ORG_ID`                                    | `request(userId, …)` resolves `{ apiKey, orgId }` and per-user `defaultRepo` / `repoAliases` from `connections.settings`; caps stay server config                                    |
| `DevinWatcher` polls one org for every subscriber                                                | Subscribers are grouped by `userId`; one poll loop per user with ≥1 connected socket, each with its own `lastStates` / seeding                                                       |
| `start_devin_session` concurrency cap counts all sessions                                        | Counts the calling user's `puding`-tagged working sessions                                                                                                                           |

The abstractions stay the same: `MusicService`, `CodingAgentService` and `SearchService` keep their tokens, and only their method signatures gain the user parameter.

### 5.3 Per-session tool registration

`GeminiTool` gains an optional `readonly requires?: Provider`. The Notion, Spotify and Devin tools declare it; `search_web` does not. `"GEMINI_TOOLS"` remains the full catalogue, and the provider-level gates stay (e.g. Spotify app credentials missing, Devin disabled in previews).

When a session starts, a new `SessionToolResolver` works out what this user gets:

1. It loads `credentialStore.listConnected(userId)`.
2. It keeps the tools whose `requires` is connected and not in an error state. Only those are declared to Gemini and contribute `instructions`.
3. It appends one server-owned line for services the user has not connected: _"Spotify and Devin are not connected for this user. If asked, say they can connect them in Puding's Settings."_ Puding can then answer "connect Spotify in Settings" instead of failing silently.

The tool list is fixed for the life of a Gemini session (Gemini Live declares tools at `setup`). After the user connects something, the client reconnects, and the Settings page triggers this automatically when the voice page regains focus.

---

## 6. HTTP API (backend, all behind `UserGuard` unless noted)

| Route                                          | Purpose                                                                                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /me`                                      | `{ id, email, name, role, status, connections: ConnectionSummary[], spotifySlots: { used, max: 5 } }`. **Pending users may call it**                                                             |
| `POST /me/access-request`                      | `{ note }`. Only in `request` mode, only while `pending`                                                                                                                                         |
| `DELETE /me`                                   | Delete account + all connections (also required by Notion's public-connection policy)                                                                                                            |
| `POST /connections/spotify/authorize`          | Returns the Spotify authorize URL with signed `state`; the browser navigates to it                                                                                                               |
| `GET /connections/spotify/callback` _(public)_ | Verifies `state`, exchanges the code, stores the credential and account label (`GET /v1/me` display name), then redirects to `${WEB_ORIGIN}/settings?connected=spotify` (or `?error=`)           |
| `POST /connections/notion/authorize`           | Same for Notion (`owner=user`)                                                                                                                                                                   |
| `GET /connections/notion/callback` _(public)_  | Exchanges the code at `POST /v1/oauth/token`, stores access + refresh token and the workspace name/icon                                                                                          |
| `PUT /connections/notion/token`                | Paste fallback: validates with `GET /v1/users/me` before saving                                                                                                                                  |
| `PUT /connections/devin`                       | `{ apiKey, orgId, defaultRepo?, repoAliases? }`; validates with a `GET /sessions?limit=1` on that org; rejects `apk_` keys with the "create a `cog_` PAT under Settings → Devin API → PATs" hint |
| `DELETE /connections/:provider`                | Disconnect (deletes the row; the user is told how to revoke on the provider side as well)                                                                                                        |
| `GET /admin/users?status=`                     | Admin only                                                                                                                                                                                       |
| `POST /admin/users/:id/approve` · `/reject`    | Admin only; reject on an approved user = revoke                                                                                                                                                  |

CORS on the backend allows only `WEB_ORIGIN` (prod) plus `*.vercel.app` preview origins of the `puding-web` project. The existing `/spotify/login` and `/spotify/callback` operator routes are removed once per-user connect lands.

---

## 7. Abuse & Spend Guardrails

The shared keys are the remaining spend risk. Notion, Spotify and Devin spend now falls on each user's own account.

1. **Sign-up gate** (§2.2): nobody reaches Gemini or Tavily without being approved.
2. **Tavily daily cap:** `TAVILY_DAILY_LIMIT_PER_USER` (default 50), counted in `usage_counters`. Over the cap, `search_web` returns a spoken-friendly refusal.
3. **Concurrent sockets per user:** `MAX_SOCKETS_PER_USER` (default 2). One more closes the oldest, which covers a phone and a laptop.
4. **Devin caps** (`DEVIN_MAX_ACU_PER_SESSION`, `DEVIN_MAX_ACTIVE_SESSIONS`) now apply per user.
5. **Token hygiene:**
   - OAuth codes and tokens are never logged.
   - `ConnectionSummary` never includes secrets.
   - The Devin key is displayed only as `cog_…abcd`.
6. **CSRF:** OAuth `state` is signed and bound to the user. The authorize endpoints are `POST` with a Bearer token, so a third-party page cannot start a connect flow on the user's behalf.

---

## 8. Client (`apps/web`)

| Route / component                     | Purpose                                                                                                                                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/api/auth/[...nextauth]/route.ts` | Auth.js handlers (Google)                                                                                                                                                                                              |
| `app/api/puding-token/route.ts`       | Mints the 5-minute backend token for the signed-in user                                                                                                                                                                |
| `app/signin/page.tsx`                 | "Sign in with Google"                                                                                                                                                                                                  |
| `app/page.tsx` (voice)                | Requires an approved user; pending → `AccessRequestScreen`, rejected → `InviteOnlyScreen`; first visit with no connections → onboarding banner                                                                         |
| `app/settings/page.tsx`               | `ConnectionCard` × 3 (status, account label, Connect / Reconnect / Disconnect), `DevinKeyForm` (PAT + org ID + default repo + aliases, with the "where do I get this?" links), Spotify "X of 5" notice, Delete account |
| `app/admin/page.tsx`                  | Requests and user list (§2.3)                                                                                                                                                                                          |
| `app/privacy`, `app/terms`            | Static pages required by the Notion public connection                                                                                                                                                                  |
| `hooks/useBackendApi.ts`              | Fetches a Puding token and calls backend REST with `Authorization: Bearer`                                                                                                                                             |
| `hooks/useLiveSession.ts`             | Fetches a fresh Puding token before each connect; drops `AccessTokenPrompt`; handles `unauthorized` reasons (`expired` → silent retry once, `pending`/`rejected` → screen)                                             |
| `components/UserMenu.tsx`             | Avatar, Settings, Admin (if admin), Sign out                                                                                                                                                                           |

All new screens follow the existing styling rules (CSS custom properties in `globals.css`) and must work on the phone layout, since the owner uses Puding mainly on mobile.

---

## 9. Environments & Configuration

**New server env (Render):**

- `DATABASE_URL`
- `CREDENTIALS_ENCRYPTION_KEYS`
- `PUDING_AUTH_SECRET`
- `WEB_ORIGIN`
- `SIGNUP_MODE`, `ADMIN_EMAILS`, `ALLOWED_EMAILS`
- `NOTION_OAUTH_CLIENT_ID`, `NOTION_OAUTH_CLIENT_SECRET`, `NOTION_OAUTH_REDIRECT_URI`
- `SPOTIFY_REDIRECT_URI`, now `https://puding-backend.onrender.com/connections/spotify/callback` in prod
- `TAVILY_DAILY_LIMIT_PER_USER`, `MAX_SOCKETS_PER_USER`

**New web env (Vercel):**

- `AUTH_SECRET` (Auth.js)
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- `PUDING_AUTH_SECRET` (same value as the server's)
- `AUTH_REDIRECT_PROXY_URL` (previews)

**Redirect URIs to register:**

- **Google:** `https://<prod web>/api/auth/callback/google` and `http://localhost:6600/api/auth/callback/google`.
- **Spotify:** prod backend callback + `http://127.0.0.1:6601/connections/spotify/callback`.
- **Notion:** prod backend callback + local.

**PR previews:**

- **Google sign-in** works through Auth.js's redirect proxy (`AUTH_REDIRECT_PROXY_URL` pointing at production). Previews are also still behind Vercel Authentication.
- **Database:** previews get a separate Neon branch, `preview`, shared by all PRs. Its `DATABASE_URL` goes in the `puding-preview-secrets` env group, so preview data never touches production users.
- **Spotify/Notion OAuth** cannot redirect to per-PR Render hostnames, because they need exact redirect URIs. Previews therefore fall back to `EnvCredentialStore` values for those providers, i.e. the existing shared preview credentials. A preview never reads a real user's tokens.
- **Devin** keeps the `DEVIN_ENABLE_IN_PREVIEW` gate.

**Local dev** keeps working with no DB and no Google client: `DATABASE_URL` unset → `EnvCredentialStore` + a `local` user, and the auth layer accepts a dev token when `NODE_ENV !== "production"` and `PUDING_AUTH_SECRET` is unset. `ConfigService` refuses to start in production without `DATABASE_URL`, `PUDING_AUTH_SECRET` and `CREDENTIALS_ENCRYPTION_KEYS`.

### 9.1 Owner migration

`pnpm --filter @puding/server migrate:owner` reads today's `NOTION_TOKEN`, `SPOTIFY_REFRESH_TOKEN`, `DEVIN_API_KEY`/`DEVIN_ORG_ID`/`DEVIN_DEFAULT_REPO`/`DEVIN_REPO_ALIASES` and stores them as the connections of the first `ADMIN_EMAILS` user:

- Notion as `static_token`.
- Spotify as `oauth`. The refresh token was issued by the same client ID, so it stays valid.

After verification, those env vars are removed from the production service. Nothing has to be reconnected by hand.

---

## 10. Implementation Stages

Continuing the global numbering after stage 34:

| Stage                                            | Work                                                                                                                                                                                                                                                                                                                                                                                  | Files                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **35. Database & Encrypted Credential Store**    | `DATABASE_URL`, Drizzle schema + migrations for `users`, `connections`, `usage_counters`; `DatabaseModule`; `CredentialCipher` (AES-256-GCM, AAD, key versions); abstract `CredentialStore` + `UserDirectory` with Postgres and env-backed implementations; specs (round-trip, tamper/AAD mismatch, key rotation, env fallback).                                                      | `db/schema.ts`, `db/migrations/*`, `db/database.module.ts`, `credentials/credential-cipher.ts` (+spec), `credentials/credential-store.ts`, `credentials/postgres-credential-store.ts` (+spec), `credentials/env-credential-store.ts` (+spec), `users/user-directory.ts`, `config.service.ts`, `.env.example` |
| **36. Google Sign-In & Backend Identity**        | Auth.js v5 Google provider, `/signin`, `/api/puding-token`; backend `AuthService` (`jose` verification, user upsert, status cache), `UserGuard`, `GET /me`; `ProxyGateway` authenticates with the Puding token (falls back to `AccessGuard` while `PUDING_AUTH_SECRET` is unset) and passes the user to `createSession`; `useLiveSession` fetches a token per connect; `UserMenu`.    | web: `auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/api/puding-token/route.ts`, `app/signin/page.tsx`, `components/UserMenu.tsx`, `hooks/useLiveSession.ts`; server: `auth/auth.service.ts` (+spec), `auth/user.guard.ts`, `users/me.controller.ts`, `gateway/proxy.gateway.ts` (+spec)              |
| **37. Sign-Up Modes, Access Requests & Admin**   | `SIGNUP_MODE`, `ADMIN_EMAILS`, `ALLOWED_EMAILS`; status on first sign-in; `POST /me/access-request`; admin routes (approve / reject / revoke, live-socket close on revoke); `AccessRequestScreen`, `InviteOnlyScreen`, `/admin` with pending badge and Spotify-allowlist reminder; CORS restricted to `WEB_ORIGIN`.                                                                   | `users/signup-policy.ts` (+spec), `users/admin.controller.ts` (+spec), `users/me.controller.ts`, `main.ts`, web: `app/admin/page.tsx`, `components/AccessRequestScreen.tsx`, `components/InviteOnlyScreen.tsx`, `globals.css`                                                                                |
| **38. Per-User Tool Context**                    | `ToolContext.userId`; `GeminiTool.requires`; `SessionToolResolver` + "not connected" instruction line; `NotionClientProvider`, `SpotifyTokenManager`, per-user `DevinService` credentials and settings; per-user `DevinWatcher` loops and caps; Tavily daily cap; `MAX_SOCKETS_PER_USER`. Still served by `EnvCredentialStore` in local dev, so behaviour is unchanged for the owner. | `gemini/gemini-tool.interface.ts`, `gemini/session-tool-resolver.ts` (+spec), `gemini/gemini.session.ts`, `gemini/gemini.service.ts`, `gemini/gemini.module.ts`, `notion/*`, `spotify/*`, `devin/devin.service.ts`, `devin/devin-watcher.service.ts` (+specs), `search/tools/search-web.tool.ts`             |
| **39. Settings Page & Devin Key**                | `/settings` with `ConnectionCard`s and Delete account; `useBackendApi`; `PUT /connections/devin` with live validation and `apk_` hint; `DELETE /connections/:provider`; `DELETE /me`; reconnect-on-focus for the voice page.                                                                                                                                                          | web: `app/settings/page.tsx`, `components/ConnectionCard.tsx`, `components/DevinKeyForm.tsx`, `hooks/useBackendApi.ts`; server: `connections/connections.controller.ts` (+spec), `connections/devin-connection.service.ts` (+spec)                                                                           |
| **40. Spotify Connect per User**                 | `POST /connections/spotify/authorize` + public callback with signed `state`; refresh-token rotation; `invalid_grant` → reconnect state; "X of 5" slot notice and the "not on the app's user list" (403) message; remove `/spotify/login` operator routes.                                                                                                                             | `spotify/spotify-connect.controller.ts` (+spec), `spotify/spotify-token-manager.ts` (+spec), `spotify/spotify-auth.controller.ts` (removed), `connections/oauth-state.ts` (+spec), web: `components/ConnectionCard.tsx`                                                                                      |
| **41. Notion Connect (Public Connection OAuth)** | Notion authorize + callback, token exchange and refresh via `NotionTokenManager`, workspace label/icon, `PUT /connections/notion/token` paste fallback; `/privacy` and `/terms` pages.                                                                                                                                                                                                | `notion/notion-connect.controller.ts` (+spec), `notion/notion-token-manager.ts` (+spec), `notion/notion-client.provider.ts`, web: `app/privacy/page.tsx`, `app/terms/page.tsx`, `components/ConnectionCard.tsx`                                                                                              |
| **42. Owner Migration, Rollout & Docs**          | `migrate:owner` script; remove `PUDING_ACCESS_TOKEN`/`AccessTokenPrompt`; production env validation; `render.yaml` / preview env-group updates; `DEPLOYMENT.md` (Google OAuth client, Neon + `preview` branch, secrets, every redirect URI, Spotify Users Management, Notion public connection setup) and a multi-user verification checklist.                                        | `scripts/migrate-owner.ts`, `auth/access-guard.service.ts` (removed), web: `components/AccessTokenPrompt.tsx` (removed), `lib/accessToken.ts`, `render.yaml`, `DEPLOYMENT.md`, `.env.example`                                                                                                                |

Each stage is a separate `feature/stage-<n>-<slug>` branch/PR per the plan-driven workflow, with `pnpm run build`, `pnpm lint` and `pnpm test` passing before commit. Through stage 41, production keeps running on the env credentials and the access token. The switch happens in stage 42.

**New dependencies:**

- server: `drizzle-orm`, `pg`, `jose`; dev: `drizzle-kit`
- web: `next-auth@5` (beta channel; `AUTH_REDIRECT_PROXY_URL` for previews is a v5 feature)

---

## 11. Verification Plan

1. **Build / lint / unit tests** at the workspace root.
2. **Unit coverage:**
   - cipher round-trip, tamper and AAD mismatch, key rotation;
   - `SignupPolicy` for every mode × admin/allowlisted/other;
   - `AuthService` (expired, bad `aud`, wrong signature, pending, rejected, revoked within 30s);
   - OAuth `state` (forged, expired, replayed for another user);
   - `SessionToolResolver` (only connected providers; error-state provider excluded; "not connected" line);
   - per-user `DevinWatcher` (two users never see each other's sessions);
   - Tavily cap; Devin key validation (`apk_` rejected).
3. **Isolation test:** two users with different Notion workspaces and Devin orgs. "Read my Groceries page" and "what are my Devin sessions doing?" return each user's own data.
4. **Live flows (production-like env):**
   - Sign in with an allowlisted email lands on the voice page; a non-listed email sees "invite-only".
   - Switch to `request`: a new account submits a note, the admin sees the badge, approves it, and the user is in without re-signing.
   - Connect Spotify, then "play Bohemian Rhapsody" plays on that user's device. A sixth Spotify user gets the clear slot message.
   - Connect Notion with page picker, then "add milk to my Groceries page" writes to that user's workspace. Disconnect, and Puding says Notion isn't connected.
   - Paste a `cog_` PAT; an invalid key is rejected inline. "Ask Devin to plan …" creates the session in that user's org.
   - Revoke a user and their live socket closes within 30s.
5. **Owner migration:** after `migrate:owner` and removing the env credentials, the owner's existing Notion, Spotify and Devin flows behave exactly as before.
6. **Latency:** credential lookup + decrypt happens once at session setup and is cached for the session, so time-to-first-audio stays under 500ms. A per-call refresh only happens when a provider token has expired.

---

## 12. Open Questions / Future Work

- **Access-request notifications:** email (e.g. Resend) or Web Push to admins when a request arrives.
- **Bring-your-own Gemini key** for heavy users, stored as a fourth provider.
- **Per-user Gemini usage caps** (daily minutes), using `usage_counters`.
- **Neon branch per PR** instead of one shared `preview` branch.
- **MCP-backed providers** (e.g. Notion's hosted MCP server) as alternative implementations behind the same abstractions, reusing the stored OAuth tokens.
- **Spotify beyond 5 users** is only possible with Spotify's extended quota (business entity, 250k MAU). Otherwise, swap in another `MusicService` implementation.
- **Devin service user + `create_as_user_id`** if an organisation would rather hold one key centrally than have every member paste a PAT.
