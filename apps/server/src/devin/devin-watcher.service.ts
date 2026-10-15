import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "../config/config.service";
import {
  AgentSession,
  AgentSessionState,
  CodingAgentService,
} from "./coding-agent.interface";
import { ClientIntegration, sessionCard } from "./devin-card";
import { DilemmaParser } from "./dilemma-parser.service";
import { SpokenReader } from "./spoken-reader.service";
import { GetDevinSessionTool } from "./tools/get-devin-session.tool";
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

/**
 * Polls Puding's Devin sessions while a client is connected and tells every
 * connected voice session when one starts waiting, finishes or stops.
 */
@Injectable()
export class DevinWatcher implements OnModuleDestroy {
  private readonly logger = new Logger(DevinWatcher.name);
  private readonly subscribers = new Set<DevinUpdateSubscriber>();
  private readonly lastStates = new Map<string, AgentSessionState>();
  private timer?: NodeJS.Timeout;
  private seeded = false;
  private polling = false;

  constructor(
    @Inject(CodingAgentService)
    private readonly codingAgent: CodingAgentService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DilemmaParser) private readonly dilemmas: DilemmaParser,
    @Inject(SpokenReader) private readonly reader: SpokenReader,
  ) {}

  isEnabled(): boolean {
    return devinEnabled(this.config, this.codingAgent);
  }

  /**
   * Subscribes a voice session; polling runs only while someone listens.
   * Returns the unsubscribe function.
   */
  subscribe(subscriber: DevinUpdateSubscriber): () => void {
    if (!this.isEnabled()) return () => undefined;
    this.subscribers.add(subscriber);
    if (!this.timer) {
      this.logger.log("Starting Devin session polling.");
      this.timer = setInterval(
        () => void this.poll(),
        this.config.getDevinPollIntervalMs(),
      );
      void this.poll();
    }
    return () => this.unsubscribe(subscriber);
  }

  onModuleDestroy(): void {
    this.stop();
  }

  /**
   * One polling pass. The first pass after (re)starting only records state.
   */
  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const sessions = await this.codingAgent.listSessions({ limit: 20 });
      const changed = sessions.filter((s) => {
        const previous = this.lastStates.get(s.id);
        this.lastStates.set(s.id, s.state);
        return (
          this.seeded && previous !== s.state && NOTIFY_STATES.has(s.state)
        );
      });
      this.seeded = true;
      for (const session of changed) {
        await this.announce(session);
      }
    } catch (err) {
      this.logger.warn(
        `Devin polling failed: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.polling = false;
    }
  }

  private async announce(session: AgentSession): Promise<void> {
    let latest: string | undefined;
    try {
      const messages = await this.codingAgent.getMessages(session.id, {
        last: 5,
      });
      latest = [...messages].reverse().find((m) => m.from === "agent")?.text;
    } catch (err) {
      this.logger.warn(
        `Could not read messages for ${session.id}: ${err instanceof Error ? err.message : err}`,
      );
    }

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
      parts.push(`Devin said: ${GetDevinSessionTool.summarize(latest)}`);
    }
    parts.push(
      "Tell the user in one sentence and offer next steps. Do not call any tool unless they ask.",
    );

    const update: DevinSessionUpdate = {
      devinId: session.id,
      state: session.state,
      note: parts.join(" "),
      card: sessionCard(session, latest),
    };
    this.logger.log(`Announcing ${session.id} -> ${session.state}`);
    for (const subscriber of this.subscribers) {
      if (dilemma) {
        this.reader.rememberDilemma(
          { sessionId: subscriber.sessionId },
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

  private unsubscribe(subscriber: DevinUpdateSubscriber): void {
    this.subscribers.delete(subscriber);
    if (this.subscribers.size === 0) this.stop();
  }

  private stop(): void {
    if (this.timer) {
      this.logger.log("Stopping Devin session polling.");
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.seeded = false;
    this.lastStates.clear();
  }
}
