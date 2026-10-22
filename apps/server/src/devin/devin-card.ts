import { ServerMessage } from "../types/server-message";
import { AgentSession, AgentSessionState } from "./coding-agent.interface";
import { DilemmaOption, Dilemma } from "./dilemma-parser.service";
import { SpokenSection } from "./spoken-reader.service";

export interface DevinListRow {
  index: number;
  title: string;
  state: AgentSessionState;
  url: string;
}

export type DevinCardData =
  | {
      kind: "session";
      title: string;
      state: AgentSessionState;
      stateReason?: string;
      url: string;
      latestMessage?: string;
      pullRequests: { url: string; state?: string }[];
    }
  | { kind: "list"; filter: string; sessions: DevinListRow[] }
  | {
      kind: "reading";
      title: string;
      url: string;
      sections: SpokenSection[];
      current: number;
    }
  | {
      kind: "question";
      title: string;
      url: string;
      question: string;
      options: DilemmaOption[];
      recommendation?: Dilemma["recommendation"];
    }
  | { kind: "confirm"; action: "start" | "stop"; readBack: string };

export type ClientIntegration = Extract<
  ServerMessage,
  { type: "content" }
>["integration"];

export function devinCard(data: DevinCardData): ClientIntegration {
  return { type: "devin", data };
}

export function sessionCard(
  session: AgentSession,
  latestMessage?: string,
): ClientIntegration {
  return devinCard({
    kind: "session",
    title: session.title,
    state: session.state,
    ...(session.stateReason && { stateReason: session.stateReason }),
    url: session.url,
    ...(latestMessage && { latestMessage }),
    pullRequests: session.pullRequests,
  });
}
