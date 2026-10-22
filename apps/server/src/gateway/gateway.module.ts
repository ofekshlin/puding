import { Module } from "@nestjs/common";
import { ProxyGateway } from "./proxy.gateway";
import { GeminiModule } from "../gemini/gemini.module";
import { SessionModule } from "../session/session.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [GeminiModule, SessionModule, AuthModule],
  providers: [ProxyGateway],
})
export class GatewayModule {}
