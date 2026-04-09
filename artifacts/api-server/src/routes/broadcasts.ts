import { Router, type IRouter } from "express";
import multer from "multer";
import { db, broadcastsTable, leadsTable, fbSettingsTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { sendFbMessage, sendFbImageFromDataUrl } from "../lib/ai.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router: IRouter = Router();

router.get("/broadcasts/image/:id", async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const [broadcast] = await db.select({ imageUrl: broadcastsTable.imageUrl }).from(broadcastsTable).where(eq(broadcastsTable.id, id)).limit(1);

  if (!broadcast?.imageUrl) {
    res.status(404).end();
    return;
  }

  const dataUrl = broadcast.imageUrl;
  if (dataUrl.startsWith("data:")) {
    const [meta, b64] = dataUrl.split(",") as [string, string];
    const mimeMatch = meta.match(/data:([^;]+)/);
    const mime = mimeMatch?.[1] ?? "image/jpeg";
    const buf = Buffer.from(b64, "base64");
    res.set("Content-Type", mime);
    res.set("Cache-Control", "public, max-age=86400");
    res.end(buf);
  } else {
    res.redirect(302, dataUrl);
  }
});

router.get("/broadcasts", async (_req, res): Promise<void> => {
  const rows = await db.select().from(broadcastsTable).orderBy(desc(broadcastsTable.createdAt));
  res.json(rows);
});

router.post("/broadcasts", upload.single("broadcastImage"), async (req, res): Promise<void> => {
  const body = req.body as {
    title?: string;
    messageText?: string;
    imageUrl?: string;
    targetFilter?: string;
    targetLabel?: string;
    scheduledAt?: string;
  };

  if (!body.title || !body.messageText) {
    res.status(400).json({ message: "title and messageText are required" });
    return;
  }

  const file = req.file as Express.Multer.File | undefined;
  const imageUrl = file
    ? `data:${file.mimetype};base64,${file.buffer.toString("base64")}`
    : (body.imageUrl ?? null);

  const [created] = await db
    .insert(broadcastsTable)
    .values({
      title: body.title,
      messageText: body.messageText,
      imageUrl,
      targetFilter: body.targetFilter ?? "all",
      targetLabel: body.targetLabel ?? null,
      status: "draft",
      scheduledAt: body.scheduledAt ?? null,
    })
    .returning();

  res.status(201).json(created);
});

router.patch("/broadcasts/:id", async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const body = req.body as {
    title?: string;
    messageText?: string;
    imageUrl?: string;
    targetFilter?: string;
    targetLabel?: string;
    scheduledAt?: string;
  };

  const [broadcast] = await db.select().from(broadcastsTable).where(eq(broadcastsTable.id, id)).limit(1);
  if (!broadcast) {
    res.status(404).json({ message: "Broadcast not found" });
    return;
  }

  const [updated] = await db
    .update(broadcastsTable)
    .set({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.messageText !== undefined && { messageText: body.messageText }),
      ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
      ...(body.targetFilter !== undefined && { targetFilter: body.targetFilter }),
      ...(body.targetLabel !== undefined && { targetLabel: body.targetLabel }),
      ...(body.scheduledAt !== undefined && { scheduledAt: body.scheduledAt }),
    })
    .where(eq(broadcastsTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/broadcasts/:id", async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  await db.delete(broadcastsTable).where(eq(broadcastsTable.id, id));
  res.json({ message: "Deleted" });
});

router.post("/broadcasts/:id/send", async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);

  const [broadcast] = await db.select().from(broadcastsTable).where(eq(broadcastsTable.id, id)).limit(1);
  if (!broadcast) {
    res.status(404).json({ message: "Broadcast not found" });
    return;
  }

  const [fbRow] = await db
    .select({ pageAccessToken: fbSettingsTable.pageAccessToken, pageId: fbSettingsTable.pageId })
    .from(fbSettingsTable)
    .limit(1);
  const token = fbRow?.pageAccessToken ?? null;
  const fbPageId = fbRow?.pageId ?? undefined;
  if (!token) {
    res.status(400).json({ message: "Facebook page not connected" });
    return;
  }

  // Facebook 24h messaging window: select users whose LAST conversation message (any sender)
  // occurred within 24 hours — enforced via MAX(timestamp) per user.
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let activeUserIds: string[] = [];

  if (broadcast.targetFilter === "label" && broadcast.targetLabel) {
    const labelLeads = await db
      .select({ fbUserId: leadsTable.fbUserId })
      .from(leadsTable)
      .where(eq(leadsTable.label, broadcast.targetLabel));
    const labelUserIds = labelLeads.map((l) => l.fbUserId);

    if (labelUserIds.length > 0) {
      const recentRows = await db.execute(sql`
        SELECT fb_user_id
        FROM conversations
        WHERE fb_user_id = ANY(${labelUserIds})
        GROUP BY fb_user_id
        HAVING MAX(timestamp) > ${twentyFourHoursAgo}
      `);
      activeUserIds = (recentRows.rows as { fb_user_id: string }[]).map((r) => r.fb_user_id);
    }
  } else if (broadcast.targetFilter === "appointments") {
    // Appointment users within the 24h messaging window
    const apptRows = await db.execute(sql`
      SELECT DISTINCT a.fb_user_id
      FROM appointments a
      WHERE a.status IN ('pending', 'confirmed')
        AND EXISTS (
          SELECT 1 FROM (
            SELECT fb_user_id, MAX(timestamp) AS last_ts
            FROM conversations
            GROUP BY fb_user_id
          ) sub
          WHERE sub.fb_user_id = a.fb_user_id
            AND sub.last_ts > ${twentyFourHoursAgo}
        )
    `);
    activeUserIds = (apptRows.rows as { fb_user_id: string }[]).map((r) => r.fb_user_id);
  } else {
    // All users: last conversation message within 24h
    const recentRows = await db.execute(sql`
      SELECT fb_user_id
      FROM conversations
      GROUP BY fb_user_id
      HAVING MAX(timestamp) > ${twentyFourHoursAgo}
    `);
    activeUserIds = (recentRows.rows as { fb_user_id: string }[]).map((r) => r.fb_user_id);
  }

  const totalRecipients = activeUserIds.length;
  let sentCount = 0;

  for (const userId of activeUserIds) {
    let textSent = false;
    if (broadcast.imageUrl) {
      try {
        await sendFbImageFromDataUrl(token, userId, broadcast.imageUrl, fbPageId);
      } catch (e) {
        console.warn(`[broadcast] Image send failed for user ${userId}:`, e instanceof Error ? e.message : String(e));
      }
    }
    try {
      await sendFbMessage(token, userId, broadcast.messageText, fbPageId);
      textSent = true;
    } catch (e) {
      console.warn(`[broadcast] Text send failed for user ${userId}:`, e instanceof Error ? e.message : String(e));
    }
    if (textSent) sentCount++;
  }

  const [updated] = await db
    .update(broadcastsTable)
    .set({ status: "sent", sentCount, totalRecipients, sentAt: new Date().toISOString() })
    .where(eq(broadcastsTable.id, id))
    .returning();

  res.json({ message: "Broadcast sent", sentCount, totalRecipients, broadcast: updated });
});

router.get("/broadcasts/:id/stats", async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const [broadcast] = await db.select().from(broadcastsTable).where(eq(broadcastsTable.id, id)).limit(1);
  if (!broadcast) {
    res.status(404).json({ message: "Broadcast not found" });
    return;
  }
  res.json({
    id: broadcast.id,
    title: broadcast.title,
    status: broadcast.status,
    sentCount: broadcast.sentCount ?? 0,
    totalRecipients: broadcast.totalRecipients ?? 0,
    sentAt: broadcast.sentAt ?? null,
    deliveryRate: broadcast.totalRecipients
      ? Math.round(((broadcast.sentCount ?? 0) / broadcast.totalRecipients) * 100)
      : 0,
  });
});

export default router;
