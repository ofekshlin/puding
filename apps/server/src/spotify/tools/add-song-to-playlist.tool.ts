import { Injectable, Inject } from "@nestjs/common";
import { GeminiTool } from "../../gemini/gemini-tool.interface";
import { MusicService } from "../music-service.interface";
import { ServerMessage } from "../../types";

@Injectable()
export class AddSongToPlaylistTool extends GeminiTool {
  readonly name = "add_song_to_playlist";

  readonly declaration = {
    name: this.name,
    description:
      "Adds a song to one of the user's Spotify playlists, resolved by playlist name.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: {
          type: "STRING",
          description:
            "The song to add, e.g., 'Redbone by Childish Gambino'. Include the artist when the user mentions one.",
        },
        playlist_name: {
          type: "STRING",
          description: "The name of the target playlist, e.g., 'Focus'.",
        },
      },
      required: ["query", "playlist_name"],
    },
  };

  constructor(
    @Inject(MusicService) private readonly musicService: MusicService,
  ) {
    super();
  }

  async execute(args: { query: string; playlist_name: string }): Promise<{
    output: any;
    clientIntegration?: Extract<
      ServerMessage,
      { type: "content" }
    >["integration"];
  }> {
    const { track, playlist } = await this.musicService.addTrackToPlaylist(
      args.query,
      args.playlist_name,
    );

    return {
      output: {
        status: "added_to_playlist",
        track: track.name,
        artist: track.artist,
        playlist: playlist.name,
      },
      clientIntegration: {
        type: "spotify",
        data: {
          track: track.name,
          artist: track.artist,
          albumArt: track.imageUrl,
          action: "Added to playlist",
          playlist: playlist.name,
          isPlaying: false,
        },
      },
    };
  }
}
