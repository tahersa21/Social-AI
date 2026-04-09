import { pgTable, serial, text, integer, timestamp, doublePrecision, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  fbUserId: text("fb_user_id").notNull(),
  fbUserName: text("fb_user_name"),
  fbProfileUrl: text("fb_profile_url"),
  message: text("message").notNull(),
  sender: text("sender").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  isPaused: integer("is_paused").notNull().default(0),
  sentiment: text("sentiment"),
  label: text("label"),
  confidenceScore: doublePrecision("confidence_score"),
  rescueTriggered: integer("rescue_triggered").notNull().default(0),
  safeModeBlocked: integer("safe_mode_blocked").notNull().default(0),
  providerName: text("provider_name"),
  modelName: text("model_name"),
  sourceType: text("source_type"),
  salesTriggerType: text("sales_trigger_type"),
  convertedToOrder: integer("converted_to_order").notNull().default(0),
  conversionSource: text("conversion_source"),
  conversionValue: doublePrecision("conversion_value"),
  operatorNote: text("operator_note"),
}, (table) => [
  index("conversations_fb_user_id_timestamp_idx").on(table.fbUserId, table.timestamp),
  index("conversations_fb_user_id_sender_idx").on(table.fbUserId, table.sender),
]);

export const insertConversationSchema = createInsertSchema(conversationsTable).omit({ id: true });
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversationsTable.$inferSelect;
