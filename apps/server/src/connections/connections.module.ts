import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ConfigModule } from "../config/config.module";
import { NotionConnectController } from "../notion/notion-connect.controller";
import { NotionModule } from "../notion/notion.module";
import { SpotifyConnectController } from "../spotify/spotify-connect.controller";
import { SpotifyModule } from "../spotify/spotify.module";
import { ConnectionsController } from "./connections.controller";
import { DevinConnectionService } from "./devin-connection.service";
import { OAuthStateService } from "./oauth-state";

@Module({
  imports: [AuthModule, ConfigModule, NotionModule, SpotifyModule],
  controllers: [
    NotionConnectController,
    SpotifyConnectController,
    ConnectionsController,
  ],
  providers: [DevinConnectionService, OAuthStateService],
})
export class ConnectionsModule {}
