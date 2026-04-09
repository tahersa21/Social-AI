import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products.js";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  fbUserId: text("fb_user_id").notNull(),
  fbUserName: text("fb_user_name"),
  fbProfileUrl: text("fb_profile_url"),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  productName: text("product_name"),
  unitPrice: real("unit_price"),
  quantity: integer("quantity").notNull().default(1),
  totalPrice: real("total_price"),
  status: text("status").notNull().default("pending"),
  note: text("note"),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerWilaya: text("customer_wilaya"),
  customerCommune: text("customer_commune"),
  customerAddress: text("customer_address"),
  deliveryType: text("delivery_type"),
  deliveryPrice: real("delivery_price"),
  source: text("source").notNull().default("messenger"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
