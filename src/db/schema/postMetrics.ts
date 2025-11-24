// src/db/schema/postMetrics.ts
import { pgTable, uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { posts } from "./posts";

export const postMetrics = pgTable("post_metrics", {
  postId: uuid("post_id").primaryKey().references(() => posts.id, { onDelete: "cascade" }),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  saves: integer("saves").notNull().default(0),
  views: integer("views").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});
