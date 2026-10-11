# Phase 7 Design: Devin Agent Control by Voice

## 1. Overview

This phase turns Puding into a voice front-end for [Devin](https://devin.ai). From the PWA the user can:

1. **Plan** — "Puding, ask Devin to plan dark mode for the web app" → a Devin session investigates the repo and replies with a plan, without writing code.
2. **Develop** — "Go ahead with the plan" / "Have Devin implement stage 30 of Puding" → the session builds it and opens a PR.
3. **Manage** — "What are my Devin sessions doing?", "What did Devin say on the login bug?", "Tell it to use pnpm", "Stop the Spotify session".
4. **Get notified** — while Puding is open, it proactively says "Devin finished the dark-mode plan, want me to read it?" when a session needs input or completes.

Design constraints inherited from `.agents/AGENTS.md`:

1. **Security & Isolation:** the Devin token lives only on the server (`ConfigService`); the browser never sees it.
2. **Dependency Inversion:** a runtime-persistent abstract class `CodingAgentService` is the injection token; `DevinService` is the concrete implementation. Tools depend on the abstraction only.
3. **Gemini Tool Abstraction:** each capability is a `GeminiTool` subclass registered under `"GEMINI_TOOLS"`; nothing Devin-specific lives in `GeminiSession`.
4. **Structured Logging:** NestJS `Logger` only.

### 1.1 Why the REST API (not the Devin MCP server)

| Option                                                               | Verdict                                                                                                                                                                                               |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Devin REST API v3** (`api.devin.ai/v3/organizations/{org_id}/...`) | **Chosen.** Six endpoints cover everything; plain `fetch`, same as `TavilySearchService` / `SpotifyService`; no new dependency.                                                                       |
| Devin MCP server (`mcp.devin.ai`)                                    | Would need an MCP client inside NestJS and exposes a large tool surface we would have to curate before handing it to Gemini. Revisit if we later want Devin's knowledge/playbook management by voice. |
| Slack / email bridge                                                 | Indirect, no structured status, no PR data.                                                                                                                                                           |

### 1.2 External prerequisites (non-code)

- A **Devin Personal Access Token** (`cog_…`), created in Devin settings. A PAT authenticates as the user, so sessions appear in the user's own session list without `create_as_user_id`. (A service-user key with `ImpersonateOrgSessions` + `create_as_user_id` is the alternative if PATs are disabled for the account.)
- The **Devin organization ID** (`org-…`).
- The target repos (e.g. `ofekshlin/puding`) already connected to Devin.
- Devin sessions consume **ACUs**; see the spend guardrails in §6.

---

## 2. API surface used

All requests: `Authorization: Bearer $DEVIN_API_KEY`, base `https://api.devin.ai/v3/organizations/$DEVIN_ORG_ID`.

| Purpose         | Endpoint                             | Fields we use                                                                                               |
| --------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Start a session | `POST /sessions`                     | `prompt`, `repos`, `title`, `tags` (always includes `puding`), `max_acu_limit`, `devin_mode`, `playbook_id` |
| List sessions   | `GET /sessions`                      | `session_id`, `title`, `status`, `status_detail`, `tags`, `pull_requests`, `updated_at`, `url`              |
| Session detail  | `GET /sessions/{devin_id}`           | same as above + `structured_output`, `acus_consumed`                                                        |
| Conversation    | `GET /sessions/{devin_id}/messages`  | `items[].source` (`devin`/`user`), `message`, `created_at`                                                  |
| Reply / steer   | `POST /sessions/{devin_id}/messages` | `message` (resumes a suspended session automatically)                                                       |
| Stop            | `DELETE /sessions/{devin_id}`        | terminate (irreversible); optional `archive`                                                                |

Status model we map to speech:

| `status` / `status_detail`                          | Spoken as           | Notify? |
| --------------------------------------------------- | ------------------- | ------- |
| `running` / `working`                               | "working"           | no      |
| `running` / `waiting_for_user`                      | "waiting for you"   | **yes** |
| `running` / `waiting_for_approval`                  | "needs an approval" | **yes** |
| `running` / `finished`                              | "finished"          | **yes** |
| `suspended` / `inactivity`, `user_request`          | "asleep"            | no      |
| `suspended` / usage-limit reasons, `error` / `exit` | "stopped: <reason>" | **yes** |

> The exact query parameters of `GET /sessions` (tag filter, page size) must be confirmed against the live API in stage 30. If tag filtering is not supported server-side, `DevinService` filters by the `puding` tag client-side over the most recent page.

---

## 3. Architecture & Monorepo Changes

```
puding/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── auth/                                # NEW (stage 29)
│   │   │   │   └── access-guard.service.ts          # validates PUDING_ACCESS_TOKEN on WS upgrade
│   │   │   ├── config/config.service.ts             # DEVIN_* + PUDING_ACCESS_TOKEN getters
│   │   │   ├── gateway/proxy.gateway.ts             # rejects unauthenticated sockets
│   │   │   ├── gemini/
│   │   │   │   ├── gemini.module.ts                 # registers Devin tools when configured
│   │   │   │   └── gemini.session.ts                # server-side system-instruction addenda + injectSystemNote()
│   │   │   ├── devin/                               # NEW MODULE
│   │   │   │   ├── coding-agent.interface.ts        # abstract CodingAgentService + domain types
│   │   │   │   ├── devin.service.ts                 # REST v3 implementation
│   │   │   │   ├── devin.service.spec.ts
│   │   │   │   ├── session-resolver.service.ts      # "the login one" -> devin-xxxx
│   │   │   │   ├── session-resolver.service.spec.ts
│   │   │   │   ├── devin-watcher.service.ts         # polls & emits status transitions (stage 32)
│   │   │   │   ├── devin.module.ts
│   │   │   │   └── tools/
│   │   │   │       ├── start-devin-session.tool.ts
│   │   │   │       ├── list-devin-sessions.tool.ts
│   │   │   │       ├── get-devin-session.tool.ts
│   │   │   │       ├── message-devin-session.tool.ts
│   │   │   │       └── stop-devin-session.tool.ts
│   │   │   └── types/server-message.ts              # integration.type gains "devin"
│   │   └── .env.example                             # DEVIN_* + PUDING_ACCESS_TOKEN
│   └── web/
│       └── src/
│           ├── components/ChatWindow.tsx            # DevinSessionCard + DevinSessionListCard
│           ├── components/AccessTokenPrompt.tsx     # one-time token entry (stage 29)
│           ├── hooks/useLiveSession.ts              # appends ?token= to the WS URL
│           └── app/globals.css                      # status badge colours
```

No new runtime dependency.

---

## 4. Service Design

### 4.1 Abstraction (`coding-agent.interface.ts`)

```typescript
export type AgentSessionState =
  | "working"
  | "waiting_for_user"
  | "waiting_for_approval"
  | "finished"
  | "sleeping"
  | "stopped";

export interface AgentSession {
  id: string; // devin-…
  title: string;
  state: AgentSessionState;
  stateReason?: string; // e.g. "usage_limit_exceeded"
  url: string; // https://app.devin.ai/sessions/…
  pullRequests: { url: string; state?: string }[];
  updatedAt: number;
}

export interface AgentMessage {
  from: "agent" | "user";
  text: string;
  at: number;
}

export interface StartSessionInput {
  task: string;
  repo?: string; // "owner/name"
  intent: "plan" | "build";
  mode?: "normal" | "fast" | "lite" | "ultra" | "fusion";
}

export abstract class CodingAgentService {
  abstract isConfigured(): boolean;
  abstract startSession(input: StartSessionInput): Promise<AgentSession>;
  abstract listSessions(opts?: {
    onlyPuding?: boolean;
    limit?: number;
  }): Promise<AgentSession[]>;
  abstract getSession(id: string): Promise<AgentSession>;
  abstract getMessages(
    id: string,
    opts?: { last?: number },
  ): Promise<AgentMessage[]>;
  abstract sendMessage(id: string, text: string): Promise<AgentSession>;
  abstract stopSession(id: string): Promise<void>;
}
```

### 4.2 Implementation (`devin.service.ts`)

- `fetch` wrapper with bearer auth, 10s timeout, and error translation into spoken-friendly messages: `401/403` → "Devin rejected the API token", `404` → "I couldn't find that Devin session", `429` → "Devin is rate-limiting us, try again in a moment".
- `startSession` builds the prompt from `intent`:
  - **plan** — wraps the task: _"Investigate the repository and produce an implementation plan for the task below. Do NOT write code or open a PR. Send the plan, then wait for my approval. Task: …"_
  - **build** — passes the task through, suffixed with _"Open a PR when done."_
  - Always sets `tags: ["puding", "puding-<intent>"]`, `max_acu_limit` from config, `repos: [repo ?? DEVIN_DEFAULT_REPO]`, and a `title` derived from the task (first ~60 chars) so it is easy to refer to by voice.
- Repo resolution: `DEVIN_REPO_ALIASES="puding=ofekshlin/puding,site=ofekshlin/site"` lets the user say "on puding" instead of `owner/name`. Unknown aliases are rejected with the list of known ones.
- Messages: Devin replies are Markdown and can be long. `getMessages` returns raw text; tools produce a `spokenSummary` by stripping code fences, links and tables and truncating to ~1,200 characters, while the full text goes to the client card.

### 4.3 Session resolution (`session-resolver.service.ts`)

Voice users cannot say `devin-4f1c…`. Every tool that targets a session accepts a free-text `session` argument resolved in this order:

1. Literal `devin-…` id.
2. Anaphora (`"it"`, `"that one"`, empty) → the **focused** session: the last session started, read, or messaged in this Puding conversation.
3. Recency words (`"latest"`, `"last"`, `"newest"`) → most recently updated `puding`-tagged session.
4. Ordinals (`"the second one"`) → index into the last list returned by `list_devin_sessions`.
5. Fuzzy title match over the 20 most recent sessions (normalised token overlap; tie threshold).

Ambiguity returns `{ status: "ambiguous", candidates: [title, …] }` so Gemini asks "Did you mean the login bug or the login page redesign?" instead of guessing. Focus state is per `GeminiSession` (keyed by Puding `sessionId`), not global.

### 4.4 Module wiring (`devin.module.ts`)

```typescript
providers: [
  { provide: CodingAgentService, useClass: DevinService },
  SessionResolver,
  DevinWatcher,
  StartDevinSessionTool,
  ListDevinSessionsTool,
  GetDevinSessionTool,
  MessageDevinSessionTool,
  StopDevinSessionTool,
];
```

`gemini.module.ts` spreads the five tools into `"GEMINI_TOOLS"` only when `codingAgent.isConfigured()` (and not in a preview unless `DEVIN_ENABLE_IN_PREVIEW=true`), mirroring the Spotify gating.

---

## 5. Gemini Tool Schemas

| Tool                    | Args                                                                                           | Behaviour                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start_devin_session`   | `task` (req), `intent` (`plan`\|`build`, default `plan`), `repo?`, `mode?`, `confirmed` (bool) | If `confirmed` is false, returns `{ status: "needs_confirmation", readBack }` and does nothing. Otherwise creates the session, sets focus, returns title + URL. |
| `list_devin_sessions`   | `filter?` (`active`\|`needs_me`\|`all`, default `active`), `limit?` (default 5)                | Returns compact rows `{ index, title, state, prCount }`; stores the list for ordinal resolution.                                                                |
| `get_devin_session`     | `session` (req), `include_last_messages?` (default 1)                                          | State, PR URLs, ACUs used, and `spokenSummary` of Devin's latest message. Sets focus.                                                                           |
| `message_devin_session` | `session` (req), `message` (req)                                                               | Sends verbatim text (approvals, answers, steering). Sets focus.                                                                                                 |
| `stop_devin_session`    | `session` (req), `confirmed` (bool)                                                            | Same confirmation contract as start; terminates (irreversible).                                                                                                 |

**Confirmation is enforced in code, not only in the prompt**: the two costly/irreversible tools refuse to act unless `confirmed: true`, so a misheard utterance cannot spend ACUs or kill a session. The read-back ("Start a Devin **plan** session on **puding**: _add dark mode toggle_?") is spoken first.

**Server-owned instructions:** today the system instruction comes from the client (`useLiveSession`). This phase adds a server-side addendum appended in `GeminiSession.setup()` whenever Devin tools are registered — summarise Devin's Markdown in one or two sentences, never read code or URLs aloud, always read back before `start`/`stop`, default to `plan` intent when the user says "plan" or is vague. Keeping it server-side means a stale or tampered client cannot strip the safety rules.

Example conversation:

> **User:** Ask Devin to plan a dark mode toggle for Puding.
> **Puding:** _(start_devin_session confirmed=false)_ Start a Devin plan session on puding: "dark mode toggle"?
> **User:** Yes.
> **Puding:** _(confirmed=true)_ Started. I'll tell you when the plan is ready.
> _…4 minutes later, watcher fires…_
> **Puding:** Devin's dark-mode plan is ready — three stages, starting with CSS variables. Want the details or should I tell it to go ahead?
> **User:** Go ahead, but skip the settings page.
> **Puding:** _(message_devin_session session="it")_ Sent.

---

## 6. Security & Spend Guardrails

The current WebSocket gateway accepts **any** client and the Render URL is public. Today that only costs Gemini tokens; with Devin tools an anonymous visitor could start paid sessions in the user's repos. Therefore stage 29 lands **before** any Devin tool is reachable:

1. **Access token on the socket.** New `PUDING_ACCESS_TOKEN` (server env). `ProxyGateway.handleConnection` compares the `?token=` query param (constant-time) and closes with `4401` when it is missing or wrong. When the env var is unset (local dev) the guard is open and logs a warning.
2. **Client side.** `AccessTokenPrompt` asks for the token once and stores it in `localStorage`; `useLiveSession` appends it to the WS URL (the resolver from stage 26 already owns URL building). On `4401` the prompt reappears.
3. **Preview isolation.** Devin tools are off in Render PR previews (`IS_PULL_REQUEST=true`) unless `DEVIN_ENABLE_IN_PREVIEW=true`, and previews should not receive `DEVIN_API_KEY` in the `puding-preview-secrets` group by default.
4. **ACU cap.** Every created session sets `max_acu_limit = DEVIN_MAX_ACU_PER_SESSION` (default 10).
5. **Concurrency cap.** `start_devin_session` refuses when there are already `DEVIN_MAX_ACTIVE_SESSIONS` (default 3) `puding`-tagged sessions in `working` state.
6. **Confirmation contract** (§5) for start/stop.

---

## 7. Proactive Updates (`devin-watcher.service.ts`)

Devin sessions run for minutes to hours, far longer than a voice turn.

- A singleton `DevinWatcher` polls `GET /sessions` every `DEVIN_POLL_INTERVAL_MS` (default 20s) **only while at least one Puding client is connected**, and keeps the last known state of each `puding`-tagged session.
- On a transition **into** a notify state (§2 table), it emits a `DevinSessionUpdate` to every connected `GeminiSession` via a small subscriber interface (no gateway coupling).
- `GeminiSession.injectSystemNote(text)` queues the note and, once the model is idle (after the next `turnComplete` and no user speech in the last ~1.5s), sends it as a `clientContent` turn: _"[Devin update] Session 'dark mode toggle' is now waiting for the user. Devin said: … Tell the user in one sentence and offer next steps."_ It never interrupts Puding mid-sentence or barges over the user.
- The client also receives a `devin` integration card for the update, so the change is visible even when audio is muted.
- Because state lives in Devin (via the `puding` tag), nothing is lost when the browser reconnects or the Gemini session rotates; the first poll after (re)connect only seeds state and does not announce historical transitions.

Out of scope here: notifications while Puding is closed (see §10).

---

## 8. Client Integration

`ServerMessage.integration.type` gains `"devin"`, with `data.kind` discriminating:

- **`session`** — `DevinSessionCard`: title, status badge (colour per state), repo, latest Devin message (full Markdown, collapsed to 4 lines), PR links, and "Open in Devin" linking to `url`.
- **`list`** — `DevinSessionListCard`: numbered rows (matching the spoken ordinals) with title + badge.
- **`confirm`** — the read-back for start/stop, rendered as a pending card so the user can also see what Puding is about to do.

Renderers are added to `INTEGRATION_RENDERERS` in `ChatWindow.tsx`; badge colours use CSS custom properties in `globals.css`.

---

## 9. Implementation Stages

Continuing the global numbering after stage 28:

| Stage                                          | Work                                                                                                                                                                                                                                                                                                                         | Files                                                                                                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **29. WebSocket Access Guard**                 | `PUDING_ACCESS_TOKEN` config, constant-time check on WS upgrade with `4401` close, `AccessTokenPrompt` + `localStorage`, token appended by the WS URL resolver, preview-safe defaults.                                                                                                                                       | `config.service.ts`, `auth/access-guard.service.ts`, `proxy.gateway.ts`, `proxy.gateway.spec.ts`, `useLiveSession.ts`, `AccessTokenPrompt.tsx`, `.env.example` |
| **30. Devin API Client**                       | `DEVIN_*` config getters (optional), `CodingAgentService` abstraction, `DevinService` over REST v3 (start/list/get/messages/send/stop), prompt templates for plan/build, repo aliases, ACU + concurrency caps, error translation, unit tests with mocked `fetch`. Confirm `GET /sessions` query params against the live API. | `devin/coding-agent.interface.ts`, `devin/devin.service.ts`, `devin/devin.service.spec.ts`, `devin/devin.module.ts`, `app.module.ts`                           |
| **31. Devin Voice Tools & Session Resolution** | `SessionResolver` (id → anaphora → recency → ordinal → fuzzy, with ambiguity), the five `GeminiTool`s with code-enforced confirmation, gated registration in `"GEMINI_TOOLS"`, server-side system-instruction addendum.                                                                                                      | `devin/session-resolver.service.ts` (+spec), `devin/tools/*.ts` (+spec), `gemini.module.ts`, `gemini.session.ts`                                               |
| **32. Devin Session Cards**                    | `"devin"` integration type; `DevinSessionCard`, `DevinSessionListCard`, confirm card; status badge styles.                                                                                                                                                                                                                   | `types/server-message.ts`, `ChatWindow.tsx`, `globals.css`                                                                                                     |
| **33. Proactive Devin Updates**                | `DevinWatcher` polling with transition detection, subscriber interface, `GeminiSession.injectSystemNote` with idle-aware queue, update cards.                                                                                                                                                                                | `devin/devin-watcher.service.ts` (+spec), `gemini.session.ts`, `gemini.service.ts`                                                                             |

Each stage is a separate `feature/stage-<n>-<slug>` branch/PR per the plan-driven workflow, with `pnpm run build`, `pnpm lint` and `pnpm test` passing before commit.

---

## 10. Verification Plan

1. **Build / lint / unit tests** at the workspace root.
2. **Unit coverage:** `devin.service.spec.ts` (request shape incl. `tags`/`max_acu_limit`/`repos`, status mapping, error translation, concurrency cap), `session-resolver.service.spec.ts` (every resolution path + ambiguity), tool specs (no API call when `confirmed=false`), watcher spec (seed without announcing, single announcement per transition).
3. **Access guard:** connecting without/with a wrong token closes with `4401`; the PWA prompts once and reconnects.
4. **Live voice tests** (real `DEVIN_API_KEY`, `DEVIN_ORG_ID`):
   - "Ask Devin to plan adding a README badge on puding" → read-back → "yes" → session visible in app.devin.ai tagged `puding`, card shows _working_.
   - Wait for the plan → Puding announces it unprompted; "read it" → one-to-two sentence summary, card shows full plan.
   - "Go ahead" → message lands in the Devin session; later the PR link appears on the card.
   - "What are my Devin sessions doing?" → numbered list; "what about the second one?" resolves correctly.
   - "Stop it" → read-back → "yes" → session terminated.
5. **Failure paths:** unset `DEVIN_API_KEY` → server boots, tools absent, Puding says Devin isn't connected; invalid token → spoken "Devin rejected the API token"; fourth concurrent start → refused with the cap explained.
6. **Latency:** each Devin tool round trip should stay under ~1s; polling must not affect the <500ms first-audio target (it runs off the audio path).

---

## 11. Open Questions / Future Work

- **Notifications while Puding is closed:** Web Push via the existing service worker, or a Devin Automation that messages the user; needs a push subscription store.
- **Playbooks by voice:** map spoken names ("run the release playbook") to `playbook_id`s via config.
- **Devin MCP server:** if knowledge/playbook/schedule management by voice becomes desirable, add an MCP-backed `CodingAgentService` without changing the tools.
- **Multi-user:** a single PAT means a single owner. Real multi-user support needs per-user auth in Puding and service-user `create_as_user_id`.
- **Plan documents:** a "save the plan to Notion" follow-up can chain `get_devin_session` with the existing `create_notion_page` tool.
