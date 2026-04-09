import { Router, type IRouter } from "express";
import { db, ordersTable, leadsTable, deliveryPricesTable } from "@workspace/db";
import { eq, count, sql, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

// process.cwd() in dev  = /workspace/artifacts/api-server  (pnpm filter runs from package dir)
// process.cwd() in prod = /home/runner/workspace            (node run from workspace root)
function findTemplate(): string {
  const candidates = [
    path.resolve(process.cwd(), "public/ecotrack_template.xlsx"),
    path.resolve(process.cwd(), "artifacts/api-server/public/ecotrack_template.xlsx"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0]!;
}

const ECOTRACK_TEMPLATE = findTemplate();

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
    } catch (e) {
      console.warn("[orders] Failed to sync lead label:", e instanceof Error ? e.message : String(e));
    }
  }

  res.json(updated);
});

router.get("/orders/export", async (req, res): Promise<void> => {
  const { status } = req.query as { status?: string };

  const orders = status
    ? await db.select().from(ordersTable).where(eq(ordersTable.status, status)).orderBy(sql`${ordersTable.createdAt} desc`)
    : await db.select().from(ordersTable).orderBy(sql`${ordersTable.createdAt} desc`);

  const wilayaPrices = await db.select().from(deliveryPricesTable);
  const wilayaCodeMap = new Map<string, number>();
  for (const w of wilayaPrices) {
    wilayaCodeMap.set(w.wilayaName.trim().toLowerCase(), w.wilayaId);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ECOTRACK_TEMPLATE);
  const ws = wb.getWorksheet(1)!;

  orders.forEach((o, idx) => {
    const rowNum = idx + 2;
    const wilayaKey = (o.customerWilaya ?? "").trim().toLowerCase();
    const wilayaCode = wilayaCodeMap.get(wilayaKey);

    const row = ws.getRow(rowNum);
    row.getCell(1).value = o.id;
    row.getCell(2).value = o.customerName ?? "";
    row.getCell(3).value = String(o.customerPhone ?? "");
    row.getCell(4).value = "";
    row.getCell(5).value = wilayaCode != null ? wilayaCode : "";
    row.getCell(6).value = o.customerWilaya ?? "";
    row.getCell(7).value = o.customerCommune ?? "";
    row.getCell(8).value = o.customerAddress ?? "";
    row.getCell(9).value = o.productName ?? "";
    row.getCell(10).value = "";
    row.getCell(11).value = o.totalPrice ?? 0;
    row.getCell(12).value = "";
    row.getCell(13).value = "OUI";
    row.getCell(14).value = "";
    row.getCell(15).value = "";
    row.getCell(16).value = "";
    row.getCell(17).value = "";
    row.getCell(18).value = "";
    row.commit();
  });

  const buf = await wb.xlsx.writeBuffer();

  const filename = `commandes_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(Buffer.from(buf as ArrayBuffer));
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
