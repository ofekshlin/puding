import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { GeminiModule } from "./gemini/gemini.module";
import { GatewayModule } from "./gateway/gateway.module";
import { SessionModule } from "./session/session.module";
import { NotionModule } from "./notion/notion.module";

@Module({
  imports: [
    ConfigModule,
    GeminiModule,
    GatewayModule,
    SessionModule,
    NotionModule,
  ],
})
export class AppModule {}
