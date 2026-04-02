import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  fbUserId: text("fb_user_id").notNull().unique(),
  fbUserName: text("fb_user_name"),
  fbProfileUrl: text("fb_profile_url"),
  phone: text("phone"),
  email: text("email"),
  label: text("label").notNull().default("new"),
  notes: text("notes"),
  source: text("source").notNull().default("messenger"),
  lastInteractionAt: text("last_interaction_at"),
  totalMessages: integer("total_messages").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Lead = typeof leadsTable.$inferSelect;
