import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const processedMessagesTable = pgTable("processed_messages", {
  mid:         text("mid").primaryKey(),
  senderId:    text("sender_id").notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});
