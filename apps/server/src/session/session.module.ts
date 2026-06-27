import { Module } from "@nestjs/common";
import { SessionTracker } from "./session-tracker.interface";
import { SessionTrackerService } from "./session-tracker.service";
import { SessionController } from "./session.controller";

@Module({
  controllers: [SessionController],
  providers: [
    {
      provide: SessionTracker,
      useClass: SessionTrackerService,
    },
  ],
  exports: [SessionTracker],
})
export class SessionModule {}
