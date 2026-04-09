import { Router, type IRouter } from "express";
import { db, fbSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { rDel } from "../lib/redisCache.js";

const router: IRouter = Router();

type FbPage = { id: string; name: string; access_token: string };

async function getPagesFromToken(token: string): Promise<FbPage[]> {
  const url = `https://graph.facebook.com/v25.0/me/accounts?fields=id,name,access_token&access_token=${token}`;
  const resp = await fetch(url);
  const data = (await resp.json()) as { data?: FbPage[]; error?: { message: string } };
  if (data.error || !data.data) return [];
  return data.data;
}

async function subscribePageToFeedEvents(
  pageId: string,
  storedToken: string,
): Promise<{ ok: boolean; error?: string; pageId?: string; pageName?: string; pageToken?: string }> {
  const fields = [
    "feed",
    "messages",
    "messaging_postbacks",
    "messaging_optins",
    "message_deliveries",
    "message_reads",
  ].join(",");

  async function trySubscribe(pid: string, tok: string) {
    const url = `https://graph.facebook.com/v25.0/${pid}/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}&access_token=${tok}`;
    const resp = await fetch(url, { method: "POST" });
    return (await resp.json()) as { success?: boolean; error?: { message: string; code?: number } };
  }

  try {
    let result = await trySubscribe(pageId, storedToken);

    if (result.success === true) {
      return { ok: true, pageId };
    }

    const errCode = result.error?.code;
    const isPageTokenError =
      errCode === 210 ||
      errCode === 1 ||
      /page access token|does not exist|missing permissions|OAuthException/i.test(result.error?.message ?? "");

    if (!isPageTokenError) {
      return { ok: false, error: result.error?.message ?? JSON.stringify(result) };
    }

    console.log("⚙️  Stored token is User Token — fetching Page Token via /me/accounts...");
    const pages = await getPagesFromToken(storedToken);

    if (!pages.length) {
      return {
        ok: false,
        error:
          "لم يتم العثور على صفحات مُدارة بهذا التوكن. تأكد من إضافة صلاحية pages_show_list وأنك إدمن الصفحة.",
      };
    }

    let targetPage = pages.find((p) => p.id === pageId);

    if (!targetPage && pages.length === 1) {
      targetPage = pages[0];
      console.log(`⚙️  pageId mismatch — using only managed page: ${targetPage.name} (${targetPage.id})`);
    }

    if (!targetPage) {
      const names = pages.map((p) => `${p.name} (${p.id})`).join(" | ");
      return {
        ok: false,
        error: `الـ Page ID المخزّن (${pageId}) لا يطابق أي صفحة مُدارة. الصفحات المتاحة: ${names}`,
      };
    }

    result = await trySubscribe(targetPage.id, targetPage.access_token);

    if (result.success === true) {
      console.log(`✅ Subscribed page ${targetPage.name} (${targetPage.id}) to feed events using extracted page token`);
      return {
        ok: true,
        pageId: targetPage.id,
        pageName: targetPage.name,
        pageToken: targetPage.access_token,
      };
    }

    return { ok: false, error: result.error?.message ?? JSON.stringify(result) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

router.get("/fb-settings", async (_req, res): Promise<void> => {
  let [settings] = await db.select().from(fbSettingsTable).limit(1);
  if (!settings) {
    [settings] = await db.insert(fbSettingsTable).values({}).returning();
  }
  res.json({
    ...settings,
    pageAccessToken: settings.pageAccessToken ? "••••••••" : null,
    appSecret: settings.appSecret ? "••••••••" : null,
  });
});

router.post("/fb-settings", async (req, res): Promise<void> => {
  const { pageAccessToken, verifyToken, pageId, appSecret } = req.body as {
    pageAccessToken: string;
    verifyToken: string;
    pageId: string;
    appSecret?: string;
  };

  let [existing] = await db.select().from(fbSettingsTable).limit(1);

  const values: Record<string, any> = {
    pageAccessToken,
    verifyToken,
    pageId,
    updatedAt: new Date(),
  };
  if (appSecret) values.appSecret = appSecret;

  let saved: typeof existing;
  if (!existing) {
    const [created] = await db.insert(fbSettingsTable).values(values).returning();
    await rDel("settings");
    saved = created;
  } else {
    const [updated] = await db
      .update(fbSettingsTable)
      .set(values)
      .where(eq(fbSettingsTable.id, existing.id))
      .returning();
    await rDel("settings");
    saved = updated;
  }

  const subscription = await subscribePageToFeedEvents(pageId, pageAccessToken);
  if (!subscription.ok) {
    console.warn("⚠️  subscribed_apps failed on save:", subscription.error);
  } else {
    console.log("✅ Page subscribed to feed events on save:", subscription.pageId);
    if (subscription.pageId && subscription.pageId !== pageId) {
      await db
        .update(fbSettingsTable)
        .set({ pageId: subscription.pageId, updatedAt: new Date() })
        .where(eq(fbSettingsTable.id, saved.id));
      saved = { ...saved, pageId: subscription.pageId };
      await rDel("settings");
    }
  }

  res.json({
    ...saved,
    pageAccessToken: "••••••••",
    appSecret: saved.appSecret ? "••••••••" : null,
    feedSubscription: subscription,
  });
});

router.post("/fb-settings/subscribe-feed", async (_req, res): Promise<void> => {
  const [settings] = await db.select().from(fbSettingsTable).limit(1);
  if (!settings?.pageAccessToken || !settings.pageId) {
    res.json({ success: false, error: "Facebook settings not configured" });
    return;
  }

  const result = await subscribePageToFeedEvents(settings.pageId, settings.pageAccessToken);

  if (result.ok) {
    const updates: Record<string, any> = { updatedAt: new Date() };
    const corrections: string[] = [];

    if (result.pageId && result.pageId !== settings.pageId) {
      updates.pageId = result.pageId;
      corrections.push(`Page ID: ${settings.pageId} → ${result.pageId}`);
      console.log(`✅ Page ID corrected: ${settings.pageId} → ${result.pageId}`);
    }

    if (result.pageToken && result.pageToken !== settings.pageAccessToken) {
      updates.pageAccessToken = result.pageToken;
      corrections.push("Page Access Token تم استبداله بـ Page Token الصحيح");
      console.log("✅ pageAccessToken replaced with correct Page Token from /me/accounts");
    }

    if (Object.keys(updates).length > 1) {
      await db.update(fbSettingsTable).set(updates).where(eq(fbSettingsTable.id, settings.id));
      await rDel("settings");
    }

    const note = corrections.length ? ` (تصحيح تلقائي: ${corrections.join(" | ")})` : "";
    res.json({
      success: true,
      message: `تم الاشتراك بنجاح${result.pageName ? ` — صفحة: ${result.pageName}` : ""}${note}`,
    });
  } else {
    console.error("❌ subscribe-feed failed:", result.error);
    res.json({ success: false, error: result.error });
  }
});

router.get("/fb-settings/test", async (_req, res): Promise<void> => {
  const [settings] = await db.select().from(fbSettingsTable).limit(1);
  if (!settings?.pageAccessToken || !settings.pageId) {
    res.json({ success: false, error: "Facebook settings not configured" });
    return;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v25.0/me?access_token=${settings.pageAccessToken}`
    );
    const data = (await response.json()) as { id?: string; name?: string; error?: { message: string } };
    if (data.error) {
      res.json({
        success: false,
        error: "Token غير صحيح أو منتهي الصلاحية: " + data.error.message,
      });
    } else {
      const mismatch = data.id !== settings.pageId;
      res.json({
        success: true,
        pageName: data.name ?? null,
        pageId: data.id ?? null,
        pageIdMismatch: mismatch,
      });
    }
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
