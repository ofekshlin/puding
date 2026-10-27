import type { DatabaseConnection } from "../database/database";
import { createTestDatabase } from "../database/test-database";
import { EnvUserDirectory, LOCAL_USER } from "./env-user-directory";
import { PostgresUserDirectory } from "./postgres-user-directory";

describe("PostgresUserDirectory", () => {
  let connection: DatabaseConnection;
  let users: PostgresUserDirectory;

  beforeAll(async () => {
    connection = await createTestDatabase();
    users = new PostgresUserDirectory(connection.db);
  });

  afterAll(() => connection.close());

  it("creates a user with the defaults on first sight", async () => {
    const user = await users.upsertFromGoogle(
      { googleSub: "g-1", email: "Ofek@Example.com", name: "Ofek" },
      { role: "admin", status: "approved" },
    );
    expect(user).toMatchObject({
      email: "ofek@example.com",
      name: "Ofek",
      role: "admin",
      status: "approved",
    });
    expect(await users.findById(user.id)).toEqual(user);
    expect(await users.findByEmail("OFEK@example.com")).toEqual(user);
  });

  it("refreshes the profile but keeps role and status on later sign-ins", async () => {
    const first = await users.upsertFromGoogle(
      { googleSub: "g-2", email: "friend@example.com" },
      { role: "user", status: "pending" },
    );
    const again = await users.upsertFromGoogle(
      { googleSub: "g-2", email: "friend@example.com", name: "Friend" },
      { role: "admin", status: "approved" },
    );
    expect(again).toMatchObject({
      id: first.id,
      name: "Friend",
      role: "user",
      status: "pending",
    });
  });

  it("records access requests and admin decisions", async () => {
    const friend = await users.upsertFromGoogle(
      { googleSub: "g-3", email: "asker@example.com" },
      { role: "user", status: "pending" },
    );
    const asked = await users.recordAccessRequest(friend.id, "hi, it's me");
    expect(asked).toMatchObject({ requestNote: "hi, it's me" });
    expect(asked?.requestedAt).toBeDefined();
    expect((await users.list("pending")).map((u) => u.id)).toContain(friend.id);

    const promoted = await users.update(friend.id, { status: "approved" });
    expect(promoted).toMatchObject({ status: "approved" });
    expect(promoted?.decidedAt).toBeUndefined();

    const decided = await users.update(friend.id, {
      status: "rejected",
      decidedBy: null,
    });
    expect(decided).toMatchObject({ status: "rejected" });
    expect(decided?.decidedAt).toBeDefined();
    expect(await users.update("local", { status: "approved" })).toBeNull();
    expect(await users.recordAccessRequest("local", null)).toBeNull();
  });

  it("returns null for unknown or non-UUID ids", async () => {
    expect(await users.findById("local")).toBeNull();
    expect(
      await users.findById("00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
    expect(await users.findByEmail("nobody@example.com")).toBeNull();
  });
});

describe("EnvUserDirectory", () => {
  it("maps admins onto the local user and nobody else", async () => {
    const users = new EnvUserDirectory();
    expect(
      await users.upsertFromGoogle(
        { googleSub: "x", email: "Owner@y.z" },
        { role: "admin", status: "approved" },
      ),
    ).toEqual(LOCAL_USER);
    expect(
      await users.upsertFromGoogle(
        { googleSub: "y", email: "Friend@y.z" },
        { role: "user", status: "pending" },
      ),
    ).toEqual({
      id: "google:y",
      email: "friend@y.z",
      role: "user",
      status: "pending",
    });
    expect(await users.findById("local")).toEqual(LOCAL_USER);
    expect(await users.findById("other")).toBeNull();
  });
});
