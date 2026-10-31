import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "../config/config.service";
import { ConnectionEvents } from "../credentials/connection-events";
import {
  AgentSession,
  AgentSessionState,
  CodingAgentService,
} from "./coding-agent.interface";
import { ClientIntegration, sessionCard } from "./devin-card";
import { DilemmaParser } from "./dilemma-parser.service";
import { SpokenReader } from "./spoken-reader.service";
import { spokenState } from "./tools/devin-tool.helpers";

export interface DevinSessionUpdate {
  devinId: string;
  state: AgentSessionState;
  /** System note for the voice model, sent when it is idle. */
  note: string;
  card: ClientIntegration;
}

export interface DevinUpdateSubscriber {
  readonly sessionId: string;
  /** Updates come from this user's own Devin sessions only. */
  readonly userId: string;
  onDevinUpdate(update: DevinSessionUpdate): void;
}

const NOTIFY_STATES = new Set<AgentSessionState>([
  "waiting_for_user",
  "waiting_for_approval",
  "finished",
  "stopped",
]);

/**
 * Whether Devin voice tools (and updates) are enabled for this deployment.
 */
export function devinEnabled(
  config: ConfigService,
  codingAgent: CodingAgentService,
): boolean {
  return (
    codingAgent.isConfigured() &&
    (!config.isPreview() || config.isDevinEnabledInPreview())
  );
}

interface UserLoop {
  readonly userId: string;
  readonly subscribers: Set<DevinUpdateSubscriber>;
  readonly lastStates: Map<string, AgentSessionState>;
  timer?: NodeJS.Timeout;
  seeded: boolean;
  polling: boolean;
  /** Bumped on stop so polls that outlive their subscribers are discarded. */
  generation: number;
}

/**
 * Polls each connected user's Puding-started Devin sessions with that user's
 * own key, and tells that user's voice sessions when one starts waiting,
 * finishes or stops. A user is only polled while they have a session open.
 */
@Injectable()
export class DevinWatcher implements OnModuleDestroy {
  private readonly logger = new Logger(DevinWatcher.name);
  private readonly loops = new Map<string, UserLoop>();

  constructor(
    @Inject(CodingAgentService)
    private readonly codingAgent: CodingAgentService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DilemmaParser) private readonly dilemmas: DilemmaParser,
    @Inject(SpokenReader) private readonly reader: SpokenReader,
    @Inject(ConnectionEvents) connectionEvents: ConnectionEvents,
  ) {
    connectionEvents.onChanged((userId, provider) => {
      if (provider === "devin") this.forget(userId);
    });
  }

  isEnabled(): boolean {
    return devinEnabled(this.config, this.codingAgent);
  }

  /** Users currently being polled. */
  get watchedUsers(): number {
    return this.loops.size;
  }

  /**
   * Subscribes a voice session; its user is polled while someone listens.
   * Returns the unsubscribe function.
   */
  subscribe(subscriber: DevinUpdateSubscriber): () => void {
    if (!this.isEnabled()) return () => undefined;
    let loop = this.loops.get(subscriber.userId);
    if (!loop) {
      if (this.loops.size >= this.config.getDevinMaxWatchedUsers()) {
        this.logger.warn(
          `Not watching Devin for user ${subscriber.userId}: ${this.loops.size} users already watched.`,
        );
        return () => undefined;
      }
      loop = {
        userId: subscriber.userId,
        subscribers: new Set(),
        lastStates: new Map(),
        seeded: false,
        polling: false,
        generation: 0,
      };
      this.loops.set(subscriber.userId, loop);
    }
    loop.subscribers.add(subscriber);
    if (!loop.timer) {
      this.logger.log(`Starting Devin polling for user ${loop.userId}.`);
      const userId = loop.userId;
      loop.timer = setInterval(
        () => void this.poll(userId),
        this.config.getDevinPollIntervalMs(),
      );
      void this.poll(userId);
    }
    const subscribed = loop;
    return () => this.unsubscribe(subscribed, subscriber);
  }

  /** Stops polling a user, e.g. after their Devin connection changed. */
  forget(userId: string): void {
    const loop = this.loops.get(userId);
    if (loop) this.stop(loop);
  }

  onModuleDestroy(): void {
    for (const loop of [...this.loops.values()]) this.stop(loop);
  }

  /**
   * One polling pass for a user. The first pass after (re)starting only
   * records state.
   */
  async poll(userId: string): Promise<void> {
    const loop = this.loops.get(userId);
    if (!loop || loop.polling) return;
    loop.polling = true;
    const generation = loop.generation;
    try {
      const sessions = await this.codingAgent.listSessions(loop.userId, {
        limit: 20,
      });
      if (!this.isCurrent(loop, generation)) return;
      const changed = sessions.filter((s) => {
        const previous = loop.lastStates.get(s.id);
        loop.lastStates.set(s.id, s.state);
        return (
          loop.seeded && previous !== s.state && NOTIFY_STATES.has(s.state)
        );
      });
      loop.seeded = true;
      for (const session of changed) {
        await this.announce(loop, session, generation);
      }
    } catch (err) {
      this.logger.warn(
        `Devin polling failed for user ${loop.userId}: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      loop.polling = false;
    }
  }

  private isCurrent(loop: UserLoop, generation: number): boolean {
    return (
      generation === loop.generation &&
      loop.subscribers.size > 0 &&
      this.loops.get(loop.userId) === loop
    );
  }

  private async announce(
    loop: UserLoop,
    session: AgentSession,
    generation: number,
  ): Promise<void> {
    let latest: string | undefined;
    try {
      const messages = await this.codingAgent.getMessages(
        loop.userId,
        session.id,
        {
          last: 5,
        },
      );
      latest = [...messages].reverse().find((m) => m.from === "agent")?.text;
    } catch (err) {
      this.logger.warn(
        `Could not read messages for ${session.id}: ${err instanceof Error ? err.message : err}`,
      );
    }

    if (!this.isCurrent(loop, generation)) return;

    const dilemma =
      latest && session.state === "waiting_for_user"
        ? this.dilemmas.parse(latest)
        : undefined;
    const parts = [
      `[Devin update] Session "${session.title}" is now ${spokenState(session)}.`,
    ];
    if (dilemma) {
      parts.push(
        `Devin has a question with ${dilemma.options.length} options; if the user wants to hear it, call read_devin_message with what="question".`,
      );
    } else if (latest) {
      parts.push(
        "Devin's latest message is on the user's screen; offer to read it with read_devin_message.",
      );
    }
    // Devin's own text is never put in this turn: it is untrusted input and
    // must not be able to instruct the voice model.
    parts.push(
      "Tell the user in one sentence and offer next steps. Do not call any tool unless they ask.",
    );

    const update: DevinSessionUpdate = {
      devinId: session.id,
      state: session.state,
      note: parts.join(" "),
      card: sessionCard(session, latest),
    };
    this.logger.log(
      `Announcing ${session.id} -> ${session.state} (user ${loop.userId})`,
    );
    for (const subscriber of loop.subscribers) {
      if (dilemma) {
        this.reader.rememberDilemma(
          { sessionId: subscriber.sessionId, userId: subscriber.userId },
          session.id,
          dilemma,
        );
      }
      try {
        subscriber.onDevinUpdate(update);
      } catch (err) {
        this.logger.warn(
          `Subscriber ${subscriber.sessionId} failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  private unsubscribe(loop: UserLoop, subscriber: DevinUpdateSubscriber): void {
    loop.subscribers.delete(subscriber);
    if (loop.subscribers.size === 0) this.stop(loop);
  }

  private stop(loop: UserLoop): void {
    if (loop.timer) {
      this.logger.log(`Stopping Devin polling for user ${loop.userId}.`);
      clearInterval(loop.timer);
      loop.timer = undefined;
    }
    loop.generation++;
    loop.seeded = false;
    loop.lastStates.clear();
    if (this.loops.get(loop.userId) === loop) this.loops.delete(loop.userId);
  }
}
