import { pgTable, text, varchar, timestamp, uuid, jsonb, pgEnum } from "drizzle-orm/pg-core";

export const postStatusEnum = pgEnum("post_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "NEEDS_MANUAL_REVIEW"
]);

export const verdictEnum = pgEnum("verdict", [
  "ALLOW",
  "BLOCK",
  "REVIEW"
]);

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),

  mediaUrl: text("media_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),

  caption: text("caption"),
  hashtags: text("hashtags").array().default([]),
  location: text("location"),

  mediaType: varchar("media_type", { length: 20 }).notNull(), // 'video' or 'image'
  status: postStatusEnum("status").notNull().default("PENDING"),

  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: uuid("reviewed_by"),
  reasonRejected: text("reason_rejected"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
