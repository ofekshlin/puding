import { and, eq, lt, sql } from "drizzle-orm";
import { isUuid, type Database } from "./database";
import { usageCounters } from "./schema";

/**
 * Per-user daily counters for shared, metered resources (e.g. Tavily).
 */
export abstract class UsageLimiter {
  /**
   * Counts one use of `metric` for today (UTC) unless the user already
   * reached `limit`. Returns whether the use is allowed.
   */
  abstract tryConsume(
    userId: string,
    metric: string,
    limit: number,
  ): Promise<boolean>;
}

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Process-local counters, for env-only mode and non-database users. */
export class InMemoryUsageLimiter extends UsageLimiter {
  private readonly counts = new Map<string, number>();

  public async tryConsume(
    userId: string,
    metric: string,
    limit: number,
  ): Promise<boolean> {
    const day = utcDay();
    for (const key of this.counts.keys()) {
      if (!key.endsWith(`|${day}`)) this.counts.delete(key);
    }
    const key = `${userId}|${metric}|${day}`;
    const count = this.counts.get(key) ?? 0;
    if (count >= limit) return false;
    this.counts.set(key, count + 1);
    return true;
  }
}

/** Counters in `usage_counters`, shared by every server instance. */
export class PostgresUsageLimiter extends UsageLimiter {
  private readonly fallback = new InMemoryUsageLimiter();

  constructor(private readonly db: Database) {
    super();
  }

  public async tryConsume(
    userId: string,
    metric: string,
    limit: number,
  ): Promise<boolean> {
    if (!isUuid(userId)) {
      return this.fallback.tryConsume(userId, metric, limit);
    }
    const day = utcDay();
    const rows = await this.db
      .insert(usageCounters)
      .values({ userId, metric, day, count: 1 })
      .onConflictDoUpdate({
        target: [usageCounters.userId, usageCounters.metric, usageCounters.day],
        set: { count: sql`${usageCounters.count} + 1` },
        setWhere: and(
          eq(usageCounters.userId, userId),
          lt(usageCounters.count, limit),
        ),
      })
      .returning({ count: usageCounters.count });
    return rows.length > 0 && limit > 0;
  }
}
