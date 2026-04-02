import { Router, type IRouter } from "express";
import { db, domainTemplatesTable, aiConfigTable, faqsTable, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/domain-templates", async (_req, res): Promise<void> => {
  const rows = await db.select().from(domainTemplatesTable);
  res.json(rows);
});

async function getTemplateByDomain(domain: string, res: import("express").Response) {
  const [template] = await db
    .select()
    .from(domainTemplatesTable)
    .where(eq(domainTemplatesTable.domain, domain))
    .limit(1);

  if (!template) {
    res.status(404).json({ message: "Template not found" });
    return;
  }
  res.json(template);
}

router.get("/domain-templates/:domain", async (req, res): Promise<void> => {
  await getTemplateByDomain(req.params["domain"]!, res);
});

router.get("/templates/:domain", async (req, res): Promise<void> => {
  await getTemplateByDomain(req.params["domain"]!, res);
});

router.post("/domain-templates/:domain/apply", async (req, res): Promise<void> => {
  const domain = req.params["domain"]!;
  const [template] = await db
    .select()
    .from(domainTemplatesTable)
    .where(eq(domainTemplatesTable.domain, domain))
    .limit(1);

  if (!template) {
    res.status(404).json({ message: "Template not found" });
    return;
  }

  const [config] = await db.select().from(aiConfigTable).limit(1);
  if (!config) {
    res.status(500).json({ message: "AI config not found" });
    return;
  }

  await db.update(aiConfigTable).set({
    botName: template.botName,
    personality: template.personality,
    greetingMessage: template.greetingMessage,
    businessDomain: domain,
    updatedAt: new Date(),
  }).where(eq(aiConfigTable.id, config.id));

  interface SampleFaq { question: string; answer: string; category?: string }
  interface SampleProduct { name: string; price: number; description?: string }

  let faqs: SampleFaq[] = [];
  let sampleProducts: SampleProduct[] = [];
  try { faqs = JSON.parse(template.sampleFaqs) as SampleFaq[]; } catch { faqs = []; }
  try { sampleProducts = JSON.parse(template.sampleProducts) as SampleProduct[]; } catch { sampleProducts = []; }

  for (const faq of faqs) {
    await db.insert(faqsTable).values({
      question: faq.question,
      answer: faq.answer,
      category: faq.category ?? domain,
      isActive: 1,
    });
  }

  for (const product of sampleProducts) {
    await db.insert(productsTable).values({
      name: product.name,
      description: product.description ?? "",
      originalPrice: product.price,
      discountPrice: null,
      stockQuantity: 99,
      lowStockThreshold: 3,
      status: "available",
      images: JSON.stringify([]),
      mainImageIndex: 0,
    });
  }

  res.json({
    message: "Template applied",
    faqsInserted: faqs.length,
    productsInserted: sampleProducts.length,
  });
});

export default router;
