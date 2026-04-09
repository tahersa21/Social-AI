import { Router } from "express";
import { db, productCategoriesTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";

const router = Router();

router.get("/product-categories", async (_req, res) => {
  try {
    const categories = await db
      .select()
      .from(productCategoriesTable)
      .orderBy(productCategoriesTable.name);
    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/product-categories", async (req, res) => {
  try {
    const { name, parentId } = req.body;
    if (!name) { res.status(400).json({ error: "الاسم مطلوب" }); return; }
    const [cat] = await db
      .insert(productCategoriesTable)
      .values({ name: name.trim(), parentId: parentId ? Number(parentId) : null })
      .returning();
    res.json(cat);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/product-categories/:id", async (req, res) => {
  try {
    const { name, parentId } = req.body;
    if (!name) { res.status(400).json({ error: "الاسم مطلوب" }); return; }
    const updateId = parseInt(req.params.id, 10);
    if (Number.isNaN(updateId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [cat] = await db
      .update(productCategoriesTable)
      .set({ name: name.trim(), parentId: parentId ? Number(parentId) : null })
      .where(eq(productCategoriesTable.id, updateId))
      .returning();
    res.json(cat);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/product-categories/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db
      .update(productCategoriesTable)
      .set({ parentId: null })
      .where(eq(productCategoriesTable.parentId, id));
    await db.delete(productCategoriesTable).where(eq(productCategoriesTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
