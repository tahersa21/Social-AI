import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const productCategoriesTable = pgTable("product_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProductCategory = typeof productCategoriesTable.$inferSelect;
