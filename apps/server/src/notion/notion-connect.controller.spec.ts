import { BadRequestException, ConflictException } from "@nestjs/common";
import { ConfigService } from "../config/config.service";
import { OAuthStateService } from "../connections/oauth-state";
import {
  CredentialStore,
  ReadOnlyCredentialStoreError,
} from "../credentials/credential-store";
import { PudingUser } from "../users/user-directory";
import { NotionConnectController } from "./notion-connect.controller";
import { NotionTokenManager } from "./notion-token-manager";

const USER: PudingUser = {
  id: "u1",
  email: "a@b.c",
  role: "user",
  status: "approved",
};

describe("NotionConnectController", () => {
  const notion = {
    isConfigured: jest.fn().mockReturnValue(true),
    buildAuthorizeUrl: jest.fn((s: string) => `https://notion/?s=${s}`),
    exchangeCode: jest.fn(),
    validateToken: jest.fn(),
  };
  const states = {
    isAvailable: () => true,
    issue: jest.fn().mockResolvedValue("signed"),
    consume: jest.fn(),
  };
  const credentials = {
    save: jest.fn(),
    listConnected: jest.fn().mockResolvedValue([]),
  };
  const controller = new NotionConnectController(
    notion as unknown as NotionTokenManager,
    states as unknown as OAuthStateService,
    credentials as unknown as CredentialStore,
    { getWebOrigins: () => ["https://puding.app"] } as unknown as ConfigService,
  );

  beforeEach(() => jest.clearAllMocks());

  it("issues a notion-bound state for the signed-in user", async () => {
    expect(await controller.authorize(USER)).toEqual({
      url: "https://notion/?s=signed",
    });
    expect(states.issue).toHaveBeenCalledWith("u1", "notion");
  });

  it("stores the OAuth tokens and workspace for the state's user", async () => {
    const expiresAt = new Date();
    states.consume.mockResolvedValue("u1");
    notion.exchangeCode.mockResolvedValue({
      accessToken: "at",
      refreshToken: "rt",
      expiresAt,
      workspaceId: "w",
      workspaceName: "Ofek's workspace",
      workspaceIcon: "🍮",
    });
    expect(await controller.callback("code", "state")).toEqual({
      url: "https://puding.app/settings?connected=notion",
    });
    expect(credentials.save).toHaveBeenCalledWith("u1", {
      provider: "notion",
      kind: "oauth",
      secret: { accessToken: "at", refreshToken: "rt" },
      settings: { workspaceId: "w", workspaceIcon: "🍮" },
      accountLabel: "Ofek's workspace",
      expiresAt,
    });
  });

  it("rejects bad states before exchanging, and maps declines and failures", async () => {
    states.consume.mockResolvedValueOnce(null);
    expect(await controller.callback("code", "bad")).toEqual({
      url: "https://puding.app/settings?error=notion_state",
    });
    expect(notion.exchangeCode).not.toHaveBeenCalled();
    states.consume.mockResolvedValue("u1");
    expect(await controller.callback(undefined, "s", "access_denied")).toEqual({
      url: "https://puding.app/settings?error=notion_denied",
    });
    notion.exchangeCode.mockRejectedValue(new Error("boom"));
    expect(await controller.callback("code", "s")).toEqual({
      url: "https://puding.app/settings?error=notion_failed",
    });
  });

  it("saves a pasted token only after Notion accepts it", async () => {
    await expect(controller.pasteToken(USER, {})).rejects.toThrow(
      BadRequestException,
    );
    notion.validateToken.mockResolvedValueOnce({
      ok: false,
      reason: "rejected",
    });
    await expect(controller.pasteToken(USER, { token: "bad" })).rejects.toThrow(
      BadRequestException,
    );
    expect(credentials.save).not.toHaveBeenCalled();

    notion.validateToken.mockResolvedValue({ ok: true, workspaceName: "Team" });
    const summary = await controller.pasteToken(USER, { token: " ntn_x " });
    expect(credentials.save).toHaveBeenCalledWith("u1", {
      provider: "notion",
      kind: "static_token",
      secret: { accessToken: "ntn_x" },
      settings: {},
      accountLabel: "Team",
    });
    expect(summary).not.toHaveProperty("secret");
  });

  it("maps a read-only store to 409", async () => {
    notion.validateToken.mockResolvedValue({ ok: true });
    credentials.save.mockRejectedValueOnce(
      new ReadOnlyCredentialStoreError("notion"),
    );
    await expect(controller.pasteToken(USER, { token: "t" })).rejects.toThrow(
      ConflictException,
    );
  });
});
