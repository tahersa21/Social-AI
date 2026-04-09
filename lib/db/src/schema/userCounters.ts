import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const userCountersTable = pgTable("user_counters", {
  fbUserId:      text("fb_user_id").primaryKey(),
  offTopicCount: integer("off_topic_count").notNull().default(0),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
