import { Router, type IRouter } from "express";
import { db, conversationsTable, ordersTable, appointmentsTable, commentsLogTable, aiConfigTable, platformEventsTable } from "@workspace/db";
import { eq, sql, and, count, countDistinct, isNotNull, gte, lt } from "drizzle-orm";

interface PeakHourRow {
  hour: number;
  count: number;
}

interface TopProductRow {
  productName: string;
  orderCount: number;
}

const router: IRouter = Router();

router.get("/stats", async (_req, res): Promise<void> => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [sessionsTodayRow] = await db
    .select({ value: countDistinct(conversationsTable.fbUserId) })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.sender, "user"), gte(conversationsTable.timestamp, todayStart), lt(conversationsTable.timestamp, tomorrowStart)));
  const sessionsToday = { value: sessionsTodayRow?.value ?? 0 };

  const [sessionsWeekRow] = await db
    .select({ value: countDistinct(conversationsTable.fbUserId) })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.sender, "user"), gte(conversationsTable.timestamp, weekStart)));
  const sessionsWeek = { value: sessionsWeekRow?.value ?? 0 };

  const [sessionsMonthRow] = await db
    .select({ value: countDistinct(conversationsTable.fbUserId) })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.sender, "user"), gte(conversationsTable.timestamp, monthStart)));
  const sessionsMonth = { value: sessionsMonthRow?.value ?? 0 };

  const [ordersTotal] = await db.select({ value: count() }).from(ordersTable);
  const [ordersPending] = await db.select({ value: count() }).from(ordersTable).where(eq(ordersTable.status, "pending"));

  const [appointmentsTotal] = await db.select({ value: count() }).from(appointmentsTable);
  const [appointmentsPending] = await db.select({ value: count() }).from(appointmentsTable).where(eq(appointmentsTable.status, "pending"));

  const [commentsToday] = await db
    .select({ value: count() })
    .from(commentsLogTable)
    .where(sql`${commentsLogTable.timestamp} >= ${todayStart}`);

  const revenueResult = await db
    .select({ total: sql<number>`COALESCE(SUM(${ordersTable.totalPrice}), 0)` })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.status, "confirmed"),
      sql`${ordersTable.createdAt} >= ${todayStart}`,
      sql`${ordersTable.createdAt} < ${tomorrowStart}`
    ));
  const todayRevenue = revenueResult[0]?.total ?? 0;

  const [config] = await db.select({
    currency: aiConfigTable.currency,
  }).from(aiConfigTable).limit(1);

  const peakHoursRaw = await db.execute(sql`
    SELECT EXTRACT(HOUR FROM timestamp)::int as hour, COUNT(*)::int as count
    FROM conversations
    WHERE sender = 'user'
    GROUP BY hour
    ORDER BY hour
  `);

  const peakHours = Array.from({ length: 24 }, (_, i) => {
    const rows = peakHoursRaw.rows as unknown as PeakHourRow[];
    const found = rows.find((r) => r.hour === i);
    return { hour: i, count: found ? found.count : 0 };
  });

  const topProductsRaw = await db
    .select({ productName: ordersTable.productName, orderCount: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(isNotNull(ordersTable.productName))
    .groupBy(ordersTable.productName)
    .orderBy(sql`count(*) desc`)
    .limit(5);

  const sentimentRaw = await db
    .select({ sentiment: conversationsTable.sentiment, cnt: sql<number>`count(distinct ${conversationsTable.fbUserId})::int` })
    .from(conversationsTable)
    .where(isNotNull(conversationsTable.sentiment))
    .groupBy(conversationsTable.sentiment);
  const sentimentMap: Record<string, number> = {};
  for (const row of sentimentRaw) { sentimentMap[row.sentiment ?? ""] = row.cnt; }

  const [ordersToday] = await db
    .select({ value: count() })
    .from(ordersTable)
    .where(sql`${ordersTable.createdAt} >= ${todayStart} AND ${ordersTable.createdAt} < ${tomorrowStart}`);

  const sessionsTodayCount = sessionsToday?.value ?? 0;
  const ordersTodayCount = ordersToday?.value ?? 0;
  const conversionRate = sessionsTodayCount > 0
    ? Math.round((ordersTodayCount / sessionsTodayCount) * 100)
    : 0;

  const [errorsPreventedRow] = await db
    .select({ cnt: count() })
    .from(platformEventsTable)
    .where(and(eq(platformEventsTable.eventType, "lost_risk_prevented"), gte(platformEventsTable.createdAt, todayStart)));
  const errorsPrevented = errorsPreventedRow?.cnt ?? 0;

  const [humanInterventionsRow] = await db
    .select({ cnt: countDistinct(conversationsTable.fbUserId) })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.isPaused, 1), gte(conversationsTable.timestamp, todayStart)));
  const humanInterventions = humanInterventionsRow?.cnt ?? 0;

  const [botOrdersRow] = await db
    .select({ cnt: count() })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.convertedToOrder, 1), eq(conversationsTable.conversionSource, "bot"), gte(conversationsTable.timestamp, todayStart)));
  const botOrders = botOrdersRow?.cnt ?? 0;

  res.json({
    sessions: {
      today: sessionsToday?.value ?? 0,
      week: sessionsWeek?.value ?? 0,
      month: sessionsMonth?.value ?? 0,
    },
    orders: {
      total: ordersTotal?.value ?? 0,
      pending: ordersPending?.value ?? 0,
    },
    appointments: {
      total: appointmentsTotal?.value ?? 0,
      pending: appointmentsPending?.value ?? 0,
    },
    comments: {
      today: commentsToday?.value ?? 0,
    },
    revenue: {
      today: todayRevenue,
      currency: config?.currency ?? "DZD",
    },
    peakHours,
    topProducts: topProductsRaw as TopProductRow[],
    sentiment: {
      positive: sentimentMap["positive"] ?? 0,
      neutral: sentimentMap["neutral"] ?? 0,
      negative: sentimentMap["negative"] ?? 0,
    },
    trust: {
      conversionRate,
      botOrders,
      errorsPrevented,
      humanInterventions,
    },
  });
});

export default router;
