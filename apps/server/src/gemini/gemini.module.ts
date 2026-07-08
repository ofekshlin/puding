import { Module } from "@nestjs/common";
import { GeminiService } from "./gemini.service";
import { LiveSessionService } from "../session/live-session.service";
import { SessionModule } from "../session/session.module";
import { NotionModule } from "../notion/notion.module";

@Module({
  imports: [SessionModule, NotionModule],
  providers: [
    {
      provide: LiveSessionService,
      useClass: GeminiService,
    },
  ],
  exports: [LiveSessionService],
})
export class GeminiModule {}
