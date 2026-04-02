import { Router, type IRouter } from "express";
import { db, ordersTable, leadsTable } from "@workspace/db";
import { eq, count, sql, inArray } from "drizzle-orm";

const router: IRouter = Router();

const ORDER_STATUS_TO_LEAD_LABEL: Record<string, string> = {
  confirmed: "customer",
  delivered: "customer",
  cancelled: "cold",
  pending: "interested",
};

router.get("/orders/count", async (_req, res): Promise<void> => {
  const [totalResult] = await db.select({ value: count() }).from(ordersTable);
  const [pendingResult] = await db
    .select({ value: count() })
    .from(ordersTable)
    .where(eq(ordersTable.status, "pending"));
  res.json({ pending: pendingResult?.value ?? 0, total: totalResult?.value ?? 0 });
});

router.get("/orders", async (req, res): Promise<void> => {
  const { status } = req.query as { status?: string };
  let query = db.select().from(ordersTable);
  if (status) {
    const rows = await db.select().from(ordersTable).where(eq(ordersTable.status, status)).orderBy(sql`${ordersTable.createdAt} desc`);
    res.json(rows);
    return;
  }
  const rows = await query.orderBy(sql`${ordersTable.createdAt} desc`);
  res.json(rows);
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(raw!, 10);
  const { status } = req.body as { status: string };

  const [updated] = await db
    .update(ordersTable)
    .set({ status })
    .where(eq(ordersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ message: "Order not found" });
    return;
  }

  const newLabel = ORDER_STATUS_TO_LEAD_LABEL[status];
  if (newLabel && updated.fbUserId) {
    try {
      await db.update(leadsTable)
        .set({ label: newLabel, updatedAt: new Date() })
        .where(eq(leadsTable.fbUserId, updated.fbUserId));
    } catch {}
  }

  res.json(updated);
});

router.delete("/orders/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(raw!, 10);
  await db.delete(ordersTable).where(eq(ordersTable.id, id));
  res.json({ message: "Order deleted" });
});

router.post("/orders/bulk-delete", async (req, res): Promise<void> => {
  const { ids } = req.body as { ids: number[] };
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ message: "ids array is required" });
    return;
  }
  await db.delete(ordersTable).where(inArray(ordersTable.id, ids));
  res.json({ message: `${ids.length} orders deleted`, deleted: ids.length });
});

export default router;
