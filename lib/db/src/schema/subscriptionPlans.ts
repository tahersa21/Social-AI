import { pgTable, serial, text, integer, real } from "drizzle-orm/pg-core";

export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  priceDzd: real("price_dzd").notNull().default(0),
  aiConversationsLimit: integer("ai_conversations_limit").notNull().default(100),
  productsLimit: integer("products_limit").notNull().default(10),
  providersLimit: integer("providers_limit").notNull().default(1),
  broadcastLimit: integer("broadcast_limit").notNull().default(0),
  appointmentsEnabled: integer("appointments_enabled").notNull().default(0),
  leadsEnabled: integer("leads_enabled").notNull().default(0),
  analyticsAdvanced: integer("analytics_advanced").notNull().default(0),
  multiPage: integer("multi_page").notNull().default(0),
  isActive: integer("is_active").notNull().default(1),
});

export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;
