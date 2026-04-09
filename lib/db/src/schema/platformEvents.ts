import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

export const platformEventsTable = pgTable("platform_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  fbUserId: text("fb_user_id"),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("platform_events_fb_user_id_idx").on(table.fbUserId),
]);

export type PlatformEvent = typeof platformEventsTable.$inferSelect;
