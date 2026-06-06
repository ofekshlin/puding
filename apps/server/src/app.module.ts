import { Module } from "@nestjs/common";
import { GeminiModule } from "./gemini/gemini.module";
import { GatewayModule } from "./gateway/gateway.module";

@Module({
  imports: [GeminiModule, GatewayModule],
})
export class AppModule {}
