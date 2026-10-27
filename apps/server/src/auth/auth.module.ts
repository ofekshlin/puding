import { Module } from "@nestjs/common";
import { AccessGuard } from "./access-guard.service";
import { AuthService } from "./auth.service";
import { UserGuard } from "./user.guard";

@Module({
  providers: [AccessGuard, AuthService, UserGuard],
  exports: [AccessGuard, AuthService, UserGuard],
})
export class AuthModule {}
