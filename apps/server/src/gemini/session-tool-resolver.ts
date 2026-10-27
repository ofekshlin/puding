import { Inject, Injectable, Logger } from "@nestjs/common";
import { CredentialStore } from "../credentials/credential-store";
import { Provider } from "../credentials/credential.types";
import { GeminiTool } from "./gemini-tool.interface";

const PROVIDER_NAMES: Record<Provider, string> = {
  notion: "Notion",
  spotify: "Spotify",
  devin: "Devin",
};

export interface ResolvedSessionTools {
  tools: GeminiTool[];
  /** Server-owned note about services this user has not connected. */
  note?: string;
}

/**
 * Works out which tools a user's voice session gets: tools without a
 * provider requirement, plus those whose provider the user has connected
 * and that are not in an error state.
 */
@Injectable()
export class SessionToolResolver {
  private readonly logger = new Logger(SessionToolResolver.name);

  constructor(
    @Inject("GEMINI_TOOLS") private readonly catalogue: GeminiTool[],
    @Inject(CredentialStore) private readonly credentials: CredentialStore,
  ) {}

  public async resolve(userId: string): Promise<ResolvedSessionTools> {
    let connected = new Set<Provider>();
    try {
      const summaries = await this.credentials.listConnected(userId);
      connected = new Set(
        summaries.filter((c) => !c.lastError).map((c) => c.provider),
      );
    } catch (err) {
      this.logger.error(
        `Could not load connections for user ${userId}: ${err instanceof Error ? err.message : err}`,
      );
    }

    const tools = this.catalogue.filter(
      (t) => !t.requires || connected.has(t.requires),
    );
    const missing = [
      ...new Set(
        this.catalogue
          .map((t) => t.requires)
          .filter((p): p is Provider => Boolean(p) && !connected.has(p!)),
      ),
    ];
    return {
      tools,
      note: missing.length ? notConnectedNote(missing) : undefined,
    };
  }
}

export function notConnectedNote(providers: Provider[]): string {
  const names = providers.map((p) => PROVIDER_NAMES[p]);
  const list =
    names.length > 1
      ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
      : names[0];
  const verb = names.length > 1 ? "are" : "is";
  return `${list} ${verb} not connected for this user. If asked, say they can connect ${names.length > 1 ? "them" : "it"} in Puding's Settings.`;
}
