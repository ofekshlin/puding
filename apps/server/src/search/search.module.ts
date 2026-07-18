import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { SearchService } from "./search-service.interface";
import { TavilySearchService } from "./tavily-search.service";
import { SearchWebTool } from "./tools/search-web.tool";

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SearchService,
      useClass: TavilySearchService,
    },
    SearchWebTool,
  ],
  exports: [SearchService, SearchWebTool],
})
export class SearchModule {}
