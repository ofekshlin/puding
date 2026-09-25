import { resolveBackendWsUrl, RuntimeConfig } from "../../../lib/backendUrl";

// Evaluated per request: the pairing between a preview frontend and its
// preview backend must be correctable without a rebuild.
export const dynamic = "force-dynamic";

export function GET(): Response {
  const config: RuntimeConfig = {
    wsUrl: resolveBackendWsUrl(process.env),
  };

  return Response.json(config);
}
