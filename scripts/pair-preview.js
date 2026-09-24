/**
 * Pairs the Vercel preview deployment of a pull request with the Render service
 * preview built from the same pull request.
 *
 * Reads the *actual* Render preview URL from the Render API rather than trusting
 * the `<service>-pr-<number>.onrender.com` hostname convention, waits for the
 * backend to answer `/health`, publishes the resolved WebSocket URL to Vercel as
 * a branch-scoped `PREVIEW_WS_URL_OVERRIDE`, and reports whether the convention
 * still holds so the frontend fallback cannot go stale silently.
 */

const fs = require("fs");

const RENDER_API = "https://api.render.com/v1";
const VERCEL_API = "https://api.vercel.com";

const HEALTH_TIMEOUT_MS = 15 * 60 * 1000;
const HEALTH_INTERVAL_MS = 15 * 1000;
const RENDER_LOOKUP_TIMEOUT_MS = 5 * 60 * 1000;
const RENDER_LOOKUP_INTERVAL_MS = 15 * 1000;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function renderRequest(path) {
  const response = await fetch(`${RENDER_API}${path}`, {
    headers: {
      Authorization: `Bearer ${requireEnv("RENDER_API_KEY")}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Render API ${path} responded ${response.status}: ${await response.text()}`,
    );
  }

  return response.json();
}

/**
 * Finds the preview instance of the base service that was built from the pull
 * request branch. Previews are matched on their parent service and branch, so a
 * change to Render's preview naming does not break the lookup.
 */
async function findRenderPreview(baseServiceId, branch) {
  const deadline = Date.now() + RENDER_LOOKUP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const entries = await renderRequest(
      `/services?includePreviews=true&type=web_service&limit=100`,
    );

    const match = entries
      .map((entry) => entry.service)
      .find(
        (service) =>
          service &&
          service.branch === branch &&
          service.serviceDetails &&
          service.serviceDetails.parentServer &&
          service.serviceDetails.parentServer.id === baseServiceId,
      );

    if (match) {
      return match;
    }

    console.log(
      `No Render preview for branch ${branch} yet, retrying in ${RENDER_LOOKUP_INTERVAL_MS / 1000}s...`,
    );
    await sleep(RENDER_LOOKUP_INTERVAL_MS);
  }

  throw new Error(
    `Render created no preview for branch ${branch} within ${RENDER_LOOKUP_TIMEOUT_MS / 60000} minutes. ` +
      `Check that pull request previews are enabled for service ${baseServiceId} ` +
      `and that the pull request touches a path allowed by the build filter.`,
  );
}

/**
 * Waits for the preview backend to serve `/health`, which also covers the cold
 * build and the free-tier spin-up.
 */
async function waitForHealth(baseUrl) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let lastError = "no response yet";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`, { cache: "no-store" });
      if (response.ok) {
        const health = await response.json();
        if (health.status === "ok") {
          return health;
        }
        lastError = `unexpected body ${JSON.stringify(health)}`;
      } else {
        lastError = `status ${response.status}`;
      }
    } catch (error) {
      lastError = error.message;
    }

    console.log(`${baseUrl}/health not ready (${lastError}), waiting...`);
    await sleep(HEALTH_INTERVAL_MS);
  }

  throw new Error(
    `${baseUrl}/health never became ready within ${HEALTH_TIMEOUT_MS / 60000} minutes (last error: ${lastError})`,
  );
}

async function vercelRequest(path, init = {}) {
  const teamId = process.env.VERCEL_ORG_ID;
  const separator = path.includes("?") ? "&" : "?";
  const url = `${VERCEL_API}${path}${teamId ? `${separator}teamId=${teamId}` : ""}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireEnv("VERCEL_TOKEN")}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      `Vercel API ${path} responded ${response.status}: ${await response.text()}`,
    );
  }

  return response.json();
}

/**
 * Stores the resolved backend URL as a branch-scoped preview environment
 * variable and redeploys the branch's latest preview so the running deployment
 * picks the value up. Without the redeploy the variable would only apply to the
 * next push.
 */
async function publishToVercel(projectId, branch, wsUrl) {
  await vercelRequest(`/v10/projects/${projectId}/env?upsert=true`, {
    method: "POST",
    body: JSON.stringify({
      key: "PREVIEW_WS_URL_OVERRIDE",
      value: wsUrl,
      type: "plain",
      target: ["preview"],
      gitBranch: branch,
      comment: "Set by .github/workflows/preview-env.yml",
    }),
  });

  const { deployments } = await vercelRequest(
    `/v6/deployments?projectId=${projectId}&target=preview&branch=${encodeURIComponent(branch)}&limit=1`,
  );

  const latest = deployments && deployments[0];
  if (!latest) {
    console.log(
      `No Vercel preview deployment for ${branch} yet; the variable applies to the next build.`,
    );
    return null;
  }

  const redeployed = await vercelRequest(`/v13/deployments?forceNew=1`, {
    method: "POST",
    body: JSON.stringify({
      name: latest.name,
      deploymentId: latest.uid,
      target: "preview",
      meta: { action: "redeploy" },
    }),
  });

  return `https://${redeployed.url}`;
}

function writeOutputs(outputs) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;

  const lines = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value ?? ""}`)
    .join("\n");
  fs.appendFileSync(file, `${lines}\n`);
}

async function run() {
  const baseServiceId = requireEnv("RENDER_SERVICE_ID");
  const branch = requireEnv("PR_BRANCH");
  const pullRequestNumber = requireEnv("PR_NUMBER");
  const projectId = requireEnv("VERCEL_PROJECT_ID");

  const preview = await findRenderPreview(baseServiceId, branch);
  const backendUrl = preview.serviceDetails.url;
  console.log(`Render preview ${preview.name} -> ${backendUrl}`);

  const health = await waitForHealth(backendUrl);
  if (!health.isPreview) {
    throw new Error(
      `${backendUrl}/health reports isPreview=false; the workflow resolved a non-preview service (${health.service})`,
    );
  }
  console.log(`Backend healthy: ${health.service} @ ${health.commit}`);

  const wsUrl = backendUrl.replace(/^https:/, "wss:");
  const { hostname } = new URL(backendUrl);
  const conventionHost = `puding-server-pr-${pullRequestNumber}.onrender.com`;
  const conventionHolds = hostname === conventionHost;

  const vercelUrl = await publishToVercel(projectId, branch, wsUrl);

  writeOutputs({
    backend_url: backendUrl,
    ws_url: wsUrl,
    vercel_url: vercelUrl ?? "",
    service_name: preview.name,
    commit: health.commit,
    convention_holds: String(conventionHolds),
    convention_host: conventionHost,
  });

  if (!conventionHolds) {
    throw new Error(
      `Render's preview hostname convention changed: expected ${conventionHost}, got ${hostname}. ` +
        `The frontend fallback in apps/web/src/lib/backendUrl.ts derives that hostname and must be updated.`,
    );
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
