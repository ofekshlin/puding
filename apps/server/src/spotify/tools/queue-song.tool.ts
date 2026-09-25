import { Injectable, Inject } from "@nestjs/common";
import { GeminiTool } from "../../gemini/gemini-tool.interface";
import { MusicService } from "../music-service.interface";
import { ServerMessage } from "../../types";

@Injectable()
export class QueueSongTool extends GeminiTool {
  readonly name = "queue_song";

  readonly declaration = {
    name: this.name,
    description:
      "Adds a song to the end of the user's current Spotify playback queue without interrupting the track that is playing.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: {
          type: "STRING",
          description:
            "The song to queue, e.g., 'Redbone by Childish Gambino'. Include the artist when the user mentions one.",
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

  async execute(args: { query: string }): Promise<{
    output: any;
    clientIntegration?: Extract<
      ServerMessage,
      { type: "content" }
    >["integration"];
  }> {
    const { track, device } = await this.musicService.queueTrack(args.query);

    return {
      output: {
        status: "queued",
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
          action: "Queued",
          isPlaying: false,
        },
      },
    };
  }
}
