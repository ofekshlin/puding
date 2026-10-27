import { randomBytes } from "crypto";
import { ConfigService } from "../config/config.service";
import type { DatabaseConnection } from "../database/database";
import { connections } from "../database/schema";
import { createTestDatabase } from "../database/test-database";
import { PostgresUserDirectory } from "../users/postgres-user-directory";
import { CredentialCipher } from "./credential-cipher";
import { EnvCredentialScope } from "./credential.types";
import { EnvCredentialStore } from "./env-credential-store";
import { LayeredCredentialStore } from "./layered-credential-store";
import { PostgresCredentialStore } from "./postgres-credential-store";

const envConfig = {
  getNotionToken: () => "ntn_env",
  getSpotifyRefreshToken: () => "rt_env",
  getDevinApiKey: () => undefined,
  getDevinOrgId: () => undefined,
  isPreview: () => false,
  isDevinEnabledInPreview: () => false,
} as unknown as ConfigService;

describe("LayeredCredentialStore", () => {
  let connection: DatabaseConnection;
  let users: PostgresUserDirectory;
  let adminId: string;
  let userId: string;
  const cipher = new CredentialCipher(
    `1:${randomBytes(32).toString("base64")}`,
  );

  beforeAll(async () => {
    connection = await createTestDatabase();
    users = new PostgresUserDirectory(connection.db);
    adminId = (
      await users.upsertFromGoogle(
        { googleSub: "owner", email: "owner@x.dev" },
        { role: "admin", status: "approved" },
      )
    ).id;
    userId = (
      await users.upsertFromGoogle(
        { googleSub: "friend", email: "friend@x.dev" },
        { role: "user", status: "approved" },
      )
    ).id;
  });

  afterAll(() => connection.close());

  afterEach(() => connection.db.delete(connections));

  const layered = (scope: EnvCredentialScope) =>
    new LayeredCredentialStore(
      new PostgresCredentialStore(connection.db, cipher),
      new EnvCredentialStore(envConfig),
      users,
      scope,
    );

  it('"none" never serves env credentials', async () => {
    const store = layered("none");
    expect(await store.get(adminId, "notion")).toBeNull();
    expect(await store.listConnected(adminId)).toEqual([]);
  });

  it('"admins" serves env credentials to admins only', async () => {
    const store = layered("admins");
    expect((await store.get(adminId, "notion"))?.secret.accessToken).toBe(
      "ntn_env",
    );
    expect(await store.get(userId, "notion")).toBeNull();
    expect(await store.get("not-a-uuid", "notion")).toBeNull();
    expect(
      (await store.listConnected(adminId)).map((c) => [c.provider, c.source]),
    ).toEqual([
      ["spotify", "env"],
      ["notion", "env"],
    ]);
  });

  it('"all" serves env credentials to every user (PR previews)', async () => {
    const store = layered("all");
    expect((await store.get(userId, "spotify"))?.secret.refreshToken).toBe(
      "rt_env",
    );
  });

  it("prefers the user's own row and writes go to Postgres", async () => {
    const store = layered("all");
    await store.save(userId, {
      provider: "notion",
      kind: "oauth",
      secret: { accessToken: "ntn_own" },
      settings: {},
    });
    expect((await store.get(userId, "notion"))?.secret.accessToken).toBe(
      "ntn_own",
    );
    const sources = Object.fromEntries(
      (await store.listConnected(userId)).map((c) => [c.provider, c.source]),
    );
    expect(sources).toEqual({ notion: "db", spotify: "env" });
  });

  it("a disconnect is not undone by the env fallback", async () => {
    const store = layered("admins");
    await store.save(adminId, {
      provider: "notion",
      kind: "oauth",
      secret: { accessToken: "ntn_own" },
      settings: {},
    });

    await store.delete(adminId, "notion");

    expect(await store.get(adminId, "notion")).toBeNull();
    expect((await store.listConnected(adminId)).map((c) => c.provider)).toEqual(
      ["spotify"],
    );

    await store.save(adminId, {
      provider: "notion",
      kind: "oauth",
      secret: { accessToken: "ntn_again" },
      settings: {},
    });
    expect((await store.get(adminId, "notion"))?.secret.accessToken).toBe(
      "ntn_again",
    );
  });

  it("deletes the row outright when no env fallback applies", async () => {
    const store = layered("admins");
    await store.save(userId, {
      provider: "notion",
      kind: "oauth",
      secret: { accessToken: "ntn_own" },
      settings: {},
    });
    await store.delete(userId, "notion");
    expect(await connection.db.select().from(connections)).toEqual([]);
  });

  it("marks errors on the source that served the credential", async () => {
    const store = layered("admins");
    await store.save(adminId, {
      provider: "notion",
      kind: "oauth",
      secret: { accessToken: "ntn_own" },
      settings: {},
    });
    await store.markError(adminId, "notion", "revoked");
    await store.markError(adminId, "spotify", "invalid_grant");

    const errors = Object.fromEntries(
      (await store.listConnected(adminId)).map((c) => [
        c.provider,
        c.lastError,
      ]),
    );
    expect(errors).toEqual({ notion: "revoked", spotify: "invalid_grant" });
  });
});
