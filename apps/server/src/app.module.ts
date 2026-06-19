import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { GeminiModule } from "./gemini/gemini.module";
import { GatewayModule } from "./gateway/gateway.module";

@Module({
  imports: [ConfigModule, GeminiModule, GatewayModule],
})
export class AppModule {}
