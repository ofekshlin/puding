import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "../config/config.service";
import { CredentialStore } from "../credentials/credential-store";
import { ConnectionSummary } from "../credentials/credential.types";
import { DEVIN_API_BASE } from "../devin/devin.service";

const VALIDATION_TIMEOUT_MS = 10_000;
const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

export interface DevinConnectionInput {
  apiKey?: unknown;
  orgId?: unknown;
  defaultRepo?: unknown;
  repoAliases?: unknown;
}

/** Why a Devin key was refused; the settings form shows a message per reason. */
export type DevinKeyProblem =
  | "missing_fields"
  | "legacy_key"
  | "invalid_org"
  | "invalid_repo"
  | "rejected"
  | "unreachable"
  | "disabled";

export class DevinKeyError extends Error {
  constructor(public readonly reason: DevinKeyProblem) {
    super(reason);
    this.name = "DevinKeyError";
  }
}

/**
 * Validates a pasted Devin Personal Access Token against the Devin API and
 * stores it, with the user's default repo and aliases, as their connection.
 */
@Injectable()
export class DevinConnectionService {
  private readonly logger = new Logger(DevinConnectionService.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(CredentialStore) private readonly credentials: CredentialStore,
  ) {}

  public async connect(
    userId: string,
    input: DevinConnectionInput,
  ): Promise<ConnectionSummary> {
    if (this.config.isPreview() && !this.config.isDevinEnabledInPreview()) {
      throw new DevinKeyError("disabled");
    }
    const apiKey = DevinConnectionService.text(input.apiKey);
    const orgId = DevinConnectionService.text(input.orgId);
    if (!apiKey || !orgId) throw new DevinKeyError("missing_fields");
    if (apiKey.startsWith("apk_")) throw new DevinKeyError("legacy_key");
    if (!orgId.startsWith("org-")) throw new DevinKeyError("invalid_org");

    const defaultRepo = DevinConnectionService.text(input.defaultRepo);
    const repoAliases = DevinConnectionService.aliases(input.repoAliases);
    const repos = [defaultRepo, ...Object.values(repoAliases)].filter(
      (repo): repo is string => Boolean(repo),
    );
    if (repos.some((repo) => !REPO_PATTERN.test(repo))) {
      throw new DevinKeyError("invalid_repo");
    }

    await this.validate(apiKey, orgId);

    const settings: Record<string, unknown> = {
      repoAliases,
      keyHint: DevinConnectionService.hint(apiKey),
    };
    if (defaultRepo) settings.defaultRepo = defaultRepo;
    await this.credentials.save(userId, {
      provider: "devin",
      kind: "static_token",
      secret: { apiKey, orgId },
      settings,
      accountLabel: orgId,
    });
    this.logger.log(`Devin connected for user ${userId} (org ${orgId}).`);

    const summary = (await this.credentials.listConnected(userId)).find(
      (connection) => connection.provider === "devin",
    );
    return (
      summary ?? {
        provider: "devin",
        kind: "static_token",
        source: "db",
        settings,
        accountLabel: orgId,
      }
    );
  }

  /** One cheap authenticated call on the org proves both the key and the org ID. */
  private async validate(apiKey: string, orgId: string): Promise<void> {
    let response: Response;
    try {
      response = await fetch(
        `${DEVIN_API_BASE}/${encodeURIComponent(orgId)}/sessions?first=1`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
        },
      );
    } catch (error) {
      this.logger.warn(
        `Devin key validation could not reach Devin: ${(error as Error).message}`,
      );
      throw new DevinKeyError("unreachable");
    }
    if (response.ok) return;
    this.logger.warn(`Devin key validation returned ${response.status}.`);
    throw new DevinKeyError(
      response.status === 401 ||
        response.status === 403 ||
        response.status === 404
        ? "rejected"
        : "unreachable",
    );
  }

  /** `cog_…abcd`: enough to recognise the key, never enough to use it. */
  public static hint(apiKey: string): string {
    const prefix = apiKey.includes("_") ? apiKey.split("_")[0] + "_" : "";
    return `${prefix}…${apiKey.slice(-4)}`;
  }

  private static text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  /** Accepts `{ alias: "owner/repo" }` or the env-style `alias=owner/repo, …` string. */
  private static aliases(value: unknown): Record<string, string> {
    const entries: [string, unknown][] =
      typeof value === "string"
        ? value
            .split(",")
            .map((pair) => pair.split("=") as [string, string])
            .filter((pair) => pair.length === 2)
        : value && typeof value === "object"
          ? Object.entries(value)
          : [];
    const aliases: Record<string, string> = {};
    for (const [alias, repo] of entries) {
      const name = alias.trim().toLowerCase();
      if (name && typeof repo === "string" && repo.trim()) {
        aliases[name] = repo.trim();
      }
    }
    return aliases;
  }
}
