import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const broadcastTemplatesTable = pgTable("broadcast_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default("offers"),
  messageText: text("message_text").notNull(),
  createdAt: text("created_at").notNull(),
});

export type BroadcastTemplate = typeof broadcastTemplatesTable.$inferSelect;
