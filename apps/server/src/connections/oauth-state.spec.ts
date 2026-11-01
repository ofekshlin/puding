import { SignJWT } from "jose";
import { ConfigService } from "../config/config.service";
import type { DatabaseConnection } from "../database/database";
import { createTestDatabase } from "../database/test-database";
import { PostgresUserDirectory } from "../users/postgres-user-directory";
import {
  OAUTH_STATE_AUDIENCE,
  OAuthStateService,
  OAuthUnavailableError,
} from "./oauth-state";

const SECRET = "x".repeat(40);
const config = (secret?: string) =>
  ({ getPudingAuthSecret: () => secret }) as unknown as ConfigService;

describe("OAuthStateService", () => {
  let connection: DatabaseConnection;
  let states: OAuthStateService;
  let userId: string;
  let otherId: string;

  beforeAll(async () => {
    connection = await createTestDatabase();
    states = new OAuthStateService(config(SECRET), connection);
    const users = new PostgresUserDirectory(connection.db);
    const defaults = { role: "user", status: "approved" } as const;
    userId = (
      await users.upsertFromGoogle(
        { googleSub: "a", email: "a@x.dev" },
        defaults,
      )
    ).id;
    otherId = (
      await users.upsertFromGoogle(
        { googleSub: "b", email: "b@x.dev" },
        defaults,
      )
    ).id;
  });

  afterAll(() => connection.close());

  it("round-trips once, then rejects the replay", async () => {
    const state = await states.issue(userId, "spotify");
    expect(await states.consume(state, "spotify")).toBe(userId);
    expect(await states.consume(state, "spotify")).toBeNull();
  });

  it("rejects a state issued for another provider", async () => {
    const state = await states.issue(userId, "notion");
    expect(await states.consume(state, "spotify")).toBeNull();
  });

  it("rejects forged, garbage and missing states", async () => {
    const forged = await new SignJWT({ provider: "spotify", nonce: "n" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setAudience(OAUTH_STATE_AUDIENCE)
      .setExpirationTime("10m")
      .sign(new TextEncoder().encode("y".repeat(40)));
    expect(await states.consume(forged, "spotify")).toBeNull();
    expect(await states.consume("not-a-jwt", "spotify")).toBeNull();
    expect(await states.consume(undefined, "spotify")).toBeNull();
  });

  it("rejects a validly signed state re-pointed at another user", async () => {
    const state = await states.issue(userId, "spotify");
    const { decodeJwt } = await import("jose");
    const { nonce } = decodeJwt(state) as { nonce: string };
    const swapped = await new SignJWT({ provider: "spotify", nonce })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(otherId)
      .setAudience(OAUTH_STATE_AUDIENCE)
      .setExpirationTime("10m")
      .sign(new TextEncoder().encode(SECRET));
    expect(await states.consume(swapped, "spotify")).toBeNull();
    expect(await states.consume(state, "spotify")).toBe(userId);
  });

  it("rejects an expired state", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    try {
      const state = await states.issue(userId, "spotify");
      jest.setSystemTime(Date.now() + 11 * 60_000);
      expect(await states.consume(state, "spotify")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("is unavailable without a database or secret", async () => {
    const noDb = new OAuthStateService(config(SECRET), null);
    const noSecret = new OAuthStateService(config(undefined), connection);
    expect(noDb.isAvailable()).toBe(false);
    expect(noSecret.isAvailable()).toBe(false);
    await expect(noDb.issue(userId, "spotify")).rejects.toThrow(
      OAuthUnavailableError,
    );
    await expect(states.issue("local", "spotify")).rejects.toThrow(
      OAuthUnavailableError,
    );
  });
});
