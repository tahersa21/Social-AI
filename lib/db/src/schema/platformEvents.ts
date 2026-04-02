import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const platformEventsTable = pgTable("platform_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  fbUserId: text("fb_user_id"),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformEvent = typeof platformEventsTable.$inferSelect;
