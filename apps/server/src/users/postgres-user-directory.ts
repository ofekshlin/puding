import { eq } from "drizzle-orm";
import { isUuid, type Database } from "../database/database";
import { users } from "../database/schema";
import {
  GoogleProfile,
  NewUserDefaults,
  PudingUser,
  UserDirectory,
} from "./user-directory";

type UserRow = typeof users.$inferSelect;

function toUser(row: UserRow): PudingUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? undefined,
    pictureUrl: row.pictureUrl ?? undefined,
    role: row.role,
    status: row.status,
  };
}

export class PostgresUserDirectory extends UserDirectory {
  constructor(private readonly db: Database) {
    super();
  }

  public async findById(id: string): Promise<PudingUser | null> {
    if (!isUuid(id)) return null;
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row ? toUser(row) : null;
  }

  public async findByEmail(email: string): Promise<PudingUser | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    return row ? toUser(row) : null;
  }

  public async upsertFromGoogle(
    profile: GoogleProfile,
    defaults: NewUserDefaults,
  ): Promise<PudingUser> {
    const fields = {
      email: profile.email.toLowerCase(),
      name: profile.name ?? null,
      pictureUrl: profile.pictureUrl ?? null,
    };
    const [row] = await this.db
      .insert(users)
      .values({ googleSub: profile.googleSub, ...fields, ...defaults })
      .onConflictDoUpdate({ target: users.googleSub, set: fields })
      .returning();
    return toUser(row);
  }
}
