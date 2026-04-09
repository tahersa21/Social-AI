import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const productFoldersTable = pgTable("product_folders", {
  id:        serial("id").primaryKey(),
  name:      text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
