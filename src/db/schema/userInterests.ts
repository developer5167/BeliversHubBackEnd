import { pgTable, uuid, jsonb, timestamp } from "drizzle-orm/pg-core";

export const userInterests = pgTable("user_interests", {
  userId: uuid("user_id").primaryKey(),
  interests: jsonb("interests").notNull().default({}),
  updatedAt: timestamp("updated_at").defaultNow()
});
