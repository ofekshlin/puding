import { Inject, Injectable } from "@nestjs/common";
import { ToolContext } from "../gemini/gemini-tool.interface";
import { AgentSession, CodingAgentService } from "./coding-agent.interface";

export type ResolveResult =
  | { status: "resolved"; session: AgentSession }
  | { status: "ambiguous"; candidates: string[] }
  | { status: "not_found"; message: string };

interface ConversationState {
  focusId?: string;
  lastList: AgentSession[];
}

const MAX_CONVERSATIONS = 100;
const FUZZY_POOL_SIZE = 20;
const MIN_FUZZY_SCORE = 0.5;
const TIE_MARGIN = 0.15;

const ANAPHORA = new Set([
  "",
  "it",
  "that",
  "that one",
  "this",
  "this one",
  "same",
  "same one",
  "the same one",
  "current",
  "the current one",
  "the session",
  "that session",
  "this session",
]);

const RECENCY =
  /^(the )?(latest|last|newest|most recent|recent)( one| session| devin session)?$/;

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  one: 1,
  second: 2,
  two: 2,
  third: 3,
  three: 3,
  fourth: 4,
  four: 4,
  fifth: 5,
  five: 5,
  sixth: 6,
  six: 6,
  seventh: 7,
  seven: 7,
  eighth: 8,
  eight: 8,
  ninth: 9,
  nine: 9,
  tenth: 10,
  ten: 10,
};

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "one",
  "session",
  "devin",
  "about",
  "on",
  "for",
  "of",
  "to",
  "with",
  "that",
  "this",
  "my",
  "is",
  "and",
]);

/**
 * Turns what the user said ("it", "the latest", "the second one", "the login
 * bug") into a concrete agent session, tracking focus per Puding conversation.
 */
@Injectable()
export class SessionResolver {
  private readonly conversations = new Map<string, ConversationState>();

  constructor(
    @Inject(CodingAgentService)
    private readonly codingAgent: CodingAgentService,
  ) {}

  setFocus(context: ToolContext | undefined, session: AgentSession): void {
    this.state(context).focusId = session.id;
  }

  rememberList(context: ToolContext | undefined, sessions: AgentSession[]) {
    this.state(context).lastList = sessions;
  }

  async resolve(
    context: ToolContext | undefined,
    spoken?: string,
  ): Promise<ResolveResult> {
    const raw = (spoken ?? "").trim();
    const phrase = raw
      .toLowerCase()
      .replace(/[.,!?]/g, "")
      .trim();
    const state = this.state(context);

    const literal = raw.match(/devin-[a-z0-9]+/i);
    if (literal) {
      return this.resolved(
        context,
        await this.codingAgent.getSession(literal[0]),
      );
    }

    if (ANAPHORA.has(phrase)) {
      if (state.focusId) {
        return this.resolved(
          context,
          await this.codingAgent.getSession(state.focusId),
        );
      }
      return this.latest(context);
    }

    if (RECENCY.test(phrase)) return this.latest(context);

    const ordinal = SessionResolver.parseOrdinal(phrase);
    if (ordinal !== undefined) {
      const list = state.lastList.length
        ? state.lastList
        : await this.codingAgent.listSessions({ limit: 10 });
      const picked = list[ordinal - 1];
      if (!picked) {
        return {
          status: "not_found",
          message: `There is no session number ${ordinal}; the last list had ${list.length}.`,
        };
      }
      return this.resolved(context, picked);
    }

    return this.fuzzy(context, phrase);
  }

  private async latest(
    context: ToolContext | undefined,
  ): Promise<ResolveResult> {
    const [latest] = await this.codingAgent.listSessions({ limit: 1 });
    if (!latest) {
      return {
        status: "not_found",
        message: "There are no Devin sessions started from Puding yet.",
      };
    }
    return this.resolved(context, latest);
  }

  private async fuzzy(
    context: ToolContext | undefined,
    phrase: string,
  ): Promise<ResolveResult> {
    const query = SessionResolver.tokens(phrase);
    if (!query.length) {
      return {
        status: "not_found",
        message: "Which Devin session do you mean?",
      };
    }

    const pool = await this.codingAgent.listSessions({
      onlyPuding: false,
      limit: FUZZY_POOL_SIZE,
    });
    const scored = pool
      .map((session) => {
        const title = new Set(SessionResolver.tokens(session.title));
        const hits = query.filter((token) =>
          [...title].some((t) => t.startsWith(token) || token.startsWith(t)),
        ).length;
        return { session, score: hits / query.length };
      })
      .filter((s) => s.score >= MIN_FUZZY_SCORE)
      .sort((a, b) => b.score - a.score);

    if (!scored.length) {
      return {
        status: "not_found",
        message: `I couldn't find a Devin session matching "${phrase}".`,
      };
    }
    const close = scored.filter((s) => scored[0].score - s.score <= TIE_MARGIN);
    if (close.length > 1) {
      return {
        status: "ambiguous",
        candidates: close.slice(0, 3).map((s) => s.session.title),
      };
    }
    return this.resolved(context, scored[0].session);
  }

  private resolved(
    context: ToolContext | undefined,
    session: AgentSession,
  ): ResolveResult {
    this.setFocus(context, session);
    return { status: "resolved", session };
  }

  private state(context: ToolContext | undefined): ConversationState {
    const key = context?.sessionId ?? "default";
    let state = this.conversations.get(key);
    if (state) {
      // Re-insert to keep the map ordered by last use.
      this.conversations.delete(key);
    } else {
      state = { lastList: [] };
    }
    this.conversations.set(key, state);
    if (this.conversations.size > MAX_CONVERSATIONS) {
      const oldest = this.conversations.keys().next().value;
      if (oldest !== undefined) this.conversations.delete(oldest);
    }
    return state;
  }

  private static parseOrdinal(phrase: string): number | undefined {
    const match = phrase.match(
      /^(?:the |number |no )?(\d+|[a-z]+)(?:st|nd|rd|th)?(?: one| session)?$/,
    );
    if (!match) return undefined;
    const token = match[1];
    const value = /^\d+$/.test(token)
      ? parseInt(token, 10)
      : ORDINAL_WORDS[token];
    return value && value > 0 ? value : undefined;
  }

  private static tokens(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
  }
}
