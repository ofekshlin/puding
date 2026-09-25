import { Test, TestingModule } from "@nestjs/testing";
import { MusicService } from "../music-service.interface";
import { PlaySongTool } from "./play-song.tool";
import { QueueSongTool } from "./queue-song.tool";
import { AddSongToPlaylistTool } from "./add-song-to-playlist.tool";

const track = {
  id: "track-id",
  uri: "spotify:track:track-id",
  name: "Bohemian Rhapsody",
  artist: "Queen",
  album: "A Night at the Opera",
  imageUrl: "https://img/cover.jpg",
};

describe("Spotify tools", () => {
  let playTool: PlaySongTool;
  let queueTool: QueueSongTool;
  let playlistTool: AddSongToPlaylistTool;
  let mockMusicService: jest.Mocked<MusicService>;

  beforeEach(async () => {
    mockMusicService = {
      searchTrack: jest.fn(),
      playTrack: jest.fn(),
      queueTrack: jest.fn(),
      addTrackToPlaylist: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaySongTool,
        QueueSongTool,
        AddSongToPlaylistTool,
        { provide: MusicService, useValue: mockMusicService },
      ],
    }).compile();

    playTool = module.get(PlaySongTool);
    queueTool = module.get(QueueSongTool);
    playlistTool = module.get(AddSongToPlaylistTool);
  });

  it("should declare tool names matching their declarations", () => {
    expect(playTool.name).toBe("play_song");
    expect(playTool.declaration.name).toBe("play_song");
    expect(playTool.declaration.parameters.required).toEqual(["query"]);

    expect(queueTool.name).toBe("queue_song");
    expect(queueTool.declaration.name).toBe("queue_song");

    expect(playlistTool.name).toBe("add_song_to_playlist");
    expect(playlistTool.declaration.name).toBe("add_song_to_playlist");
    expect(playlistTool.declaration.parameters.required).toEqual([
      "query",
      "playlist_name",
    ]);
  });

  it("should play a song and emit a Spotify integration payload", async () => {
    mockMusicService.playTrack.mockResolvedValue({ track, device: "Desktop" });

    const result = await playTool.execute({
      query: "bohemian rhapsody",
      device_name: "Desktop",
    });

    expect(mockMusicService.playTrack).toHaveBeenCalledWith(
      "bohemian rhapsody",
      "Desktop",
    );
    expect(result.output).toEqual({
      status: "playing",
      track: "Bohemian Rhapsody",
      artist: "Queen",
      album: "A Night at the Opera",
      device: "Desktop",
    });
    expect(result.clientIntegration).toEqual({
      type: "spotify",
      data: {
        track: "Bohemian Rhapsody",
        artist: "Queen",
        albumArt: "https://img/cover.jpg",
        action: "Playing",
        isPlaying: true,
      },
    });
  });

  it("should queue a song", async () => {
    mockMusicService.queueTrack.mockResolvedValue({ track, device: "Phone" });

    const result = await queueTool.execute({ query: "bohemian rhapsody" });

    expect(mockMusicService.queueTrack).toHaveBeenCalledWith(
      "bohemian rhapsody",
    );
    expect(result.output.status).toBe("queued");
    expect(result.clientIntegration?.data).toEqual(
      expect.objectContaining({ action: "Queued", isPlaying: false }),
    );
  });

  it("should add a song to a playlist", async () => {
    mockMusicService.addTrackToPlaylist.mockResolvedValue({
      track,
      playlist: { id: "pl-1", name: "Focus" },
    });

    const result = await playlistTool.execute({
      query: "bohemian rhapsody",
      playlist_name: "Focus",
    });

    expect(mockMusicService.addTrackToPlaylist).toHaveBeenCalledWith(
      "bohemian rhapsody",
      "Focus",
    );
    expect(result.output).toEqual({
      status: "added_to_playlist",
      track: "Bohemian Rhapsody",
      artist: "Queen",
      playlist: "Focus",
    });
    expect(result.clientIntegration?.data).toEqual(
      expect.objectContaining({
        action: "Added to playlist",
        playlist: "Focus",
      }),
    );
  });

  it("should propagate music service errors", async () => {
    mockMusicService.playTrack.mockRejectedValue(
      new Error("No active Spotify device was found."),
    );

    await expect(playTool.execute({ query: "anything" })).rejects.toThrow(
      "No active Spotify device was found.",
    );
  });
});
