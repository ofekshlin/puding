import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { CodingAgentService } from "./coding-agent.interface";
import { DevinService } from "./devin.service";
import { SessionResolver } from "./session-resolver.service";
import { StartDevinSessionTool } from "./tools/start-devin-session.tool";
import { ListDevinSessionsTool } from "./tools/list-devin-sessions.tool";
import { GetDevinSessionTool } from "./tools/get-devin-session.tool";
import { MessageDevinSessionTool } from "./tools/message-devin-session.tool";
import { StopDevinSessionTool } from "./tools/stop-devin-session.tool";
import { ReadDevinMessageTool } from "./tools/read-devin-message.tool";
import { AnswerDevinQuestionTool } from "./tools/answer-devin-question.tool";
import { SpokenReader } from "./spoken-reader.service";
import { DilemmaParser } from "./dilemma-parser.service";

const DEVIN_TOOLS = [
  StartDevinSessionTool,
  ListDevinSessionsTool,
  GetDevinSessionTool,
  MessageDevinSessionTool,
  StopDevinSessionTool,
  ReadDevinMessageTool,
  AnswerDevinQuestionTool,
];

@Module({
  imports: [ConfigModule],
  providers: [
    { provide: CodingAgentService, useClass: DevinService },
    SessionResolver,
    SpokenReader,
    DilemmaParser,
    ...DEVIN_TOOLS,
  ],
  exports: [CodingAgentService, SessionResolver, ...DEVIN_TOOLS],
})
export class DevinModule {}
