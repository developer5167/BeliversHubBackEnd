import { pgTable, uuid, integer, timestamp } from "drizzle-orm/pg-core";

export const watchEvents = pgTable("watch_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  postId: uuid("post_id").notNull(),
  watchedSeconds: integer("watched_seconds").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});
