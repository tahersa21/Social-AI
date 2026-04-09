import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { productsTable } from "./products.js";

export const userProductContextTable = pgTable("user_product_context", {
  fbUserId: text("fb_user_id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
