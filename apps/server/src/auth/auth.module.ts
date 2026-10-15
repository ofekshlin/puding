import { Module } from "@nestjs/common";
import { AccessGuard } from "./access-guard.service";

@Module({
  providers: [AccessGuard],
  exports: [AccessGuard],
})
export class AuthModule {}
