import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { CodingAgentService } from "./coding-agent.interface";
import { DevinService } from "./devin.service";

@Module({
  imports: [ConfigModule],
  providers: [{ provide: CodingAgentService, useClass: DevinService }],
  exports: [CodingAgentService],
})
export class DevinModule {}
