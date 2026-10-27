import { Module } from "@nestjs/common";
import { SignupPolicy } from "../users/signup-policy";
import { AccessGuard } from "./access-guard.service";
import { AdminGuard } from "./admin.guard";
import { AuthService } from "./auth.service";
import { UserAccessEvents } from "./user-access-events";
import { UserGuard } from "./user.guard";

const PROVIDERS = [
  AccessGuard,
  AdminGuard,
  AuthService,
  SignupPolicy,
  UserAccessEvents,
  UserGuard,
];

@Module({
  providers: PROVIDERS,
  exports: PROVIDERS,
})
export class AuthModule {}
