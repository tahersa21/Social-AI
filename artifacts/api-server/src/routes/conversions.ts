import { Router, type IRouter } from "express";
import { db, ordersTable, conversationSessionsTable, conversationsTable } from "@workspace/db";
import { sql, count, eq, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/conversions", async (_req, res): Promise<void> => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const [totalOrdersRow] = await db.select({ value: count() }).from(ordersTable);
  const totalOrders = totalOrdersRow?.value ?? 0;

  const [botOrdersRow] = await db
    .select({ cnt: count() })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.convertedToOrder, 1), eq(conversationsTable.conversionSource, "bot")));
  const botOrders = botOrdersRow?.cnt ?? 0;

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

  const triggerBreakdownRaw = await db
    .select({ trigger: conversationsTable.salesTriggerType, cnt: sql<number>`count(*)::int` })
    .from(conversationsTable)
    .where(eq(conversationsTable.convertedToOrder, 1))
    .groupBy(conversationsTable.salesTriggerType)
    .orderBy(sql`count(*) desc`);

  res.json({
    totalOrders,
    botOrders,
    conversionRate,
    triggerBreakdown: triggerBreakdownRaw,
  });
});

export default router;
