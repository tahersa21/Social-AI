import { Router, type IRouter } from "express";
import multer from "multer";
import sharp from "sharp";
import { db, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 5, fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// Compress image to max 800px wide, JPEG 78% quality → typically <100KB per image
async function compressImage(file: Express.Multer.File): Promise<string> {
  const compressed = await sharp(file.buffer)
    .rotate()
    .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78, progressive: true })
    .toBuffer();
  return `data:image/jpeg;base64,${compressed.toString("base64")}`;
}

const router: IRouter = Router();

// Public endpoint — serves a product image by index from DB (no auth required)
// Used by Facebook webhook to send product images via Messenger
router.get("/products/image/:id/:index", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"]!, 10);
  const index = parseInt(req.params["index"] ?? "0", 10);

  const [product] = await db
    .select({ images: productsTable.images })
    .from(productsTable)
    .where(eq(productsTable.id, id))
    .limit(1);

  if (!product?.images) {
    res.status(404).end();
    return;
  }

  const imgs = JSON.parse(product.images) as string[];
  const dataUrl = imgs[index] ?? imgs[0];

  if (!dataUrl) {
    res.status(404).end();
    return;
  }

  if (dataUrl.startsWith("data:")) {
    const [meta, b64] = dataUrl.split(",") as [string, string];
    const mimeMatch = meta.match(/data:([^;]+)/);
    const mime = mimeMatch?.[1] ?? "image/jpeg";
    const buf = Buffer.from(b64, "base64");
    res.set("Content-Type", mime);
    res.set("Cache-Control", "public, max-age=86400");
    res.end(buf);
  } else {
    res.redirect(302, dataUrl);
  }
});

router.get("/products", async (_req, res): Promise<void> => {
  const rows = await db.select().from(productsTable).orderBy(productsTable.id);
  res.json(rows);
});

router.post(
  "/products",
  upload.array("images[]", 5),
  async (req, res): Promise<void> => {
    const files = (req.files as Express.Multer.File[]) ?? [];
    const imageUrls = await Promise.all(files.map(compressImage));

    const body = req.body as Record<string, string>;
    const [row] = await db
      .insert(productsTable)
      .values({
        name: body["name"] ?? "Unnamed Product",
        description: body["description"] ?? null,
        originalPrice: body["originalPrice"] ? parseFloat(body["originalPrice"]) : null,
        discountPrice: body["discountPrice"] ? parseFloat(body["discountPrice"]) : null,
        stockQuantity: body["stockQuantity"] ? parseInt(body["stockQuantity"], 10) : 0,
        lowStockThreshold: body["lowStockThreshold"] ? parseInt(body["lowStockThreshold"], 10) : 5,
        status: body["status"] ?? "available",
        images: imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
        mainImageIndex: body["mainImageIndex"] ? parseInt(body["mainImageIndex"], 10) : 0,
        category: body["category"] || null,
        brand: body["brand"] || null,
        itemType: body["itemType"] || null,
        priceTier: body["priceTier"] || null,
        externalUrl: body["externalUrl"] || null,
      })
      .returning();

    res.status(201).json(row);
  }
);

router.put(
  "/products/:id",
  upload.array("images[]", 5),
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
    const id = parseInt(raw!, 10);

    const [existing] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ message: "Product not found" });
      return;
    }

    const files = (req.files as Express.Multer.File[]) ?? [];
    const newImageUrls = await Promise.all(files.map(compressImage));

    const body = req.body as Record<string, string>;
    const keepImages: string[] = body["keepImages"] ? JSON.parse(body["keepImages"]) : [];
    const allImages = [...keepImages, ...newImageUrls];

    const [updated] = await db
      .update(productsTable)
      .set({
        name: body["name"] ?? existing.name,
        description: body["description"] ?? existing.description,
        originalPrice: body["originalPrice"] ? parseFloat(body["originalPrice"]) : existing.originalPrice,
        discountPrice: body["discountPrice"] ? parseFloat(body["discountPrice"]) : existing.discountPrice,
        stockQuantity: body["stockQuantity"] ? parseInt(body["stockQuantity"], 10) : existing.stockQuantity,
        lowStockThreshold: body["lowStockThreshold"] ? parseInt(body["lowStockThreshold"], 10) : existing.lowStockThreshold,
        status: body["status"] ?? existing.status,
        images: allImages.length > 0 ? JSON.stringify(allImages) : existing.images,
        mainImageIndex: body["mainImageIndex"] ? parseInt(body["mainImageIndex"], 10) : existing.mainImageIndex,
        category: body["category"] !== undefined ? (body["category"] || null) : existing.category,
        brand: body["brand"] !== undefined ? (body["brand"] || null) : existing.brand,
        itemType: body["itemType"] !== undefined ? (body["itemType"] || null) : existing.itemType,
        priceTier: body["priceTier"] !== undefined ? (body["priceTier"] || null) : existing.priceTier,
        externalUrl: body["externalUrl"] !== undefined ? (body["externalUrl"] || null) : existing.externalUrl,
      })
      .where(eq(productsTable.id, id))
      .returning();

    res.json(updated);
  }
);

router.delete("/products/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(raw!, 10);
  await db.delete(productsTable).where(eq(productsTable.id, id));
  res.json({ message: "Product deleted" });
});

router.patch("/products/:id/stock", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(raw!, 10);

  const { quantityChange } = req.body as { quantityChange: number };
  if (typeof quantityChange !== "number") {
    res.status(400).json({ message: "quantityChange must be a number" });
    return;
  }

  const [existing] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ message: "Product not found" });
    return;
  }

  const newQty = Math.max(0, existing.stockQuantity + quantityChange);
  const newStatus =
    newQty === 0 ? "out_of_stock" : existing.status === "out_of_stock" ? "available" : existing.status;

  const [updated] = await db
    .update(productsTable)
    .set({ stockQuantity: newQty, status: newStatus })
    .where(eq(productsTable.id, id))
    .returning();

  res.json(updated);
});

export default router;
