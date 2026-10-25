import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminController } from "./admin.controller";
import { MeController } from "./me.controller";

@Module({
  imports: [AuthModule],
  controllers: [MeController, AdminController],
})
export class UsersModule {}
