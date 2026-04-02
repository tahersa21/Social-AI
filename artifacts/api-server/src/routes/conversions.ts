import { Router, type IRouter } from "express";
import { db, ordersTable, conversationSessionsTable } from "@workspace/db";
import { sql, count } from "drizzle-orm";

const router: IRouter = Router();

router.get("/conversions", async (_req, res): Promise<void> => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const [totalOrdersRow] = await db.select({ value: count() }).from(ordersTable);
  const totalOrders = totalOrdersRow?.value ?? 0;

  const botOrdersRaw = await db.execute(sql`
    SELECT COUNT(*)::int as cnt FROM conversations
    WHERE converted_to_order = 1 AND conversion_source = 'bot'
  `);
  const botOrders = (botOrdersRaw.rows[0] as any)?.cnt ?? 0;

  const [sessionsTodayRow] = await db
    .select({ value: count() })
    .from(conversationSessionsTable)
    .where(sql`${conversationSessionsTable.createdAt} >= ${todayStart}`);
  const sessionsToday = sessionsTodayRow?.value ?? 0;

  const [ordersTodayRow] = await db
    .select({ value: count() })
    .from(ordersTable)
    .where(sql`${ordersTable.createdAt} >= ${todayStart} AND ${ordersTable.createdAt} < ${tomorrowStart}`);
  const ordersToday = ordersTodayRow?.value ?? 0;

  const conversionRate = sessionsToday > 0
    ? Math.round((ordersToday / sessionsToday) * 100)
    : 0;

  const triggerBreakdownRaw = await db.execute(sql`
    SELECT sales_trigger_type as trigger, COUNT(*)::int as cnt
    FROM conversations
    WHERE converted_to_order = 1
    GROUP BY sales_trigger_type
    ORDER BY cnt DESC
  `);

  res.json({
    totalOrders,
    botOrders,
    conversionRate,
    triggerBreakdown: triggerBreakdownRaw.rows as { trigger: string | null; cnt: number }[],
  });
});

export default router;
