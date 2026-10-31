import { resolveWsUrl } from "./backendUrl";
import { fetchPudingToken } from "./pudingToken";

export type UserStatus = "pending" | "approved" | "rejected";
export type SignupMode = "allowlist" | "request" | "open";

export interface PudingUser {
  id: string;
  email: string;
  name?: string;
  pictureUrl?: string;
  role: "user" | "admin";
  status: UserStatus;
  requestNote?: string;
  requestedAt?: string;
  createdAt?: string;
  decidedAt?: string;
}

export type Provider = "spotify" | "notion" | "devin";

/** A connected provider as the backend reports it; never includes the secret. */
export interface ConnectionSummary {
  provider: Provider;
  kind: "oauth" | "static_token" | "disconnected";
  source: "db" | "env";
  settings: Record<string, unknown>;
  accountLabel?: string;
  connectedAt?: string;
  lastError?: string;
}

export interface MeResponse extends PudingUser {
  signupMode: SignupMode;
  connections: ConnectionSummary[];
  pendingRequests?: number;
}

export class BackendError extends Error {
  constructor(
    public readonly status: number,
    public readonly reason?: string,
  ) {
    super(reason ? `${status}: ${reason}` : `Request failed (${status})`);
  }
}

/** `ws(s)://host/...` → `http(s)://host`, the backend's REST origin. */
export function toHttpOrigin(wsUrl: string): string {
  const url = new URL(wsUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  return url.origin;
}

/** Calls the backend REST API with a fresh `Authorization: Bearer` token. */
export async function backendRequest<T>(
  path: string,
  init: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const token = await fetchPudingToken();
  if (token.kind === "signed_out") {
    window.location.assign("/signin");
    throw new BackendError(401, "signed_out");
  }
  if (token.kind !== "token") throw new BackendError(401, "auth_disabled");

  const res = await fetch(`${toHttpOrigin(await resolveWsUrl())}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token.token}`,
      ...(init.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      reason?: string;
    } | null;
    throw new BackendError(res.status, body?.reason);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
