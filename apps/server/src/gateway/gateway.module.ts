import { Module } from "@nestjs/common";
import { ProxyGateway } from "./proxy.gateway";
import { GeminiModule } from "../gemini/gemini.module";

@Module({
  imports: [GeminiModule],
  providers: [ProxyGateway],
})
export class GatewayModule {}
