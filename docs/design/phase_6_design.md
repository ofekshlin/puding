# Phase 6 Design: Per-PR Preview Environments (Render + Vercel)

## 1. Goal

Every pull request gets a complete, isolated, throwaway copy of Puding:

- a **backend preview** — a temporary Render web service built from the PR branch, and
- a **frontend preview** — the existing Vercel preview deployment,

wired together so the Vercel preview talks to _its own_ PR backend rather than
production. This must work for every feature automatically, with no manual
dashboard steps per PR.

```
PR #42 opened
   ├── Vercel   → https://puding-web-git-<branch>-<scope>.vercel.app
   │                 resolves backend at runtime ──┐
   └── Render   → https://puding-backend-pr-42.onrender.com  ←┘  (wss://)
```

Both previews are destroyed when the PR is merged or closed.

## 2. Why the naive approach fails

The client reads the backend URL from a build-time constant:

```ts
// apps/web/src/hooks/useLiveSession.ts
const wsUrl = process.env.NEXT_PUBLIC_SERVER_WS_URL || "ws://localhost:6601";
```

`NEXT_PUBLIC_*` values are **inlined into the JS bundle at build time**. A single
Vercel project-level value therefore points every preview at the same backend.
Making it per-PR requires the value to vary per deployment, which means either
(a) computing it during the build, or (b) not baking it at all and resolving it
at runtime. This design takes (b), with (a) as the fallback path, because a
runtime lookup lets the pairing be fixed without rebuilding the frontend.

## 3. Platform capabilities we rely on

| Capability                                                      | Source                                                                             | Notes                                                                                                  |
| :-------------------------------------------------------------- | :--------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| Render PR previews for a Git-backed web service                 | `previews.generation: automatic` in `render.yaml`, or the service's _Previews_ tab | A separate temporary instance with its own `onrender.com` URL, TLS included                            |
| Previews inherit base-service env vars                          | Render service previews                                                            | Preview instances copy settings from the base service when created                                     |
| Free-tier previews                                              | Render free plan                                                                   | Free web services support service previews, and previews of a free base service are also free          |
| Auto-teardown                                                   | Render                                                                             | Preview deleted when the PR merges or closes                                                           |
| `IS_PULL_REQUEST`, `RENDER_SERVICE_NAME`, `RENDER_EXTERNAL_URL` | Render runtime env                                                                 | Let the backend identify itself as a preview                                                           |
| `VERCEL_ENV`, `VERCEL_GIT_PULL_REQUEST_ID`                      | Vercel system env vars                                                             | Available at **both build and runtime**; the PR id is empty for branch deploys made before a PR exists |

Two caveats that shape the design:

1. **Render's preview hostname pattern (`<service>-pr-<number>.onrender.com`) is
   observed behaviour, not a documented contract.** We use it as a fast path but
   verify it in CI (stage 27) and fail loudly if it ever changes, rather than
   silently pointing previews at a dead host.
2. **Free instances spin down after ~15 minutes idle.** The first connection to a
   cold preview takes ~30–50s. The client must show that state instead of
   appearing connected.

## 4. Architecture

### 4.1 Backend: `render.yaml` blueprint

Move the backend service definition from dashboard-clicks into version control so
preview behaviour is reviewable and identical for every feature:

```yaml
services:
  - type: web
    name: puding-backend
    runtime: node
    plan: free
    region: frankfurt
    branch: main
    buildCommand: pnpm install --frozen-lockfile && pnpm --filter @puding/server build
    startCommand: pnpm --filter @puding/server start
    healthCheckPath: /health
    previews:
      generation: automatic # a preview for every PR
    buildFilter: # monorepo: skip previews for web-only PRs
      paths:
        - apps/server/**
        - package.json
        - pnpm-lock.yaml
    envVars:
      - key: NODE_ENV
        value: production
      - fromGroup: puding-preview-secrets
```

`puding-preview-secrets` is a Render **environment group** holding the shared
non-production `GEMINI_API_KEY`, `NOTION_TOKEN`, `TAVILY_API_KEY` and
`SPOTIFY_*` values, so a rotated key updates every preview at once and no secret
is committed.

### 4.2 Backend: health + identity endpoint

The server currently exposes no HTTP route other than `/spotify/*`, so Render has
nothing to health-check and CI has nothing to poll. Add a tiny controller:

```
GET /health → 200 { status, commit, isPreview, service }
```

`isPreview` comes from `IS_PULL_REQUEST`; `service` from `RENDER_SERVICE_NAME`.
CI uses this endpoint to prove a preview is actually live before wiring the
frontend to it, and it doubles as the keep-warm ping target.

### 4.3 Frontend: runtime backend resolution

Replace the single build-time constant with a small resolver, in priority order:

```ts
resolveWsUrl() =
  1. ?ws=<url>                         // manual override, for testing a specific backend
  2. window.__PUDING_WS_URL__          // injected by /api/config at runtime
  3. NEXT_PUBLIC_SERVER_WS_URL         // production / explicit configuration
  4. ws://localhost:6601               // local dev
```

`/api/config` is a Next.js route handler (runtime, not static) that returns:

```ts
if (VERCEL_ENV === "preview" && VERCEL_GIT_PULL_REQUEST_ID)
  wsUrl =
    PREVIEW_WS_URL_OVERRIDE ?? // set by CI, exact
    `wss://puding-backend-pr-${VERCEL_GIT_PULL_REQUEST_ID}.onrender.com`;
else wsUrl = NEXT_PUBLIC_SERVER_WS_URL;
```

Because this is evaluated per request, CI can correct the value without
rebuilding, and a reviewer can point any preview frontend at any backend with a
query parameter.

### 4.4 CI glue: verify and publish the pairing

A `pull_request` workflow (`.github/workflows/preview-env.yml`) that:

1. queries the Render API for the preview service belonging to this PR and reads
   its **actual** URL (rather than trusting the naming convention);
2. polls `GET <preview>/health` until it reports ready (covers the cold build);
3. writes that URL into the Vercel preview environment for this deployment
   (`vercel env` / deploy hook with `PREVIEW_WS_URL_OVERRIDE`);
4. posts/updates a single PR comment with both preview URLs and the resolved
   `wss://` endpoint;
5. fails the check if the convention-derived URL and the API-reported URL differ,
   so the fallback in 4.3 can never go stale silently.

Required repository secrets: `RENDER_API_KEY`, `RENDER_SERVICE_ID`,
`VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID`.

## 5. Risks and mitigations

| Risk                                                       | Mitigation                                                                                                                                    |
| :--------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| Preview hostname convention changes                        | CI compares the convention against the Render API and fails the check (4.4 step 5)                                                            |
| Free-tier cold start (~30–50s) looks like a hang           | Surface a "waking backend" state in the client; CI pre-warms via `/health`                                                                    |
| Free-tier 750 instance-hours/month shared across previews  | `buildFilter` skips server-only rebuilds for web-only PRs; previews auto-expire with the PR; long-lived PRs can opt out with `[skip preview]` |
| Shared API keys across previews                            | Dedicated non-production keys in a Render env group, never production credentials                                                             |
| Spotify OAuth redirect URIs must be pre-registered exactly | Previews never run the `/spotify/login` flow; they consume the shared `SPOTIFY_REFRESH_TOKEN`, so no per-PR redirect URI is needed            |
| Mixed content                                              | Previews are HTTPS-only, so the resolver always emits `wss://` off-localhost                                                                  |

## 6. Stages

- **25. Backend health endpoint & `render.yaml` blueprint** — add `GET /health`
  (status, commit, `isPreview`, service name) and commit a `render.yaml` defining
  `puding-backend` with `previews.generation: automatic`, `plan: free`,
  `healthCheckPath`, a server-scoped `buildFilter`, and a `puding-preview-secrets`
  env group reference.
- **26. Runtime backend URL resolution** — replace the build-time
  `NEXT_PUBLIC_SERVER_WS_URL` read with the `?ws=` → `/api/config` →
  `NEXT_PUBLIC_SERVER_WS_URL` → localhost resolver, add the `/api/config` route
  handler deriving the per-PR backend from `VERCEL_ENV` /
  `VERCEL_GIT_PULL_REQUEST_ID`, and show a "waking backend" state while a cold
  free-tier preview boots.
- **27. Preview pairing workflow** — add `.github/workflows/preview-env.yml` to
  resolve the real Render preview URL via the Render API, poll `/health`, push
  `PREVIEW_WS_URL_OVERRIDE` to the Vercel preview deployment, comment both URLs on
  the PR, and fail if the hostname convention no longer holds.
- **28. Deployment documentation & verification** — document the per-PR flow, the
  required Render/Vercel secrets and the env group in `DEPLOYMENT.md`, with a
  reviewer checklist (open PR → both previews live → voice round-trip against the
  PR backend → teardown on close).

## 7. Out of scope

- Render **Preview Environments** (full blueprint-wide environments including
  datastores) — unnecessary until Puding has a database; service previews cover
  the single stateless backend.
- Per-PR Spotify/Notion workspaces or per-PR OAuth apps.
- Paid always-on preview instances to eliminate cold starts.
