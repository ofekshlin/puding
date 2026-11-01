import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ConfigModule } from "../config/config.module";
import { ConnectionsController } from "./connections.controller";
import { DevinConnectionService } from "./devin-connection.service";

@Module({
  imports: [AuthModule, ConfigModule],
  controllers: [ConnectionsController],
  providers: [DevinConnectionService],
})
export class ConnectionsModule {}
