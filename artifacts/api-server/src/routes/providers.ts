import { Router, type IRouter } from "express";
import { db, aiProvidersTable, providerUsageLogTable } from "@workspace/db";
import { eq, sql, gte, and } from "drizzle-orm";
import { encrypt, decrypt, maskKey } from "../lib/encryption.js";
import { detectApiFormat, testWithFormat } from "../lib/apiTransformer.js";

const router: IRouter = Router();

function resolveProvType(rawType: string, url: string): string {
  if (rawType.includes("gemini") || url.includes("generativelanguage.googleapis.com")) return "gemini";
  if (rawType === "anthropic" || (rawType === "custom" && url.includes("anthropic.com"))) return "anthropic";
  if (rawType === "orbit" || (rawType === "custom" && url.includes("orbit-provider.com"))) return "orbit";
  if (rawType === "agentrouter" || (rawType === "custom" && url.includes("agentrouter.org"))) return "agentrouter";
  if (rawType === "deepseek" || (rawType === "custom" && url.includes("deepseek.com"))) return "deepseek";
  if (rawType === "groq" || (rawType === "custom" && url.includes("groq.com"))) return "groq";
  if (rawType === "openrouter" || (rawType === "custom" && url.includes("openrouter.ai"))) return "openrouter";
  if (rawType === "openai" || (rawType === "custom" && url.includes("openai.com"))) return "openai";
  if (rawType !== "custom") return rawType;
  return "openai";
}

function sanitizeProvider(p: typeof aiProvidersTable.$inferSelect) {
  return {
    ...p,
    apiKey: p.apiKey ? maskKey(decrypt(p.apiKey)) : "",
  };
}

router.get("/providers", async (_req, res): Promise<void> => {
  const rows = await db.select().from(aiProvidersTable).orderBy(aiProvidersTable.id);
  res.json(rows.map(sanitizeProvider));
});

router.post("/providers", async (req, res): Promise<void> => {
  const { name, providerType, apiKey, baseUrl, modelName } = req.body as {
    name: string;
    providerType: string;
    apiKey: string;
    baseUrl?: string;
    modelName: string;
  };

  if (!name || !modelName) {
    res.status(400).json({ message: "name and modelName are required" });
    return;
  }

  const [row] = await db
    .insert(aiProvidersTable)
    .values({
      name,
      providerType: providerType || "custom",
      apiKey: apiKey ? encrypt(apiKey) : "",
      baseUrl: baseUrl ?? null,
      modelName,
      isActive: 0,
    })
    .returning();

  res.status(201).json(sanitizeProvider(row!));
});

router.put("/providers/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(raw!, 10);
  const { name, providerType, apiKey, baseUrl, modelName } = req.body as {
    name?: string;
    providerType?: string;
    apiKey?: string;
    baseUrl?: string;
    modelName?: string;
  };

  const { priority, isEnabled } = req.body as {
    priority?: number;
    isEnabled?: number;
  };

  const updateData: Partial<typeof aiProvidersTable.$inferInsert> = {};
  if (name !== undefined) updateData.name = name;
  if (providerType !== undefined) updateData.providerType = providerType;
  if (apiKey !== undefined) updateData.apiKey = apiKey ? encrypt(apiKey) : "";
  if (baseUrl !== undefined) updateData.baseUrl = baseUrl;
  if (modelName !== undefined) updateData.modelName = modelName;
  if (priority !== undefined) updateData.priority = priority;
  if (isEnabled !== undefined) updateData.isEnabled = isEnabled;

  const [row] = await db
    .update(aiProvidersTable)
    .set(updateData)
    .where(eq(aiProvidersTable.id, id))
    .returning();

  if (!row) {
    res.status(404).json({ message: "Provider not found" });
    return;
  }

  res.json(sanitizeProvider(row));
});

router.delete("/providers/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(raw!, 10);

  await db.delete(aiProvidersTable).where(eq(aiProvidersTable.id, id));
  res.json({ message: "Provider deleted" });
});

router.post("/providers/:id/activate", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(raw!, 10);

  await db.update(aiProvidersTable).set({ isActive: 0 });
  await db.update(aiProvidersTable).set({ isActive: 1 }).where(eq(aiProvidersTable.id, id));
  res.json({ message: "Provider activated" });
});

router.post("/providers/:id/test", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(raw!, 10);

  const [provider] = await db
    .select()
    .from(aiProvidersTable)
    .where(eq(aiProvidersTable.id, id))
    .limit(1);

  if (!provider) {
    res.status(404).json({ message: "Provider not found" });
    return;
  }

  const start = Date.now();
  try {
    const apiKey = decrypt(provider.apiKey);
    console.log("🔧 Testing provider:", {
      id: provider.id,
      name: provider.name,
      type: provider.providerType,
      baseUrl: provider.baseUrl,
      model: provider.modelName,
      keyLength: apiKey?.length ?? 0,
      keyPrefix: apiKey?.substring(0, 8) ?? "(empty)",
    });
    if (!apiKey) {
      res.json({ success: false, response: "No API key configured — مفتاح API غير موجود", latencyMs: 0 });
      return;
    }

    const rawType = provider.providerType.toLowerCase();
    const url = (provider.baseUrl ?? "").toLowerCase();
    const provType = resolveProvType(rawType, url);
    const apiFormat = detectApiFormat(rawType);
    let responseText: string;

    if (apiFormat === "raw_single" || apiFormat === "raw_messages") {
      const endpointUrl = provider.baseUrl ?? "";
      if (!endpointUrl) {
        res.json({ success: false, response: "لا يوجد رابط endpoint — أدخل الرابط الكامل في حقل Base URL", latencyMs: 0 });
        return;
      }
      console.log(`🔧 Raw format test [${rawType}] → ${endpointUrl} [${provider.modelName}]`);
      responseText = await testWithFormat(apiFormat, apiKey, endpointUrl, provider.modelName);
    } else if (provType === "anthropic" || provType === "orbit" || provType === "agentrouter") {
      const base = (provType !== "anthropic" && provider.baseUrl)
        ? provider.baseUrl.replace(/\/$/, "")
        : "https://api.anthropic.com";
      const fullUrl = `${base}/v1/messages`;
      console.log(`🔧 Anthropic-compatible test → ${fullUrl} [${provType}/${provider.modelName}]`);
      const r = await fetch(fullUrl, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: provider.modelName,
          max_tokens: 10,
          messages: [{ role: "user", content: "Say hello in one word" }],
        }),
      });
      const rawText = await r.text();
      if (rawText.trim().startsWith("<")) {
        throw new Error(`${provType}: API returned HTML instead of JSON (${fullUrl}). Check API key and base URL.`);
      }
      const data = JSON.parse(rawText) as { content?: Array<{ text: string }>; error?: { message: string } };
      if (data.error) throw new Error(`${provType}: ${data.error.message}`);
      responseText = data.content?.[0]?.text ?? "No response";
    } else {
      const cleanBase = (provider.baseUrl ?? "https://api.openai.com").replace(/\/$/, "");
      const skipV1 = provType === "deepseek" || provType === "gemini";
      const endpoint = skipV1 ? "/chat/completions" : "/v1/chat/completions";

      const extraHeaders: Record<string, string> = {};
      if (provType === "openrouter") {
        extraHeaders["HTTP-Referer"] = process.env["REPLIT_DEV_DOMAIN"]
          ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
          : "https://facebook-ai-agent.replit.app";
        extraHeaders["X-Title"] = "Facebook AI Agent";
      }

      const r = await fetch(`${cleanBase}${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...extraHeaders,
        },
        body: JSON.stringify({
          model: provider.modelName,
          messages: [{ role: "user", content: "Say hello in one word" }],
          max_tokens: 10,
        }),
      });
      const data = (await r.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string } | string;
      };
      if (data.error) {
        const errMsg = typeof data.error === "string" ? data.error : data.error.message ?? JSON.stringify(data.error);
        throw new Error(`${provType}: ${errMsg}`);
      }
      responseText = data.choices?.[0]?.message?.content ?? "No response";
    }

    res.json({ success: true, response: responseText, latencyMs: Date.now() - start });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    console.error(`❌ Provider test failed [${provider.providerType}/${provider.modelName}] (${provider.baseUrl}):`, errMsg);
    res.json({
      success: false,
      response: errMsg,
      latencyMs: Date.now() - start,
    });
  }
});

router.get("/providers/stats", async (_req, res): Promise<void> => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const stats = await db
    .select({
      providerId: providerUsageLogTable.providerId,
      totalCalls: sql<number>`count(*)`.as("total_calls"),
      successCount: sql<number>`sum(case when ${providerUsageLogTable.success} = 1 then 1 else 0 end)`.as("success_count"),
      avgLatency: sql<number>`round(avg(${providerUsageLogTable.latencyMs}))`.as("avg_latency"),
      lastError: sql<string>`max(case when ${providerUsageLogTable.success} = 0 then ${providerUsageLogTable.error} else null end)`.as("last_error"),
    })
    .from(providerUsageLogTable)
    .where(gte(providerUsageLogTable.createdAt, cutoff))
    .groupBy(providerUsageLogTable.providerId);

  const providers = await db.select({ id: aiProvidersTable.id, name: aiProvidersTable.name }).from(aiProvidersTable);
  const nameMap = new Map(providers.map(p => [p.id, p.name]));

  // Auto-cleanup: delete orphan usage log entries (stale providerIds not in aiProvidersTable)
  const knownIds = providers.map(p => p.id);
  const orphanIds = stats.map(s => s.providerId).filter(id => !knownIds.includes(id));
  if (orphanIds.length > 0) {
    for (const orphanId of orphanIds) {
      await db.delete(providerUsageLogTable).where(eq(providerUsageLogTable.providerId, orphanId));
    }
  }

  // Filter out orphan entries (providers deleted from DB) and include only known providers
  const result = stats
    .filter(s => nameMap.has(s.providerId))
    .map(s => ({
      providerId: s.providerId,
      providerName: nameMap.get(s.providerId) ?? "Unknown",
      totalCalls: Number(s.totalCalls),
      successCount: Number(s.successCount),
      successRate: s.totalCalls > 0 ? Math.round((Number(s.successCount) / Number(s.totalCalls)) * 100) : 0,
      avgLatencyMs: Number(s.avgLatency) || 0,
      lastError: s.lastError ?? null,
    }));

  res.json(result);
});

// DELETE /providers/:id/reset-stats — clear failCount and usage log entries for a provider
router.delete("/providers/:id/reset-stats", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"]!, 10);
  await db.update(aiProvidersTable)
    .set({ failCount: 0 })
    .where(eq(aiProvidersTable.id, id));
  await db.delete(providerUsageLogTable)
    .where(eq(providerUsageLogTable.providerId, id));
  res.json({ success: true });
});

export default router;
