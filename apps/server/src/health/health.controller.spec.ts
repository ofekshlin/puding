import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { ConfigService } from "../config/config.service";

describe("HealthController", () => {
  const createController = async (
    config: Partial<ConfigService>,
  ): Promise<HealthController> => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: ConfigService, useValue: config }],
    }).compile();

    return module.get<HealthController>(HealthController);
  };

  it("should report the deployment identity of a preview instance", async () => {
    const controller = await createController({
      getCommitSha: () => "abc1234",
      getServiceName: () => "puding-backend-pr-42",
      isPreview: () => true,
    });

    expect(controller.getHealth()).toEqual({
      status: "ok",
      commit: "abc1234",
      isPreview: true,
      service: "puding-backend-pr-42",
    });
  });

  it("should report a non-preview instance as production", async () => {
    const controller = await createController({
      getCommitSha: () => "unknown",
      getServiceName: () => "local",
      isPreview: () => false,
    });

    expect(controller.getHealth()).toEqual({
      status: "ok",
      commit: "unknown",
      isPreview: false,
      service: "local",
    });
  });
});
