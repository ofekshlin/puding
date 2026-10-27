import "reflect-metadata";
import dotenv from "dotenv";
import path from "path";
import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";
import { AppModule } from "./app.module";
import { isAllowedOrigin } from "./config/cors";
import { ConfigService } from "./config/config.service";
import { Logger } from "@nestjs/common";

// Load environment configurations
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule);

  // Set the WsAdapter to support raw WebSocket server implementation
  app.useWebSocketAdapter(new WsAdapter(app));

  const configService = app.get(ConfigService);
  const webOrigins = configService.getWebOrigins();
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => callback(null, !origin || isAllowedOrigin(origin, webOrigins)),
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type"],
  });

  const port = configService.getPort();
  await app.listen(port);

  logger.log(`Puding WebSocket Proxy running on port ${port}`);
}

bootstrap().catch((error) => {
  const logger = new Logger("Bootstrap");
  logger.error("Failed to start the NestJS application server:", error);
  process.exit(1);
});
