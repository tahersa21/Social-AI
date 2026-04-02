import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";

export const providerUsageLogTable = pgTable("provider_usage_log", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id").notNull(),
  success: integer("success").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  error: text("error"),
  createdAt: text("created_at").notNull(),
});

export type ProviderUsageLog = typeof providerUsageLogTable.$inferSelect;
