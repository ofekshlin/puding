import "reflect-metadata";
import dotenv from "dotenv";
import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";
import { AppModule } from "./app.module";
import { Logger } from "@nestjs/common";

// Load environment configurations
dotenv.config();

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule);

  // Set the WsAdapter to support raw WebSocket server implementation
  app.useWebSocketAdapter(new WsAdapter(app));

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  await app.listen(port);
  
  logger.log(`Puding WebSocket Proxy running on port ${port}`);
}

bootstrap().catch((error) => {
  const logger = new Logger("Bootstrap");
  logger.error("Failed to start the NestJS application server:", error);
  process.exit(1);
});
