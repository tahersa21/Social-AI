import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";

export const deliveryPricesTable = pgTable("delivery_prices", {
  id: serial("id").primaryKey(),
  wilayaId: integer("wilaya_id").notNull().unique(),
  wilayaName: text("wilaya_name").notNull(),
  homePrice: integer("home_price").notNull().default(0),
  officePrice: integer("office_price").notNull().default(0),
});
