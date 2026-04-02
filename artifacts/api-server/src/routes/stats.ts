import { Router, type IRouter } from "express";
import { db, conversationsTable, ordersTable, appointmentsTable, commentsLogTable, aiConfigTable, conversationSessionsTable } from "@workspace/db";
import { eq, sql, and, count } from "drizzle-orm";

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

  const [sessionsToday] = await db.execute(sql`
    SELECT COUNT(DISTINCT fb_user_id)::int AS value
    FROM conversations
    WHERE sender = 'user'
      AND timestamp >= ${todayStart}
      AND timestamp < ${tomorrowStart}
  `).then(r => [{ value: (r.rows[0] as any)?.value ?? 0 }]);

  const [sessionsWeek] = await db.execute(sql`
    SELECT COUNT(DISTINCT fb_user_id)::int AS value
    FROM conversations
    WHERE sender = 'user'
      AND timestamp >= ${weekStart}
  `).then(r => [{ value: (r.rows[0] as any)?.value ?? 0 }]);

  const [sessionsMonth] = await db.execute(sql`
    SELECT COUNT(DISTINCT fb_user_id)::int AS value
    FROM conversations
    WHERE sender = 'user'
      AND timestamp >= ${monthStart}
  `).then(r => [{ value: (r.rows[0] as any)?.value ?? 0 }]);

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

  const topProductsRaw = await db.execute(sql`
    SELECT product_name as "productName", COUNT(*)::int as "orderCount"
    FROM orders
    WHERE product_name IS NOT NULL
    GROUP BY product_name
    ORDER BY "orderCount" DESC
    LIMIT 5
  `);

  const sentimentRaw = await db.execute(sql`
    SELECT sentiment, COUNT(DISTINCT fb_user_id)::int as cnt
    FROM conversations
    WHERE sentiment IS NOT NULL
    GROUP BY sentiment
  `);
  const sentimentRows = sentimentRaw.rows as unknown as { sentiment: string; cnt: number }[];
  const sentimentMap: Record<string, number> = {};
  for (const row of sentimentRows) { sentimentMap[row.sentiment] = row.cnt; }

  const [ordersToday] = await db
    .select({ value: count() })
    .from(ordersTable)
    .where(sql`${ordersTable.createdAt} >= ${todayStart} AND ${ordersTable.createdAt} < ${tomorrowStart}`);

  const sessionsTodayCount = sessionsToday?.value ?? 0;
  const ordersTodayCount = ordersToday?.value ?? 0;
  const conversionRate = sessionsTodayCount > 0
    ? Math.round((ordersTodayCount / sessionsTodayCount) * 100)
    : 0;

  const errorsPreventedRaw = await db.execute(sql`
    SELECT COUNT(*)::int as cnt FROM platform_events
    WHERE event_type = 'lost_risk_prevented'
    AND created_at >= ${todayStart}
  `);
  const errorsPrevented = (errorsPreventedRaw.rows[0] as any)?.cnt ?? 0;

  const humanInterventionsRaw = await db.execute(sql`
    SELECT COUNT(DISTINCT fb_user_id)::int as cnt FROM conversations
    WHERE is_paused = 1
    AND timestamp >= ${todayStart}
  `);
  const humanInterventions = (humanInterventionsRaw.rows[0] as any)?.cnt ?? 0;

  const botOrdersRaw = await db.execute(sql`
    SELECT COUNT(*)::int as cnt FROM conversations
    WHERE converted_to_order = 1
    AND conversion_source = 'bot'
    AND timestamp >= ${todayStart}
  `);
  const botOrders = (botOrdersRaw.rows[0] as any)?.cnt ?? 0;

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
    topProducts: topProductsRaw.rows as unknown as TopProductRow[],
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
