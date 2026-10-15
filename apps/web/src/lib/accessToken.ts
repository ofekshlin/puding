const STORAGE_KEY = "puding.accessToken";
const QUERY_PARAM = "token";

export const UNAUTHORIZED_CLOSE_CODE = 4401;

export function readAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeAccessToken(token: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Storage can be unavailable (private mode); the token then lasts for this connect only.
  }
}

/**
 * Appends the access token to a WebSocket URL. Browsers cannot set headers on
 * a WebSocket handshake, so the token travels as a query parameter.
 */
export function withAccessToken(wsUrl: string, token: string | null): string {
  if (!token) return wsUrl;
  const url = new URL(wsUrl);
  url.searchParams.set(QUERY_PARAM, token);
  return url.toString();
}
