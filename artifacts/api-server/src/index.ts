import { pool, db, aiProvidersTable, aiConfigTable, productInquiriesTable, fbSettingsTable, conversationsTable, broadcastsTable, leadsTable } from "@workspace/db";
import { eq, and, sql, lte } from "drizzle-orm";
import app from "./app.js";
import { runSeed } from "./lib/seed.js";
import { decrypt } from "./lib/encryption.js";
import { sendFbMessage } from "./lib/ai.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

if (!process.env["ENCRYPTION_KEY"]) {
  console.warn("[server] WARNING: ENCRYPTION_KEY not set — AI provider keys cannot be encrypted");
}

async function checkActiveProvider(): Promise<void> {
  try {
    const [active] = await db
      .select()
      .from(aiProvidersTable)
      .where(eq(aiProvidersTable.isActive, 1))
      .limit(1);

    if (!active) {
      console.warn("⚠️  No active AI provider configured.\n     Go to /providers and activate one with a valid API key.");
      return;
    }

    const key = decrypt(active.apiKey);
    if (!key) {
      console.warn(`⚠️  Active provider "${active.name}" has no API key.\n     Go to /providers and set a valid API key.`);
    }
  } catch {
    // Non-critical — just a startup hint
  }
}

async function runAbandonedCartReminder(): Promise<void> {
  try {
    const [config] = await db.select().from(aiConfigTable).limit(1);
    if (!config || !config.abandonedCartEnabled) return;

    const [settings] = await db.select().from(fbSettingsTable).limit(1);
    if (!settings?.pageAccessToken) return;

    const delayHours = config.abandonedCartDelayHours ?? 1;
    const delayMs = delayHours * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - delayMs).toISOString();

    const inquiries = await db.select().from(productInquiriesTable)
      .where(and(
        eq(productInquiriesTable.converted, 0),
        eq(productInquiriesTable.reminderSent, 0),
        sql`${productInquiriesTable.inquiredAt} < ${cutoff}`
      ));

    if (inquiries.length === 0) return;

    const template = config.abandonedCartMessage ?? "مرحباً! 👋 لاحظنا اهتمامك بـ {product_name}\nهل تريد إتمام طلبك؟ نحن هنا لمساعدتك 😊";
    const pageName = config.pageName ?? "";

    for (const inq of inquiries) {
      const msg = template
        .replace(/\{product_name\}/g, inq.productName)
        .replace(/\{page_name\}/g, pageName);

      try {
        await sendFbMessage(settings.pageAccessToken, inq.fbUserId, msg, settings.pageId ?? undefined);
        await db.insert(conversationsTable).values({
          fbUserId: inq.fbUserId,
          fbUserName: inq.fbUserName,
          message: msg,
          sender: "bot",
          timestamp: new Date(),
        });
        await db.update(productInquiriesTable)
          .set({ reminderSent: 1 })
          .where(eq(productInquiriesTable.id, inq.id));
        console.log(`[abandoned-cart] Sent reminder to ${inq.fbUserId} for "${inq.productName}"`);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[abandoned-cart] Failed to send reminder to ${inq.fbUserId}:`, errMsg);
      }
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[abandoned-cart] Job error:", errMsg);
  }
}

async function runScheduledBroadcasts(): Promise<void> {
  try {
    const now = new Date().toISOString();

    const pending = await db
      .select()
      .from(broadcastsTable)
      .where(
        and(
          eq(broadcastsTable.status, "draft"),
          lte(broadcastsTable.scheduledAt, now)
        )
      );

    if (pending.length === 0) return;

    const fbRaw = await db.execute(sql`SELECT page_access_token, page_id FROM fb_settings LIMIT 1`);
    const fbRow = (fbRaw.rows as unknown as { page_access_token: string | null; page_id: string | null }[])[0];
    const token = fbRow?.page_access_token ?? null;
    const fbPageId = fbRow?.page_id ?? undefined;

    if (!token) return;

    for (const broadcast of pending) {
      // Claim the record immediately to prevent double-sending
      await db
        .update(broadcastsTable)
        .set({ status: "sending" } as any)
        .where(and(eq(broadcastsTable.id, broadcast.id), eq(broadcastsTable.status, "draft")));

      try {
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
              SELECT fb_user_id FROM conversations
              WHERE fb_user_id = ANY(${labelUserIds})
              GROUP BY fb_user_id HAVING MAX(timestamp) > ${twentyFourHoursAgo}
            `);
            activeUserIds = (recentRows.rows as { fb_user_id: string }[]).map((r) => r.fb_user_id);
          }
        } else if (broadcast.targetFilter === "appointments") {
          const apptRows = await db.execute(sql`
            SELECT DISTINCT a.fb_user_id FROM appointments a
            WHERE a.status IN ('pending', 'confirmed')
              AND EXISTS (
                SELECT 1 FROM (
                  SELECT fb_user_id, MAX(timestamp) AS last_ts FROM conversations GROUP BY fb_user_id
                ) sub WHERE sub.fb_user_id = a.fb_user_id AND sub.last_ts > ${twentyFourHoursAgo}
              )
          `);
          activeUserIds = (apptRows.rows as { fb_user_id: string }[]).map((r) => r.fb_user_id);
        } else {
          const recentRows = await db.execute(sql`
            SELECT fb_user_id FROM conversations
            GROUP BY fb_user_id HAVING MAX(timestamp) > ${twentyFourHoursAgo}
          `);
          activeUserIds = (recentRows.rows as { fb_user_id: string }[]).map((r) => r.fb_user_id);
        }

        const totalRecipients = activeUserIds.length;
        let sentCount = 0;

        for (const userId of activeUserIds) {
          try {
            await sendFbMessage(token, userId, broadcast.messageText, fbPageId);
            sentCount++;
          } catch {
            // continue to next recipient
          }
        }

        await db
          .update(broadcastsTable)
          .set({ status: "sent", sentCount, totalRecipients, sentAt: new Date().toISOString() })
          .where(eq(broadcastsTable.id, broadcast.id));

        console.log(`[scheduled-broadcast] Sent broadcast #${broadcast.id} "${broadcast.title}" to ${sentCount}/${totalRecipients} users`);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[scheduled-broadcast] Failed to send broadcast #${broadcast.id}:`, errMsg);
        await db
          .update(broadcastsTable)
          .set({ status: "failed" } as any)
          .where(eq(broadcastsTable.id, broadcast.id));
      }
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[scheduled-broadcast] Job error:", errMsg);
  }
}

async function start() {
  try {
    await pool.query("SELECT 1");
    console.log("[server] Database connected");
    await runSeed();
    await checkActiveProvider();
  } catch (err) {
    console.error("[server] Database connection failed:", err);
  }

  setInterval(runAbandonedCartReminder, 30 * 60 * 1000);
  console.log("[server] Abandoned cart reminder job scheduled (every 30 min)");

  setInterval(runScheduledBroadcasts, 60 * 1000);
  console.log("[server] Scheduled broadcasts job running (every 60 sec)");

  app.listen(port, () => {
    console.log(`[server] Listening on port ${port}`);
  });
}

start();
