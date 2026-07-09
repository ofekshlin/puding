import { Module } from "@nestjs/common";
import { GeminiService } from "./gemini.service";
import { LiveSessionService } from "../session/live-session.service";
import { SessionModule } from "../session/session.module";
import { NotionModule } from "../notion/notion.module";
import { ReadNotionPageTool } from "../notion/tools/read-notion-page.tool";
import { CreateNotionPageTool } from "../notion/tools/create-notion-page.tool";
import { WriteNotionPageTool } from "../notion/tools/write-notion-page.tool";
import { GeminiTool } from "./gemini-tool.interface";

@Module({
  imports: [SessionModule, NotionModule],
  providers: [
    {
      provide: LiveSessionService,
      useClass: GeminiService,
    },
    {
      provide: "GEMINI_TOOLS",
      useFactory: (
        read: ReadNotionPageTool,
        create: CreateNotionPageTool,
        write: WriteNotionPageTool,
      ): GeminiTool[] => [read, create, write],
      inject: [ReadNotionPageTool, CreateNotionPageTool, WriteNotionPageTool],
    },
  ],
  exports: [LiveSessionService],
})
export class GeminiModule {}
