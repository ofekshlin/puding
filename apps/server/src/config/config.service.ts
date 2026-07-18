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

  // Define required environment variables here for easy extension
  private readonly requiredEnvVars = ["GEMINI_API_KEY", "NOTION_TOKEN"];

  constructor() {
    // Resolve absolute path to apps/server/.env
    const envPath = path.resolve(__dirname, "../../.env");
    dotenv.config({ path: envPath });

    this.validateConfig(envPath);

    this.geminiApiKey = process.env.GEMINI_API_KEY as string;
    this.port = process.env.PORT ? parseInt(process.env.PORT, 10) : 6001;
    this.notionToken = process.env.NOTION_TOKEN as string;
    this.tavilyApiKey = process.env.TAVILY_API_KEY;
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
}
