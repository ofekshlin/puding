import { ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { CredentialStore } from "../credentials/credential-store";
import { LOCAL_USER } from "./env-user-directory";
import { MeController } from "./me.controller";
import { SignupPolicy } from "./signup-policy";
import { PudingUser, UserDirectory } from "./user-directory";

const PENDING: PudingUser = {
  id: "u1",
  email: "p@x.dev",
  role: "user",
  status: "pending",
};

describe("MeController", () => {
  const listConnected = jest
    .fn()
    .mockResolvedValue([
      { provider: "notion", kind: "static_token", source: "env", settings: {} },
    ]);
  const users = {
    list: jest.fn().mockResolvedValue([PENDING, PENDING]),
    recordAccessRequest: jest.fn(),
  };
  const forget = jest.fn();
  let mode = "request";
  const controller = new MeController(
    { listConnected } as unknown as CredentialStore,
    users as unknown as UserDirectory,
    { getMode: () => mode } as unknown as SignupPolicy,
    { forget } as unknown as AuthService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mode = "request";
  });

  it("returns an approved admin with connections and the pending count", async () => {
    expect(await controller.getMe({ ...LOCAL_USER })).toEqual({
      ...LOCAL_USER,
      connections: [expect.objectContaining({ provider: "notion" })],
      signupMode: "request",
      pendingRequests: 2,
    });
    expect(listConnected).toHaveBeenCalledWith("local");
    expect(users.list).toHaveBeenCalledWith("pending");
  });

  it("shows a pending user their status but no connections", async () => {
    const me = await controller.getMe(PENDING);
    expect(me).toMatchObject({ status: "pending", connections: [] });
    expect(me.pendingRequests).toBeUndefined();
    expect(listConnected).not.toHaveBeenCalled();
  });

  it("records a trimmed access request and drops the cached status", async () => {
    users.recordAccessRequest.mockResolvedValue({
      ...PENDING,
      requestNote: "Ofek's brother",
      requestedAt: "2026-10-22T00:00:00.000Z",
    });
    const me = await controller.requestAccess(PENDING, {
      note: "  Ofek's brother  ",
    });
    expect(users.recordAccessRequest).toHaveBeenCalledWith(
      "u1",
      "Ofek's brother",
    );
    expect(forget).toHaveBeenCalledWith("u1");
    expect(me).toMatchObject({ requestNote: "Ofek's brother" });
  });

  it("stores no note when it is missing or blank", async () => {
    users.recordAccessRequest.mockResolvedValue(PENDING);
    await controller.requestAccess(PENDING, undefined);
    await controller.requestAccess(PENDING, { note: "   " });
    expect(users.recordAccessRequest).toHaveBeenNthCalledWith(1, "u1", null);
    expect(users.recordAccessRequest).toHaveBeenNthCalledWith(2, "u1", null);
  });

  it("refuses requests outside request mode or from non-pending users", async () => {
    mode = "allowlist";
    await expect(controller.requestAccess(PENDING, {})).rejects.toThrow(
      ConflictException,
    );
    mode = "request";
    await expect(
      controller.requestAccess({ ...PENDING, status: "rejected" }, {}),
    ).rejects.toThrow(ConflictException);
    expect(users.recordAccessRequest).not.toHaveBeenCalled();
  });

  it("reports when there is no database to store the request", async () => {
    users.recordAccessRequest.mockResolvedValue(null);
    await expect(controller.requestAccess(PENDING, {})).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
