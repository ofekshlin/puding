import { Module } from "@nestjs/common";
import { NotionService } from "./notion.service";
import { NotionTokenManager } from "./notion-token-manager";
import { ConfigModule } from "../config/config.module";
import { ReadNotionPageTool } from "./tools/read-notion-page.tool";
import { CreateNotionPageTool } from "./tools/create-notion-page.tool";
import { WriteNotionPageTool } from "./tools/write-notion-page.tool";

@Module({
  imports: [ConfigModule],
  providers: [
    NotionTokenManager,
    NotionService,
    ReadNotionPageTool,
    CreateNotionPageTool,
    WriteNotionPageTool,
  ],
  exports: [
    NotionTokenManager,
    NotionService,
    ReadNotionPageTool,
    CreateNotionPageTool,
    WriteNotionPageTool,
  ],
})
export class NotionModule {}
