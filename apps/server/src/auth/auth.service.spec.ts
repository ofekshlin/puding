import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { ConfigService, SignupMode } from "../config/config.service";
import type { DatabaseConnection } from "../database/database";
import { users as usersTable } from "../database/schema";
import { createTestDatabase } from "../database/test-database";
import { LOCAL_USER } from "../users/env-user-directory";
import { PostgresUserDirectory } from "../users/postgres-user-directory";
import { SignupPolicy } from "../users/signup-policy";
import { AccessGuard } from "./access-guard.service";
import { AuthService, PUDING_TOKEN_AUDIENCE } from "./auth.service";

const SECRET = "test-secret-that-is-long-enough-32b";

function configWith(values: {
  secret?: string;
  admins?: string[];
  accessToken?: string;
  mode?: SignupMode;
  allowed?: string[];
}): ConfigService {
  return {
    getPudingAuthSecret: () => values.secret,
    getAdminEmails: () => values.admins ?? [],
    getSignupMode: () => values.mode ?? "request",
    getAllowedEmails: () => values.allowed ?? [],
    getAccessToken: () => values.accessToken,
  } as unknown as ConfigService;
}

interface TokenOptions {
  sub?: string;
  email?: string | null;
  audience?: string;
  secret?: string;
  expiresAt?: number | string;
}

function token(options: TokenOptions = {}): Promise<string> {
  const claims: Record<string, unknown> = { name: "Someone" };
  if (options.email !== null) claims.email = options.email ?? "owner@x.dev";
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(options.sub ?? "g-owner")
    .setAudience(options.audience ?? PUDING_TOKEN_AUDIENCE)
    .setExpirationTime(options.expiresAt ?? "5m")
    .sign(new TextEncoder().encode(options.secret ?? SECRET));
}

describe("AuthService", () => {
  let connection: DatabaseConnection;
  let directory: PostgresUserDirectory;

  beforeAll(async () => {
    connection = await createTestDatabase();
    directory = new PostgresUserDirectory(connection.db);
  });

  afterAll(() => connection.close());

  const service = (values: Parameters<typeof configWith>[0]) => {
    const config = configWith(values);
    return new AuthService(
      config,
      directory,
      new AccessGuard(config),
      new SignupPolicy(config),
    );
  };

  describe("without PUDING_AUTH_SECRET (legacy access token)", () => {
    it("maps a valid access token to the local user", async () => {
      const auth = service({ accessToken: "legacy" });
      expect(auth.isEnabled()).toBe(false);
      expect(await auth.authenticate("legacy")).toEqual({
        ok: true,
        user: LOCAL_USER,
      });
      expect(await auth.authenticate("wrong")).toEqual({
        ok: false,
        reason: "invalid",
      });
      expect(await auth.authenticate(null)).toEqual({
        ok: false,
        reason: "missing",
      });
    });

    it("lets everyone in as the local user when no access token is set either", async () => {
      expect(await service({}).authenticate(null)).toMatchObject({ ok: true });
    });
  });

  describe("with PUDING_AUTH_SECRET", () => {
    it("refuses a short secret", () => {
      expect(() => service({ secret: "short" })).toThrow(/at least 32 bytes/);
    });

    it("ignores the legacy access token", async () => {
      const auth = service({ secret: SECRET, accessToken: "legacy" });
      expect(auth.isEnabled()).toBe(true);
      expect(await auth.authenticate("legacy")).toEqual({
        ok: false,
        reason: "invalid",
      });
    });

    it("creates ADMIN_EMAILS users as approved admins", async () => {
      const auth = service({ secret: SECRET, admins: ["owner@x.dev"] });
      const result = await auth.authenticate(
        await token({ sub: "g-owner", email: "Owner@X.dev" }),
      );
      expect(result).toMatchObject({
        ok: true,
        user: { email: "owner@x.dev", role: "admin", status: "approved" },
      });
    });

    it("creates everyone else as pending, allowed only where pending is", async () => {
      const auth = service({ secret: SECRET, admins: ["owner@x.dev"] });
      const friend = await token({ sub: "g-friend", email: "friend@x.dev" });

      expect(await auth.authenticate(friend)).toEqual({
        ok: false,
        reason: "pending",
      });
      expect(
        await auth.authenticate(friend, ["approved", "pending"]),
      ).toMatchObject({ ok: true, user: { role: "user", status: "pending" } });
    });

    it.each<[string, TokenOptions, string]>([
      ["expired", { expiresAt: Math.floor(Date.now() / 1000) - 60 }, "expired"],
      ["for another audience", { audience: "someone-else" }, "invalid"],
      ["signed with another secret", { secret: "x".repeat(40) }, "invalid"],
      ["without an email", { email: null }, "invalid"],
    ])("rejects a token %s", async (_label, options, reason) => {
      const auth = service({ secret: SECRET });
      expect(await auth.authenticate(await token(options))).toEqual({
        ok: false,
        reason,
      });
    });

    it("rejects garbage and missing tokens", async () => {
      const auth = service({ secret: SECRET });
      expect(await auth.authenticate("not-a-jwt")).toEqual({
        ok: false,
        reason: "invalid",
      });
      expect(await auth.authenticate(undefined)).toEqual({
        ok: false,
        reason: "missing",
      });
    });

    it("sees a status change after at most 30 seconds, or at once after forget()", async () => {
      const auth = service({ secret: SECRET, mode: "open" });
      const revoked = await token({ sub: "g-revoked", email: "revoked@x.dev" });
      const first = await auth.authenticate(revoked);
      if (!first.ok) throw new Error("expected approval");

      await connection.db
        .update(usersTable)
        .set({ status: "rejected" })
        .where(eq(usersTable.id, first.user.id));

      const now = Date.now();
      const clock = jest.spyOn(Date, "now").mockReturnValue(now + 29_000);
      expect(await auth.authenticate(revoked)).toMatchObject({ ok: true });

      clock.mockReturnValue(now + 31_000);
      expect(await auth.authenticate(revoked)).toEqual({
        ok: false,
        reason: "rejected",
      });

      await connection.db
        .update(usersTable)
        .set({ status: "approved" })
        .where(eq(usersTable.id, first.user.id));
      auth.forget(first.user.id);
      expect(await auth.authenticate(revoked)).toMatchObject({ ok: true });
      clock.mockRestore();
    });
  });
});
