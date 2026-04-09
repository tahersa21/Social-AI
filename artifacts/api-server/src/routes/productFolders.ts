import { Router, type IRouter } from "express";
import { db, productFoldersTable, productsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const router: IRouter = Router();

router.get("/product-folders", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(productFoldersTable)
    .orderBy(productFoldersTable.createdAt);
  res.json(rows);
});

router.post("/product-folders", async (req, res): Promise<void> => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ message: "الاسم مطلوب" });
    return;
  }
  const [row] = await db
    .insert(productFoldersTable)
    .values({ name: name.trim() })
    .returning();
  res.status(201).json(row);
});

router.put("/product-folders/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"]!, 10);
  if (Number.isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }
  const { name } = req.body as { name?: string };
  if (!name?.trim()) { res.status(400).json({ message: "الاسم مطلوب" }); return; }
  const [row] = await db
    .update(productFoldersTable)
    .set({ name: name.trim() })
    .where(eq(productFoldersTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ message: "المجلد غير موجود" }); return; }
  res.json(row);
});

router.delete("/product-folders/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"]!, 10);
  if (Number.isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }
  await db.update(productsTable).set({ folderId: null }).where(eq(productsTable.folderId, id));
  await db.delete(productFoldersTable).where(eq(productFoldersTable.id, id));
  res.json({ message: "تم الحذف" });
});

// تعيين مجلد لعدة منتجات دفعة واحدة
router.post("/product-folders/bulk-assign", async (req, res): Promise<void> => {
  const { productIds, folderId } = req.body as { productIds?: number[]; folderId?: number | null };
  if (!Array.isArray(productIds) || productIds.length === 0) {
    res.status(400).json({ message: "productIds مطلوب" });
    return;
  }
  await db
    .update(productsTable)
    .set({ folderId: folderId ?? null })
    .where(inArray(productsTable.id, productIds));
  res.json({ message: "تم التعيين", count: productIds.length });
});

export default router;
