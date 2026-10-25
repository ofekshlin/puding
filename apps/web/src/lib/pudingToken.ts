export type PudingTokenResult =
  | { kind: "token"; token: string }
  | { kind: "disabled" }
  | { kind: "signed_out" };

/** Fetches a fresh backend token; each one lasts five minutes, so call it per connect. */
export async function fetchPudingToken(): Promise<PudingTokenResult> {
  const res = await fetch("/api/puding-token", { cache: "no-store" });
  if (res.status === 401) return { kind: "signed_out" };
  if (!res.ok) throw new Error(`Token request failed (${res.status})`);
  const body: { token: string | null } = await res.json();
  return body.token
    ? { kind: "token", token: body.token }
    : { kind: "disabled" };
}
