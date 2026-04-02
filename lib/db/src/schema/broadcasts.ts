import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const broadcastsTable = pgTable("broadcasts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  messageText: text("message_text").notNull(),
  imageUrl: text("image_url"),
  targetFilter: text("target_filter").notNull().default("all"),
  targetLabel: text("target_label"),
  status: text("status").notNull().default("draft"),
  sentCount: integer("sent_count").notNull().default(0),
  totalRecipients: integer("total_recipients").notNull().default(0),
  scheduledAt: text("scheduled_at"),
  sentAt: text("sent_at"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Broadcast = typeof broadcastsTable.$inferSelect;
