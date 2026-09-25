# Project Puding: Free Deployment Plan & Execution Guide 🚀

This document outlines the architecture, prerequisites, step-by-step instructions, and verification checklist for deploying **Project Puding** to production for **100% free** without compromising low-latency WebSocket streaming or PWA capabilities.

---

## 1. Deployment Architecture & Requirements

Project Puding consists of two distinct components with different runtime requirements:

```
                  ┌──────────────────────────────────────────────┐
                  │                 User Device                  │
                  │       (PWA on iOS / Android / Desktop)       │
                  └───────────────────────┬──────────────────────┘
                                          │
                               HTTPS / PWA Assets
                                          │
                                          ▼
                            ┌───────────────────────────┐
                            │    Vercel (Free Tier)     │
                            │   Frontend: `apps/web`    │
                            │      (Next.js 14 PWA)     │
                            └───────────────────────────┘
                                          │
                               Bi-directional WSS
                       (16kHz PCM In / 24kHz PCM Out)
                                          │
                                          ▼
                            ┌───────────────────────────┐
                            │    Render (Free Tier)     │
                            │   Backend: `apps/server`  │
                            │  (NestJS WebSocket Proxy) │
                            └─────────────┬─────────────┘
                                          │
                 ┌────────────────────────┼────────────────────────┐
                 │                        │                        │
                 ▼                        ▼                        ▼
     ┌───────────────────────┐ ┌────────────────────┐ ┌────────────────────────┐
     │  Google Gemini 2.0    │ │ Notion Workspace   │ │ Tavily Search Engine   │
     │  Multimodal Live API  │ │ (Page I/O Tools)   │ │ (Web Search Tool)      │
     │  (Full-duplex WSS)    │ └────────────────────┘ └────────────────────────┘
     └───────────────────────┘
```

### Component Requirements

| Component                              | Technology                                    | Runtime Requirement                                            | Recommended Free Host             |
| :------------------------------------- | :-------------------------------------------- | :------------------------------------------------------------- | :-------------------------------- |
| **Frontend** (`apps/web`)              | Next.js 14, React, Tailwind, Canvas/Web Audio | Static / SSR / Edge                                            | **Vercel** (Hobby Tier)           |
| **Backend** (`apps/server`)            | NestJS, `ws`, Google Gen AI SDK, Notion SDK   | Persistent container / Node.js process (Long-lived WebSockets) | **Render.com** (Free Web Service) |
| **Memory / Database** _(Future Phase)_ | PostgreSQL + `pgvector`                       | Managed Relational DB with Vector extension                    | **Supabase** or **Neon**          |

> [!IMPORTANT]
> **Why Backend Cannot Use Pure Serverless (Vercel Serverless / AWS Lambda):**
> Standard serverless functions terminate execution after an HTTP request/response cycle and cannot maintain the stateful, persistent, full-duplex TCP/WebSocket connection required for Gemini Live bidirectional audio streaming. A continuous Node.js runtime (Render, Fly.io, Koyeb, or a VM) is required for `apps/server`.

---

## 2. Recommended Free Deployment Stack

- **Frontend Host**: [Vercel](https://vercel.com) (Unlimited static bandwidth, free SSL, fast global CDN).
- **Backend Host**: [Render.com](https://render.com) (750 free instance hours/month, native WebSocket and SSL support).
- **Domain & SSL**: Free `*.vercel.app` and `*.onrender.com` subdomains with automated SSL certificates (enables required `https://` and `wss://`).

---

## 3. Step-by-Step Deployment Instructions

### Phase 1: Deploy Backend WebSocket Proxy (`apps/server`)

The backend must be deployed first so we have the production WebSocket URL ready for the frontend.

#### 1. Create a Web Service on Render

1. Sign in to [Render.com](https://render.com) (sign in with GitHub).
2. Click **New +** &rarr; **Web Service**.
3. Select and connect your repository: `ofekshlin/puding`.

#### 2. Configure Service Settings

- **Name**: `puding-backend` (or any unique name)
- **Region**: Select the region closest to your target users (e.g., _Frankfurt / Oregon / Ohio_).
- **Branch**: `main` (or your active release branch)
- **Root Directory**: _(Leave empty / root)_
- **Runtime**: `Node`
- **Build Command**:
  ```bash
  pnpm install --frozen-lockfile && pnpm --filter @puding/server build
  ```
- **Start Command**:
  ```bash
  pnpm --filter @puding/server start
  ```
- **Instance Type**: `Free`

#### 3. Set Environment Variables

In the **Environment Variables** section on Render, add:

| Key              | Value / Description                                 | Required    |
| :--------------- | :-------------------------------------------------- | :---------- |
| `PORT`           | `10000` _(Render sets this automatically)_          | Auto        |
| `GEMINI_API_KEY` | Your Google AI Studio API key                       | **Yes**     |
| `NOTION_TOKEN`   | Your Notion internal integration secret (`ntn_...`) | **Yes**     |
| `TAVILY_API_KEY` | Your Tavily Search API key (`tvly-...`)             | Optional    |
| `NODE_ENV`       | `production`                                        | Recommended |

#### 4. Deploy and Note the WebSocket Endpoint

1. Click **Create Web Service**.
2. Once the build completes and the logs show:
   ```text
   Puding WebSocket Proxy running on port 10000
   ```
3. Copy your service's HTTPS URL (e.g. `https://puding-backend.onrender.com`).
4. Your production WebSocket URL is:
   ```text
   wss://puding-backend.onrender.com
   ```

---

### Phase 2: Deploy Frontend PWA (`apps/web`)

#### 1. Import Project to Vercel

1. Sign in to [Vercel](https://vercel.com) using your GitHub account.
2. Click **Add New...** &rarr; **Project** and select `ofekshlin/puding`.

#### 2. Configure Monorepo Settings

- **Framework Preset**: `Next.js`
- **Root Directory**: Click _Edit_ and select **`apps/web`**.
- **Build Command**: `pnpm --filter @puding/web build` (or leave default Next.js build).
- **Output Directory**: `.next` (default).
- **Install Command**: `pnpm install`.

#### 3. Configure Environment Variables

In the Vercel **Environment Variables** panel, add:

| Variable Name               | Value                              | Purpose                                        |
| :-------------------------- | :--------------------------------- | :--------------------------------------------- |
| `NEXT_PUBLIC_SERVER_WS_URL` | `wss://puding-backend.onrender.com` | Directs client to the secure backend WebSocket |

#### 4. Deploy

1. Click **Deploy**.
2. Vercel will build the Next.js app, optimize images and PWA assets, and provide a public URL (e.g. `https://puding.vercel.app`).

---

## 4. Per-Pull-Request Preview Environments

Every pull request gets a full stack of its own: a Vercel preview of `apps/web`
and a temporary Render instance of `apps/server`, wired to each other so a
feature can be exercised end to end before it reaches `main`.

```
Pull request opened
        │
        ├── Vercel builds a preview of apps/web         → https://puding-<hash>.vercel.app
        ├── Render builds a preview of apps/server      → https://puding-backend-pr-<n>.onrender.com
        │
        └── .github/workflows/preview-env.yml
              1. asks the Render API which preview belongs to this PR
              2. waits for GET <backend>/health to answer
              3. writes PREVIEW_WS_URL_OVERRIDE (branch-scoped) to Vercel and redeploys
              4. comments both URLs on the pull request

Pull request merged or closed
        └── Render deletes the preview instance automatically
```

### How the frontend finds its backend

`NEXT_PUBLIC_SERVER_WS_URL` is inlined at build time and therefore cannot differ
per pull request, so the browser resolves the backend at **runtime** instead
(`apps/web/src/lib/backendUrl.ts`), in this order:

1. `?ws=wss://...` in the URL — a manual override, useful for pointing any
   preview at any backend while debugging;
2. `GET /api/config` — returns `PREVIEW_WS_URL_OVERRIDE` published by the
   workflow, falling back to `wss://puding-backend-pr-<n>.onrender.com`;
3. `NEXT_PUBLIC_SERVER_WS_URL` — production;
4. `ws://localhost:6601` — local development.

Production is untouched by all of this: outside `VERCEL_ENV=preview`,
`/api/config` returns exactly `NEXT_PUBLIC_SERVER_WS_URL`.

### One-time setup

**Render** — the blueprint (`render.yaml`) already sets
`previews.generation: automatic`, `healthCheckPath: /health` and a build filter
so frontend-only pull requests do not rebuild the backend. You must create the
environment group it references:

1. Render Dashboard &rarr; **Env Groups** &rarr; **New Environment Group**, named
   `puding-preview-secrets`.
2. Add **non-production** values for `GEMINI_API_KEY`, `NOTION_TOKEN`,
   `TAVILY_API_KEY` and the `SPOTIFY_*` credentials. Previews inherit these, so
   production keys must not be placed here.
3. Link the group to the `puding-backend` service.

**GitHub** — add these repository secrets (Settings &rarr; Secrets and variables
&rarr; Actions):

| Secret              | Where to get it                                       |
| :------------------ | :---------------------------------------------------- |
| `RENDER_API_KEY`    | Render &rarr; Account Settings &rarr; API Keys        |
| `RENDER_SERVICE_ID` | The `srv-...` id in the `puding-backend` dashboard URL |
| `VERCEL_TOKEN`      | Vercel &rarr; Account Settings &rarr; Tokens          |
| `VERCEL_PROJECT_ID` | Vercel project &rarr; Settings &rarr; General         |
| `VERCEL_ORG_ID`     | Vercel team &rarr; Settings &rarr; General            |

The workflow only ever _writes_ the resolved backend URL to Vercel; no secret
value is echoed into logs or into the pull request comment.

### Opting out and costs

- Skip the backend preview for a single pull request with the label
  `render-preview-skip` or `[skip preview]` in the title. Use `[skip preview]`
  rather than `[skip render]`, which would also skip the production deploy on
  merge. The pairing workflow skips itself for the same markers, so opting out
  does not produce a failing check.
- Previews from forks are skipped because repository secrets are unavailable to
  them.
- Preview instances are billed at the base service's rate, so previews of the
  free `puding-backend` are free, but they draw on the same 750 free instance
  hours per month — a long-lived pull request consumes hours even while idle.
- Free instances spin down after 15 minutes, so the first connection to a
  preview takes 30–50 seconds. The UI shows a _"Waking backend"_ state for the
  duration instead of appearing to hang.

### Reviewer checklist

- [ ] Both the Vercel and Render previews appear as checks/deployments on the
      pull request.
- [ ] The **Preview environment** comment lists a backend URL and its `wss://`
      endpoint, and the job is green — a red job means Render's hostname
      convention changed and `resolveBackendWsUrl` needs updating.
- [ ] `GET <backend>/health` reports `"isPreview": true` and the commit of the
      pull request.
- [ ] The Vercel preview connects to _that_ backend (check
      `<frontend>/api/config`, or the connection log in the UI).
- [ ] A voice round-trip works, plus whichever tools the pull request touches
      (Notion, Tavily, Spotify).
- [ ] After merging or closing, the Render preview disappears from the service's
      **Previews** tab.

---

## 5. Alternative Free Hosting Options

If you prefer alternative platforms or want to eliminate free-tier spin-down:

### Option B: Fly.io (Docker-Based Edge Deployment)

Fly.io provides low-latency edge deployment with native WebSocket handling.

1. Install Fly CLI: `brew install flyctl`
2. Run `fly launch` in `apps/server` with a lightweight Node.js Dockerfile.
3. Set secrets: `fly secrets set GEMINI_API_KEY=... NOTION_TOKEN=...`
4. Deploy: `fly deploy`

### Option C: Oracle Cloud Always Free VM (Zero Spin-Down 24/7)

Oracle Cloud offers an **Always Free** tier with 4 OCPU ARM compute instances and 24GB RAM that run 24/7 permanently without cold starts:

1. Spin up an Ubuntu ARM instance.
2. Clone repo and install `docker` & `docker-compose`.
3. Use **Caddy** as a reverse proxy for automatic HTTPS/WSS certificates.
4. Run frontend and backend containers via Docker Compose.

---

## 6. PWA Installation (Mobile & Desktop)

Since Vercel serves the application over strict HTTPS:

- **iOS (iPhone/iPad)**:
  1. Open the Vercel URL in **Safari**.
  2. Tap the **Share** button &rarr; **Add to Home Screen**.
  3. Launch "Puding" from your home screen as a standalone, distraction-free voice assistant.
- **Android**:
  1. Open the Vercel URL in **Google Chrome**.
  2. Tap the menu (three dots) &rarr; **Install App** / **Add to Home screen**.
- **macOS / Windows**:
  1. Open in Chrome, Edge, or Brave.
  2. Click the **Install** icon in the address bar to run Puding in its own window.

---

## 7. Verification & Post-Deployment Checklist

After deployment, verify the end-to-end functionality:

- [ ] **SSL & WebSocket Handshake**: Ensure the client establishes a `wss://` connection without browser console mixed-content errors.
- [ ] **Microphone Permissions**: Check that the browser requests audio input permissions on the first interaction.
- [ ] **Voice Streaming Latency**: Speak a prompt and verify audio response playback starts in < 500ms.
- [ ] **Interruption (Barge-In)**: Speak while Puding is talking; ensure audio playback immediately halts and resets.
- [ ] **Text Chat & Multi-Modal Interaction**: Send text messages and ensure transcription matches.
- [ ] **Notion Tool Integration**: Ask Puding to read or create a page; verify the backend completes the tool loop without timeout.
- [ ] **Web Search Tool**: Ask a live question (e.g., _"What is the weather today in Tokyo?"_); confirm Tavily search tool executes and returns relevant citations.

---

## 8. Troubleshooting & Common Issues

### 1. Mixed Content Error (`Blocked loading mixed active content`)

- **Cause**: The frontend is served over `https://` but `NEXT_PUBLIC_SERVER_WS_URL` is set to `ws://` instead of `wss://`.
- **Solution**: Ensure your WebSocket URL starts with **`wss://`** (Render automatically supports WSS on port 443).

### 2. Render Free Tier Cold Start (30-50s Delay)

- **Cause**: Render's free tier puts instances to sleep after 15 minutes of inactivity.
- **Solution**: The first request will take ~30 seconds to wake up the server. Subsequent requests will be instantaneous. To keep it warm, use a free uptime monitor (like [UptimeRobot](https://uptimerobot.com)) to ping your server's HTTP endpoint every 10 minutes.

### 3. Missing Environment Variables on Server

- If connections are rejected immediately with code `1011`, check the Render logs. Ensure both `GEMINI_API_KEY` and `NOTION_TOKEN` are set in the Render dashboard.

### 4. Preview Frontend Talks to the Production Backend

- **Cause**: `/api/config` did not return an override — usually because the
  pairing workflow failed, or the Vercel preview was built before the workflow
  redeployed it.
- **Solution**: Open `<frontend>/api/config` to see the URL actually served,
  re-run the **Preview environment** workflow, or append
  `?ws=wss://puding-backend-pr-<n>.onrender.com` to the preview URL to override
  the backend for one session.

### 5. No Render Preview Was Created for a Pull Request

- **Cause**: The pull request touches only paths excluded by the `buildFilter`
  in `render.yaml` (e.g. frontend-only changes), or it carries a skip marker.
- **Solution**: For a frontend-only change this is expected, and the frontend
  preview falls back to the production backend. If the pull request does need
  its own backend, widen `buildFilter.paths` in `render.yaml` or remove the skip
  marker.
