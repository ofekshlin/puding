export const LOCAL_BACKEND_WS_URL = "ws://localhost:6601";

export const DEFAULT_BACKEND_SERVICE = "puding-backend";

export interface RuntimeConfig {
  wsUrl: string | null;
}

export type BackendEnv = Record<string, string | undefined>;

/**
 * Resolves the backend a deployment should talk to, evaluated per request so a
 * pull request preview can be repaired without rebuilding the frontend.
 *
 * Preview deployments target their own Render preview instance: the exact URL
 * published by CI when available, otherwise Render's preview hostname
 * convention. Every other deployment targets the configured backend.
 */
export function resolveBackendWsUrl(env: BackendEnv): string | null {
  const pullRequestId = env.VERCEL_GIT_PULL_REQUEST_ID;

  if (env.VERCEL_ENV === "preview" && pullRequestId) {
    if (env.PREVIEW_WS_URL_OVERRIDE) {
      return env.PREVIEW_WS_URL_OVERRIDE;
    }

    const service = env.PREVIEW_BACKEND_SERVICE || DEFAULT_BACKEND_SERVICE;
    return `wss://${service}-pr-${pullRequestId}.onrender.com`;
  }

  return env.NEXT_PUBLIC_SERVER_WS_URL || null;
}

function readQueryOverride(): string | null {
  if (typeof window === "undefined") return null;

  const requested = new URLSearchParams(window.location.search).get("ws");
  return requested && isWebSocketUrl(requested) ? requested : null;
}

function isWebSocketUrl(candidate: string): boolean {
  try {
    const { protocol } = new URL(candidate);
    return protocol === "ws:" || protocol === "wss:";
  } catch {
    return false;
  }
}

async function fetchRuntimeWsUrl(): Promise<string | null> {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (!response.ok) return null;

    const { wsUrl } = (await response.json()) as RuntimeConfig;
    return wsUrl && isWebSocketUrl(wsUrl) ? wsUrl : null;
  } catch {
    return null;
  }
}

/**
 * Determines the WebSocket proxy endpoint for the current client, in priority
 * order: an explicit `?ws=` override, the runtime configuration served by
 * `/api/config`, the build-time configuration, then local development.
 */
export async function resolveWsUrl(): Promise<string> {
  return (
    readQueryOverride() ||
    (await fetchRuntimeWsUrl()) ||
    process.env.NEXT_PUBLIC_SERVER_WS_URL ||
    LOCAL_BACKEND_WS_URL
  );
}
