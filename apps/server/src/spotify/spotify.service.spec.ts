import { Test, TestingModule } from "@nestjs/testing";
import { SpotifyService } from "./spotify.service";
import { SpotifyAuthService } from "./spotify-auth.service";

type MockResponse = {
  ok: boolean;
  status: number;
  text: jest.Mock;
  headers: { get: (name: string) => string | null };
};

const jsonResponse = (payload: unknown, status = 200): MockResponse => ({
  ok: status >= 200 && status < 300,
  status,
  text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
  headers: { get: () => null },
});

const emptyResponse = (status = 204): MockResponse => ({
  ok: status >= 200 && status < 300,
  status,
  text: jest.fn().mockResolvedValue(""),
  headers: { get: () => null },
});

const errorResponse = (status: number, body = "error"): MockResponse => ({
  ok: false,
  status,
  text: jest.fn().mockResolvedValue(body),
  headers: { get: () => null },
});

const trackPayload = {
  tracks: {
    items: [
      {
        id: "track-id",
        uri: "spotify:track:track-id",
        name: "Bohemian Rhapsody",
        artists: [{ name: "Queen" }],
        album: {
          name: "A Night at the Opera",
          images: [{ url: "https://img/cover.jpg" }],
        },
      },
    ],
  },
};

const devicesPayload = {
  devices: [
    { id: "device-1", name: "Phone", is_active: false },
    { id: "device-2", name: "Desktop", is_active: true },
  ],
};

describe("SpotifyService", () => {
  let service: SpotifyService;
  let mockAuthService: jest.Mocked<SpotifyAuthService>;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    mockAuthService = {
      getAccessToken: jest.fn().mockResolvedValue("access-token"),
      refreshAccessToken: jest.fn().mockResolvedValue("new-access-token"),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpotifyService,
        { provide: SpotifyAuthService, useValue: mockAuthService },
      ],
    }).compile();

    service = module.get<SpotifyService>(SpotifyService);
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should map the first search result to a track", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(trackPayload) as any);

    await expect(service.searchTrack("bohemian rhapsody")).resolves.toEqual({
      id: "track-id",
      uri: "spotify:track:track-id",
      name: "Bohemian Rhapsody",
      artist: "Queen",
      album: "A Night at the Opera",
      imageUrl: "https://img/cover.jpg",
    });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain("https://api.spotify.com/v1/search?");
    expect(url).toContain("type=track");
  });

  it("should throw when the search returns no tracks", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ tracks: { items: [] } }) as any,
    );

    await expect(service.searchTrack("nonexistent")).rejects.toThrow(
      'No track matching "nonexistent" was found on Spotify.',
    );
  });

  it("should play a track on the active device", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(trackPayload) as any)
      .mockResolvedValueOnce(jsonResponse(devicesPayload) as any)
      .mockResolvedValueOnce(emptyResponse() as any);

    const result = await service.playTrack("bohemian rhapsody");

    expect(result.device).toBe("Desktop");
    const [playUrl, playInit] = fetchSpy.mock.calls[2];
    expect(playUrl).toBe(
      "https://api.spotify.com/v1/me/player/play?device_id=device-2",
    );
    expect(playInit.method).toBe("PUT");
    expect(JSON.parse(playInit.body)).toEqual({
      uris: ["spotify:track:track-id"],
    });
  });

  it("should play on an explicitly named device", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(trackPayload) as any)
      .mockResolvedValueOnce(jsonResponse(devicesPayload) as any)
      .mockResolvedValueOnce(emptyResponse() as any);

    const result = await service.playTrack("bohemian rhapsody", "phone");

    expect(result.device).toBe("Phone");
    expect(fetchSpy.mock.calls[2][0]).toContain("device_id=device-1");
  });

  it("should report when no device is available", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(trackPayload) as any)
      .mockResolvedValueOnce(jsonResponse({ devices: [] }) as any);

    await expect(service.playTrack("bohemian rhapsody")).rejects.toThrow(
      "No active Spotify device was found. Open Spotify on a device and try again.",
    );
  });

  it("should queue a track on the active device", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(trackPayload) as any)
      .mockResolvedValueOnce(jsonResponse(devicesPayload) as any)
      .mockResolvedValueOnce(emptyResponse() as any);

    await service.queueTrack("bohemian rhapsody");

    const [queueUrl, queueInit] = fetchSpy.mock.calls[2];
    expect(queueUrl).toContain("/me/player/queue?");
    expect(queueUrl).toContain("uri=spotify%3Atrack%3Atrack-id");
    expect(queueUrl).toContain("device_id=device-2");
    expect(queueInit.method).toBe("POST");
  });

  it("should add a track to a playlist matched by name", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(trackPayload) as any)
      .mockResolvedValueOnce(
        jsonResponse({
          items: [{ id: "pl-1", name: "Chill" }],
          next: "https://api.spotify.com/v1/me/playlists?offset=50",
        }) as any,
      )
      .mockResolvedValueOnce(
        jsonResponse({ items: [{ id: "pl-2", name: "Focus" }], next: null }) as any,
      )
      .mockResolvedValueOnce(jsonResponse({ snapshot_id: "snap" }, 201) as any);

    const result = await service.addTrackToPlaylist(
      "bohemian rhapsody",
      "focus",
    );

    expect(result.playlist).toEqual({ id: "pl-2", name: "Focus" });
    const [addUrl, addInit] = fetchSpy.mock.calls[3];
    expect(addUrl).toBe("https://api.spotify.com/v1/playlists/pl-2/items");
    expect(JSON.parse(addInit.body)).toEqual({
      uris: ["spotify:track:track-id"],
    });
  });

  it("should throw when no playlist matches", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(trackPayload) as any)
      .mockResolvedValueOnce(
        jsonResponse({ items: [{ id: "pl-1", name: "Chill" }], next: null }) as any,
      );

    await expect(
      service.addTrackToPlaylist("bohemian rhapsody", "Focus"),
    ).rejects.toThrow('No Spotify playlist named "Focus" was found.');
  });

  it("should refresh the access token and retry once on 401", async () => {
    fetchSpy
      .mockResolvedValueOnce(errorResponse(401, "expired") as any)
      .mockResolvedValueOnce(jsonResponse(trackPayload) as any);

    await expect(service.searchTrack("bohemian rhapsody")).resolves.toEqual(
      expect.objectContaining({ name: "Bohemian Rhapsody" }),
    );
    expect(mockAuthService.refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it("should translate 403 into a Premium requirement message", async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(403, "forbidden") as any);

    await expect(service.searchTrack("bohemian rhapsody")).rejects.toThrow(
      "Playback control requires a Spotify Premium account.",
    );
  });
});
