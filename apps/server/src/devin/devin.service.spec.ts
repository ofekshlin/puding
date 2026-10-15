import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "../config/config.service";
import { CodingAgentError } from "./coding-agent.interface";
import { DevinService } from "./devin.service";

const BASE = "https://api.devin.ai/v3/organizations/org-test";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function rawSession(overrides: Record<string, unknown> = {}) {
  return {
    session_id: "devin-abc",
    title: "Fix login",
    status: "running",
    status_detail: "working",
    tags: ["puding", "puding-plan"],
    pull_requests: [],
    updated_at: 1_700_000_000,
    url: "https://app.devin.ai/sessions/abc",
    ...overrides,
  };
}

describe("DevinService", () => {
  let service: DevinService;
  let config: jest.Mocked<ConfigService>;
  let fetchMock: jest.SpyInstance;

  beforeEach(async () => {
    config = {
      getDevinApiKey: jest.fn().mockReturnValue("cog_test"),
      getDevinOrgId: jest.fn().mockReturnValue("org-test"),
      getDevinDefaultRepo: jest.fn().mockReturnValue("ofekshlin/puding"),
      getDevinRepoAliases: jest
        .fn()
        .mockReturnValue({ site: "ofekshlin/site" }),
      getDevinMaxAcuPerSession: jest.fn().mockReturnValue(10),
      getDevinMaxActiveSessions: jest.fn().mockReturnValue(3),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [DevinService, { provide: ConfigService, useValue: config }],
    }).compile();

    service = module.get(DevinService);
    fetchMock = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("is configured only with both an API key and an org id", () => {
    expect(service.isConfigured()).toBe(true);
    config.getDevinOrgId.mockReturnValue(undefined);
    expect(service.isConfigured()).toBe(false);
  });

  it("refuses to call Devin when not configured", async () => {
    config.getDevinApiKey.mockReturnValue(undefined);
    await expect(service.getSession("devin-abc")).rejects.toThrow(
      "Devin isn't set up on this Puding server.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("startSession", () => {
    it("creates a capped, tagged plan session on the default repo", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { items: [] }))
        .mockResolvedValueOnce(
          jsonResponse(200, rawSession({ status: "new", status_detail: null })),
        );

      const session = await service.startSession({
        task: "Add dark mode to settings",
        intent: "plan",
        mode: "fast",
      });

      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe(`${BASE}/sessions`);
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Bearer cog_test");
      const body = JSON.parse(init.body);
      expect(body).toMatchObject({
        title: "Add dark mode to settings",
        tags: ["puding", "puding-plan"],
        max_acu_limit: 10,
        repos: ["ofekshlin/puding"],
        devin_mode: "fast",
      });
      expect(body.prompt).toContain("Do NOT write code or open a PR");
      expect(body.prompt).toContain("Task: Add dark mode to settings");
      expect(session).toMatchObject({ id: "devin-abc", state: "working" });
    });

    it("resolves spoken repo aliases and build prompts", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { items: [] }))
        .mockResolvedValueOnce(jsonResponse(200, rawSession()));

      await service.startSession({
        task: "Fix the footer",
        repo: "Site",
        intent: "build",
      });

      const body = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(body.repos).toEqual(["ofekshlin/site"]);
      expect(body.tags).toEqual(["puding", "puding-build"]);
      expect(body.prompt).toBe("Fix the footer\n\nOpen a PR when done.");
      expect(body.devin_mode).toBeUndefined();
    });

    it("rejects unknown repo aliases with the known list", async () => {
      await expect(
        service.startSession({ task: "x", repo: "blog", intent: "plan" }),
      ).rejects.toThrow(
        'I don\'t know a repo called "blog". Known repos are: site.',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses when the active session cap is reached", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, {
          items: [
            rawSession({ session_id: "devin-1" }),
            rawSession({ session_id: "devin-2" }),
            rawSession({ session_id: "devin-3" }),
            rawSession({ session_id: "devin-4", status: "suspended" }),
          ],
        }),
      );

      await expect(
        service.startSession({ task: "One more", intent: "plan" }),
      ).rejects.toThrow("which is the limit of 3");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("listSessions", () => {
    it("keeps only puding sessions, newest first, mapped to agent sessions", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, {
          items: [
            rawSession({ session_id: "devin-old", updated_at: 100 }),
            rawSession({ session_id: "devin-other", tags: ["slack"] }),
            rawSession({
              session_id: "new",
              updated_at: 200,
              status_detail: "waiting_for_user",
              pull_requests: [
                { pr_url: "https://github.com/o/r/pull/1", pr_state: "open" },
              ],
            }),
          ],
        }),
      );

      const sessions = await service.listSessions({ limit: 5 });

      expect(fetchMock.mock.calls[0][0]).toBe(
        `${BASE}/sessions?first=50&tags=puding`,
      );
      expect(sessions.map((s) => s.id)).toEqual(["devin-new", "devin-old"]);
      expect(sessions[0]).toMatchObject({
        state: "waiting_for_user",
        updatedAt: 200_000,
        pullRequests: [{ url: "https://github.com/o/r/pull/1", state: "open" }],
      });
    });

    it("includes every session when onlyPuding is false", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { items: [rawSession({ tags: [] })] }),
      );
      const sessions = await service.listSessions({ onlyPuding: false });
      expect(sessions).toHaveLength(1);
      expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/sessions?first=50`);
    });
  });

  it("gets a session, adding the devin- prefix when missing", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, rawSession()));
    await service.getSession("abc");
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/sessions/devin-abc`);
  });

  it("pages through messages and returns the last ones", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          items: [
            { source: "user", message: "Plan it", created_at: 1 },
            { source: "devin", message: "On it", created_at: 2 },
          ],
          end_cursor: "c1",
          has_next_page: true,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          items: [{ source: "devin", message: "# Plan", created_at: 3 }],
          end_cursor: null,
          has_next_page: false,
        }),
      );

    const messages = await service.getMessages("devin-abc", { last: 2 });

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${BASE}/sessions/devin-abc/messages?first=100`,
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      `${BASE}/sessions/devin-abc/messages?first=100&after=c1`,
    );
    expect(messages).toEqual([
      { from: "agent", text: "On it", at: 2000 },
      { from: "agent", text: "# Plan", at: 3000 },
    ]);
  });

  it("sends a message and returns the updated session", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, rawSession()));
    const session = await service.sendMessage("devin-abc", "  go ahead ");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/sessions/devin-abc/messages`);
    expect(JSON.parse(init.body)).toEqual({ message: "go ahead" });
    expect(session.state).toBe("working");
  });

  it("terminates a session with DELETE", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, rawSession()));
    await service.stopSession("devin-abc");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/sessions/devin-abc`);
    expect(init.method).toBe("DELETE");
  });

  describe("error translation", () => {
    it.each([
      [401, "Devin rejected the API token."],
      [403, "Devin rejected the API token."],
      [404, "I couldn't find that Devin session."],
      [429, "Devin is rate-limiting us, try again in a moment."],
      [500, "Devin had a problem handling that request."],
    ])("translates HTTP %i", async (status, message) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(status, {}));
      const error = await service.getSession("devin-abc").catch((e) => e);
      expect(error).toBeInstanceOf(CodingAgentError);
      expect(error.message).toBe(message);
      expect(error.status).toBe(status);
    });

    it("includes Devin's detail for validation errors", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(422, { detail: "Repo not connected" }),
      );
      await expect(service.getSession("devin-abc")).rejects.toThrow(
        "Devin refused the request: Repo not connected",
      );
    });

    it("translates timeouts and network failures", async () => {
      fetchMock.mockRejectedValueOnce(
        Object.assign(new Error("timeout"), { name: "TimeoutError" }),
      );
      await expect(service.getSession("devin-abc")).rejects.toThrow(
        "Devin didn't answer in time, try again in a moment.",
      );
      fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
      await expect(service.getSession("devin-abc")).rejects.toThrow(
        "I couldn't reach Devin right now.",
      );
    });
  });

  describe("mapState", () => {
    it.each([
      ["new", null, "working", undefined],
      ["running", "working", "working", undefined],
      ["running", "waiting_for_approval", "waiting_for_approval", undefined],
      ["running", "finished", "finished", undefined],
      ["suspended", "inactivity", "sleeping", undefined],
      ["suspended", "usage_limit_exceeded", "stopped", "usage limit exceeded"],
      ["error", null, "stopped", "error"],
      ["exit", null, "stopped", undefined],
    ])("%s/%s -> %s", (status, detail, state, reason) => {
      expect(DevinService.mapState(status, detail)).toEqual(
        reason ? { state, reason } : { state },
      );
    });
  });

  it("shortens long titles at a word boundary", () => {
    const title = DevinService.buildTitle(
      "Refactor the authentication middleware so that it supports rotating access tokens",
    );
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.endsWith("…")).toBe(true);
    expect(title).not.toContain("  ");
  });
});
