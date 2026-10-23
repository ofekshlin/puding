import path from "path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/** Any Drizzle Postgres database over the Puding schema (node-postgres in production, PGlite in specs). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Database user ids are UUIDs; anything else (e.g. the implicit `local` user) has no rows. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export interface DatabaseConnection {
  db: Database;
  close(): Promise<void>;
}

/** Injection token for the `DatabaseConnection`, or `null` when `DATABASE_URL` is unset. */
export const DATABASE = Symbol("DATABASE");

/** Resolves to `apps/server/drizzle` from both `src/database` and `dist/database`. */
export const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../drizzle");

export async function connectDatabase(
  url: string,
): Promise<DatabaseConnection> {
  const pool = new Pool({ connectionString: url, max: 5 });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, close: () => pool.end() };
}
