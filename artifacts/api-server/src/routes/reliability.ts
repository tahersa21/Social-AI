import { Router, type IRouter } from "express";
import { db, platformEventsTable } from "@workspace/db";
import { sql, desc } from "drizzle-orm";

const router: IRouter = Router();

const EVENT_TYPES = [
  "low_confidence",
  "rescue_triggered",
  "handoff",
  "provider_failure",
  "blocked_keyword",
  "kill_switch_blocked",
  "off_topic_escalation",
  "safe_mode_blocked",
] as const;

router.get("/platform-reliability", async (_req, res): Promise<void> => {
  const countsRaw = await db.execute(sql`
    SELECT event_type, COUNT(*)::int AS count
    FROM platform_events
    GROUP BY event_type
  `);

  const counts: Record<string, number> = {};
  for (const type of EVENT_TYPES) counts[type] = 0;
  for (const row of countsRaw.rows as { event_type: string; count: number }[]) {
    counts[row.event_type] = Number(row.count);
  }

  const recent = await db
    .select()
    .from(platformEventsTable)
    .orderBy(desc(platformEventsTable.createdAt))
    .limit(25);

  res.json({ counts, recent });
});

export default router;
