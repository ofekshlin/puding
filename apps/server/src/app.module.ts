import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { GeminiModule } from "./gemini/gemini.module";
import { GatewayModule } from "./gateway/gateway.module";
import { SessionModule } from "./session/session.module";
import { NotionModule } from "./notion/notion.module";
import { SearchModule } from "./search/search.module";
import { SpotifyModule } from "./spotify/spotify.module";
import { HealthModule } from "./health/health.module";
import { DatabaseModule } from "./database/database.module";
import { UsersModule } from "./users/users.module";
import { ConnectionsModule } from "./connections/connections.module";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    GeminiModule,
    GatewayModule,
    SessionModule,
    NotionModule,
    SearchModule,
    SpotifyModule,
    HealthModule,
    UsersModule,
    ConnectionsModule,
  ],
})
export class AppModule {}
