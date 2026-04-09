import { Router, type IRouter } from "express";
import { db, appointmentsTable } from "@workspace/db";
import { eq, sql, and, count } from "drizzle-orm";

const router: IRouter = Router();

router.get("/appointments/count", async (_req, res): Promise<void> => {
  const [result] = await db
    .select({ value: count() })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.status, "pending"));
  res.json({ pending: result?.value ?? 0 });
});

router.get("/appointments", async (req, res): Promise<void> => {
  const { status, date } = req.query as { status?: string; date?: string };
  const conditions = [];
  if (status) conditions.push(eq(appointmentsTable.status, status));
  if (date) conditions.push(eq(appointmentsTable.appointmentDate, date));

  const rows = conditions.length > 0
    ? await db.select().from(appointmentsTable).where(and(...conditions)).orderBy(sql`${appointmentsTable.createdAt} desc`)
    : await db.select().from(appointmentsTable).orderBy(sql`${appointmentsTable.createdAt} desc`);

  res.json(rows);
});

router.patch("/appointments/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"]!, 10);
  const { status, note } = req.body as { status?: string; note?: string };

  const updates: Partial<{ status: string; note: string }> = {};
  if (status !== undefined) updates.status = status;
  if (note !== undefined) updates.note = note;

  const [updated] = await db
    .update(appointmentsTable)
    .set(updates)
    .where(eq(appointmentsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ message: "Appointment not found" });
    return;
  }
  res.json(updated);
});

router.delete("/appointments/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"]!, 10);
  await db.delete(appointmentsTable).where(eq(appointmentsTable.id, id));
  res.json({ message: "Deleted" });
});

export default router;
