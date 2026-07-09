import { ServerMessage } from "../types";

/**
 * Abstract token class representing a Gemini function tool.
 * Modules register tool subclasses to extend Gemini sessions.
 */
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
   * Executes the tool's business logic.
   *
   * @param args The arguments passed by the Gemini model.
   * @returns The execution result (`output`) and optional `clientIntegration` metadata for UI rendering.
   */
  abstract execute(args: any): Promise<{
    output: any;
    clientIntegration?: Extract<
      ServerMessage,
      { type: "content" }
    >["integration"];
  }>;
}
