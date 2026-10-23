import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import type { DatabaseConnection } from "../database/database";
import { connections } from "../database/schema";
import { createTestDatabase } from "../database/test-database";
import { PostgresUserDirectory } from "../users/postgres-user-directory";
import { CredentialCipher } from "./credential-cipher";
import { PostgresCredentialStore } from "./postgres-credential-store";

const key = () => randomBytes(32).toString("base64");

describe("PostgresCredentialStore", () => {
  let connection: DatabaseConnection;
  let userId: string;
  let otherUserId: string;
  const v1 = key();

  beforeAll(async () => {
    connection = await createTestDatabase();
    const users = new PostgresUserDirectory(connection.db);
    const defaults = { role: "user", status: "approved" } as const;
    userId = (
      await users.upsertFromGoogle(
        { googleSub: "a", email: "a@x.dev" },
        defaults,
      )
    ).id;
    otherUserId = (
      await users.upsertFromGoogle(
        { googleSub: "b", email: "b@x.dev" },
        defaults,
      )
    ).id;
  });

  afterAll(() => connection.close());

  afterEach(() => connection.db.delete(connections));

  const store = (spec = `1:${v1}`) =>
    new PostgresCredentialStore(connection.db, new CredentialCipher(spec));

  it("saves encrypted and reads back the decrypted credential", async () => {
    const s = store();
    await s.save(userId, {
      provider: "notion",
      kind: "oauth",
      secret: { accessToken: "ntn_abc", refreshToken: "r1" },
      settings: { workspaceId: "w1" },
      accountLabel: "Ofek's workspace",
    });

    const [row] = await connection.db
      .select()
      .from(connections)
      .where(eq(connections.userId, userId));
    expect(row.secretCipher?.toString("utf8")).not.toContain("ntn_abc");
    expect(row.keyVersion).toBe(1);

    expect(await store().get(userId, "notion")).toEqual({
      provider: "notion",
      kind: "oauth",
      secret: { accessToken: "ntn_abc", refreshToken: "r1" },
      settings: { workspaceId: "w1" },
      accountLabel: "Ofek's workspace",
      expiresAt: undefined,
    });
    expect(await s.get(otherUserId, "notion")).toBeNull();
  });

  it("upserts, invalidates its cache, and lists summaries without secrets", async () => {
    const s = store();
    const base = { provider: "devin" as const, kind: "static_token" as const };
    await s.save(userId, {
      ...base,
      secret: { apiKey: "cog_1", orgId: "org-1" },
      settings: {},
    });
    expect((await s.get(userId, "devin"))?.secret.apiKey).toBe("cog_1");

    await s.save(userId, {
      ...base,
      secret: { apiKey: "cog_2", orgId: "org-1" },
      settings: { defaultRepo: "o/r" },
    });
    expect((await s.get(userId, "devin"))?.secret.apiKey).toBe("cog_2");

    await s.markError(userId, "devin", "Devin rejected the token");
    const [summary] = await s.listConnected(userId);
    expect(summary).toMatchObject({
      provider: "devin",
      source: "db",
      settings: { defaultRepo: "o/r" },
      lastError: "Devin rejected the token",
    });
    expect(JSON.stringify(summary)).not.toContain("cog_2");

    await s.save(userId, {
      ...base,
      secret: { apiKey: "cog_3", orgId: "org-1" },
      settings: {},
    });
    expect((await s.listConnected(userId))[0].lastError).toBeUndefined();

    await s.delete(userId, "devin");
    expect(await s.get(userId, "devin")).toBeNull();
    expect(await s.listConnected(userId)).toEqual([]);
  });

  it("refuses a ciphertext copied into another user's row", async () => {
    const s = store();
    await s.save(userId, {
      provider: "spotify",
      kind: "oauth",
      secret: { refreshToken: "rt" },
      settings: {},
    });
    const [row] = await connection.db
      .select()
      .from(connections)
      .where(eq(connections.userId, userId));
    await connection.db
      .insert(connections)
      .values({ ...row, userId: otherUserId });

    expect(await store().get(otherUserId, "spotify")).toBeNull();
    const [summary] = await store().listConnected(otherUserId);
    expect(summary.lastError).toMatch(/reconnect/);
  });

  it("re-encrypts rows under the newest key after rotation", async () => {
    await store().save(userId, {
      provider: "spotify",
      kind: "oauth",
      secret: { refreshToken: "rt" },
      settings: {},
    });

    const v2 = key();
    const rotated = store(`1:${v1},2:${v2}`);
    expect((await rotated.get(userId, "spotify"))?.secret).toEqual({
      refreshToken: "rt",
    });
    const [row] = await connection.db
      .select()
      .from(connections)
      .where(eq(connections.userId, userId));
    expect(row.keyVersion).toBe(2);

    expect((await store(`2:${v2}`).get(userId, "spotify"))?.secret).toEqual({
      refreshToken: "rt",
    });
  });

  it("stores a secret-less tombstone that reads as disconnected", async () => {
    const s = store();
    await s.tombstone(userId, "notion");

    expect(await s.get(userId, "notion")).toBeNull();
    expect(await s.isDisconnected(userId, "notion")).toBe(true);
    expect(await s.listConnected(userId)).toEqual([]);
    expect(await s.disconnectedProviders(userId)).toEqual(["notion"]);

    await s.save(userId, {
      provider: "notion",
      kind: "static_token",
      secret: { accessToken: "ntn" },
      settings: {},
    });
    expect(await s.isDisconnected(userId, "notion")).toBe(false);
    expect((await s.get(userId, "notion"))?.secret.accessToken).toBe("ntn");
  });

  it("treats non-UUID user ids as having no rows", async () => {
    const s = store();
    expect(await s.get("local", "notion")).toBeNull();
    expect(await s.listConnected("local")).toEqual([]);
    await expect(s.delete("local", "notion")).resolves.toBeUndefined();
  });

  it("drops a user's credentials when the user is deleted", async () => {
    const users = new PostgresUserDirectory(connection.db);
    const temp = await users.upsertFromGoogle(
      { googleSub: "tmp", email: "tmp@x.dev" },
      { role: "user", status: "approved" },
    );
    await store().save(temp.id, {
      provider: "notion",
      kind: "static_token",
      secret: { accessToken: "ntn" },
      settings: {},
    });
    const { users: usersTable } = await import("../database/schema");
    await connection.db.delete(usersTable).where(eq(usersTable.id, temp.id));
    expect(await store().listConnected(temp.id)).toEqual([]);
  });
});
