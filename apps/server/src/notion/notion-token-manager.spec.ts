import { ConfigService } from "../config/config.service";
import { CredentialStore } from "../credentials/credential-store";
import { StoredCredential } from "../credentials/credential.types";
import { NotionTokenManager } from "./notion-token-manager";

describe("NotionTokenManager", () => {
  const config = {
    getNotionOAuthClientId: () => "client-id",
    getNotionOAuthClientSecret: () => "client-secret",
    getNotionOAuthRedirectUri: () =>
      "https://api.puding/connections/notion/callback",
  } as unknown as ConfigService;
  const credentials = {
    save: jest.fn().mockResolvedValue(undefined),
    markError: jest.fn().mockResolvedValue(undefined),
  };
  const manager = new NotionTokenManager(
    config,
    credentials as unknown as CredentialStore,
  );
  const oauth = (expiresAt?: Date): StoredCredential<"notion"> => ({
    provider: "notion",
    kind: "oauth",
    secret: { accessToken: "old", refreshToken: "rt" },
    settings: { workspaceId: "w" },
    accountLabel: "Ofek's workspace",
    expiresAt,
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("builds a user-owned consent URL", () => {
    const url = new URL(manager.buildAuthorizeUrl("s"));
    expect(url.origin + url.pathname).toBe(
      "https://api.notion.com/v1/oauth/authorize",
    );
    expect(url.searchParams.get("owner")).toBe("user");
    expect(url.searchParams.get("state")).toBe("s");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://api.puding/connections/notion/callback",
    );
  });

  it("exchanges a code with Basic auth and maps the workspace", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "at",
        refresh_token: "rt",
        expires_in: 3600,
        workspace_id: "w",
        workspace_name: "Ofek's workspace",
        workspace_icon: "🍮",
      }),
    } as Response);
    const tokens = await manager.exchangeCode("code");
    expect(tokens).toMatchObject({
      accessToken: "at",
      refreshToken: "rt",
      workspaceName: "Ofek's workspace",
      workspaceIcon: "🍮",
    });
    expect(tokens.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    const [, init] = fetchMock.mock.calls[0];
    expect((init!.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
    );
    expect(JSON.parse(init!.body as string)).toMatchObject({
      grant_type: "authorization_code",
      code: "code",
    });
  });

  it("passes static and fresh tokens through untouched", async () => {
    const fetchMock = jest.spyOn(global, "fetch");
    await expect(
      manager.accessTokenFor("u1", {
        ...oauth(),
        kind: "static_token",
        secret: { accessToken: "pasted" },
      }),
    ).resolves.toBe("pasted");
    await expect(
      manager.accessTokenFor("u1", oauth(new Date(Date.now() + 3_600_000))),
    ).resolves.toBe("old");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes an expiring token once and stores the rotation", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "new",
        refresh_token: "rt2",
        expires_in: 3600,
      }),
    } as Response);
    const expiring = oauth(new Date(Date.now() + 1000));
    const [a, b] = await Promise.all([
      manager.accessTokenFor("u1", expiring),
      manager.accessTokenFor("u1", expiring),
    ]);
    expect([a, b]).toEqual(["new", "new"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(credentials.save).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        secret: { accessToken: "new", refreshToken: "rt2" },
        accountLabel: "Ofek's workspace",
      }),
    );
  });

  it("marks the connection for reconnecting on invalid_grant only", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => "bad gateway",
    } as Response);
    await expect(
      manager.accessTokenFor("u1", oauth(new Date(0))),
    ).rejects.toThrow();
    expect(credentials.markError).not.toHaveBeenCalled();

    jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid_grant"}',
    } as Response);
    await expect(
      manager.accessTokenFor("u1", oauth(new Date(0))),
    ).rejects.toThrow();
    expect(credentials.markError).toHaveBeenCalledWith(
      "u1",
      "notion",
      expect.stringContaining("Reconnect"),
    );
  });

  it("validates pasted tokens", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ bot: { workspace_name: "Team" } }),
    } as Response);
    await expect(manager.validateToken("ntn_x")).resolves.toEqual({
      ok: true,
      workspaceName: "Team",
    });
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    await expect(manager.validateToken("bad")).resolves.toEqual({
      ok: false,
      reason: "rejected",
    });
    jest.spyOn(global, "fetch").mockRejectedValueOnce(new Error("offline"));
    await expect(manager.validateToken("x")).resolves.toEqual({
      ok: false,
      reason: "unreachable",
    });
  });
});
