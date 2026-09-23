import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { SpotifyAuthService } from "./spotify-auth.service";
import { SpotifyAuthController } from "./spotify-auth.controller";
import { MusicService } from "./music-service.interface";
import { SpotifyService } from "./spotify.service";
import { PlaySongTool } from "./tools/play-song.tool";
import { QueueSongTool } from "./tools/queue-song.tool";
import { AddSongToPlaylistTool } from "./tools/add-song-to-playlist.tool";

@Module({
  imports: [ConfigModule],
  controllers: [SpotifyAuthController],
  providers: [
    SpotifyAuthService,
    {
      provide: MusicService,
      useClass: SpotifyService,
    },
    PlaySongTool,
    QueueSongTool,
    AddSongToPlaylistTool,
  ],
  exports: [
    SpotifyAuthService,
    MusicService,
    PlaySongTool,
    QueueSongTool,
    AddSongToPlaylistTool,
  ],
})
export class SpotifyModule {}
