import { AgentSession, AgentSessionState } from "../coding-agent.interface";
import { ResolveResult } from "../session-resolver.service";

export const SESSION_ARG = {
  type: "STRING",
  description:
    "Which Devin session, in the user's words: 'it', 'the latest', 'the second one', or part of its title. Empty means the session discussed last.",
};

const SPOKEN_STATE: Record<AgentSessionState, string> = {
  working: "working",
  waiting_for_user: "waiting for you",
  waiting_for_approval: "needs an approval",
  finished: "finished",
  sleeping: "asleep",
  stopped: "stopped",
};

export function spokenState(session: AgentSession): string {
  const base = SPOKEN_STATE[session.state];
  return session.stateReason ? `${base}: ${session.stateReason}` : base;
}

/**
 * Output returned to Gemini when a session reference did not resolve.
 */
export function unresolvedOutput(
  result: Exclude<ResolveResult, { status: "resolved" }>,
) {
  return result.status === "ambiguous"
    ? {
        status: "ambiguous",
        candidates: result.candidates,
        instruction: "Ask the user which of these sessions they mean.",
      }
    : { status: "not_found", message: result.message };
}
