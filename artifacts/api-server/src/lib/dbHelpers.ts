import { db, fbSettingsTable, aiConfigTable, conversationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { TTL } from "./cache.js";
import { rGet, rSet } from "./redisCache.js";

export type ConvEntry = {
  fbUserId: string;
  fbUserName: string;
  fbProfileUrl?: string | null;
  message: string;
  sender: "user" | "bot";
  isPaused?: number;
  sentiment?: string | null;
  salesTriggerType?: string | null;
  sourceType?: string | null;
  safeModeBlocked?: number | null;
  rescueTriggered?: number | null;
  confidenceScore?: number | null;
  providerName?: string | null;
  modelName?: string | null;
  timestamp?: Date;
};

export async function saveConversation(entry: ConvEntry): Promise<number | null> {
  const [row] = await db.insert(conversationsTable).values({
    fbUserId:       entry.fbUserId,
    fbUserName:     entry.fbUserName,
    fbProfileUrl:   entry.fbProfileUrl ?? null,
    message:        entry.message,
    sender:         entry.sender,
    isPaused:       entry.isPaused ?? 0,
    sentiment:      entry.sentiment ?? null,
    salesTriggerType: entry.salesTriggerType ?? null,
    sourceType:     entry.sourceType ?? null,
    safeModeBlocked: entry.safeModeBlocked ?? 0,
    rescueTriggered: entry.rescueTriggered ?? 0,
    confidenceScore: entry.confidenceScore ?? null,
    providerName:   entry.providerName ?? null,
    modelName:      entry.modelName ?? null,
    timestamp:      entry.timestamp ?? new Date(),
  }).returning({ id: conversationsTable.id });
  return row?.id ?? null;
}

export async function getSettings(tenantId?: number) {
  if (tenantId) {
    const [settings] = await db.select().from(fbSettingsTable)
      .where(eq(fbSettingsTable.id, tenantId))
      .limit(1);
    return settings ?? null;
  }
  const cached = await rGet<typeof fbSettingsTable.$inferSelect>("settings");
  if (cached) return cached;
  const [settings] = await db.select().from(fbSettingsTable).limit(1);
  if (settings) await rSet("settings", settings, TTL.SETTINGS);
  return settings ?? null;
}

export async function getConfig(tenantId?: number) {
  if (tenantId) {
    const [config] = await db.select().from(aiConfigTable)
      .where(eq(aiConfigTable.id, tenantId))
      .limit(1);
    return config ?? null;
  }
  const cached = await rGet<typeof aiConfigTable.$inferSelect>("config");
  if (cached) return cached;
  const [config] = await db.select().from(aiConfigTable).limit(1);
  if (config) await rSet("config", config, TTL.CONFIG);
  return config ?? null;
}

export async function isUserPaused(fbUserId: string): Promise<boolean> {
  const [latest] = await db
    .select({ isPaused: conversationsTable.isPaused })
    .from(conversationsTable)
    .where(eq(conversationsTable.fbUserId, fbUserId))
    .orderBy(desc(conversationsTable.timestamp))
    .limit(1);
  return latest?.isPaused === 1;
}
