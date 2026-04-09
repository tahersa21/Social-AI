import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aiProvidersTable = pgTable("ai_providers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  providerType: text("provider_type").notNull(),
  apiKey: text("api_key").notNull().default(""),
  baseUrl: text("base_url"),
  modelName: text("model_name").notNull(),
  isActive: integer("is_active").notNull().default(0),
  priority: integer("priority").notNull().default(0),
  isEnabled: integer("is_enabled").notNull().default(1),
  failCount: integer("fail_count").notNull().default(0),
  lastUsedAt: text("last_used_at"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAiProviderSchema = createInsertSchema(aiProvidersTable).omit({ id: true, createdAt: true });
export type InsertAiProvider = z.infer<typeof insertAiProviderSchema>;
export type AiProvider = typeof aiProvidersTable.$inferSelect;
