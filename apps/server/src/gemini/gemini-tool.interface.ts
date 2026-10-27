import { ServerMessage } from "../types";
import { Provider } from "../credentials/credential.types";

/**
 * Abstract token class representing a Gemini function tool.
 * Modules register tool subclasses to extend Gemini sessions.
 */
/**
 * Per-conversation context passed to every tool call.
 */
export interface ToolContext {
  /** The Puding session (one browser connection) that issued the call. */
  sessionId: string;
  /** The Puding user who owns the session; services resolve credentials with it. */
  userId: string;
}

export abstract class GeminiTool {
  /**
   * The unique name of the function tool (e.g., 'read_notion_page').
   */
  abstract readonly name: string;

  /**
   * The Gemini function declaration schema.
   */
  abstract readonly declaration: any;

  /**
   * Optional server-owned system-instruction text appended to the client's
   * system instruction whenever this tool is registered. Tools sharing the same
   * text contribute it once.
   */
  readonly instructions?: string;

  /**
   * The provider connection this tool needs. Sessions only declare the tool
   * when the user has that provider connected.
   */
  readonly requires?: Provider;

  /**
   * Executes the tool's business logic.
   *
   * @param args The arguments passed by the Gemini model.
   * @param context The conversation the call belongs to.
   * @returns The execution result (`output`) and optional `clientIntegration` metadata for UI rendering.
   */
  abstract execute(
    args: any,
    context?: ToolContext,
  ): Promise<{
    output: any;
    clientIntegration?: Extract<
      ServerMessage,
      { type: "content" }
    >["integration"];
  }>;
}

/** The user a tool call belongs to; provider tools cannot run without one. */
export function requireUserId(context?: ToolContext): string {
  if (!context?.userId) {
    throw new Error("This tool needs a signed-in Puding user.");
  }
  return context.userId;
}
