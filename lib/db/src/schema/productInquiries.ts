import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";

export const productInquiriesTable = pgTable("product_inquiries", {
  id: serial("id").primaryKey(),
  fbUserId: text("fb_user_id").notNull(),
  fbUserName: text("fb_user_name"),
  productName: text("product_name").notNull(),
  productId: integer("product_id"),
  inquiredAt: text("inquired_at").notNull(),
  reminderSent: integer("reminder_sent").notNull().default(0),
  converted: integer("converted").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export type ProductInquiry = typeof productInquiriesTable.$inferSelect;
