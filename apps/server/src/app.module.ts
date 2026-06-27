import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { GeminiModule } from "./gemini/gemini.module";
import { GatewayModule } from "./gateway/gateway.module";
import { SessionModule } from "./session/session.module";

@Module({
  imports: [ConfigModule, GeminiModule, GatewayModule, SessionModule],
})
export class AppModule {}
