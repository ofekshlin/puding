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
import { SpotifyModule } from "../spotify/spotify.module";
import { SpotifyAuthService } from "../spotify/spotify-auth.service";
import { PlaySongTool } from "../spotify/tools/play-song.tool";
import { QueueSongTool } from "../spotify/tools/queue-song.tool";
import { AddSongToPlaylistTool } from "../spotify/tools/add-song-to-playlist.tool";

@Module({
  imports: [SessionModule, NotionModule, SearchModule, SpotifyModule],
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
        spotifyAuth: SpotifyAuthService,
        play: PlaySongTool,
        queue: QueueSongTool,
        addToPlaylist: AddSongToPlaylistTool,
      ): GeminiTool[] => [
        read,
        create,
        write,
        search,
        ...(spotifyAuth.isConfigured() ? [play, queue, addToPlaylist] : []),
      ],
      inject: [
        ReadNotionPageTool,
        CreateNotionPageTool,
        WriteNotionPageTool,
        SearchWebTool,
        SpotifyAuthService,
        PlaySongTool,
        QueueSongTool,
        AddSongToPlaylistTool,
      ],
    },
  ],
  exports: [LiveSessionService],
})
export class GeminiModule {}
