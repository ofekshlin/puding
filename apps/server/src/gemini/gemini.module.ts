import { Module } from "@nestjs/common";
import { GeminiService } from "./gemini.service";
import { LiveSessionService } from "../session/live-session.service";
import { SessionModule } from "../session/session.module";
import { NotionModule } from "../notion/notion.module";
import { ReadNotionPageTool } from "../notion/tools/read-notion-page.tool";
import { CreateNotionPageTool } from "../notion/tools/create-notion-page.tool";
import { WriteNotionPageTool } from "../notion/tools/write-notion-page.tool";
import { GeminiTool } from "./gemini-tool.interface";
import { SearchModule } from "../search/search.module";
import { SearchWebTool } from "../search/tools/search-web.tool";

@Module({
  imports: [SessionModule, NotionModule, SearchModule],
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
        search: SearchWebTool,
      ): GeminiTool[] => [read, create, write, search],
      inject: [
        ReadNotionPageTool,
        CreateNotionPageTool,
        WriteNotionPageTool,
        SearchWebTool,
      ],
    },
  ],
  exports: [LiveSessionService],
})
export class GeminiModule {}
