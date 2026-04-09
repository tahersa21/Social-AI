import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { productsTable } from "./products.js";

export const preOrdersTable = pgTable("pre_orders", {
  id: serial("id").primaryKey(),
  fbUserId: text("fb_user_id").notNull(),
  fbUserName: text("fb_user_name"),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  productName: text("product_name"),
  customerName: text("customer_name"),
  phone: text("phone"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});
