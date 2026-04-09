import { Router, type IRouter } from "express";
import { db, conversationsTable, fbSettingsTable } from "@workspace/db";
import { eq, sql, countDistinct } from "drizzle-orm";
import { sendFbMessage } from "../lib/ai.js";

const router: IRouter = Router();

router.get("/conversations", async (_req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (fb_user_id)
      fb_user_id as "fbUserId",
      fb_user_name as "fbUserName",
      fb_profile_url as "fbProfileUrl",
      message as "lastMessage",
      sender as "lastSender",
      timestamp as "lastTimestamp",
      is_paused as "isPaused",
      sentiment,
      label
    FROM conversations
    ORDER BY fb_user_id, timestamp DESC
  `);
  res.json(rows.rows);
});

router.get("/conversations/paused-count", async (_req, res): Promise<void> => {
  const [result] = await db
    .select({ count: countDistinct(conversationsTable.fbUserId) })
    .from(conversationsTable)
    .where(eq(conversationsTable.isPaused, 1));
  res.json({ count: result?.count ?? 0 });
});

router.get("/conversations/:fbUserId", async (req, res): Promise<void> => {
  const fbUserId = req.params["fbUserId"]!;
  const rows = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.fbUserId, fbUserId))
    .orderBy(conversationsTable.timestamp);
  res.json(rows);
});

router.post("/conversations/:fbUserId/reply", async (req, res): Promise<void> => {
  const fbUserId = req.params["fbUserId"]!;
  const { message } = req.body as { message?: string };

  if (!message || !message.trim()) {
    res.status(400).json({ message: "Message is required" });
    return;
  }

  const [settings] = await db.select().from(fbSettingsTable).limit(1);
  if (!settings?.pageAccessToken) {
    res.status(400).json({ message: "Facebook not connected — set page access token first" });
    return;
  }

  try {
    await sendFbMessage(
      settings.pageAccessToken,
      fbUserId,
      message.trim(),
      settings.pageId ?? undefined
    );
  } catch (err) {
    console.error("[reply] Failed to send FB message:", err);
    res.status(502).json({ message: "Failed to send message to Facebook" });
    return;
  }

  const existingRows = await db
    .select({ fbUserName: conversationsTable.fbUserName, fbProfileUrl: conversationsTable.fbProfileUrl })
    .from(conversationsTable)
    .where(eq(conversationsTable.fbUserId, fbUserId))
    .limit(1);

  const existing = existingRows[0];

  const [inserted] = await db
    .insert(conversationsTable)
    .values({
      fbUserId,
      fbUserName: existing?.fbUserName ?? "مستخدم",
      fbProfileUrl: existing?.fbProfileUrl ?? null,
      message: message.trim(),
      sender: "admin",
      isPaused: 1,
    })
    .returning();

  res.json(inserted);
});

router.patch("/conversations/:fbUserId/pause", async (req, res): Promise<void> => {
  const fbUserId = req.params["fbUserId"]!;
  await db.update(conversationsTable).set({ isPaused: 1 }).where(eq(conversationsTable.fbUserId, fbUserId));
  res.json({ message: "AI paused for this user", isPaused: 1 });
});

router.patch("/conversations/:fbUserId/resume", async (req, res): Promise<void> => {
  const fbUserId = req.params["fbUserId"]!;
  await db.update(conversationsTable).set({ isPaused: 0 }).where(eq(conversationsTable.fbUserId, fbUserId));
  res.json({ message: "AI resumed for this user", isPaused: 0 });
});

router.patch("/conversations/:fbUserId/label", async (req, res): Promise<void> => {
  const fbUserId = req.params["fbUserId"]!;
  const body = req.body as { label?: string | null };
  await db.update(conversationsTable).set({ label: body.label ?? null }).where(eq(conversationsTable.fbUserId, fbUserId));
  res.json({ message: "Label updated", label: body.label ?? null });
});

router.patch("/conversations/:fbUserId/sentiment", async (req, res): Promise<void> => {
  const fbUserId = req.params["fbUserId"]!;
  const body = req.body as { sentiment?: string | null };
  await db.update(conversationsTable).set({ sentiment: body.sentiment ?? null }).where(eq(conversationsTable.fbUserId, fbUserId));
  res.json({ message: "Sentiment updated", sentiment: body.sentiment ?? null });
});

router.patch("/conversations/:fbUserId/note", async (req, res): Promise<void> => {
  const fbUserId = req.params["fbUserId"]!;
  const body = req.body as { note?: string | null };
  await db.update(conversationsTable).set({ operatorNote: body.note ?? null }).where(eq(conversationsTable.fbUserId, fbUserId));
  res.json({ message: "Note updated", operatorNote: body.note ?? null });
});

export default router;
