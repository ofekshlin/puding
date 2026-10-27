import { CredentialStore } from "../credentials/credential-store";
import { LOCAL_USER } from "./env-user-directory";
import { MeController } from "./me.controller";

describe("MeController", () => {
  const listConnected = jest
    .fn()
    .mockResolvedValue([
      { provider: "notion", kind: "static_token", source: "env", settings: {} },
    ]);
  const controller = new MeController({
    listConnected,
  } as unknown as CredentialStore);

  beforeEach(() => listConnected.mockClear());

  it("returns an approved user with their connections", async () => {
    expect(await controller.getMe({ ...LOCAL_USER })).toEqual({
      ...LOCAL_USER,
      connections: [expect.objectContaining({ provider: "notion" })],
    });
    expect(listConnected).toHaveBeenCalledWith("local");
  });

  it("shows a pending user their status but no connections", async () => {
    const me = await controller.getMe({
      id: "u1",
      email: "p@x.dev",
      role: "user",
      status: "pending",
    });
    expect(me).toMatchObject({ status: "pending", connections: [] });
    expect(listConnected).not.toHaveBeenCalled();
  });
});
