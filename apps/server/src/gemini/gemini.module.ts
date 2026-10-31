import { Module } from "@nestjs/common";
import { GeminiService } from "./gemini.service";
import { SessionToolResolver } from "./session-tool-resolver";
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
import { ConfigService } from "../config/config.service";
import { DevinModule } from "../devin/devin.module";
import { CodingAgentService } from "../devin/coding-agent.interface";
import { devinEnabled } from "../devin/devin-watcher.service";
import { StartDevinSessionTool } from "../devin/tools/start-devin-session.tool";
import { ListDevinSessionsTool } from "../devin/tools/list-devin-sessions.tool";
import { GetDevinSessionTool } from "../devin/tools/get-devin-session.tool";
import { MessageDevinSessionTool } from "../devin/tools/message-devin-session.tool";
import { StopDevinSessionTool } from "../devin/tools/stop-devin-session.tool";
import { ReadDevinMessageTool } from "../devin/tools/read-devin-message.tool";
import { AnswerDevinQuestionTool } from "../devin/tools/answer-devin-question.tool";

@Module({
  imports: [
    SessionModule,
    NotionModule,
    SearchModule,
    SpotifyModule,
    DevinModule,
  ],
  providers: [
    SessionToolResolver,
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
        config: ConfigService,
        codingAgent: CodingAgentService,
        startDevin: StartDevinSessionTool,
        listDevin: ListDevinSessionsTool,
        getDevin: GetDevinSessionTool,
        messageDevin: MessageDevinSessionTool,
        stopDevin: StopDevinSessionTool,
        readDevin: ReadDevinMessageTool,
        answerDevin: AnswerDevinQuestionTool,
      ): GeminiTool[] => [
        read,
        create,
        write,
        search,
        ...(spotifyAuth.isConfigured() ? [play, queue, addToPlaylist] : []),
        ...(devinEnabled(config, codingAgent)
          ? [
              startDevin,
              listDevin,
              getDevin,
              messageDevin,
              stopDevin,
              readDevin,
              answerDevin,
            ]
          : []),
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
        ConfigService,
        CodingAgentService,
        StartDevinSessionTool,
        ListDevinSessionsTool,
        GetDevinSessionTool,
        MessageDevinSessionTool,
        StopDevinSessionTool,
        ReadDevinMessageTool,
        AnswerDevinQuestionTool,
      ],
    },
  ],
  exports: [LiveSessionService],
})
export class GeminiModule {}
