import { ConfigService } from "../config/config.service";
import { ReadOnlyCredentialStoreError } from "./credential-store";
import { EnvCredentialStore } from "./env-credential-store";

function configWith(overrides: Partial<Record<string, unknown>> = {}) {
  const values: Record<string, unknown> = {
    getNotionToken: "ntn_env",
    getSpotifyRefreshToken: "rt_env",
    getDevinApiKey: "cog_env",
    getDevinOrgId: "org-env",
    getDevinDefaultRepo: "ofekshlin/puding",
    getDevinRepoAliases: { puding: "ofekshlin/puding" },
    isPreview: false,
    isDevinEnabledInPreview: false,
    ...overrides,
  };
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, () => value]),
  ) as unknown as ConfigService;
}

describe("EnvCredentialStore", () => {
  it("serves today's env credentials to any user", async () => {
    const store = new EnvCredentialStore(configWith());

    expect(await store.get("local", "notion")).toMatchObject({
      kind: "static_token",
      secret: { accessToken: "ntn_env" },
    });
    expect(await store.get("anyone", "spotify")).toMatchObject({
      kind: "oauth",
      secret: { refreshToken: "rt_env" },
    });
    expect(await store.get("local", "devin")).toMatchObject({
      secret: { apiKey: "cog_env", orgId: "org-env" },
      settings: {
        defaultRepo: "ofekshlin/puding",
        repoAliases: { puding: "ofekshlin/puding" },
      },
    });
  });

  it("omits providers whose env vars are missing", async () => {
    const store = new EnvCredentialStore(
      configWith({
        getSpotifyRefreshToken: undefined,
        getDevinOrgId: undefined,
      }),
    );
    expect(await store.get("local", "spotify")).toBeNull();
    expect(await store.get("local", "devin")).toBeNull();
    expect((await store.listConnected("local")).map((c) => c.provider)).toEqual(
      ["notion"],
    );
  });

  it("keeps Devin off in previews unless DEVIN_ENABLE_IN_PREVIEW is set", async () => {
    expect(
      await new EnvCredentialStore(configWith({ isPreview: true })).get(
        "local",
        "devin",
      ),
    ).toBeNull();
    expect(
      await new EnvCredentialStore(
        configWith({ isPreview: true, isDevinEnabledInPreview: true }),
      ).get("local", "devin"),
    ).not.toBeNull();
  });

  it("is read-only, but remembers errors for the summary", async () => {
    const store = new EnvCredentialStore(configWith());
    await expect(store.delete("local", "notion")).rejects.toThrow(
      ReadOnlyCredentialStoreError,
    );
    await expect(
      store.save("local", {
        provider: "notion",
        kind: "static_token",
        secret: { accessToken: "x" },
        settings: {},
      }),
    ).rejects.toThrow(ReadOnlyCredentialStoreError);

    await store.markError("local", "spotify", "refresh token revoked");
    const summaries = await store.listConnected("local");
    expect(summaries.find((c) => c.provider === "spotify")).toMatchObject({
      source: "env",
      lastError: "refresh token revoked",
    });
    expect(JSON.stringify(summaries)).not.toMatch(/ntn_env|rt_env|cog_env/);
  });
});
