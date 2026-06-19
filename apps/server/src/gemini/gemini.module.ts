import { Module } from "@nestjs/common";
import { GeminiService } from "./gemini.service";
import { LiveSessionService } from "../session/live-session.service";

@Module({
  providers: [
    {
      provide: LiveSessionService,
      useClass: GeminiService,
    },
  ],
  exports: [LiveSessionService],
})
export class GeminiModule {}
