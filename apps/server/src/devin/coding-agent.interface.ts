export type AgentSessionState =
  | "working"
  | "waiting_for_user"
  | "waiting_for_approval"
  | "finished"
  | "sleeping"
  | "stopped";

export interface AgentPullRequest {
  url: string;
  state?: string;
}

export interface AgentSession {
  id: string;
  title: string;
  state: AgentSessionState;
  stateReason?: string;
  url: string;
  tags: string[];
  pullRequests: AgentPullRequest[];
  acusConsumed?: number;
  updatedAt: number;
}

export interface AgentMessage {
  from: "agent" | "user";
  text: string;
  at: number;
}

export type AgentIntent = "plan" | "build";

export type AgentMode = "normal" | "fast" | "lite" | "ultra" | "fusion";

export interface StartSessionInput {
  task: string;
  repo?: string;
  intent: AgentIntent;
  mode?: AgentMode;
}

export interface ListSessionsOptions {
  onlyPuding?: boolean;
  limit?: number;
}

/**
 * Error whose message is safe and friendly to speak aloud to the user.
 */
export class CodingAgentError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "CodingAgentError";
  }
}

/** The user has not connected the coding agent. */
export class AgentNotConnectedError extends CodingAgentError {
  constructor() {
    super(
      "Devin isn't connected for this user. They can connect it in Puding's Settings.",
    );
    this.name = "AgentNotConnectedError";
  }
}

export abstract class CodingAgentService {
  /**
   * Whether the agent backend can be used in this deployment at all.
   * Each call still needs the user's own connection.
   */
  abstract isConfigured(): boolean;

  /**
   * Starts a new agent session for the given task.
   */
  abstract startSession(
    userId: string,
    input: StartSessionInput,
  ): Promise<AgentSession>;

  /**
   * Lists recent sessions, most recently updated first.
   */
  abstract listSessions(
    userId: string,
    opts?: ListSessionsOptions,
  ): Promise<AgentSession[]>;

  /**
   * Retrieves a single session by id.
   */
  abstract getSession(userId: string, id: string): Promise<AgentSession>;

  /**
   * Retrieves the conversation of a session in chronological order.
   */
  abstract getMessages(
    userId: string,
    id: string,
    opts?: { last?: number },
  ): Promise<AgentMessage[]>;

  /**
   * Sends a message to a session, resuming it if it is asleep.
   */
  abstract sendMessage(
    userId: string,
    id: string,
    text: string,
  ): Promise<AgentSession>;

  /**
   * Terminates a session. This cannot be undone.
   */
  abstract stopSession(userId: string, id: string): Promise<void>;
}
