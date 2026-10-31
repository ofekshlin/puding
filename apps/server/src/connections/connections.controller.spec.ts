import { BadRequestException, ConflictException } from "@nestjs/common";
import {
  CredentialStore,
  ReadOnlyCredentialStoreError,
} from "../credentials/credential-store";
import { PudingUser } from "../users/user-directory";
import { ConnectionsController } from "./connections.controller";
import {
  DevinConnectionService,
  DevinKeyError,
} from "./devin-connection.service";

const USER: PudingUser = {
  id: "u1",
  email: "a@b.c",
  role: "user",
  status: "approved",
};

describe("ConnectionsController", () => {
  const remove = jest.fn();
  const connect = jest.fn();
  const controller = new ConnectionsController(
    { delete: remove } as unknown as CredentialStore,
    { connect } as unknown as DevinConnectionService,
  );

  beforeEach(() => jest.clearAllMocks());

  it("connects Devin for the signed-in user only", async () => {
    connect.mockResolvedValue({ provider: "devin" });
    await controller.connectDevin(USER, { apiKey: "cog_x", orgId: "org-1" });
    expect(connect).toHaveBeenCalledWith("u1", {
      apiKey: "cog_x",
      orgId: "org-1",
    });
  });

  it("turns a refused key into a 400 with its reason", async () => {
    connect.mockRejectedValue(new DevinKeyError("legacy_key"));
    await expect(controller.connectDevin(USER, {})).rejects.toMatchObject({
      response: { reason: "legacy_key" },
    });
    await expect(controller.connectDevin(USER, undefined)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("disconnects known providers and rejects unknown ones", async () => {
    await controller.disconnect(USER, "spotify");
    expect(remove).toHaveBeenCalledWith("u1", "spotify");
    await expect(controller.disconnect(USER, "tavily")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("reports a read-only store as a conflict", async () => {
    remove.mockRejectedValue(new ReadOnlyCredentialStoreError("notion"));
    await expect(controller.disconnect(USER, "notion")).rejects.toThrow(
      ConflictException,
    );
  });
});
