import { Injectable, Logger } from "@nestjs/common";
import dotenv from "dotenv";
import path from "path";

@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);
  private readonly geminiApiKey: string;
  private readonly port: number;
  private readonly notionToken: string;
  private readonly tavilyApiKey?: string;
  private readonly commitSha: string;
  private readonly serviceName: string;
  private readonly preview: boolean;

  // Define required environment variables here for easy extension
  private readonly requiredEnvVars = ["GEMINI_API_KEY", "NOTION_TOKEN"];

  constructor() {
    // Resolve absolute path to apps/server/.env
    const envPath = path.resolve(__dirname, "../../.env");
    dotenv.config({ path: envPath });

    this.validateConfig(envPath);

    this.geminiApiKey = process.env.GEMINI_API_KEY as string;
    this.port = process.env.PORT ? parseInt(process.env.PORT, 10) : 6601;
    this.notionToken = process.env.NOTION_TOKEN as string;
    this.tavilyApiKey = process.env.TAVILY_API_KEY;
    this.commitSha = process.env.RENDER_GIT_COMMIT ?? "unknown";
    this.serviceName = process.env.RENDER_SERVICE_NAME ?? "local";
    this.preview = process.env.IS_PULL_REQUEST === "true";
  }

  private validateConfig(envPath: string): void {
    const missingVars = this.requiredEnvVars.filter(
      (envVar) => !process.env[envVar],
    );

    if (missingVars.length > 0) {
      const errorMessage = `CRITICAL CONFIGURATION ERROR: Missing required environment variables: ${missingVars.join(", ")}. Attempted loading from: ${envPath}`;
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Retrieves the Google Gemini API key.
   */
  public getGeminiApiKey(): string {
    return this.geminiApiKey;
  }

  /**
   * Retrieves the port number the WebSocket server listens on.
   */
  public getPort(): number {
    return this.port;
  }

  /**
   * Retrieves the Notion integration token.
   */
  public getNotionToken(): string {
    return this.notionToken;
  }

  /**
   * Retrieves the Tavily API key.
   */
  public getTavilyApiKey(): string | undefined {
    return this.tavilyApiKey;
  }

  /**
   * Retrieves the git commit the running instance was built from.
   */
  public getCommitSha(): string {
    return this.commitSha;
  }

  /**
   * Retrieves the name of the deployed service instance.
   */
  public getServiceName(): string {
    return this.serviceName;
  }

  /**
   * Indicates whether this instance is a per-pull-request preview deployment.
   */
  public isPreview(): boolean {
    return this.preview;
  }
}
