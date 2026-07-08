import { Module } from "@nestjs/common";
import { NotionService } from "./notion.service";
import { ConfigModule } from "../config/config.module";

@Module({
  imports: [ConfigModule],
  providers: [NotionService],
  exports: [NotionService],
})
export class NotionModule {}
