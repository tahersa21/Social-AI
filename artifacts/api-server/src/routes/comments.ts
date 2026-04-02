import { Router, type IRouter } from "express";
import { db, commentsLogTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/comments/stats", async (_req, res): Promise<void> => {
  const [totalResult] = await db.select({ value: count() }).from(commentsLogTable);
  const [dmResult] = await db
    .select({ value: count() })
    .from(commentsLogTable)
    .where(eq(commentsLogTable.dmSent, 1));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [todayResult] = await db
    .select({ value: count() })
    .from(commentsLogTable)
    .where(sql`${commentsLogTable.timestamp} >= ${today.toISOString()}`);

  res.json({
    total: totalResult?.value ?? 0,
    dmSent: dmResult?.value ?? 0,
    today: todayResult?.value ?? 0,
  });
});

router.get("/comments", async (req, res): Promise<void> => {
  const page = parseInt((req.query["page"] as string) ?? "1", 10);
  const limit = parseInt((req.query["limit"] as string) ?? "20", 10);
  const offset = (page - 1) * limit;

  const rows = await db
    .select()
    .from(commentsLogTable)
    .orderBy(sql`${commentsLogTable.timestamp} desc`)
    .limit(limit)
    .offset(offset);
  res.json(rows);
});

export default router;
