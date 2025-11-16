import { pgTable, serial, varchar, text, timestamp, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }),
  username: varchar("username", { length: 200 }).notNull(),
  avatar_url: text("avatar_url"),
  bio: text("bio"),
  created_at: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  usernameIdx: uniqueIndex("users_username_idx").on(t.username)
}));

export const auth_providers = pgTable("auth_providers", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id),
  provider: varchar("provider", { length: 50 }).notNull(),
  provider_id: varchar("provider_id", { length: 300 }).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull()
});

export const refresh_tokens = pgTable("refresh_tokens", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id),
  token_hash: varchar("token_hash", { length: 512 }).notNull(),
  revoked: boolean("revoked").default(false),
  created_at: timestamp("created_at").defaultNow().notNull(),
  expires_at: timestamp("expires_at").notNull()
});
