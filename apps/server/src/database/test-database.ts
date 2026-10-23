import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database, DatabaseConnection } from "./database";
import { MIGRATIONS_FOLDER } from "./database";
import * as schema from "./schema";

/** An in-memory Postgres (PGlite) with Puding's real migrations applied, for specs. */
export async function createTestDatabase(): Promise<DatabaseConnection> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db: db as unknown as Database, close: () => client.close() };
}
