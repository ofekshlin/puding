import { desc, eq } from "drizzle-orm";
import { isUuid, type Database } from "../database/database";
import { users } from "../database/schema";
import {
  GoogleProfile,
  NewUserDefaults,
  PudingUser,
  UserAccessUpdate,
  UserDirectory,
  UserStatus,
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
    requestNote: row.requestNote ?? undefined,
    requestedAt: row.requestedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString(),
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

  public async list(status?: UserStatus): Promise<PudingUser[]> {
    const rows = await this.db
      .select()
      .from(users)
      .where(status ? eq(users.status, status) : undefined)
      .orderBy(desc(users.createdAt));
    return rows.map(toUser);
  }

  public async update(
    id: string,
    patch: UserAccessUpdate,
  ): Promise<PudingUser | null> {
    if (!isUuid(id)) return null;
    const { decidedBy, ...access } = patch;
    const decision =
      decidedBy === undefined ? {} : { decidedBy, decidedAt: new Date() };
    const [row] = await this.db
      .update(users)
      .set({ ...access, ...decision })
      .where(eq(users.id, id))
      .returning();
    return row ? toUser(row) : null;
  }

  public async recordAccessRequest(
    id: string,
    note: string | null,
  ): Promise<PudingUser | null> {
    if (!isUuid(id)) return null;
    const [row] = await this.db
      .update(users)
      .set({ requestNote: note, requestedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return row ? toUser(row) : null;
  }
}
