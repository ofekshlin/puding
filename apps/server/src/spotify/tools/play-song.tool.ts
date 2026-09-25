import { Injectable, Inject } from "@nestjs/common";
import { GeminiTool } from "../../gemini/gemini-tool.interface";
import { MusicService } from "../music-service.interface";
import { ServerMessage } from "../../types";

@Injectable()
export class PlaySongTool extends GeminiTool {
  readonly name = "play_song";

  readonly declaration = {
    name: this.name,
    description:
      "Plays a song on the user's active Spotify device. Use for requests like 'play <song>' or 'put on <artist>'.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: {
          type: "STRING",
          description:
            "The song to play, e.g., 'Bohemian Rhapsody by Queen'. Include the artist when the user mentions one.",
        },
        device_name: {
          type: "STRING",
          description:
            "Optional device to play on, e.g., 'Kitchen speaker'. Omit to use the currently active device.",
        },
      },
      required: ["query"],
    },
  };

  constructor(
    @Inject(MusicService) private readonly musicService: MusicService,
  ) {
    super();
  }

  async execute(args: { query: string; device_name?: string }): Promise<{
    output: any;
    clientIntegration?: Extract<
      ServerMessage,
      { type: "content" }
    >["integration"];
  }> {
    const { track, device } = await this.musicService.playTrack(
      args.query,
      args.device_name,
    );

    return {
      output: {
        status: "playing",
        track: track.name,
        artist: track.artist,
        album: track.album,
        device,
      },
      clientIntegration: {
        type: "spotify",
        data: {
          track: track.name,
          artist: track.artist,
          albumArt: track.imageUrl,
          action: "Playing",
          isPlaying: true,
        },
      },
    };
  }
}
