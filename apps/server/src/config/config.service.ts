import { Injectable, Logger } from "@nestjs/common";
import dotenv from "dotenv";
import path from "path";

@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);
  private readonly geminiApiKey: string;
  private readonly port: number;

  constructor() {
    // Resolve absolute path to apps/server/.env
    const envPath = path.resolve(__dirname, "../../.env");
    dotenv.config({ path: envPath });

    this.geminiApiKey = process.env.GEMINI_API_KEY || "";
    this.port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

    if (!this.geminiApiKey) {
      this.logger.error(`CRITICAL CONFIGURATION ERROR: GEMINI_API_KEY is not defined in the environment. Attempted loading from: ${envPath}`);
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
}
