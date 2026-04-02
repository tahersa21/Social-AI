import { Router, type IRouter } from "express";
import { db, preOrdersTable, productsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

// GET /api/pre-orders — list all pre-orders (newest first)
router.get("/", async (_req, res) => {
  try {
    const orders = await db
      .select()
      .from(preOrdersTable)
      .orderBy(desc(preOrdersTable.createdAt));
    res.json(orders);
  } catch (err) {
    console.error("[pre-orders] GET /:", err);
    res.status(500).json({ error: "Failed to fetch pre-orders" });
  }
});

// GET /api/pre-orders/:id
router.get("/:id", async (req, res) => {
  try {
    const [order] = await db
      .select()
      .from(preOrdersTable)
      .where(eq(preOrdersTable.id, Number(req.params.id)))
      .limit(1);
    if (!order) return res.status(404).json({ error: "Not found" });
    res.json(order);
  } catch (err) {
    console.error("[pre-orders] GET /:id:", err);
    res.status(500).json({ error: "Failed to fetch pre-order" });
  }
});

// PATCH /api/pre-orders/:id/status  { status: "notified" | "cancelled" | "pending" }
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body as { status: string };
    const allowed = ["pending", "notified", "cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Allowed: ${allowed.join(", ")}` });
    }
    const [updated] = await db
      .update(preOrdersTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(preOrdersTable.id, Number(req.params.id)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (err) {
    console.error("[pre-orders] PATCH /:id/status:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// DELETE /api/pre-orders/:id
router.delete("/:id", async (req, res) => {
  try {
    await db
      .delete(preOrdersTable)
      .where(eq(preOrdersTable.id, Number(req.params.id)));
    res.json({ success: true });
  } catch (err) {
    console.error("[pre-orders] DELETE /:id:", err);
    res.status(500).json({ error: "Failed to delete pre-order" });
  }
});

export { router as preOrdersRouter };
