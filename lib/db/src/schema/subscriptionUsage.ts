import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";

export const subscriptionUsageTable = pgTable("subscription_usage", {
  id: serial("id").primaryKey(),
  monthYear: text("month_year").notNull(),
  aiConversationsUsed: integer("ai_conversations_used").notNull().default(0),
  broadcastSent: integer("broadcast_sent").notNull().default(0),
  messagesLimitWarningSent: integer("messages_limit_warning_sent").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(""),
});

export type SubscriptionUsage = typeof subscriptionUsageTable.$inferSelect;
