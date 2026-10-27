import { DatabaseConnection } from "./database";
import { users } from "./schema";
import { createTestDatabase } from "./test-database";
import { InMemoryUsageLimiter, PostgresUsageLimiter } from "./usage-limiter";

describe("UsageLimiter", () => {
  it("in memory: allows `limit` uses per user and metric", async () => {
    const limiter = new InMemoryUsageLimiter();
    expect(await limiter.tryConsume("u1", "search", 2)).toBe(true);
    expect(await limiter.tryConsume("u1", "search", 2)).toBe(true);
    expect(await limiter.tryConsume("u1", "search", 2)).toBe(false);
    expect(await limiter.tryConsume("u2", "search", 2)).toBe(true);
    expect(await limiter.tryConsume("u1", "other", 2)).toBe(true);
  });

  describe("postgres", () => {
    let connection: DatabaseConnection;
    let userId: string;

    beforeEach(async () => {
      connection = await createTestDatabase();
      const [row] = await connection.db
        .insert(users)
        .values({
          googleSub: "sub-1",
          email: "a@example.com",
          status: "approved",
        })
        .returning({ id: users.id });
      userId = row.id;
    });

    afterEach(() => connection.close());

    it("counts in usage_counters and refuses past the limit", async () => {
      const limiter = new PostgresUsageLimiter(connection.db);
      expect(await limiter.tryConsume(userId, "search", 2)).toBe(true);
      expect(await limiter.tryConsume(userId, "search", 2)).toBe(true);
      expect(await limiter.tryConsume(userId, "search", 2)).toBe(false);
      expect(await limiter.tryConsume(userId, "other", 2)).toBe(true);
    });

    it("keeps the implicit local user in memory", async () => {
      const limiter = new PostgresUsageLimiter(connection.db);
      expect(await limiter.tryConsume("local", "search", 1)).toBe(true);
      expect(await limiter.tryConsume("local", "search", 1)).toBe(false);
    });
  });
});
