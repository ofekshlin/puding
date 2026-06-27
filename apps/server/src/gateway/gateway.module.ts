import { Module } from "@nestjs/common";
import { ProxyGateway } from "./proxy.gateway";
import { GeminiModule } from "../gemini/gemini.module";
import { SessionModule } from "../session/session.module";

@Module({
  imports: [GeminiModule, SessionModule],
  providers: [ProxyGateway],
})
export class GatewayModule {}
