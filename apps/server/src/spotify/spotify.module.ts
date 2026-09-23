import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { SpotifyAuthService } from "./spotify-auth.service";
import { SpotifyAuthController } from "./spotify-auth.controller";
import { MusicService } from "./music-service.interface";
import { SpotifyService } from "./spotify.service";

@Module({
  imports: [ConfigModule],
  controllers: [SpotifyAuthController],
  providers: [
    SpotifyAuthService,
    {
      provide: MusicService,
      useClass: SpotifyService,
    },
  ],
  exports: [SpotifyAuthService, MusicService],
})
export class SpotifyModule {}
