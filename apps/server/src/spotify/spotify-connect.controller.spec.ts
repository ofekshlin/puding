import { ConflictException } from "@nestjs/common";
import { ConfigService } from "../config/config.service";
import { OAuthStateService } from "../connections/oauth-state";
import { CredentialStore } from "../credentials/credential-store";
import { PudingUser } from "../users/user-directory";
import { SpotifyAuthService } from "./spotify-auth.service";
import { SpotifyConnectController } from "./spotify-connect.controller";

const USER: PudingUser = {
  id: "u1",
  email: "a@b.c",
  role: "user",
  status: "approved",
};

describe("SpotifyConnectController", () => {
  const spotify = {
    isConfigured: jest.fn().mockReturnValue(true),
    buildAuthorizeUrl: jest.fn(
      (state: string) => `https://spotify/?s=${state}`,
    ),
    exchangeCode: jest.fn(),
    fetchProfile: jest.fn(),
  };
  const states = {
    isAvailable: () => true,
    issue: jest.fn().mockResolvedValue("signed-state"),
    consume: jest.fn(),
  };
  const credentials = { get: jest.fn(), save: jest.fn() };
  let envOwner: string | undefined;
  const config = {
    getWebOrigins: () => ["https://puding.app"],
    getSpotifyRefreshToken: () => envOwner,
    getEnvCredentialsScope: () => "admins",
  } as unknown as ConfigService;
  const controller = new SpotifyConnectController(
    spotify as unknown as SpotifyAuthService,
    states as unknown as OAuthStateService,
    credentials as unknown as CredentialStore,
    config,
    null,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    envOwner = undefined;
    credentials.get.mockResolvedValue(null);
  });

  it("returns a consent URL with a state bound to the signed-in user", async () => {
    expect(await controller.authorize(USER)).toEqual({
      url: "https://spotify/?s=signed-state",
    });
    expect(states.issue).toHaveBeenCalledWith("u1", "spotify");
  });

  it("stores the refresh token and display name for the state's user", async () => {
    states.consume.mockResolvedValue("u1");
    spotify.exchangeCode.mockResolvedValue({
      refreshToken: "rt",
      accessToken: "at",
    });
    spotify.fetchProfile.mockResolvedValue({ kind: "ok", label: "Ofek" });
    expect(await controller.callback("code", "state")).toEqual({
      url: "https://puding.app/settings?connected=spotify",
    });
    expect(credentials.save).toHaveBeenCalledWith("u1", {
      provider: "spotify",
      kind: "oauth",
      secret: { refreshToken: "rt" },
      settings: {},
      accountLabel: "Ofek",
    });
  });

  it("refuses an invalid state before touching the code", async () => {
    states.consume.mockResolvedValue(null);
    expect(await controller.callback("code", "bad")).toEqual({
      url: "https://puding.app/settings?error=spotify_state",
    });
    expect(spotify.exchangeCode).not.toHaveBeenCalled();
  });

  it("reports accounts missing from the app's user list without saving", async () => {
    states.consume.mockResolvedValue("u1");
    spotify.exchangeCode.mockResolvedValue({
      refreshToken: "rt",
      accessToken: "at",
    });
    spotify.fetchProfile.mockResolvedValue({ kind: "not_allowlisted" });
    expect(await controller.callback("code", "state")).toEqual({
      url: "https://puding.app/settings?error=spotify_not_allowlisted",
    });
    expect(credentials.save).not.toHaveBeenCalled();
  });

  it("maps a declined consent screen and a failed exchange", async () => {
    states.consume.mockResolvedValue("u1");
    expect(
      await controller.callback(undefined, "state", "access_denied"),
    ).toEqual({ url: "https://puding.app/settings?error=spotify_denied" });
    spotify.exchangeCode.mockRejectedValue(new Error("boom"));
    expect(await controller.callback("code", "state")).toEqual({
      url: "https://puding.app/settings?error=spotify_failed",
    });
  });

  it("counts the env owner as a slot", async () => {
    envOwner = "rt";
    expect(await controller.slots()).toEqual({
      used: 1,
      max: 5,
      available: true,
    });
  });

  it("refuses new users once every slot is taken", async () => {
    const full = new SpotifyConnectController(
      spotify as unknown as SpotifyAuthService,
      states as unknown as OAuthStateService,
      credentials as unknown as CredentialStore,
      config,
      null,
    );
    jest
      .spyOn(
        full as unknown as { usedSlots: () => Promise<number> },
        "usedSlots",
      )
      .mockResolvedValue(5);
    await expect(full.authorize(USER)).rejects.toThrow(ConflictException);
    credentials.get.mockResolvedValue({ provider: "spotify" });
    await expect(full.authorize(USER)).resolves.toEqual({
      url: "https://spotify/?s=signed-state",
    });
  });
});
