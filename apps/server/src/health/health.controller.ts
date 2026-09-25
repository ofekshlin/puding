import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "../config/config.service";
import { HealthStatus } from "./health.types";

@Controller("health")
export class HealthController {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Liveness probe used by Render health checks and by the preview pairing
   * workflow to confirm which deployment answers on a given host.
   */
  @Get()
  public getHealth(): HealthStatus {
    return {
      status: "ok",
      commit: this.configService.getCommitSha(),
      isPreview: this.configService.isPreview(),
      service: this.configService.getServiceName(),
    };
  }
}
