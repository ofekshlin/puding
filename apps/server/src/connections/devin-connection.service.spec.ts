import { ConfigService } from "../config/config.service";
import { CredentialStore } from "../credentials/credential-store";
import {
  DevinConnectionService,
  DevinKeyError,
} from "./devin-connection.service";

describe("DevinConnectionService", () => {
  const save = jest.fn();
  const listConnected = jest.fn().mockResolvedValue([]);
  const credentials = { save, listConnected } as unknown as CredentialStore;
  let preview = false;
  const config = {
    isPreview: () => preview,
    isDevinEnabledInPreview: () => false,
  } as unknown as ConfigService;
  const service = new DevinConnectionService(config, credentials);
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    preview = false;
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
  });

  const reason = async (input: object) => {
    try {
      await service.connect("u1", input);
    } catch (error) {
      expect(error).toBeInstanceOf(DevinKeyError);
      return (error as DevinKeyError).reason;
    }
    throw new Error("expected a DevinKeyError");
  };

  it("validates the key against the org, then saves it with its settings", async () => {
    const summary = await service.connect("u1", {
      apiKey: " cog_secret1234 ",
      orgId: "org-abc",
      defaultRepo: "ofekshlin/puding",
      repoAliases: "Web=ofekshlin/site, api = ofekshlin/api",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.devin.ai/v3/organizations/org-abc/sessions?first=1",
      expect.objectContaining({
        headers: { Authorization: "Bearer cog_secret1234" },
      }),
    );
    expect(save).toHaveBeenCalledWith("u1", {
      provider: "devin",
      kind: "static_token",
      secret: { apiKey: "cog_secret1234", orgId: "org-abc" },
      settings: {
        defaultRepo: "ofekshlin/puding",
        repoAliases: { web: "ofekshlin/site", api: "ofekshlin/api" },
        keyHint: "cog_…1234",
      },
      accountLabel: "org-abc",
    });
    expect(summary).toMatchObject({
      provider: "devin",
      accountLabel: "org-abc",
    });
    expect(JSON.stringify(summary)).not.toContain("cog_secret1234");
  });

  it("refuses legacy keys, bad org IDs, bad repos and missing fields without calling Devin", async () => {
    expect(await reason({ apiKey: "apk_x", orgId: "org-1" })).toBe(
      "legacy_key",
    );
    expect(await reason({ apiKey: "cog_x", orgId: "acme" })).toBe(
      "invalid_org",
    );
    expect(await reason({ apiKey: "cog_x" })).toBe("missing_fields");
    expect(
      await reason({ apiKey: "cog_x", orgId: "org-1", defaultRepo: "puding" }),
    ).toBe("invalid_repo");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("maps Devin's answers onto rejected or unreachable", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    expect(await reason({ apiKey: "cog_x", orgId: "org-1" })).toBe("rejected");
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    expect(await reason({ apiKey: "cog_x", orgId: "org-1" })).toBe(
      "unreachable",
    );
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await reason({ apiKey: "cog_x", orgId: "org-1" })).toBe(
      "unreachable",
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("is off on previews where Devin is disabled", async () => {
    preview = true;
    expect(await reason({ apiKey: "cog_x", orgId: "org-1" })).toBe("disabled");
  });
});
