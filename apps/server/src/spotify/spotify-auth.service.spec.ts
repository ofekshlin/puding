import { Test, TestingModule } from "@nestjs/testing";
import { SpotifyAuthService } from "./spotify-auth.service";
import { ConfigService } from "../config/config.service";

describe("SpotifyAuthService", () => {
  let service: SpotifyAuthService;
  let mockConfigService: jest.Mocked<ConfigService>;

  const tokenResponse = (overrides: Record<string, unknown> = {}) => ({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({
      access_token: "access-token",
      expires_in: 3600,
      ...overrides,
    }),
  });

  beforeEach(async () => {
    mockConfigService = {
      getSpotifyClientId: jest.fn().mockReturnValue("client-id"),
      getSpotifyClientSecret: jest.fn().mockReturnValue("client-secret"),
      getSpotifyRefreshToken: jest.fn().mockReturnValue("refresh-token"),
      getSpotifyRedirectUri: jest
        .fn()
        .mockReturnValue("http://localhost:6601/spotify/callback"),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpotifyAuthService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SpotifyAuthService>(SpotifyAuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should report configured only when client credentials exist", () => {
    expect(service.isConfigured()).toBe(true);

    mockConfigService.getSpotifyClientSecret.mockReturnValueOnce(undefined);
    expect(service.isConfigured()).toBe(false);
  });

  it("should build an authorize URL with the required scopes", () => {
    const url = new URL(service.buildAuthorizeUrl("state-123"));

    expect(url.origin + url.pathname).toBe(
      "https://accounts.spotify.com/authorize",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:6601/spotify/callback",
    );
    expect(url.searchParams.get("scope")).toContain(
      "user-modify-playback-state",
    );
  });

  it("should throw when the refresh token is missing", async () => {
    mockConfigService.getSpotifyRefreshToken.mockReturnValue(undefined);

    await expect(service.getAccessToken()).rejects.toThrow(
      "SPOTIFY_REFRESH_TOKEN is not defined in the environment.",
    );
  });

  it("should exchange the refresh token and cache the access token", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(tokenResponse() as any);

    expect(await service.getAccessToken()).toBe("access-token");
    expect(await service.getAccessToken()).toBe("access-token");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://accounts.spotify.com/api/token");
    expect((init as any).headers.Authorization).toBe(
      `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
    );
    expect((init as any).body).toContain("grant_type=refresh_token");
  });

  it("should de-duplicate concurrent refreshes", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(tokenResponse() as any);

    await Promise.all([service.getAccessToken(), service.getAccessToken()]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("should return the refresh token from an authorization code exchange", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        tokenResponse({ refresh_token: "new-refresh-token" }) as any,
      );

    await expect(service.exchangeCode("auth-code")).resolves.toEqual({
      refreshToken: "new-refresh-token",
    });
  });

  it("should throw when Spotify rejects the token request", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue("invalid_grant"),
    } as any);

    await expect(service.getAccessToken()).rejects.toThrow(
      "Spotify token request failed with status 400.",
    );
  });
});
