import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { productsTable } from "./products.js";

export const preOrderSessionsTable = pgTable("pre_order_sessions", {
  fbUserId: text("fb_user_id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  productName: text("product_name"),
  step: text("step").notNull().default("awaiting_name"),
  customerName: text("customer_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
