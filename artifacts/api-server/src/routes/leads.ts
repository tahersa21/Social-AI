import { Router, type IRouter } from "express";
import { db, leadsTable, ordersTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/leads", async (req, res): Promise<void> => {
  const { label } = req.query as { label?: string };
  const baseQuery = sql`
    SELECT l.*,
      lo.product_name AS "latestOrderProduct",
      lo.status AS "latestOrderStatus",
      lo.total_price AS "latestOrderPrice",
      lo.created_at AS "latestOrderDate"
    FROM leads l
    LEFT JOIN LATERAL (
      SELECT product_name, status, total_price, created_at
      FROM orders o
      WHERE o.fb_user_id = l.fb_user_id
      ORDER BY o.created_at DESC
      LIMIT 1
    ) lo ON true
    ${label ? sql`WHERE l.label = ${label}` : sql``}
    ORDER BY l.created_at DESC
  `;
  const result = await db.execute(baseQuery);
  res.json(result.rows);
});

router.post("/leads", async (req, res): Promise<void> => {
  const body = req.body as {
    fbUserId?: string;
    fbUserName?: string;
    phone?: string;
    email?: string;
    label?: string;
    notes?: string;
    source?: string;
  };

  if (!body.fbUserId) {
    res.status(400).json({ message: "fbUserId is required" });
    return;
  }

  const [created] = await db
    .insert(leadsTable)
    .values({
      fbUserId: body.fbUserId,
      fbUserName: body.fbUserName ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      label: body.label ?? "new",
      notes: body.notes ?? null,
      source: body.source ?? "manual",
    })
    .returning();

  res.status(201).json(created);
});

router.put("/leads/:id", async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const body = req.body as {
    label?: string;
    notes?: string;
    phone?: string;
    email?: string;
    fbUserName?: string;
  };

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, id)).limit(1);
  if (!lead) {
    res.status(404).json({ message: "Lead not found" });
    return;
  }

  const [updated] = await db
    .update(leadsTable)
    .set({
      label: body.label ?? lead.label,
      notes: body.notes !== undefined ? body.notes : lead.notes,
      phone: body.phone !== undefined ? body.phone : lead.phone,
      email: body.email !== undefined ? body.email : lead.email,
      fbUserName: body.fbUserName !== undefined ? body.fbUserName : lead.fbUserName,
      updatedAt: new Date(),
    })
    .where(eq(leadsTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/leads/:id", async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  await db.delete(leadsTable).where(eq(leadsTable.id, id));
  res.json({ message: "Deleted" });
});

router.get("/leads/export", async (_req, res): Promise<void> => {
  const rows = await db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt));

  const headers = ["fbUserName", "phone", "email", "label", "source", "createdAt"];
  const csvRows = rows.map((r) => [
    r.fbUserName ?? "",
    r.phone ?? "",
    r.email ?? "",
    r.label ?? "",
    r.source ?? "",
    r.createdAt ? new Date(r.createdAt).toISOString() : "",
  ]);

  const BOM = "\uFEFF";
  const csv = BOM + [headers, ...csvRows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

export default router;
