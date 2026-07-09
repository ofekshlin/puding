import { Module } from "@nestjs/common";
import { NotionService } from "./notion.service";
import { ConfigModule } from "../config/config.module";
import { ReadNotionPageTool } from "./tools/read-notion-page.tool";
import { CreateNotionPageTool } from "./tools/create-notion-page.tool";
import { WriteNotionPageTool } from "./tools/write-notion-page.tool";

@Module({
  imports: [ConfigModule],
  providers: [
    NotionService,
    ReadNotionPageTool,
    CreateNotionPageTool,
    WriteNotionPageTool,
  ],
  exports: [
    NotionService,
    ReadNotionPageTool,
    CreateNotionPageTool,
    WriteNotionPageTool,
  ],
})
export class NotionModule {}
