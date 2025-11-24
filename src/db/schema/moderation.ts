import { pgTable, uuid, text, jsonb, timestamp, pgEnum, real } from "drizzle-orm/pg-core";
import { posts, verdictEnum } from "./posts";

export const moderationEvents = pgTable("moderation_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),

  provider: text("provider").notNull(),              // "aws_rekognition"
  providerJobId: text("provider_job_id"),           // video moderation job id
  resultJson: jsonb("result_json"),                 // full AI result
  verdict: verdictEnum("verdict").notNull(),        // ALLOW / BLOCK / REVIEW
  confidence: real("confidence"),
  reason: text("reason"),

  createdAt: timestamp("created_at").defaultNow()
});
