import {
  customType,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (value) => Buffer.from(value),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  googleSub: text("google_sub").notNull().unique(),
  email: text("email").notNull().unique(),
  name: text("name"),
  pictureUrl: text("picture_url"),
  role: text("role", { enum: ["user", "admin"] })
    .notNull()
    .default("user"),
  status: text("status", {
    enum: ["pending", "approved", "rejected"],
  }).notNull(),
  requestNote: text("request_note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: uuid("decided_by").references((): AnyPgColumn => users.id, {
    onDelete: "set null",
  }),
});

export const connections = pgTable(
  "connections",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider", {
      enum: ["spotify", "notion", "devin"],
    }).notNull(),
    kind: text("kind", {
      enum: ["oauth", "static_token", "disconnected"],
    }).notNull(),
    secretCipher: bytea("secret_cipher"),
    keyVersion: smallint("key_version"),
    accountLabel: text("account_label"),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    connectedAt: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastError: text("last_error"),
  },
  (table) => [primaryKey({ columns: [table.userId, table.provider] })],
);

export const oauthStates = pgTable("oauth_states", {
  nonce: text("nonce").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider", {
    enum: ["spotify", "notion", "devin"],
  }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const usageCounters = pgTable(
  "usage_counters",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    day: date("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.metric, table.day] })],
);
