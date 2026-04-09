import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fbSettingsTable = pgTable("fb_settings", {
  id: serial("id").primaryKey(),
  pageAccessToken: text("page_access_token"),
  verifyToken: text("verify_token"),
  pageId: text("page_id"),
  appSecret: text("app_secret"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const insertFbSettingsSchema = createInsertSchema(fbSettingsTable).omit({ id: true });
export type InsertFbSettings = z.infer<typeof insertFbSettingsSchema>;
export type FbSettings = typeof fbSettingsTable.$inferSelect;
