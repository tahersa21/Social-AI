import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const orderSessionsTable = pgTable("order_sessions", {
  id: serial("id").primaryKey(),
  fbUserId: text("fb_user_id").notNull().unique(),
  productName: text("product_name"),
  productId: integer("product_id"),
  quantity: integer("quantity").notNull().default(1),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerWilaya: text("customer_wilaya"),
  customerAddress: text("customer_address"),
  deliveryType: text("delivery_type"),
  deliveryPrice: integer("delivery_price"),
  step: text("step").notNull().default("collecting"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OrderSession = typeof orderSessionsTable.$inferSelect;
