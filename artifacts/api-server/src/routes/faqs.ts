import { Router, type IRouter } from "express";
import { db, faqsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { rDel } from "../lib/redisCache.js";

const router: IRouter = Router();

router.get("/faqs", async (_req, res): Promise<void> => {
  const rows = await db.select().from(faqsTable).orderBy(sql`${faqsTable.createdAt} desc`);
  res.json(rows);
});

router.post("/faqs", async (req, res): Promise<void> => {
  const { question, answer, category, isActive } = req.body as {
    question: string; answer: string; category?: string; isActive?: number;
  };
  const [created] = await db
    .insert(faqsTable)
    .values({ question, answer, category: category ?? null, isActive: isActive ?? 1 })
    .returning();
  await rDel("faqs:active");
  res.status(201).json(created);
});

router.put("/faqs/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"]!, 10);
  const { question, answer, category, isActive } = req.body as {
    question?: string; answer?: string; category?: string; isActive?: number;
  };

  const [existing] = await db.select().from(faqsTable).where(eq(faqsTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ message: "FAQ not found" });
    return;
  }

  const [updated] = await db
    .update(faqsTable)
    .set({
      question: question ?? existing.question,
      answer: answer ?? existing.answer,
      category: category !== undefined ? category : existing.category,
      isActive: isActive !== undefined ? isActive : existing.isActive,
    })
    .where(eq(faqsTable.id, id))
    .returning();

  await rDel("faqs:active");
  res.json(updated);
});

router.delete("/faqs/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"]!, 10);
  await db.delete(faqsTable).where(eq(faqsTable.id, id));
  await rDel("faqs:active");
  res.json({ message: "Deleted" });
});

export default router;
