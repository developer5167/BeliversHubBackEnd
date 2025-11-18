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
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull().references(() => users.id),
  caption: text("caption"),
  location: varchar("location", { length: 255 }).default(""),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const upload_sessions = pgTable("upload_sessions", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull().references(() => users.id),
  upload_id: varchar("upload_id", { length: 64 }).notNull(), // uuid we return to client
  file_key: varchar("file_key", { length: 1024 }).notNull(),
  file_size: integer("file_size").default(0),
  mime_type: varchar("mime_type", { length: 128 }).default(""),
  status: varchar("status", { length: 32 }).default("initiated"), // initiated, uploaded, processing, done, failed
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const media = pgTable("media", {
  id: serial("id").primaryKey(),
  post_id: integer("post_id").references(() => posts.id),
  upload_session_id: integer("upload_session_id").references(() => upload_sessions.id),
  type: varchar("type", { length: 16 }).notNull(), // video/image
  duration_sec: integer("duration_sec").default(0),
  width: integer("width").default(0),
  height: integer("height").default(0),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const media_variants = pgTable("media_variants", {
  id: serial("id").primaryKey(),
  media_id: integer("media_id").references(() => media.id),
  quality: varchar("quality", { length: 64 }).notNull(),
  url: text("url").notNull(),
  size_bytes: integer("size_bytes").default(0),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const thumbnails = pgTable("thumbnails", {
  id: serial("id").primaryKey(),
  media_id: integer("media_id").references(() => media.id),
  url: text("url").notNull(),
  is_selected: boolean("is_selected").default(false),
});

export const hashtags = pgTable("hashtags", {
  id: serial("id").primaryKey(),
  tag: varchar("tag", { length: 128 }).notNull(),
  category: varchar("category", { length: 128 }).default("general"), // Christian categories suggested later
});
