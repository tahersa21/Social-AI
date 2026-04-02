import { Router, type IRouter } from "express";
import { db, fbSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

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

  if (!existing) {
    const [created] = await db
      .insert(fbSettingsTable)
      .values(values)
      .returning();
    res.json({ ...created, pageAccessToken: "••••••••", appSecret: created.appSecret ? "••••••••" : null });
    return;
  }

  const [updated] = await db
    .update(fbSettingsTable)
    .set(values)
    .where(eq(fbSettingsTable.id, existing.id))
    .returning();

  res.json({ ...updated, pageAccessToken: "••••••••", appSecret: updated.appSecret ? "••••••••" : null });
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
