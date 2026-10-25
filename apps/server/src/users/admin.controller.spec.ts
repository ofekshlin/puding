import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { UserAccessEvents } from "../auth/user-access-events";
import { ConfigService } from "../config/config.service";
import type { DatabaseConnection } from "../database/database";
import { createTestDatabase } from "../database/test-database";
import { AdminController } from "./admin.controller";
import { PostgresUserDirectory } from "./postgres-user-directory";
import { SignupPolicy } from "./signup-policy";
import { PudingUser } from "./user-directory";

describe("AdminController", () => {
  let connection: DatabaseConnection;
  let users: PostgresUserDirectory;
  let controller: AdminController;
  let admin: PudingUser;
  const forget = jest.fn();
  const revoked = jest.fn();
  const events = new UserAccessEvents();
  events.onRevoked(revoked);

  beforeAll(async () => {
    connection = await createTestDatabase();
    users = new PostgresUserDirectory(connection.db);
    const policy = new SignupPolicy({
      getSignupMode: () => "request",
      getAdminEmails: () => ["owner@x.dev"],
      getAllowedEmails: () => [],
    } as unknown as ConfigService);
    controller = new AdminController(
      users,
      { forget } as unknown as AuthService,
      policy,
      events,
    );
    admin = await users.upsertFromGoogle(
      { googleSub: "g-owner", email: "owner@x.dev" },
      { role: "admin", status: "approved" },
    );
  });

  afterAll(() => connection.close());
  beforeEach(() => jest.clearAllMocks());

  const newUser = (sub: string) =>
    users.upsertFromGoogle(
      { googleSub: sub, email: `${sub}@x.dev` },
      { role: "user", status: "pending" },
    );

  it("lists users, optionally by status", async () => {
    const friend = await newUser("lister");
    const pending = await controller.list("pending");
    expect(pending.users.map((u) => u.id)).toContain(friend.id);
    expect(pending.users.every((u) => u.status === "pending")).toBe(true);
    expect((await controller.list()).users.length).toBeGreaterThan(1);
    await expect(controller.list("bogus")).rejects.toThrow(BadRequestException);
  });

  it("approves a request and records who decided", async () => {
    const friend = await newUser("approve-me");
    const approved = await controller.approve(admin, friend.id);
    expect(approved).toMatchObject({ status: "approved" });
    expect(approved.decidedAt).toBeDefined();
    expect(forget).toHaveBeenCalledWith(friend.id);
    expect(revoked).not.toHaveBeenCalled();
  });

  it("rejects a pending request without revoking anything", async () => {
    const friend = await newUser("reject-me");
    expect(await controller.reject(admin, friend.id)).toMatchObject({
      status: "rejected",
    });
    expect(revoked).not.toHaveBeenCalled();
  });

  it("revokes an approved user and closes their sessions", async () => {
    const friend = await newUser("revoke-me");
    await controller.approve(admin, friend.id);
    expect(await controller.reject(admin, friend.id)).toMatchObject({
      status: "rejected",
    });
    expect(revoked).toHaveBeenCalledWith(friend.id);
    expect(forget).toHaveBeenCalledWith(friend.id);
  });

  it("refuses to reject an admin or an unknown user", async () => {
    await expect(controller.reject(admin, admin.id)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      controller.approve(admin, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toThrow(NotFoundException);
  });
});
