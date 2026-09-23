import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { SpotifyAuthService } from "./spotify-auth.service";
import { SpotifyAuthController } from "./spotify-auth.controller";

@Module({
  imports: [ConfigModule],
  controllers: [SpotifyAuthController],
  providers: [SpotifyAuthService],
  exports: [SpotifyAuthService],
})
export class SpotifyModule {}
