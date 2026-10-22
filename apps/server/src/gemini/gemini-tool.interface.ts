import { ServerMessage } from "../types";

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
