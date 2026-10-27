import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "../config/config.service";
import { CredentialStore } from "../credentials/credential-store";
import { DevinSecret } from "../credentials/credential.types";
import {
  AgentMessage,
  AgentSession,
  AgentSessionState,
  AgentNotConnectedError,
  CodingAgentError,
  CodingAgentService,
  ListSessionsOptions,
  StartSessionInput,
} from "./coding-agent.interface";

export const DEVIN_API_BASE = "https://api.devin.ai/v3/organizations";
export const PUDING_TAG = "puding";

const REQUEST_TIMEOUT_MS = 10_000;
const MESSAGES_PAGE_SIZE = 100;
const MAX_MESSAGE_PAGES = 20;
const DEFAULT_LIST_LIMIT = 20;
const LIST_PAGE_SIZE = 50;
const TITLE_MAX_CHARS = 60;
const SLEEP_REASONS = new Set(["inactivity", "user_request"]);

interface DevinPullRequest {
  pr_url?: string;
  pr_state?: string | null;
  url?: string;
  state?: string | null;
}

interface DevinSession {
  session_id: string;
  title?: string | null;
  status: string;
  status_detail?: string | null;
  tags?: string[];
  pull_requests?: DevinPullRequest[];
  updated_at?: number | string;
  acus_consumed?: number;
  url: string;
}

interface DevinSessionList {
  items?: DevinSession[];
}

interface DevinMessagePage {
  items?: { message: string; source: string; created_at: number | string }[];
  end_cursor?: string | null;
  has_next_page?: boolean;
}

@Injectable()
export class DevinService extends CodingAgentService {
  private readonly logger = new Logger(DevinService.name);

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(CredentialStore) private readonly credentials: CredentialStore,
  ) {
    super();
  }

  isConfigured(): boolean {
    return (
      !this.configService.isPreview() ||
      this.configService.isDevinEnabledInPreview()
    );
  }

  async startSession(
    userId: string,
    input: StartSessionInput,
  ): Promise<AgentSession> {
    const task = input.task.trim();
    if (!task) {
      throw new CodingAgentError("I need a task to give Devin.");
    }
    const repo = await this.resolveRepo(userId, input.repo);
    await this.assertActiveSessionCapacity(userId);

    const body: Record<string, unknown> = {
      prompt: DevinService.buildPrompt(task, input.intent),
      title: DevinService.buildTitle(task),
      tags: [PUDING_TAG, `${PUDING_TAG}-${input.intent}`],
      max_acu_limit: this.configService.getDevinMaxAcuPerSession(),
    };
    if (repo) body.repos = [repo];
    if (input.mode) body.devin_mode = input.mode;

    this.logger.log(
      `Starting Devin ${input.intent} session${repo ? ` on ${repo}` : ""}.`,
    );
    const created = await this.request<DevinSession>(
      userId,
      "POST",
      "/sessions",
      body,
    );
    return DevinService.toAgentSession(created);
  }

  async listSessions(
    userId: string,
    opts: ListSessionsOptions = {},
  ): Promise<AgentSession[]> {
    const limit = opts.limit ?? DEFAULT_LIST_LIMIT;
    const onlyPuding = opts.onlyPuding ?? true;
    // Tag filtering on GET /sessions is not documented for v3, so the tag
    // query is a hint and the result is always filtered client-side.
    const query = new URLSearchParams({
      first: String(Math.max(limit, LIST_PAGE_SIZE)),
    });
    if (onlyPuding) query.set("tags", PUDING_TAG);

    const page = await this.request<DevinSessionList>(
      userId,
      "GET",
      `/sessions?${query.toString()}`,
    );
    return (page.items ?? [])
      .filter((s) => !onlyPuding || (s.tags ?? []).includes(PUDING_TAG))
      .map((s) => DevinService.toAgentSession(s))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }

  async getSession(userId: string, id: string): Promise<AgentSession> {
    const session = await this.request<DevinSession>(
      userId,
      "GET",
      `/sessions/${DevinService.sessionPath(id)}`,
    );
    return DevinService.toAgentSession(session);
  }

  async getMessages(
    userId: string,
    id: string,
    opts: { last?: number } = {},
  ): Promise<AgentMessage[]> {
    const messages: AgentMessage[] = [];
    let cursor: string | null | undefined;

    for (let page = 0; page < MAX_MESSAGE_PAGES; page++) {
      const query = new URLSearchParams({ first: String(MESSAGES_PAGE_SIZE) });
      if (cursor) query.set("after", cursor);

      const result = await this.request<DevinMessagePage>(
        userId,
        "GET",
        `/sessions/${DevinService.sessionPath(id)}/messages?${query.toString()}`,
      );
      for (const item of result.items ?? []) {
        messages.push({
          from: item.source === "user" ? "user" : "agent",
          text: item.message,
          at: DevinService.toMillis(item.created_at),
        });
      }
      cursor = result.end_cursor;
      if (!result.has_next_page || !cursor) break;
    }

    return opts.last ? messages.slice(-opts.last) : messages;
  }

  async sendMessage(
    userId: string,
    id: string,
    text: string,
  ): Promise<AgentSession> {
    const message = text.trim();
    if (!message) {
      throw new CodingAgentError("There's nothing to send to Devin.");
    }
    const session = await this.request<DevinSession>(
      userId,
      "POST",
      `/sessions/${DevinService.sessionPath(id)}/messages`,
      { message },
    );
    return DevinService.toAgentSession(session);
  }

  async stopSession(userId: string, id: string): Promise<void> {
    await this.request<unknown>(
      userId,
      "DELETE",
      `/sessions/${DevinService.sessionPath(id)}`,
    );
    this.logger.log(`Terminated Devin session ${id}.`);
  }

  public static buildPrompt(
    task: string,
    intent: StartSessionInput["intent"],
  ): string {
    if (intent === "plan") {
      return [
        "Investigate the repository and produce an implementation plan for the task below.",
        "Do NOT write code or open a PR. Send the plan, then wait for my approval.",
        "",
        `Task: ${task}`,
      ].join("\n");
    }
    return `${task}\n\nOpen a PR when done.`;
  }

  public static buildTitle(task: string): string {
    const singleLine = task.replace(/\s+/g, " ").trim();
    if (singleLine.length <= TITLE_MAX_CHARS) return singleLine;
    const cut = singleLine.slice(0, TITLE_MAX_CHARS);
    const lastSpace = cut.lastIndexOf(" ");
    return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim()}…`;
  }

  public static mapState(
    status: string,
    detail?: string | null,
  ): { state: AgentSessionState; reason?: string } {
    switch (status) {
      case "new":
      case "claimed":
      case "resuming":
        return { state: "working" };
      case "running":
        if (
          detail === "waiting_for_user" ||
          detail === "waiting_for_approval" ||
          detail === "finished"
        ) {
          return { state: detail };
        }
        return { state: "working" };
      case "suspended":
        if (!detail || SLEEP_REASONS.has(detail)) return { state: "sleeping" };
        return { state: "stopped", reason: DevinService.humanize(detail) };
      case "error":
        return {
          state: "stopped",
          reason: detail ? DevinService.humanize(detail) : "error",
        };
      case "exit":
      default:
        return {
          state: "stopped",
          reason: detail ? DevinService.humanize(detail) : undefined,
        };
    }
  }

  private async resolveRepo(
    userId: string,
    spoken?: string,
  ): Promise<string | undefined> {
    const settings = (await this.credentials.get(userId, "devin"))?.settings;
    const name = spoken?.trim();
    if (!name) {
      return typeof settings?.defaultRepo === "string" && settings.defaultRepo
        ? settings.defaultRepo
        : undefined;
    }
    if (name.includes("/")) return name;

    const aliases = DevinService.aliasesFrom(settings?.repoAliases);
    const repo = aliases[name.toLowerCase()];
    if (repo) return repo;

    const known = Object.keys(aliases);
    throw new CodingAgentError(
      known.length
        ? `I don't know a repo called "${name}". Known repos are: ${known.join(", ")}.`
        : `I don't know a repo called "${name}". Say it as owner slash name.`,
    );
  }

  private static aliasesFrom(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object") return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, repo]) => typeof repo === "string")
        .map(([alias, repo]) => [alias.toLowerCase(), repo as string]),
    );
  }

  private async assertActiveSessionCapacity(userId: string): Promise<void> {
    const max = this.configService.getDevinMaxActiveSessions();
    const working = (
      await this.listSessions(userId, {
        onlyPuding: true,
        limit: LIST_PAGE_SIZE,
      })
    ).filter((s) => s.state === "working");
    if (working.length >= max) {
      throw new CodingAgentError(
        `You already have ${working.length} Devin sessions working, which is the limit of ${max}. Stop one or wait for one to finish first.`,
      );
    }
  }

  private async secretFor(userId: string): Promise<DevinSecret> {
    if (!this.isConfigured()) {
      throw new CodingAgentError("Devin is turned off on this Puding server.");
    }
    const credential = await this.credentials.get(userId, "devin");
    if (!credential) throw new AgentNotConnectedError();
    return credential.secret;
  }

  private async request<T>(
    userId: string,
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const { apiKey, orgId } = await this.secretFor(userId);

    const url = `${DEVIN_API_BASE}/${encodeURIComponent(orgId)}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(body !== undefined && { "Content-Type": "application/json" }),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error: any) {
      const timedOut =
        error?.name === "TimeoutError" || error?.name === "AbortError";
      this.logger.error(
        `Devin ${method} ${path} failed: ${error?.message ?? error}`,
      );
      throw new CodingAgentError(
        timedOut
          ? "Devin didn't answer in time, try again in a moment."
          : "I couldn't reach Devin right now.",
      );
    }

    if (!response.ok) {
      const detail = await DevinService.readErrorDetail(response);
      this.logger.warn(
        `Devin ${method} ${path} returned ${response.status}${detail ? `: ${detail}` : ""}`,
      );
      throw new CodingAgentError(
        DevinService.spokenError(response.status, detail),
        response.status,
      );
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private static spokenError(status: number, detail?: string): string {
    if (status === 401 || status === 403) {
      return "Devin rejected the API token.";
    }
    if (status === 404) return "I couldn't find that Devin session.";
    if (status === 429) {
      return "Devin is rate-limiting us, try again in a moment.";
    }
    if (status === 400 || status === 409 || status === 422) {
      return detail
        ? `Devin refused the request: ${detail}`
        : "Devin refused the request.";
    }
    return "Devin had a problem handling that request.";
  }

  private static async readErrorDetail(
    response: Response,
  ): Promise<string | undefined> {
    try {
      const data = (await response.json()) as any;
      if (typeof data?.detail === "string") return data.detail;
      if (typeof data?.title === "string") return data.title;
    } catch {
      // Non-JSON error bodies carry no spoken detail.
    }
    return undefined;
  }

  private static toAgentSession(session: DevinSession): AgentSession {
    const { state, reason } = DevinService.mapState(
      session.status,
      session.status_detail,
    );
    return {
      id: DevinService.normalizeId(session.session_id),
      title: session.title?.trim() || "Untitled Devin session",
      state,
      ...(reason && { stateReason: reason }),
      url: session.url,
      tags: session.tags ?? [],
      pullRequests: (session.pull_requests ?? [])
        .map((pr) => ({
          url: pr.pr_url ?? pr.url ?? "",
          state: pr.pr_state ?? pr.state ?? undefined,
        }))
        .filter((pr) => pr.url),
      ...(typeof session.acus_consumed === "number" && {
        acusConsumed: session.acus_consumed,
      }),
      updatedAt: DevinService.toMillis(session.updated_at),
    };
  }

  private static normalizeId(id: string): string {
    return id.startsWith("devin-") ? id : `devin-${id}`;
  }

  private static sessionPath(id: string): string {
    return encodeURIComponent(DevinService.normalizeId(id.trim()));
  }

  private static toMillis(value: number | string | undefined): number {
    if (typeof value === "number") {
      return value < 1e12 ? value * 1000 : value;
    }
    const parsed = value ? Date.parse(value) : NaN;
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private static humanize(value: string): string {
    return value.replace(/_/g, " ");
  }
}
