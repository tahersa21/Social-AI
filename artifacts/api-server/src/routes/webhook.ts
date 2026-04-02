import crypto from "crypto";
import { Router, type IRouter } from "express";
import { db, fbSettingsTable, aiConfigTable, productsTable, conversationsTable, ordersTable, commentsLogTable, appointmentsTable, availableSlotsTable, leadsTable, orderSessionsTable, conversationSessionsTable, productInquiriesTable, platformEventsTable, userProductContextTable, preOrdersTable, preOrderSessionsTable, faqsTable, deliveryPricesTable } from "@workspace/db";
import { eq, desc, and, sql, count, gte } from "drizzle-orm";
import { broadcastNotification } from "./notifications.js";
import { ALGERIA_WILAYAS } from "./deliveryPrices.js";
import {
  buildSystemPrompt,
  buildCommentSystemPrompt,
  callAIWithLoadBalancing,
  callAIWithMetadata,
  detectJailbreak,
  detectReplyLeak,
  detectSalesTrigger,
  type SalesTriggerType,
  parseOrderAction,
  parseStartOrderAction,
  parseConfirmOrderAction,
  parseAppointmentAction,
  parseSendImageAction,
  parseBrowseCatalogAction,
  sendFbMessage,
  sendFbImageMessage,
  sendFbButtonMessage,
  sendFbGenericTemplate,
  getFbUserName,
  isWithinBusinessHours,
  analyzeAttachmentWithGemini,
  matchProductsFromAnalysis,
  transcribeOrDescribeAttachment,
} from "../lib/ai.js";

const router: IRouter = Router();

// ── In-memory off-topic counter (per sender, resets on server restart) ──────
const offTopicCounters = new Map<string, number>();

// ── Phase 7B: Attachment rate limiter — max 5 per 2 min per user ─────────────
const attachmentRateLimiter = new Map<string, number[]>();
const ATTACHMENT_MAX = 5;
const ATTACHMENT_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

function checkAttachmentRateLimit(userId: string): boolean {
  const now = Date.now();
  const prev = (attachmentRateLimiter.get(userId) ?? []).filter(
    (t) => now - t < ATTACHMENT_WINDOW_MS
  );
  if (prev.length >= ATTACHMENT_MAX) return false;
  attachmentRateLimiter.set(userId, [...prev, now]);
  return true;
}

// ── Frustration keywords that trigger Conversation Rescue ────────────────────
const RESCUE_KEYWORDS = [
  "ما فهمت", "مش فاهم", "لا أفهم", "مافهمتش", "ما فهمتوش",
  "كلامك ما فهمتوش", "محتاج إنسان", "ابغى إنسان", "أريد إنسان",
  "بشري", "إنسان حقيقي", "human", "real person", "real human",
  "مش عارف", "ما عندكش حل", "ما تساعدنيش", "ما تنفعش",
  "مزعج", "محبط", "زهقت", "تعبت",
];

// ── Helper: log to platform_events table (fire-and-forget) ───────────────────
async function logPlatformEvent(
  eventType: string,
  fbUserId?: string | null,
  detail?: string | null
): Promise<void> {
  try {
    await db.insert(platformEventsTable).values({
      eventType,
      fbUserId: fbUserId ?? null,
      detail: detail ?? null,
    });
  } catch {
    // non-critical — never block main flow
  }
}

function verifyWebhookSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!rawBody || !signatureHeader) return false;
  const expectedSignature =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signatureHeader)
  );
}

async function getSettings(tenantId?: number) {
  if (tenantId) {
    const [settings] = await db.select().from(fbSettingsTable)
      .where(eq(fbSettingsTable.id, tenantId))
      .limit(1);
    return settings ?? null;
  }
  const [settings] = await db.select().from(fbSettingsTable).limit(1);
  return settings ?? null;
}

async function getConfig(tenantId?: number) {
  if (tenantId) {
    const [config] = await db.select().from(aiConfigTable)
      .where(eq(aiConfigTable.id, tenantId))
      .limit(1);
    return config ?? null;
  }
  const [config] = await db.select().from(aiConfigTable).limit(1);
  return config ?? null;
}

async function isUserPaused(fbUserId: string): Promise<boolean> {
  const [latest] = await db
    .select({ isPaused: conversationsTable.isPaused })
    .from(conversationsTable)
    .where(eq(conversationsTable.fbUserId, fbUserId))
    .orderBy(desc(conversationsTable.timestamp))
    .limit(1);
  return latest?.isPaused === 1;
}

function analyzeSentiment(text: string): "positive" | "negative" | "neutral" {
  const lower = text.toLowerCase();
  const positiveWords = ["شكرا", "شكراً", "ممتاز", "رائع", "جيد", "جيدة", "احسنت", "حلو", "عجبني", "حسن", "مشكور", "يسلمو", "بارك", "ممتازة", "واو", "بديع", "جميل", "رائعة", "تمام", "مرحبا", "مرحباً", "اهلا", "أهلاً", "great", "good", "excellent", "thanks", "thank", "amazing", "wonderful", "perfect"];
  const negativeWords = ["مشكلة", "غاضب", "سيء", "رديء", "ما عجبني", "مو عاجبني", "غير راضي", "زعلان", "كذب", "غش", "احتيال", "وحش", "مجنون", "مو حلو", "تاعبني", "مزعج", "bad", "terrible", "awful", "problem", "issue", "angry", "mad", "hate", "worst", "horrible", "disgusting"];

  let posScore = 0;
  let negScore = 0;

  for (const w of positiveWords) {
    if (lower.includes(w)) posScore++;
  }
  for (const w of negativeWords) {
    if (lower.includes(w)) negScore++;
  }

  if (posScore > negScore) return "positive";
  if (negScore > posScore) return "negative";
  return "neutral";
}

function extractPhone(text: string): string | null {
  const patterns = [
    /(?:\+213|00213|0)(5|6|7)\d{8}/,
    /07[0-9]{8}/,
    /06[0-9]{8}/,
    /05[0-9]{8}/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

// ── Phone number validation: digits only, 10 (local) or 12 (with country code) ─
function isValidPhoneNumber(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 12;
}

// ── Wilaya resolver: accepts wilaya number (e.g. "16") or name (e.g. "الجزائر") ─
function resolveWilaya(input: string): string {
  const trimmed = input.trim();
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= 69) {
    const found = ALGERIA_WILAYAS.find((w) => w.wilayaId === num);
    if (found) return found.wilayaName;
  }
  const lower = trimmed.replace(/\s+/g, " ").toLowerCase();
  const exact = ALGERIA_WILAYAS.find((w) => w.wilayaName === trimmed);
  if (exact) return exact.wilayaName;
  const partial = ALGERIA_WILAYAS.find((w) =>
    w.wilayaName.toLowerCase().includes(lower) || lower.includes(w.wilayaName.toLowerCase())
  );
  if (partial) return partial.wilayaName;
  return trimmed;
}

function extractEmail(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

async function handleProductPayload(
  payload: string,
  senderId: string,
  userName: string,
  pageAccessToken: string,
  pageId?: string
): Promise<boolean> {
  const [payloadAction, payloadProductId] = payload.split(":") as [string, string | undefined];
  const payloadProdId = payloadProductId ? Number(payloadProductId) : null;

  if (payloadAction === "ORDER_NOW") {
    const [targetProduct] = payloadProdId
      ? await db.select().from(productsTable).where(eq(productsTable.id, payloadProdId)).limit(1)
      : await db.select().from(productsTable).limit(1);

    if (targetProduct) {
      // ── Stock check: redirect to pre-order if out of stock ──
      if ((targetProduct.stockQuantity ?? 0) === 0) {
        const outMsg = `⚠️ عذراً، "${targetProduct.name}" غير متاح حالياً (نفدت الكمية).\nيمكنك تسجيل طلب مسبق وسنعلمك فور توفّره.`;
        await sendFbMessage(pageAccessToken, senderId, outMsg, pageId);
        await db.insert(conversationsTable).values({
          fbUserId: senderId, fbUserName: userName, fbProfileUrl: null,
          message: outMsg, sender: "bot", timestamp: new Date(),
        });
        await sendFbQuickReplies(
          pageAccessToken, senderId,
          "هل تريد تسجيل طلب مسبق؟",
          [
            { title: "✅ نعم، طلب مسبق", payload: `PREORDER_START:${targetProduct.id}` },
            { title: "❌ لا، شكراً", payload: "BROWSE_CATALOG" },
          ],
          pageId
        );
        return true;
      }

      await db.delete(orderSessionsTable).where(eq(orderSessionsTable.fbUserId, senderId));
      await db.insert(orderSessionsTable).values({
        fbUserId: senderId,
        productName: targetProduct.name,
        productId: targetProduct.id,
        quantity: 1,
        step: "collecting",
      });
      const askInfoMsg = `بكل سرور! لإتمام طلبك لـ "${targetProduct.name}" نحتاج بعض المعلومات:\nما هو اسمك الكامل؟`;
      await sendFbMessage(pageAccessToken, senderId, askInfoMsg, pageId);
      await db.insert(conversationsTable).values({
        fbUserId: senderId, fbUserName: userName, fbProfileUrl: null,
        message: askInfoMsg, sender: "bot", timestamp: new Date(),
      });
    } else {
      const noProductMsg = "يرجى إرسال رسالة بتفاصيل طلبك وسيتواصل معك فريقنا.";
      await sendFbMessage(pageAccessToken, senderId, noProductMsg, pageId);
      await db.insert(conversationsTable).values({
        fbUserId: senderId, fbUserName: userName, fbProfileUrl: null,
        message: noProductMsg, sender: "bot", timestamp: new Date(),
      });
    }
    return true;
  }

  if (payloadAction === "CONFIRM_ORDER") {
    const deleted = await db.delete(orderSessionsTable)
      .where(and(eq(orderSessionsTable.fbUserId, senderId), eq(orderSessionsTable.step, "awaiting_confirm")))
      .returning();
    const session = deleted[0];

    if (!session) {
      await sendFbMessage(pageAccessToken, senderId, "لا يوجد طلب قيد الانتظار حالياً.", pageId);
      return true;
    }

    const product = session.productId
      ? (await db.select().from(productsTable).where(eq(productsTable.id, session.productId)).limit(1))[0]
      : null;

    const [appCfgOrd] = await db.select().from(aiConfigTable).limit(1);
    const currencyOrd = appCfgOrd?.currency ?? "DZD";
    const unitPriceOrd = product?.discountPrice ?? product?.originalPrice ?? 0;
    const qtyOrd = session.quantity ?? 1;
    const deliveryPriceOrd = session.deliveryPrice ?? 0;
    const totalPriceOrd = unitPriceOrd * qtyOrd + deliveryPriceOrd;

    await db.insert(ordersTable).values({
      fbUserId: senderId, fbUserName: userName, fbProfileUrl: null,
      productId: session.productId ?? null,
      productName: session.productName,
      unitPrice: unitPriceOrd || null,
      quantity: qtyOrd,
      totalPrice: totalPriceOrd,
      deliveryType: (session as any).deliveryType ?? null,
      deliveryPrice: deliveryPriceOrd || null,
      status: "pending",
      customerName: session.customerName,
      customerPhone: session.customerPhone,
      customerWilaya: session.customerWilaya,
      customerAddress: session.customerAddress,
      source: "messenger",
    });

    await db.update(productInquiriesTable)
      .set({ converted: 1 })
      .where(and(eq(productInquiriesTable.fbUserId, senderId), eq(productInquiriesTable.converted, 0)));

    const realName = session.customerName ?? userName;
    const [existingLead] = await db.select().from(leadsTable).where(eq(leadsTable.fbUserId, senderId)).limit(1);
    if (existingLead) {
      await db.update(leadsTable).set({
        fbUserName: realName,
        phone: session.customerPhone ?? existingLead.phone,
        label: "customer",
        lastInteractionAt: new Date().toISOString(),
        updatedAt: new Date(),
      }).where(eq(leadsTable.fbUserId, senderId));
    } else {
      await db.insert(leadsTable).values({
        fbUserId: senderId,
        fbUserName: realName,
        fbProfileUrl: `https://facebook.com/${senderId}`,
        phone: session.customerPhone ?? null,
        label: "customer",
        source: "messenger",
        lastInteractionAt: new Date().toISOString(),
        totalMessages: 1,
        createdAt: new Date(),
      }).onConflictDoNothing();
    }

    broadcastNotification({
      type: "new_order",
      title: "طلب جديد!",
      body: `${userName} طلب "${session.productName}" (${session.quantity ?? 1} قطعة)`,
      route: "/orders",
    });

    const deliveryLine = (session as any).deliveryType
      ? `\n🚚 نوع التوصيل: ${(session as any).deliveryType === "home" ? "للمنزل" : "مكتب البريد"} — ${deliveryPriceOrd} ${currencyOrd}`
      : "";
    const confirmMsg =
      `✅ تم تأكيد طلبك لـ "${session.productName}" (${qtyOrd} قطعة) بنجاح!\n` +
      `💰 إجمالي الطلب: ${totalPriceOrd} ${currencyOrd}` +
      deliveryLine +
      `\nسيتواصل معك فريقنا قريباً. شكراً لثقتك! 🙏`;
    await sendFbMessage(pageAccessToken, senderId, confirmMsg, pageId);
    await db.insert(conversationsTable).values({
      fbUserId: senderId, fbUserName: userName, fbProfileUrl: null,
      message: confirmMsg, sender: "bot", timestamp: new Date(),
    });

    if (product?.images) {
      try {
        const imgIndex = product.mainImageIndex ?? 0;
        const fullUrl = buildProductImageUrl(product.id, imgIndex);
        await sendFbImageMessage(pageAccessToken, senderId, fullUrl, pageId);
      } catch {}
    }
    return true;
  }

  if (payloadAction === "CANCEL_ORDER") {
    await db.delete(orderSessionsTable).where(eq(orderSessionsTable.fbUserId, senderId));
    const cancelMsg = "❌ تم إلغاء الطلب. يمكنك طلب منتج جديد في أي وقت!";
    await sendFbMessage(pageAccessToken, senderId, cancelMsg, pageId);
    await db.insert(conversationsTable).values({
      fbUserId: senderId, fbUserName: userName, fbProfileUrl: null,
      message: cancelMsg, sender: "bot", timestamp: new Date(),
    });
    return true;
  }

  // ── DELIVERY_HOME / DELIVERY_OFFICE — choose delivery type ────────────────
  if (payloadAction === "DELIVERY_HOME" || payloadAction === "DELIVERY_OFFICE") {
    const [session] = await db.select().from(orderSessionsTable)
      .where(eq(orderSessionsTable.fbUserId, senderId)).limit(1);
    if (!session) return false;

    const isHome = payloadAction === "DELIVERY_HOME";
    const deliveryType = isHome ? "home" : "office";

    // Look up price from deliveryPricesTable based on saved wilaya
    let deliveryPrice = 0;
    if (session.customerWilaya) {
      const [wp] = await db.select().from(deliveryPricesTable)
        .where(eq(deliveryPricesTable.wilayaName, session.customerWilaya)).limit(1);
      deliveryPrice = wp ? (isHome ? (wp.homePrice ?? 0) : (wp.officePrice ?? 0)) : 0;
    }

    await db.update(orderSessionsTable).set({
      deliveryType,
      deliveryPrice,
      step: "awaiting_confirm",
      updatedAt: new Date(),
    }).where(eq(orderSessionsTable.fbUserId, senderId));

    // Re-fetch session with updated values
    const [appConf] = await db.select().from(aiConfigTable).limit(1);
    const currency = appConf?.currency ?? "DZD";
    const product = session.productId
      ? (await db.select().from(productsTable).where(eq(productsTable.id, session.productId)).limit(1))[0]
      : null;
    const unitPrice = product?.discountPrice ?? product?.originalPrice ?? 0;
    const qty = session.quantity ?? 1;
    const productTotal = unitPrice * qty;
    const grandTotal = productTotal + deliveryPrice;
    const deliveryLabel = isHome ? "🏠 توصيل للمنزل" : "🏢 مكتب البريد";

    const summaryMsg =
      `📋 ملخص طلبك:\n` +
      `🛍️ المنتج: ${session.productName}\n` +
      `📦 الكمية: ${qty}\n` +
      `💰 سعر المنتج: ${productTotal} ${currency}\n` +
      `🚚 ${deliveryLabel}: ${deliveryPrice} ${currency}\n` +
      `─────────────────\n` +
      `💵 الإجمالي: ${grandTotal} ${currency}\n` +
      `👤 الاسم: ${session.customerName ?? "—"}\n` +
      `📱 الهاتف: ${session.customerPhone ?? "—"}\n` +
      `📍 الولاية: ${session.customerWilaya ?? "—"}\n` +
      `🏠 العنوان: ${session.customerAddress ?? "—"}\n\n` +
      `هل تريد تأكيد الطلب؟`;

    try {
      await sendFbButtonMessage(pageAccessToken, senderId, summaryMsg, [
        { title: "✅ تأكيد الطلب", payload: "CONFIRM_ORDER" },
        { title: "🔄 تغيير التوصيل", payload: "CHANGE_DELIVERY" },
        { title: "❌ إلغاء", payload: "CANCEL_ORDER" },
      ], pageId);
    } catch {
      await sendFbMessage(pageAccessToken, senderId, summaryMsg + "\n\nأرسل 'تأكيد' أو 'تغيير التوصيل' أو 'إلغاء'.", pageId);
    }

    await db.insert(conversationsTable).values({
      fbUserId: senderId, fbUserName: userName, fbProfileUrl: null,
      message: summaryMsg, sender: "bot", timestamp: new Date(),
    });
    return true;
  }

  // ── CHANGE_DELIVERY — re-show delivery options ────────────────────────────
  if (payloadAction === "CHANGE_DELIVERY") {
    const [session] = await db.select().from(orderSessionsTable)
      .where(eq(orderSessionsTable.fbUserId, senderId)).limit(1);
    if (!session || !session.customerWilaya) {
      await sendFbMessage(pageAccessToken, senderId, "لا يوجد طلب نشط لتغيير التوصيل.", pageId);
      return true;
    }
    await sendDeliveryOptions(pageAccessToken, senderId, session.customerWilaya, pageId);
    await db.update(orderSessionsTable).set({ step: "choosing_delivery", updatedAt: new Date() })
      .where(eq(orderSessionsTable.fbUserId, senderId));
    return true;
  }

  if (payloadAction === "PRICE_INFO") {
    const priceProducts = payloadProdId
      ? await db.select().from(productsTable).where(eq(productsTable.id, payloadProdId)).limit(1)
      : await db.select().from(productsTable).limit(5);
    const priceList = priceProducts
      .map((p) => `• ${p.name}: ${p.discountPrice ?? p.originalPrice ?? 0} دج`)
      .join("\n");
    const priceMsg = priceProducts.length > 0
      ? `📋 قائمة الأسعار:\n${priceList}`
      : "يرجى التواصل معنا للاستفسار عن الأسعار.";
    await sendFbMessage(pageAccessToken, senderId, priceMsg, pageId);
    await db.insert(conversationsTable).values({
      fbUserId: senderId, fbUserName: userName, fbProfileUrl: null,
      message: priceMsg, sender: "bot", timestamp: new Date(),
    });
    return true;
  }

  if (payloadAction === "PRODUCT_IMAGE") {
    const [imageProduct] = payloadProdId
      ? await db.select().from(productsTable).where(eq(productsTable.id, payloadProdId)).limit(1)
      : await db.select().from(productsTable).limit(1);
    if (imageProduct?.images) {
      try {
        const imgIndex = imageProduct.mainImageIndex ?? 0;
        const fullUrl = buildProductImageUrl(imageProduct.id, imgIndex);
        await sendFbImageMessage(pageAccessToken, senderId, fullUrl, pageId);
      } catch {}
    } else {
      await sendFbMessage(pageAccessToken, senderId, "عذراً، لا تتوفر صور المنتجات حالياً.", pageId);
    }
    return true;
  }

  // ── CATALOG BROWSER ────────────────────────────────────────────────────────

  if (payloadAction === "BROWSE_CATALOG" || payloadAction === "PRODUCTS") {
    await sendCatalogCategoryMenu(pageAccessToken, senderId, pageId);
    return true;
  }

  if (payloadAction === "APPOINTMENT") {
    const [appConfig] = await db.select().from(aiConfigTable).limit(1);
    const startHour = appConfig?.businessHoursStart ?? "09:00";
    const endHour   = appConfig?.businessHoursEnd   ?? "22:00";
    const appointmentMsg =
      `📅 لحجز موعد، يرجى إرسال:\n` +
      `• اسمك الكامل\n` +
      `• رقم هاتفك\n` +
      `• التاريخ والوقت المناسب لك\n\n` +
      `⏰ ساعات العمل: ${startHour} - ${endHour}\n\n` +
      `سيتواصل معك فريقنا لتأكيد الموعد.`;
    await sendFbMessage(pageAccessToken, senderId, appointmentMsg, pageId);
    await db.insert(conversationsTable).values({
      fbUserId: senderId, fbUserName: userName, fbProfileUrl: null,
      message: appointmentMsg, sender: "bot", timestamp: new Date(),
    });
    return true;
  }

  if (payloadAction === "DELIVERY") {
    const [appConfig] = await db.select().from(aiConfigTable).limit(1);
    const deliveryPrices = await db.select().from(deliveryPricesTable);
    const deliveryEnabled = appConfig?.deliveryEnabled;
    if (!deliveryEnabled || deliveryPrices.length === 0) {
      const noDeliveryMsg = "🚚 للاستفسار عن التوصيل، يرجى التواصل معنا مباشرة وسنزودك بكافة التفاصيل.";
      await sendFbMessage(pageAccessToken, senderId, noDeliveryMsg, pageId);
      await db.insert(conversationsTable).values({
        fbUserId: senderId, fbUserName: userName, fbProfileUrl: null,
        message: noDeliveryMsg, sender: "bot", timestamp: new Date(),
      });
    } else {
      const sample = deliveryPrices.slice(0, 10);
      const lines = [
        "🚚 أسعار التوصيل حسب الولاية:",
        "",
        ...sample.map((w) => `• ${w.wilayaName}: 🏠 ${w.homePrice ?? 0} / 🏢 ${w.officePrice ?? 0} ${appConfig?.currency ?? "DZD"}`),
        deliveryPrices.length > 10 ? `\n...و ${deliveryPrices.length - 10} ولاية أخرى. أرسل اسم ولايتك لمعرفة السعر الدقيق.` : "",
      ].filter((l) => l !== undefined);
      const deliveryMsg = lines.join("\n");
      await sendFbMessage(pageAccessToken, senderId, deliveryMsg, pageId);
      await db.insert(conversationsTable).values({
        fbUserId: senderId, fbUserName: userName, fbProfileUrl: null,
        message: deliveryMsg, sender: "bot", timestamp: new Date(),
      });
    }
    return true;
  }

  if (payloadAction === "FAQ") {
    const allFaqs = await db.select().from(faqsTable).limit(8);
    if (allFaqs.length === 0) {
      const noFaqMsg = "❓ لا توجد أسئلة شائعة بعد. تواصل معنا مباشرة وسنجيب على استفساراتك.";
      await sendFbMessage(pageAccessToken, senderId, noFaqMsg, pageId);
      await db.insert(conversationsTable).values({
        fbUserId: senderId, fbUserName: userName, fbProfileUrl: null,
        message: noFaqMsg, sender: "bot", timestamp: new Date(),
      });
    } else {
      const faqLines = ["❓ الأسئلة الشائعة:", ""];
      allFaqs.forEach((f, i) => {
        faqLines.push(`${i + 1}. ${f.question}`);
        faqLines.push(`   ${f.answer}`);
        faqLines.push("");
      });
      const faqMsg = faqLines.join("\n");
      await sendFbMessage(pageAccessToken, senderId, faqMsg, pageId);
      await db.insert(conversationsTable).values({
        fbUserId: senderId, fbUserName: userName, fbProfileUrl: null,
        message: faqMsg, sender: "bot", timestamp: new Date(),
      });
    }
    return true;
  }

  if (payloadAction === "CONTACT") {
    const [appConfig] = await db.select().from(aiConfigTable).limit(1);
    const contactMsg =
      `📞 للتواصل معنا:\n\n` +
      `${appConfig?.pageFacebookUrl ? `🔗 فيسبوك: ${appConfig.pageFacebookUrl}\n` : ""}` +
      `${appConfig?.businessCity ? `📍 الموقع: ${appConfig.businessCity}\n` : ""}` +
      `\nأرسل لنا رسالتك وسيرد عليك فريقنا في أقرب وقت. 😊`;
    await sendFbMessage(pageAccessToken, senderId, contactMsg, pageId);
    await db.insert(conversationsTable).values({
      fbUserId: senderId, fbUserName: userName, fbProfileUrl: null,
      message: contactMsg, sender: "bot", timestamp: new Date(),
    });
    return true;
  }

  if (payloadAction === "FILTER_CATEGORY") {
    const category = payloadProductId ?? "general";
    await sendCatalogPage(pageAccessToken, senderId, { category }, 1, pageId);
    return true;
  }

  if (payloadAction === "FILTER_BRAND") {
    const brand = payloadProductId ?? "";
    await sendCatalogPage(pageAccessToken, senderId, { brand }, 1, pageId);
    return true;
  }

  if (payloadAction === "FILTER_PRICE_TIER") {
    const tier = payloadProductId ?? "";
    await sendCatalogPage(pageAccessToken, senderId, { priceTier: tier }, 1, pageId);
    return true;
  }

  if (payloadAction === "BROWSE_PAGE") {
    // Payload format: BROWSE_PAGE:category=phones&brand=samsung:2
    const parts = payload.split(":");
    const filtersStr = parts[1] ?? "";
    const page = parseInt(parts[2] ?? "1", 10);
    const filters: CatalogFilters = {};
    for (const pair of filtersStr.split("&")) {
      const [k, v] = pair.split("=");
      if (k === "category" && v) filters.category = decodeURIComponent(v);
      if (k === "brand" && v) filters.brand = decodeURIComponent(v);
      if (k === "priceTier" && v) filters.priceTier = decodeURIComponent(v);
    }
    await sendCatalogPage(pageAccessToken, senderId, filters, page, pageId);
    return true;
  }

  if (payloadAction === "DETAILS") {
    const productId = payloadProdId;
    if (!productId) return false;
    const [product] = await db.select().from(productsTable)
      .where(eq(productsTable.id, productId)).limit(1);
    if (!product) {
      await sendFbMessage(pageAccessToken, senderId, "عذراً، لم يعد هذا المنتج متاحاً.", pageId);
      return true;
    }
    const price = product.discountPrice ?? product.originalPrice;
    const priceStr = product.discountPrice && product.originalPrice
      ? `${product.discountPrice} دج (كان ${product.originalPrice} دج)`
      : price ? `${price} دج` : "اتصل للسعر";

    const isZeroStock = product.stockQuantity === 0;
    const stockStatus = isZeroStock ? "⚠️ الكمية نفدت" :
      product.stockQuantity <= product.lowStockThreshold ? `⚠️ كمية محدودة (${product.stockQuantity} فقط)` :
      `✅ متاح (${product.stockQuantity} قطعة)`;

    const lines: string[] = [`📦 *${product.name}*`];
    if (product.brand) lines.push(`🏷️ العلامة: ${product.brand}`);
    if (product.category) lines.push(`📂 الفئة: ${product.category}`);
    if (product.itemType) lines.push(`🔖 النوع: ${product.itemType}`);
    if (product.priceTier) {
      const tierLabel: Record<string, string> = { budget: "اقتصادي 💚", mid_range: "متوسط 💛", premium: "ممتاز 💎" };
      lines.push(`💰 الفئة السعرية: ${tierLabel[product.priceTier] ?? product.priceTier}`);
    }
    lines.push(`💵 السعر: ${priceStr}`);
    lines.push(`📊 المخزون: ${stockStatus}`);
    if (product.description) lines.push(`\n📝 ${product.description}`);

    await sendFbMessage(pageAccessToken, senderId, lines.join("\n"), pageId);
    await db.insert(conversationsTable).values({
      fbUserId: senderId, fbUserName: userName, fbProfileUrl: null,
      message: lines.join("\n"), sender: "bot", timestamp: new Date(),
    });

    // ── Zero-stock: offer pre-order instead of ORDER_NOW ──
    if (isZeroStock) {
      const preOrderPrompt =
        "⚠️ هذا المنتج انتهت الكميةُ حالياً.\nيمكنك طلبه كطلب مسبق وسنقوم بإعلامك عند توفره.";
      await sendFbMessage(pageAccessToken, senderId, preOrderPrompt, pageId);
      await sendFbQuickReplies(
        pageAccessToken,
        senderId,
        "هل تريد تسجيل طلب مسبق؟",
        [
          { title: "✅ نعم، طلب مسبق", payload: `PREORDER_START:${product.id}` },
          { title: "❌ لا، شكراً", payload: "BROWSE_CATALOG" },
        ],
        pageId
      );
    } else {
      const detailQRs: Array<{ title: string; payload: string }> = [
        { title: "🛒 اطلب الآن", payload: `ORDER_NOW:${product.id}` },
        { title: "🔍 منتجات مشابهة", payload: `FILTER_CATEGORY:${product.category ?? "general"}` },
        { title: "🏠 الفئات", payload: "BROWSE_CATALOG" },
      ];
      await sendFbQuickReplies(pageAccessToken, senderId, "ماذا تريد أن تفعل؟", detailQRs, pageId);
    }

    // ── PHASE 7 Task 1: Save active product context ───────────────────────────
    // Stores which product this user last viewed. Future text messages from
    // this user will use it to answer follow-up questions ("Is it good for...?")
    await db
      .insert(userProductContextTable)
      .values({ fbUserId: senderId, productId: product.id, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userProductContextTable.fbUserId,
        set: { productId: product.id, updatedAt: new Date() },
      });

    return true;
  }

  // ── PREORDER_START:<productId> ─────────────────────────────────────────────
  if (payloadAction === "PREORDER_START") {
    const productId = payloadProdId;
    if (!productId) return false;
    const [product] = await db.select().from(productsTable)
      .where(eq(productsTable.id, productId)).limit(1);
    if (!product) {
      await sendFbMessage(pageAccessToken, senderId, "عذراً، لم يعد هذا المنتج متاحاً.", pageId);
      return true;
    }
    // Start session — collect name first
    await db.insert(preOrderSessionsTable)
      .values({
        fbUserId: senderId,
        productId: product.id,
        productName: product.name,
        step: "awaiting_name",
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: preOrderSessionsTable.fbUserId,
        set: { productId: product.id, productName: product.name, step: "awaiting_name", customerName: null, createdAt: new Date() },
      });
    const askName = `📝 لتسجيل الطلب المسبق لـ "${product.name}"،\nأرسل لي اسمك الكامل من فضلك.`;
    await sendFbMessage(pageAccessToken, senderId, askName, pageId);
    await db.insert(conversationsTable).values({
      fbUserId: senderId, fbUserName: userName, fbProfileUrl: null,
      message: askName, sender: "bot", timestamp: new Date(),
    });
    return true;
  }

  return false;
}

// ── Delivery helpers ────────────────────────────────────────────────────────────

async function sendDeliveryOptions(
  pageAccessToken: string,
  senderId: string,
  wilayaName: string,
  pageId?: string
): Promise<void> {
  const [wp] = await db.select().from(deliveryPricesTable)
    .where(eq(deliveryPricesTable.wilayaName, wilayaName)).limit(1);
  const [appConf] = await db.select().from(aiConfigTable).limit(1);
  const currency = appConf?.currency ?? "DZD";

  const homePrice  = wp?.homePrice  ?? 0;
  const officePrice = wp?.officePrice ?? 0;

  const promptMsg = `🚚 اختر نوع التوصيل إلى ${wilayaName}:`;
  await sendFbQuickReplies(pageAccessToken, senderId, promptMsg, [
    { title: `🏠 للمنزل — ${homePrice} ${currency}`,   payload: "DELIVERY_HOME" },
    { title: `🏢 مكتب البريد — ${officePrice} ${currency}`, payload: "DELIVERY_OFFICE" },
  ], pageId);
}

// ── Catalog helpers ────────────────────────────────────────────────────────────

type CatalogFilters = { category?: string; brand?: string; priceTier?: string };

async function sendCatalogCategoryMenu(
  pageAccessToken: string,
  senderId: string,
  pageId?: string
): Promise<void> {
  const allProducts = await db.select({
    category: productsTable.category,
  }).from(productsTable)
    .where(eq(productsTable.status, "available"));

  const categories = [...new Set(
    allProducts.map((p) => p.category ?? "general").filter(Boolean)
  )].slice(0, 10);

  if (categories.length === 0) {
    await sendFbMessage(pageAccessToken, senderId, "لا توجد منتجات متاحة حالياً. تواصل معنا لمزيد من المعلومات.", pageId);
    return;
  }

  const categoryEmojis: Record<string, string> = {
    phones: "📱", hواتف: "📱", courses: "📚", كورسات: "📚", fashion: "👗", أزياء: "👗",
    food: "🍽️", طعام: "🍽️", electronics: "⚡", إلكترونيات: "⚡", beauty: "💄", جمال: "💄",
    cars: "🚗", سيارات: "🚗", real_estate: "🏠", عقارات: "🏠", general: "📦", عام: "📦",
  };
  const getEmoji = (cat: string) => categoryEmojis[cat.toLowerCase()] ?? "🏷️";

  const quickReplies = categories.map((cat) => ({
    title: `${getEmoji(cat)} ${cat}`.substring(0, 20),
    payload: `FILTER_CATEGORY:${cat}`,
  }));

  await sendFbQuickReplies(
    pageAccessToken,
    senderId,
    "🛍️ اختر الفئة التي تريد تصفحها:",
    quickReplies,
    pageId
  );
}

async function sendCatalogPage(
  pageAccessToken: string,
  senderId: string,
  filters: CatalogFilters,
  page: number,
  pageId?: string
): Promise<void> {
  const PAGE_SIZE = 10;
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [eq(productsTable.status, "available")];
  if (filters.category) conditions.push(eq(productsTable.category, filters.category));
  if (filters.brand) conditions.push(eq(productsTable.brand, filters.brand));
  if (filters.priceTier) conditions.push(eq(productsTable.priceTier, filters.priceTier));

  const allMatching = await db.select().from(productsTable)
    .where(and(...conditions))
    .orderBy(productsTable.id);

  const matching = allMatching.slice(offset, offset + PAGE_SIZE);

  if (matching.length === 0) {
    const filterDesc = [
      filters.category ? `الفئة: ${filters.category}` : null,
      filters.brand ? `العلامة: ${filters.brand}` : null,
      filters.priceTier ? `السعر: ${filters.priceTier}` : null,
    ].filter(Boolean).join("، ");
    await sendFbMessage(
      pageAccessToken,
      senderId,
      `عذراً، لا توجد منتجات تطابق (${filterDesc || "الفلتر المحدد"}). هل تريد تصفح فئات أخرى؟`,
      pageId
    );
    await sendFbQuickReplies(
      pageAccessToken, senderId,
      "اختر:", [{ title: "🏠 كل الفئات", payload: "BROWSE_CATALOG" }],
      pageId
    );
    return;
  }

  const appUrl = getAppBaseUrl();
  const PLACEHOLDER = "https://placehold.co/400x400/f8fafc/94a3b8?text=No+Image";

  const elements = matching.map((p) => {
    const price = p.discountPrice ?? p.originalPrice;
    const priceStr = price ? `${price} دج` : "اتصل للسعر";
    const tierLabel: Record<string, string> = { budget: "💚", mid_range: "💛", premium: "💎" };
    const tierIcon = p.priceTier ? (tierLabel[p.priceTier] ?? "") : "";

    const subtitleParts: string[] = [];
    if (p.brand) subtitleParts.push(p.brand);
    if (p.itemType) subtitleParts.push(p.itemType);
    subtitleParts.push(`${tierIcon} ${priceStr}`.trim());
    if (p.description) subtitleParts.push(p.description.substring(0, 30));

    let imageUrl = PLACEHOLDER;
    if (p.images && appUrl) {
      try {
        const imgs = JSON.parse(p.images) as string[];
        if (imgs.length > 0) {
          imageUrl = `${appUrl}/api/products/image/${p.id}/${p.mainImageIndex ?? 0}`;
        }
      } catch {}
    }

    const isOutOfStock = (p.stockQuantity ?? 0) === 0;
    const buttons: Array<
      | { type: "postback"; title: string; payload: string }
      | { type: "web_url"; title: string; url: string }
    > = [
      { type: "postback", title: "📋 التفاصيل", payload: `DETAILS:${p.id}` },
      isOutOfStock
        ? { type: "postback", title: "⏳ طلب مسبق", payload: `PREORDER_START:${p.id}` }
        : { type: "postback", title: "🛒 اطلب الآن", payload: `ORDER_NOW:${p.id}` },
    ];
    if (p.externalUrl) {
      buttons.push({ type: "web_url", title: "🔗 رابط المنتج", url: p.externalUrl });
    }

    return {
      title: p.name.substring(0, 80),
      subtitle: subtitleParts.join(" | ").substring(0, 80),
      image_url: imageUrl,
      buttons,
    };
  });

  // Notify user of count before carousel so they know to swipe
  if (elements.length > 1) {
    await sendFbMessage(pageAccessToken, senderId, `وجدنا ${elements.length} منتج 👇 اسحب ← لرؤية جميعها:`, pageId);
  }

  await sendFbGenericTemplate(pageAccessToken, senderId, elements, pageId);

  const hasMore = allMatching.length > offset + PAGE_SIZE;
  if (hasMore) {
    const filtersEncoded = Object.entries(filters)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    await sendFbQuickReplies(
      pageAccessToken, senderId,
      `عرض ${matching.length} من ${allMatching.length} — اضغط لرؤية المزيد:`,
      [
        { title: "⬅️ المزيد", payload: `BROWSE_PAGE:${filtersEncoded}:${page + 1}` },
        { title: "🏠 الفئات", payload: "BROWSE_CATALOG" },
      ],
      pageId
    );
  } else {
    await sendFbQuickReplies(
      pageAccessToken, senderId,
      allMatching.length === 1 ? "هذا هو المنتج المتاح في هذه الفئة 👆" : `تم عرض كل المنتجات (${allMatching.length}) 👆`,
      [{ title: "🏠 كل الفئات", payload: "BROWSE_CATALOG" }],
      pageId
    );
  }
}

function getAppBaseUrl(): string {
  // REPLIT_DOMAINS is automatically set by Replit in both dev and production
  // and always contains the correct public domain — use it as primary source.
  if (process.env["REPLIT_DOMAINS"]) {
    const domains = process.env["REPLIT_DOMAINS"].split(",").map(d => d.trim()).filter(Boolean);
    if (domains.length > 0) return `https://${domains[0]}`;
  }
  if (process.env["APP_URL"]) return process.env["APP_URL"];
  if (process.env["REPLIT_DEV_DOMAIN"]) return `https://${process.env["REPLIT_DEV_DOMAIN"]}`;
  return "";
}

function buildProductImageUrl(productId: number, imageIndex: number): string {
  return `${getAppBaseUrl()}/api/products/image/${productId}/${imageIndex}`;
}

function parseSaveLeadAction(text: string): { action: string; phone?: string; email?: string; notes?: string } | null {
  const match = text.match(/\{[\s\S]*?"action"\s*:\s*"save_lead"[\s\S]*?\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as { action: string; phone?: string; email?: string; notes?: string };
  } catch {
    return null;
  }
}

function parseCheckOrderStatusAction(text: string): boolean {
  const match = text.match(/\{[\s\S]*?"action"\s*:\s*"check_order_status"[\s\S]*?\}/);
  return !!match;
}

async function sendFbQuickReplies(
  pageAccessToken: string,
  recipientId: string,
  message: string,
  quickReplies: Array<{ title: string; payload: string }>,
  pageId?: string
): Promise<void> {
  const endpoint = pageId ? `${pageId}/messages` : "me/messages";
  await fetch(
    `https://graph.facebook.com/v25.0/${endpoint}?access_token=${pageAccessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: {
          text: message,
          quick_replies: quickReplies.map((qr) => ({
            content_type: "text",
            title: qr.title,
            payload: qr.payload,
          })),
        },
      }),
    }
  );
}

const messageBuffer = new Map<string, {
  messages: string[];
  timer: ReturnType<typeof setTimeout>;
  resolve: (combined: string) => void;
}>();

function bufferMessage(senderId: string, text: string): Promise<string> {
  return new Promise((resolve) => {
    const existing = messageBuffer.get(senderId);
    if (existing) {
      clearTimeout(existing.timer);
      existing.messages.push(text);
      existing.resolve = resolve;
    } else {
      messageBuffer.set(senderId, { messages: [text], timer: null as any, resolve });
    }

    const timer = setTimeout(() => {
      const buffered = messageBuffer.get(senderId);
      if (!buffered) return;
      const combined = buffered.messages.join(" | ");
      messageBuffer.delete(senderId);
      buffered.resolve(combined);
    }, 3000);

    messageBuffer.get(senderId)!.timer = timer;
  });
}

async function getOrCreateSession(fbUserId: string): Promise<{ isNew: boolean }> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [existing] = await db.select()
    .from(conversationSessionsTable)
    .where(and(
      eq(conversationSessionsTable.fbUserId, fbUserId),
      gte(conversationSessionsTable.sessionEnd, twentyFourHoursAgo),
    ))
    .orderBy(desc(conversationSessionsTable.createdAt))
    .limit(1);

  if (existing) {
    await db.update(conversationSessionsTable)
      .set({
        sessionEnd: new Date().toISOString(),
        messageCount: sql`${conversationSessionsTable.messageCount} + 1`,
        aiCallsCount: sql`${conversationSessionsTable.aiCallsCount} + 1`,
      })
      .where(eq(conversationSessionsTable.id, existing.id));
    return { isNew: false };
  } else {
    await db.insert(conversationSessionsTable).values({
      fbUserId,
      sessionStart: new Date().toISOString(),
      sessionEnd: new Date().toISOString(),
      messageCount: 1,
    });
    return { isNew: true };
  }
}

router.get("/webhook", async (req, res): Promise<void> => {
  const settings = await getSettings();
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === (settings?.verifyToken ?? "")) {
    res.status(200).send(challenge);
  } else {
    res.status(403).json({ message: "Forbidden" });
  }
});

router.post("/webhook", async (req, res): Promise<void> => {
  const settings = await getSettings();

  if (settings?.appSecret) {
    const sig = req.headers["x-hub-signature-256"] as string | undefined;
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!verifyWebhookSignature(rawBody, sig, settings.appSecret)) {
      res.status(403).json({ message: "Invalid signature" });
      return;
    }
  }

  res.json({ message: "EVENT_RECEIVED" });

  const body = req.body as {
    object?: string;
    entry?: Array<{
      messaging?: Array<{
        sender?: { id: string };
        message?: {
          text?: string;
          quick_reply?: { payload?: string };
          attachments?: Array<{ type: string; payload: { url?: string } }>;
        };
        postback?: { payload?: string; title?: string };
        timestamp?: number;
      }>;
      changes?: Array<{
        field?: string;
        value?: {
          item?: string;
          comment_id?: string;
          post_id?: string;
          from?: { id: string; name?: string };
          message?: string;
          sender_id?: string;
        };
      }>;
    }>;
  };

  if (body.object !== "page") return;

  if (!settings?.pageAccessToken) return;

  const config = await getConfig();
  if (!config) return;

  for (const entry of body.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      let fromAttachment = false; // set true when Phase 7B transcribes an attachment
      // ── Postback event handling ────────────────────────────────
      if (event.postback && event.sender?.id) {
        const pbSenderId = event.sender.id;
        const { name: pbUserName } = await getFbUserName(settings.pageAccessToken, pbSenderId);

        // ── Paused-user guard for postbacks ──────────────────────
        // A paused user is in human-handoff mode. All bot payload responses
        // (catalog browsing, order flow, quick replies) are suppressed so the
        // human agent's conversation is not disrupted by automated messages.
        if (await isUserPaused(pbSenderId)) {
          const handoffMsg = "🤝 يتولى أحد ممثلينا محادثتك حالياً. سيرد عليك قريباً.";
          await sendFbMessage(settings.pageAccessToken, pbSenderId, handoffMsg, settings.pageId ?? undefined);
          continue;
        }

        await handleProductPayload(event.postback.payload ?? "", pbSenderId, pbUserName, settings.pageAccessToken, settings.pageId ?? undefined);
        continue;
      }

      // ── Quick reply button handling (arrive as messages with quick_reply field) ─
      if (event.message?.quick_reply?.payload && event.sender?.id) {
        const qrSenderId = event.sender.id;
        const { name: qrUserName } = await getFbUserName(settings.pageAccessToken, qrSenderId);

        // ── Paused-user guard for quick replies ──────────────────
        // Same rationale as postbacks above — suppress all bot responses
        // while a human agent is active on this conversation.
        if (await isUserPaused(qrSenderId)) {
          const handoffMsg = "🤝 يتولى أحد ممثلينا محادثتك حالياً. سيرد عليك قريباً.";
          await sendFbMessage(settings.pageAccessToken, qrSenderId, handoffMsg, settings.pageId ?? undefined);
          continue;
        }

        await handleProductPayload(event.message.quick_reply.payload, qrSenderId, qrUserName, settings.pageAccessToken, settings.pageId ?? undefined);
        continue;
      }

      // ── PHASE 7B: Attachment-only messages (image/audio/video with no text) ──
      // If the message has no text but has an image, audio, or video attachment,
      // handle it via multimodal analysis before the text flow.
      if (!event.message?.text && event.sender?.id) {
        const attList = event.message?.attachments ?? [];
        const imageAtt = attList.find((a) => a.type === "image");
        const audioAtt = attList.find((a) => a.type === "audio");
        const videoAtt = attList.find((a) => a.type === "video");

        if (imageAtt || audioAtt || videoAtt) {
          const attSenderId = event.sender.id;
          const { name: attUserName, profileUrl: attProfileUrl } =
            await getFbUserName(settings.pageAccessToken, attSenderId);

          // Kill switch
          if (!config.botEnabled) {
            const disabledMsg =
              config.botDisabledMessage ??
              "عذراً، المساعد الذكي غير متاح حالياً. يرجى التواصل معنا لاحقاً.";
            await sendFbMessage(settings.pageAccessToken, attSenderId, disabledMsg, settings.pageId ?? undefined);
            continue;
          }

          // Paused-user guard
          if (await isUserPaused(attSenderId)) continue;

          // Working hours
          if (
            config.workingHoursEnabled !== 0 &&
            !isWithinBusinessHours(config.businessHoursStart, config.businessHoursEnd)
          ) {
            const outsideMsg =
              config.outsideHoursMessage ??
              "مرحباً! نحن حالياً خارج ساعات العمل. يرجى التواصل معنا خلال ساعات العمل.";
            await sendFbMessage(settings.pageAccessToken, attSenderId, outsideMsg, settings.pageId ?? undefined);
            continue;
          }

          const att = imageAtt ?? audioAtt ?? videoAtt!;
          const attType: "image" | "audio" | "video" = imageAtt ? "image" : audioAtt ? "audio" : "video";
          const attUrl = att.payload.url;

          const attLabel = attType === "image" ? "[صورة]" : attType === "audio" ? "[رسالة صوتية]" : "[فيديو]";

          // Log incoming attachment
          await db.insert(conversationsTable).values({
            fbUserId: attSenderId,
            fbUserName: attUserName,
            fbProfileUrl: attProfileUrl,
            message: attLabel,
            sender: "user",
            timestamp: new Date(),
          });

          broadcastNotification({
            type: "new_message",
            title: `${attType === "image" ? "صورة" : attType === "audio" ? "رسالة صوتية" : "فيديو"} من ${attUserName}`,
            body: attLabel,
            route: "/conversations",
          });

          if (!attUrl) {
            const errMsg = "عذراً، لم أتمكن من معالجة المرفق. يرجى المحاولة مجدداً.";
            await sendFbMessage(settings.pageAccessToken, attSenderId, errMsg, settings.pageId ?? undefined);
            await db.insert(conversationsTable).values({
              fbUserId: attSenderId, fbUserName: attUserName, fbProfileUrl: attProfileUrl,
              message: errMsg, sender: "bot", timestamp: new Date(),
            });
            continue;
          }

          // ── Rate limit check ──
          if (!checkAttachmentRateLimit(attSenderId)) {
            const rateLimitMsg =
              "📸 تم إرسال عدد كبير من الملفات. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.";
            await sendFbMessage(settings.pageAccessToken, attSenderId, rateLimitMsg, settings.pageId ?? undefined);
            await db.insert(conversationsTable).values({
              fbUserId: attSenderId, fbUserName: attUserName, fbProfileUrl: attProfileUrl,
              message: rateLimitMsg, sender: "bot", timestamp: new Date(),
            });
            void logPlatformEvent("attachment_rate_limited", attSenderId, `type=${attType}`);
            continue;
          }

          // ── Transcribe audio / describe image → feed into normal AI flow ──
          // Instead of doing direct product lookup, we convert the attachment to
          // plain text and let the full AI pipeline handle it naturally (greetings,
          // FAQ, product search, appointments, etc.)
          const transcription = await transcribeOrDescribeAttachment(
            attUrl,
            attType,
            settings.pageAccessToken
          );

          if (!transcription) {
            // Transcription failed — send a graceful error and stop
            const errMsg =
              attType === "audio"
                ? "عذراً، لم أتمكن من فهم الرسالة الصوتية. يرجى كتابة استفسارك."
                : "عذراً، لم أتمكن من تحليل الملف. يرجى كتابة استفسارك.";
            await sendFbMessage(settings.pageAccessToken, attSenderId, errMsg, settings.pageId ?? undefined);
            await db.insert(conversationsTable).values({
              fbUserId: attSenderId, fbUserName: attUserName, fbProfileUrl: attProfileUrl,
              message: errMsg, sender: "bot", sourceType: "multimodal_error", timestamp: new Date(),
            });
            void logPlatformEvent("multimodal_transcription_failed", attSenderId, `type=${attType}`);
            continue;
          }

          // For images/videos: prefix with a label so the AI understands the context
          const effectiveText =
            attType === "image" || attType === "video"
              ? `${attLabel}: ${transcription}`
              : transcription;

          console.log(`[multimodal] ${attType} → normal flow: "${effectiveText.substring(0, 80)}"`);
          void logPlatformEvent(
            "multimodal_transcribed",
            attSenderId,
            `type=${attType} text="${effectiveText.substring(0, 80)}"`
          );

          // Inject transcription as message text and fall through to Phase 8+ AI pipeline
          (event.message as any).text = effectiveText;
          fromAttachment = true;
          // intentionally NO continue — falls through to normal text processing below
        }
      }
      // ─────────────────────────────────────────────────────────────────────────

      if (!event.message?.text || !event.sender?.id) continue;
      const senderId = event.sender.id;
      const rawMessageText = event.message.text;

      // ── Phase 7B: detect attachments alongside text (text + image/audio) ───
      const _imageAttachment = (event.message?.attachments ?? []).find(
        (a) => a.type === "image"
      );
      const _audioAttachment = (event.message?.attachments ?? []).find(
        (a) => a.type === "audio"
      );

      const { name: userName, profileUrl } = await getFbUserName(
        settings.pageAccessToken,
        senderId
      );

      // ── TASK 2: Global Kill Switch ────────────────────────────────────────
      if (!config.botEnabled) {
        const disabledMsg = config.botDisabledMessage ?? "عذراً، المساعد الذكي غير متاح حالياً. يرجى التواصل معنا لاحقاً.";
        await sendFbMessage(settings.pageAccessToken, senderId, disabledMsg, settings.pageId ?? undefined);
        await db.insert(conversationsTable).values({
          fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
          message: rawMessageText, sender: "user", timestamp: new Date(),
        });
        await db.insert(conversationsTable).values({
          fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
          message: disabledMsg, sender: "bot", timestamp: new Date(),
        });
        void logPlatformEvent("kill_switch_blocked", senderId, rawMessageText.substring(0, 120));
        continue;
      }

      const paused = await isUserPaused(senderId);

      // Skip notification if it was already sent from Phase 7B (attachment transcription)
      if (!fromAttachment) {
        broadcastNotification({
          type: "new_message",
          title: `رسالة جديدة من ${userName}`,
          body: rawMessageText.length > 80 ? rawMessageText.substring(0, 80) + "…" : rawMessageText,
          route: "/conversations",
        });
      }

      // Always update known lead on any message (unconditional)
      const [existingLeadForTracking] = await db
        .select()
        .from(leadsTable)
        .where(eq(leadsTable.fbUserId, senderId))
        .limit(1);

      if (existingLeadForTracking) {
        await db.update(leadsTable).set({
          lastInteractionAt: new Date().toISOString(),
          totalMessages: (existingLeadForTracking.totalMessages ?? 0) + 1,
          updatedAt: new Date(),
        }).where(eq(leadsTable.fbUserId, senderId));
      }

      // Lead capture: detect phone/email and upsert (only when enabled)
      if (config.leadCaptureEnabled) {
        const detectedPhone = extractPhone(rawMessageText);
        const detectedEmail = extractEmail(rawMessageText);

        if (detectedPhone || detectedEmail) {
          if (existingLeadForTracking) {
            await db.update(leadsTable).set({
              phone: detectedPhone ?? existingLeadForTracking.phone,
              email: detectedEmail ?? existingLeadForTracking.email,
              updatedAt: new Date(),
            }).where(eq(leadsTable.fbUserId, senderId));
          } else {
            await db.insert(leadsTable).values({
              fbUserId: senderId,
              fbUserName: userName,
              fbProfileUrl: profileUrl,
              phone: detectedPhone ?? null,
              email: detectedEmail ?? null,
              label: "new",
              source: "messenger",
              lastInteractionAt: new Date().toISOString(),
              totalMessages: 1,
            }).onConflictDoNothing();
          }
        }
      }

      if (config.handoffKeyword && rawMessageText.trim().toLowerCase() === config.handoffKeyword.toLowerCase()) {
        await db
          .update(conversationsTable)
          .set({ isPaused: 1 })
          .where(eq(conversationsTable.fbUserId, senderId));

        const handoffMsg = config.handoffMessage ?? "تم تحويلك إلى فريق الدعم البشري. سيتواصل معك أحد ممثلينا قريباً.";
        await sendFbMessage(settings.pageAccessToken, senderId, handoffMsg, settings.pageId ?? undefined);
        await db.insert(conversationsTable).values({
          fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
          message: handoffMsg, sender: "bot", isPaused: 1, timestamp: new Date(),
        });
        continue;
      }

      if (paused) continue;

      const msgLower = rawMessageText.trim().toLowerCase();
      if (msgLower === "تأكيد" || msgLower === "confirm" || msgLower === "نعم" || msgLower === "اكيد") {
        const [pendingSession] = await db.select().from(orderSessionsTable)
          .where(and(eq(orderSessionsTable.fbUserId, senderId), eq(orderSessionsTable.step, "awaiting_confirm")))
          .limit(1);
        if (pendingSession) {
          await handleProductPayload("CONFIRM_ORDER", senderId, userName, settings.pageAccessToken, settings.pageId ?? undefined);
          continue;
        }
      }
      if (msgLower === "إلغاء" || msgLower === "الغاء" || msgLower === "cancel" || msgLower === "لا") {
        const [pendingSession] = await db.select().from(orderSessionsTable)
          .where(and(eq(orderSessionsTable.fbUserId, senderId), eq(orderSessionsTable.step, "awaiting_confirm")))
          .limit(1);
        if (pendingSession) {
          await handleProductPayload("CANCEL_ORDER", senderId, userName, settings.pageAccessToken, settings.pageId ?? undefined);
          continue;
        }
      }

      // ── Pre-order session interception ───────────────────────────────────────
      {
        const [preOrderSession] = await db.select().from(preOrderSessionsTable)
          .where(eq(preOrderSessionsTable.fbUserId, senderId)).limit(1);
        if (preOrderSession) {
          await db.insert(conversationsTable).values({
            fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
            message: rawMessageText, sender: "user", timestamp: new Date(),
          });
          if (preOrderSession.step === "awaiting_name") {
            const trimmedName = rawMessageText.trim();
            if (trimmedName.length < 2) {
              const nameErr = "يرجى إرسال اسمك الكامل (على الأقل حرفان).";
              await sendFbMessage(settings.pageAccessToken, senderId, nameErr, settings.pageId ?? undefined);
              await db.insert(conversationsTable).values({
                fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
                message: nameErr, sender: "bot", timestamp: new Date(),
              });
              continue;
            }
            await db.update(preOrderSessionsTable)
              .set({ customerName: trimmedName, step: "awaiting_phone" })
              .where(eq(preOrderSessionsTable.fbUserId, senderId));
            const askPhone = `شكراً ${trimmedName}! 📱 الآن أرسل لي رقم هاتفك للتواصل معك عند توفر المنتج.`;
            await sendFbMessage(settings.pageAccessToken, senderId, askPhone, settings.pageId ?? undefined);
            await db.insert(conversationsTable).values({
              fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
              message: askPhone, sender: "bot", timestamp: new Date(),
            });
            continue;
          }
          if (preOrderSession.step === "awaiting_phone") {
            const rawPhone = rawMessageText.trim();
            if (!isValidPhoneNumber(rawPhone)) {
              const phoneErr = "⚠️ رقم الهاتف غير صحيح.\nيرجى إرسال رقم مكوّن من:\n• 10 أرقام (مثال: 0551234567)\n• 12 رقمًا مع رمز الدولة (مثال: 213551234567)";
              await sendFbMessage(settings.pageAccessToken, senderId, phoneErr, settings.pageId ?? undefined);
              await db.insert(conversationsTable).values({
                fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
                message: phoneErr, sender: "bot", timestamp: new Date(),
              });
              continue;
            }
            const phone = extractPhone(rawMessageText) ?? rawPhone;
            // Save pre-order and delete session
            await db.insert(preOrdersTable).values({
              fbUserId: senderId,
              fbUserName: preOrderSession.customerName ?? userName,
              productId: preOrderSession.productId,
              productName: preOrderSession.productName,
              phone,
              status: "pending",
              createdAt: new Date(),
            }).onConflictDoNothing();
            await db.delete(preOrderSessionsTable).where(eq(preOrderSessionsTable.fbUserId, senderId));
            const confirmMsg =
              `✅ تم تسجيل طلبك المسبق لـ "${preOrderSession.productName}" بنجاح!\n` +
              `سيتم التواصل معك على الرقم ${phone} فور توفر المنتج.\nشكراً لك! 🙏`;
            await sendFbMessage(settings.pageAccessToken, senderId, confirmMsg, settings.pageId ?? undefined);
            await db.insert(conversationsTable).values({
              fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
              message: confirmMsg, sender: "bot", timestamp: new Date(),
            });
            void logPlatformEvent("preorder_created", senderId, `product=${preOrderSession.productName} phone=${phone}`);
            continue;
          }
        }
      }

      // ── Delivery selection interception (choosing_delivery step) ──────────────
      {
        const [deliverySession] = await db.select().from(orderSessionsTable)
          .where(and(eq(orderSessionsTable.fbUserId, senderId), eq(orderSessionsTable.step, "choosing_delivery")))
          .limit(1);
        if (deliverySession) {
          await db.insert(conversationsTable).values({
            fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
            message: rawMessageText, sender: "user", timestamp: new Date(),
          });
          const msgLowerD = rawMessageText.trim().toLowerCase();
          const isHomeIntent   = /منزل|home|بيت|دار|للمنزل|منزلي|بيتي/.test(msgLowerD);
          const isOfficeIntent = /مكتب|office|بريد|poste|للمكتب|bureau/.test(msgLowerD);

          if (isHomeIntent || isOfficeIntent) {
            await handleProductPayload(
              isHomeIntent ? "DELIVERY_HOME" : "DELIVERY_OFFICE",
              senderId, userName, settings.pageAccessToken, settings.pageId ?? undefined
            );
          } else {
            // Prompt again
            const repeatMsg = "يرجى اختيار نوع التوصيل:";
            if (deliverySession.customerWilaya) {
              await sendDeliveryOptions(settings.pageAccessToken, senderId, deliverySession.customerWilaya, settings.pageId ?? undefined);
            } else {
              await sendFbMessage(settings.pageAccessToken, senderId, repeatMsg, settings.pageId ?? undefined);
            }
          }
          continue;
        }
      }

      // ── Delivery change intent (awaiting_confirm step) ─────────────────────
      {
        const [confirmSession] = await db.select().from(orderSessionsTable)
          .where(and(eq(orderSessionsTable.fbUserId, senderId), eq(orderSessionsTable.step, "awaiting_confirm")))
          .limit(1);
        if (confirmSession && confirmSession.deliveryType && config.deliveryEnabled) {
          const msgLowerC = rawMessageText.trim().toLowerCase();
          const DELIVERY_CHANGE_PATTERNS = [
            /غي(ر|ّر)\s*(ن|نوع)?\s*التوصيل/,
            /\b(change|switch|changer)\b.*\b(delivery|livraison|توصيل)\b/i,
            /\bتوصيل\b.*\b(منزل|مكتب|home|office|بريد)\b/i,
            /\b(منزل|مكتب|home|office|بريد|بيت)\b/i,
            /سعره غالي/,
            /\b(بدل|بدّل|غيّر|غير)\b/,
          ];
          const wantsToChangeDelivery = DELIVERY_CHANGE_PATTERNS.some((p) => p.test(msgLowerC));
          if (wantsToChangeDelivery && confirmSession.customerWilaya) {
            await db.insert(conversationsTable).values({
              fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
              message: rawMessageText, sender: "user", timestamp: new Date(),
            });
            // Directly select new type if intent is clear
            const isHomeMsg   = /منزل|home|بيت|دار/.test(msgLowerC);
            const isOfficeMsg = /مكتب|office|بريد|poste|bureau/.test(msgLowerC);
            if (isHomeMsg || isOfficeMsg) {
              await handleProductPayload(
                isHomeMsg ? "DELIVERY_HOME" : "DELIVERY_OFFICE",
                senderId, userName, settings.pageAccessToken, settings.pageId ?? undefined
              );
            } else {
              // Show options again
              const changeMsg = "بالطبع! اختر نوع التوصيل الجديد:";
              await sendFbMessage(settings.pageAccessToken, senderId, changeMsg, settings.pageId ?? undefined);
              await sendDeliveryOptions(settings.pageAccessToken, senderId, confirmSession.customerWilaya, settings.pageId ?? undefined);
              await db.update(orderSessionsTable).set({ step: "choosing_delivery", updatedAt: new Date() })
                .where(eq(orderSessionsTable.fbUserId, senderId));
              await db.insert(conversationsTable).values({
                fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
                message: changeMsg, sender: "bot", timestamp: new Date(),
              });
            }
            continue;
          }
        }
      }

      if (config.workingHoursEnabled !== 0 && !isWithinBusinessHours(config.businessHoursStart, config.businessHoursEnd)) {
        const outsideMsg =
          config.outsideHoursMessage ??
          "مرحباً! نحن حالياً خارج ساعات العمل. يرجى التواصل معنا خلال ساعات العمل.";
        await sendFbMessage(settings.pageAccessToken, senderId, outsideMsg, settings.pageId ?? undefined);
        await db.insert(conversationsTable).values({
          fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
          message: outsideMsg, sender: "bot", timestamp: new Date(),
        });
        continue;
      }

      // ── CATALOG BROWSER — text intent detection (pre-AI) ──────────────────
      {
        const CATALOG_INTENT_PATTERNS = [
          /\b(catalog|catalogue|كتالوج|كتالوغ)\b/i,
          /\b(products|منتجات|المنتجات|عروض)\b/i,
          /^(أرني|ارني|show me|voir)\s*(المنتجات|كل شيء|everything|tout)/i,
          /\b(phones?|هواتف|telephone|تليفون)\b/i,
          /\b(courses?|كورسات?|دورات?|تدريب)\b/i,
          /\b(fashion|أزياء|ملابس|موضة)\b/i,
          /\b(electronics|إلكترونيات|الكترونيات)\b/i,
          /\b(تصفح|browse|parcourir)\b/i,
          /^(أرني|ارني|show me|voir les?)\s+\w+/i,
        ];

        const isCatalogIntent = CATALOG_INTENT_PATTERNS.some((p) => p.test(rawMessageText));

        if (isCatalogIntent) {
          const [activeOrderSession] = await db
            .select().from(orderSessionsTable)
            .where(eq(orderSessionsTable.fbUserId, senderId))
            .limit(1);

          if (!activeOrderSession) {
            await db.insert(conversationsTable).values({
              fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
              message: rawMessageText, sender: "user", timestamp: new Date(),
            });
            await sendCatalogCategoryMenu(
              settings.pageAccessToken, senderId, settings.pageId ?? undefined
            );
            void logPlatformEvent("catalog_browse_started", senderId, rawMessageText.substring(0, 80));
            continue;
          }
        }
      }

      const messageText = await bufferMessage(senderId, rawMessageText);

      const sentiment = analyzeSentiment(messageText);

      // ── PHASE 4 TASK 2: Detect sales trigger early (before user insert) ───────
      const salesTrigger: SalesTriggerType = detectSalesTrigger(messageText);
      if (salesTrigger) {
        console.log(`[sales-trigger] Detected "${salesTrigger}" for ${senderId}`);
      }

      const [userMsgRow] = await db.insert(conversationsTable).values({
        fbUserId: senderId,
        fbUserName: userName,
        fbProfileUrl: profileUrl,
        message: messageText,
        sender: "user",
        isPaused: paused ? 1 : 0,
        sentiment,
        salesTriggerType: salesTrigger,
        timestamp: new Date(),
      }).returning({ id: conversationsTable.id });
      const lastUserMsgId = userMsgRow?.id ?? null;

      // ── TASK 1: Blocked Keywords enforcement ──────────────────────────────
      if (config.blockedKeywords) {
        const keywords = config.blockedKeywords
          .split(",")
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean);
        const msgLowerForBlock = messageText.toLowerCase();
        const matchedKeyword = keywords.find((kw) => msgLowerForBlock.includes(kw));
        if (matchedKeyword) {
          const blockReply = config.offTopicResponse ?? "عذراً، لا يمكنني الإجابة على هذا الموضوع.";
          await sendFbMessage(settings.pageAccessToken, senderId, blockReply, settings.pageId ?? undefined);
          await db.insert(conversationsTable).values({
            fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
            message: blockReply, sender: "bot", timestamp: new Date(),
          });
          void logPlatformEvent("blocked_keyword", senderId, `keyword="${matchedKeyword}" msg="${messageText.substring(0, 80)}"`);
          console.log(`[blocked-keyword] Blocked message from ${senderId}: matched "${matchedKeyword}"`);
          continue;
        }
      }

      // ── PHASE 2 TASK 1: Conversation Rescue ──────────────────────────────────
      {
        const msgLowerForRescue = messageText.toLowerCase();
        const hasFrustrationKeyword = RESCUE_KEYWORDS.some((kw) =>
          msgLowerForRescue.includes(kw.toLowerCase())
        );

        let recentNegativeCount = 0;
        if (!hasFrustrationKeyword) {
          const recentMsgs = await db
            .select({ sentiment: conversationsTable.sentiment })
            .from(conversationsTable)
            .where(and(eq(conversationsTable.fbUserId, senderId), eq(conversationsTable.sender, "bot")))
            .orderBy(desc(conversationsTable.timestamp))
            .limit(5);
          recentNegativeCount = recentMsgs.filter((m) => m.sentiment === "negative").length;
        }

        if (hasFrustrationKeyword || recentNegativeCount >= 2) {
          const alreadyPaused = await isUserPaused(senderId);
          if (!alreadyPaused) {
            await db.update(conversationsTable)
              .set({ isPaused: 1 })
              .where(eq(conversationsTable.fbUserId, senderId));
            const handoffMsg = config.handoffMessage ?? "تم تحويلك إلى فريق الدعم البشري. سيتواصل معك أحد ممثلينا قريباً.";
            await sendFbMessage(settings.pageAccessToken, senderId, handoffMsg, settings.pageId ?? undefined);
            await db.insert(conversationsTable).values({
              fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
              message: handoffMsg, sender: "bot", isPaused: 1, rescueTriggered: 1, timestamp: new Date(),
            });
            const rescueReason = hasFrustrationKeyword
              ? `frustration keyword detected`
              : `${recentNegativeCount} negative sentiments in last 5 replies`;
            void logPlatformEvent("rescue_triggered", senderId, rescueReason);
            void logPlatformEvent("lost_risk_prevented", senderId, `reason=rescue ${rescueReason}`);
            console.log(`[rescue] Triggered for ${senderId}: ${rescueReason}`);
            continue;
          }
        }
      }

      // ── PHASE 5 FEATURE 3: Smart Escalation for hesitation trigger ───────────
      if (salesTrigger === "hesitation" && (config as any).smartEscalationEnabled && !paused) {
        const alreadyPaused = await isUserPaused(senderId);
        if (!alreadyPaused) {
          await db.update(conversationsTable)
            .set({ isPaused: 1 })
            .where(eq(conversationsTable.fbUserId, senderId));
          const handoffMsg = config.handoffMessage ?? "تم تحويلك إلى فريق الدعم البشري. سيتواصل معك أحد ممثلينا قريباً.";
          await sendFbMessage(settings.pageAccessToken, senderId, handoffMsg, settings.pageId ?? undefined);
          await db.insert(conversationsTable).values({
            fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
            message: handoffMsg, sender: "bot", isPaused: 1, timestamp: new Date(),
          });
          void logPlatformEvent("lost_risk_prevented", senderId, "reason=hesitation_smart_escalation");
          console.log(`[smart-escalation] Hesitation detected for ${senderId} — transferred to human`);
          continue;
        }
      }

      const history = await db
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.fbUserId, senderId))
        .orderBy(desc(conversationsTable.timestamp))
        .limit(10);

      const isFirstMessage = history.filter((h) => h.sender === "bot").length === 0;

      const messages = history
        .reverse()
        .map((m) => ({ role: m.sender === "user" ? "user" as const : "assistant" as const, content: m.message }));

      const { isNew: isNewSession } = await getOrCreateSession(senderId);

      // ── PHASE 3 TASK 1: Safe Mode — jailbreak detection (pre-AI check) ──────
      if (config.safeModeEnabled) {
        if (detectJailbreak(messageText)) {
          const safeReply = "عذراً، لا يمكنني الاستجابة لهذا النوع من الطلبات. يمكنني مساعدتك في أسئلة تتعلق بمنتجاتنا وخدماتنا فقط.";
          await sendFbMessage(settings.pageAccessToken, senderId, safeReply, settings.pageId ?? undefined);
          await db.insert(conversationsTable).values({
            fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
            message: safeReply, sender: "bot", safeModeBlocked: 1, sourceType: "safe_mode_blocked", timestamp: new Date(),
          });
          void logPlatformEvent("safe_mode_blocked", senderId, messageText.substring(0, 120));
          console.log(`[safe-mode] Jailbreak blocked for ${senderId}`);
          continue;
        }
      }

      const allProducts = await db.select().from(productsTable);

      // ── PHASE 5 FEATURE 2: Price Lock ────────────────────────────────────────
      if ((config as any).priceLockEnabled) {
        const priceTriggers = ["سعر", "بشحال", "بكم", "ثمن", "كم سعر", "price", "prix", "cost", "tarif", "combien"];
        const msgLowerForPrice = messageText.toLowerCase();
        if (priceTriggers.some((kw) => msgLowerForPrice.includes(kw))) {
          const matchedProduct = allProducts.find((p) => msgLowerForPrice.includes(p.name.toLowerCase()));
          let priceReply: string;
          if (matchedProduct) {
            const price = matchedProduct.discountPrice ?? matchedProduct.originalPrice;
            priceReply = price
              ? `💰 سعر ${matchedProduct.name}: **${price} ${config.currency ?? "DZD"}**\n\nهل تريد إتمام الطلب الآن؟ 🛒`
              : `✅ سعر ${matchedProduct.name} متاح عند التواصل. هل تريد إتمام طلب؟`;
          } else {
            priceReply = "يسعدنا إعلامك بالسعر! هل يمكنك تحديد المنتج الذي تسأل عنه؟ 😊";
          }
          await sendFbMessage(settings.pageAccessToken, senderId, priceReply, settings.pageId ?? undefined);
          await db.insert(conversationsTable).values({
            fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
            message: priceReply, sender: "bot", sourceType: "price_lock",
            salesTriggerType: salesTrigger, timestamp: new Date(),
          });
          void logPlatformEvent("price_lock_triggered", senderId, `product=${matchedProduct?.name ?? "unknown"}`);
          console.log(`[price-lock] Intercepted price query for ${senderId}`);
          continue;
        }
      }

      // ── PHASE 7 Task 1: Load active product context for this user ──────────
      // Fix 1 (TTL): context older than 30 minutes is silently ignored.
      // Fix 4 (inactive): product is only accepted if status = 'available'.
      let activeProduct: typeof productsTable.$inferSelect | undefined;
      {
        const TTL_MS = 30 * 60 * 1000; // 30 minutes
        const [ctx] = await db
          .select()
          .from(userProductContextTable)
          .where(eq(userProductContextTable.fbUserId, senderId))
          .limit(1);

        if (ctx) {
          const ageMs = Date.now() - new Date(ctx.updatedAt).getTime();
          if (ageMs <= TTL_MS) {
            const [ap] = await db
              .select()
              .from(productsTable)
              .where(eq(productsTable.id, ctx.productId))
              .limit(1);
            // Only use the product if it is currently available
            if (ap && ap.status === "available") {
              activeProduct = ap;
            }
          }
          // else: context is stale (> 30 min) or product inactive — treat as no context
        }
      }

      // ── PHASE 7B: Text + Image enrichment ─────────────────────────────────
      // If the user sent text AND an image together, analyze the image with
      // Gemini and try to set / refine the active product context from it.
      // Only runs when no DB context was already loaded (avoids redundant calls).
      if (_imageAttachment?.payload.url && !activeProduct) {
        try {
          const imgAnalysis = await analyzeAttachmentWithGemini(
            _imageAttachment.payload.url,
            "image",
            rawMessageText,
            settings.pageAccessToken
          );
          if (imgAnalysis && imgAnalysis.confidence >= 0.5) {
            const { matches, tier } = matchProductsFromAnalysis(imgAnalysis, allProducts);
            if ((tier === "strong" || tier === "multiple") && matches[0]) {
              activeProduct = matches[0];
              await db
                .insert(userProductContextTable)
                .values({ fbUserId: senderId, productId: matches[0].id, updatedAt: new Date() })
                .onConflictDoUpdate({
                  target: userProductContextTable.fbUserId,
                  set: { productId: matches[0].id, updatedAt: new Date() },
                });
              void logPlatformEvent(
                "multimodal_text_image_enrich",
                senderId,
                `product=${matches[0].name} confidence=${imgAnalysis.confidence}`
              );
            }
          }
        } catch (enrichErr) {
          console.error("[multimodal] Text+image enrichment failed:", (enrichErr as Error).message);
        }
      }

      const systemPrompt = await buildSystemPrompt(config, allProducts, { fbUserId: senderId, salesTrigger, activeProduct });

      let replyText: string;
      let aiSentiment: string | null = null;
      let aiConfidenceScore: number | null = null;
      let replyProviderName = "";
      let replyModelName = "";
      try {
        const aiResult = await callAIWithMetadata(messages, systemPrompt);
        replyText = aiResult.text;
        replyProviderName = aiResult.providerName;
        replyModelName = aiResult.modelName;

        // Extract [SENTIMENT:xxx] tag from AI response
        const sentimentMatch = replyText.match(/\[SENTIMENT:(positive|negative|neutral)\]/i);
        aiSentiment = sentimentMatch ? sentimentMatch[1]!.toLowerCase() : null;
        replyText = replyText.replace(/\[SENTIMENT:(positive|negative|neutral)\]/gi, "").trim();

        // Extract [CONFIDENCE:x.x] tag from AI response
        const confidenceMatch = replyText.match(/\[CONFIDENCE:(0?\.\d+|1(?:\.0)?|0(?:\.0)?)\]/i);
        if (confidenceMatch) {
          aiConfidenceScore = parseFloat(confidenceMatch[1]!);
          replyText = replyText.replace(/\[CONFIDENCE:[^\]]+\]/gi, "").trim();
        }
      } catch (aiErr: any) {
        console.error("❌ Webhook AI error:", aiErr.message);
        console.error("❌ Error details:", aiErr.stack?.split("\n").slice(0, 3).join(" | "));
        const errMsgLower = (aiErr.message ?? "").toLowerCase();
        const is429 = errMsgLower.includes("429")
          || errMsgLower.includes("resource_exhausted")
          || errMsgLower.includes("resource has been exhausted")
          || errMsgLower.includes("quota exceeded")
          || errMsgLower.includes("rate limit")
          || errMsgLower.includes("too many requests");
        const is403 = errMsgLower.includes("403")
          || errMsgLower.includes("permission denied")
          || errMsgLower.includes("suspended")
          || errMsgLower.includes("api key not valid")
          || errMsgLower.includes("invalid api key");
        replyText = is429
          ? "عذراً، عدد الطلبات كبير حالياً. يرجى المحاولة بعد دقيقة. ⏳"
          : is403
          ? "عذراً، لا أستطيع الرد حالياً. تواصل مع مشرف الصفحة. 🙏"
          : "عذراً، أواجه مشكلة تقنية مؤقتة. يرجى المحاولة بعد قليل. 🙏";
        void logPlatformEvent("provider_failure", senderId, aiErr.message?.substring(0, 120));
      }

      // ── PHASE 2 TASK 2: Confidence Score action ──────────────────────────────
      if (aiConfidenceScore !== null) {
        const threshold = parseFloat(config.confidenceThreshold ?? "0.5");
        const action = config.confidenceBelowAction ?? "none";
        if (aiConfidenceScore < threshold && action !== "none") {
          void logPlatformEvent("low_confidence", senderId, `score=${aiConfidenceScore} threshold=${threshold}`);
          if (action === "handoff") {
            const alreadyPaused = await isUserPaused(senderId);
            if (!alreadyPaused) {
              await db.update(conversationsTable)
                .set({ isPaused: 1 })
                .where(eq(conversationsTable.fbUserId, senderId));
              const handoffMsg = config.handoffMessage ?? "تم تحويلك إلى فريق الدعم البشري. سيتواصل معك أحد ممثلينا قريباً.";
              await sendFbMessage(settings.pageAccessToken, senderId, handoffMsg, settings.pageId ?? undefined);
              await db.insert(conversationsTable).values({
                fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
                message: handoffMsg, sender: "bot", isPaused: 1, confidenceScore: aiConfidenceScore,
                providerName: replyProviderName || null, modelName: replyModelName || null,
                sourceType: "free_generation", salesTriggerType: salesTrigger, timestamp: new Date(),
              });
              void logPlatformEvent("handoff", senderId, `reason=low_confidence score=${aiConfidenceScore}`);
              void logPlatformEvent("lost_risk_prevented", senderId, `reason=low_confidence score=${aiConfidenceScore}`);
              console.log(`[confidence] Low confidence (${aiConfidenceScore}) → handoff for ${senderId}`);
              continue;
            }
          } else if (action === "note") {
            replyText = replyText + "\n\n⚠️ ملاحظة: إجابتي ليست مؤكدة تماماً، يُنصح بالتواصل مع فريقنا للتأكد.";
          }
        }
      }

      // ── PHASE 3 TASK 2: Detect sourceType from AI reply ──────────────────────
      let replySourceType = "free_generation";
      if (/\"action\"\s*:\s*\"check_order_status\"/.test(replyText)) replySourceType = "order_status";
      else if (/\"action\"\s*:\s*\"send_image\"/.test(replyText)) replySourceType = "image_action";
      else if (/\"action\"\s*:\s*\"create_appointment\"/.test(replyText)) replySourceType = "appointment";
      else if (/\"action\"\s*:\s*\"start_order\"/.test(replyText) || /\"action\"\s*:\s*\"confirm_order\"/.test(replyText)) replySourceType = "order_action";

      // ── PHASE 3 TASK 1: Safe Mode — strict post-check (reply leak detection) ─
      if (config.safeModeEnabled && (config.safeModeLevel === "strict") && detectReplyLeak(replyText)) {
        replyText = "يمكنني مساعدتك في الأسئلة المتعلقة بمنتجاتنا وخدماتنا. هل لديك سؤال محدد؟";
        void logPlatformEvent("safe_mode_blocked", senderId, "reply_leak_detected_strict_mode");
        console.log(`[safe-mode] Reply leak replaced for ${senderId} (strict mode)`);
      }

      // ── TASK 3: Off-topic counter ────────────────────────────────────────
      if (config.strictTopicMode && config.offTopicResponse) {
        const offTopicRef = config.offTopicResponse.trim();
        const isOffTopicReply = replyText.trim() === offTopicRef || replyText.trim().startsWith(offTopicRef);
        if (isOffTopicReply) {
          const prevCount = offTopicCounters.get(senderId) ?? 0;
          const newCount = prevCount + 1;
          offTopicCounters.set(senderId, newCount);
          const maxAllowed = config.maxOffTopicMessages ?? 3;
          if (newCount >= maxAllowed) {
            offTopicCounters.delete(senderId);
            await db.update(conversationsTable)
              .set({ isPaused: 1 })
              .where(eq(conversationsTable.fbUserId, senderId));
            const handoffMsg = config.handoffMessage ?? "تم تحويلك إلى فريق الدعم البشري. سيتواصل معك أحد ممثلينا قريباً.";
            await sendFbMessage(settings.pageAccessToken, senderId, handoffMsg, settings.pageId ?? undefined);
            await db.insert(conversationsTable).values({
              fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
              message: handoffMsg, sender: "bot", isPaused: 1, timestamp: new Date(),
            });
            void logPlatformEvent("off_topic_escalation", senderId, `count=${newCount} max=${maxAllowed}`);
            void logPlatformEvent("handoff", senderId, `reason=off_topic_escalation`);
            console.log(`[off-topic] User ${senderId} exceeded maxOffTopicMessages (${maxAllowed}), triggering handoff`);
            continue;
          }
          console.log(`[off-topic] User ${senderId} off-topic count: ${newCount}/${maxAllowed}`);
        } else {
          if (offTopicCounters.has(senderId)) {
            offTopicCounters.delete(senderId);
          }
        }
      }

      // ── save_lead action from AI response ──────────────────────
      const saveLeadAction = parseSaveLeadAction(replyText);
      if (saveLeadAction) {
        const [existingLead] = await db.select().from(leadsTable).where(eq(leadsTable.fbUserId, senderId)).limit(1);
        if (existingLead) {
          await db.update(leadsTable).set({
            phone: saveLeadAction.phone ?? existingLead.phone,
            email: saveLeadAction.email ?? existingLead.email,
            notes: saveLeadAction.notes ?? existingLead.notes,
            lastInteractionAt: new Date().toISOString(),
            updatedAt: new Date(),
          }).where(eq(leadsTable.fbUserId, senderId));
        } else {
          await db.insert(leadsTable).values({
            fbUserId: senderId,
            fbUserName: userName,
            fbProfileUrl: profileUrl,
            phone: saveLeadAction.phone ?? null,
            email: saveLeadAction.email ?? null,
            notes: saveLeadAction.notes ?? null,
            label: "new",
            source: "messenger",
            lastInteractionAt: new Date().toISOString(),
            totalMessages: 1,
          }).onConflictDoNothing();
        }
        // Strip the JSON from the reply before sending
        replyText = replyText.replace(/\{[\s\S]*?"action"\s*:\s*"save_lead"[\s\S]*?\}/, "").trim();
      }

      if (parseCheckOrderStatusAction(replyText)) {
        const STATUS_EMOJI: Record<string, string> = {
          pending: "⏳",
          confirmed: "✅",
          delivered: "📦",
          cancelled: "❌",
        };
        const STATUS_LABEL: Record<string, string> = {
          pending: "قيد الانتظار",
          confirmed: "مؤكد",
          delivered: "تم التوصيل",
          cancelled: "ملغى",
        };

        const latestOrders = await db
          .select()
          .from(ordersTable)
          .where(eq(ordersTable.fbUserId, senderId))
          .orderBy(sql`${ordersTable.createdAt} DESC`)
          .limit(1);

        let statusMsg: string;
        if (latestOrders.length > 0) {
          const order = latestOrders[0]!;
          const emoji = STATUS_EMOJI[order.status] ?? "📋";
          const label = STATUS_LABEL[order.status] ?? order.status;
          const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleDateString("ar-DZ") : "—";
          statusMsg = `📋 حالة طلبك:\n\n🛍️ المنتج: ${order.productName}\n📦 الكمية: ${order.quantity}\n💰 السعر: ${order.totalPrice ?? "—"} دج\n${emoji} الحالة: ${label}\n📅 التاريخ: ${dateStr}`;
        } else {
          statusMsg = "عذراً، لم أجد أي طلب مسجل باسمك. إذا كنت قد طلبت مسبقاً، يرجى التواصل مع فريق الدعم. 🙏";
        }

        await sendFbMessage(settings.pageAccessToken, senderId, statusMsg, settings.pageId ?? undefined);
        await db.insert(conversationsTable).values({
          fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
          message: statusMsg, sender: "bot",
          providerName: replyProviderName || null, modelName: replyModelName || null,
          sourceType: "order_status", salesTriggerType: salesTrigger, timestamp: new Date(),
        });
        continue;
      }

      // ── browse_catalog action: skip text, show category menu directly ────────
      const wantsBrowseCatalog = parseBrowseCatalogAction(replyText);
      if (wantsBrowseCatalog) {
        await sendCatalogCategoryMenu(settings.pageAccessToken, senderId, settings.pageId ?? undefined);
        continue;
      }

      const sendImageAction = parseSendImageAction(replyText);
      if (sendImageAction) {
        const searchName = (sendImageAction.product_name ?? "").toLowerCase().trim();
        const imageProduct = searchName
          ? allProducts.find(
              (p) =>
                p.name.toLowerCase().includes(searchName) ||
                searchName.includes(p.name.toLowerCase())
            )
          : null;

        let botMsg = "عذراً، لا تتوفر صورة لهذا المنتج حالياً.";
        if (imageProduct?.images) {
          try {
            const imgIndex = imageProduct.mainImageIndex ?? 0;
            const fullUrl = buildProductImageUrl(imageProduct.id, imgIndex);
            botMsg = `إليك صورة ${imageProduct.name} 📸`;
            await sendFbMessage(settings.pageAccessToken, senderId, botMsg, settings.pageId ?? undefined);
            await sendFbImageMessage(settings.pageAccessToken, senderId, fullUrl, settings.pageId ?? undefined);
          } catch (imgErr: any) {
            console.error("❌ Error sending product image:", imgErr.message);
            botMsg = "عذراً، حدث خطأ أثناء إرسال الصورة. يرجى المحاولة لاحقاً.";
            await sendFbMessage(settings.pageAccessToken, senderId, botMsg, settings.pageId ?? undefined);
          }
        } else {
          await sendFbMessage(settings.pageAccessToken, senderId, botMsg, settings.pageId ?? undefined);
        }

        await db.insert(conversationsTable).values({
          fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
          message: botMsg, sender: "bot",
          providerName: replyProviderName || null, modelName: replyModelName || null,
          sourceType: "image_action", salesTriggerType: salesTrigger, timestamp: new Date(),
        });
        continue;
      }

      const appointmentAction = parseAppointmentAction(replyText);
      if (appointmentAction) {
        const apptDate = appointmentAction.appointment_date;
        const apptTime = appointmentAction.time_slot;

        const d = new Date(apptDate);
        const dayOfWeek = d.getDay();
        const slots = await db
          .select()
          .from(availableSlotsTable)
          .where(and(eq(availableSlotsTable.dayOfWeek, dayOfWeek), eq(availableSlotsTable.timeSlot, apptTime), eq(availableSlotsTable.isActive, 1)));

        if (slots.length > 0) {
          const slot = slots[0]!;
          const [bookingCount] = await db
            .select({ value: count() })
            .from(appointmentsTable)
            .where(and(
              eq(appointmentsTable.appointmentDate, apptDate),
              eq(appointmentsTable.timeSlot, apptTime),
              sql`${appointmentsTable.status} != 'cancelled'`
            ));

          if ((bookingCount?.value ?? 0) < slot.maxBookings) {
            await db.insert(appointmentsTable).values({
              fbUserId: senderId,
              fbUserName: userName,
              fbProfileUrl: profileUrl,
              serviceName: appointmentAction.service_name ?? null,
              appointmentDate: apptDate,
              timeSlot: apptTime,
              status: "pending",
              note: appointmentAction.note ?? null,
              source: "messenger",
            });

            broadcastNotification({
              type: "new_appointment",
              title: "موعد جديد!",
              body: `${userName} حجز موعد ${apptDate} الساعة ${apptTime}`,
              route: "/appointments",
            });

            const confirmMsg = `✅ تم حجز موعدك بنجاح!\n📅 التاريخ: ${apptDate}\n🕐 الوقت: ${apptTime}\n📋 الخدمة: ${appointmentAction.service_name ?? "غير محدد"}\nسيتواصل معك فريقنا لتأكيد الموعد.`;
            await sendFbMessage(settings.pageAccessToken, senderId, confirmMsg, settings.pageId ?? undefined);
            await db.insert(conversationsTable).values({
              fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
              message: confirmMsg, sender: "bot",
              providerName: replyProviderName || null, modelName: replyModelName || null,
              sourceType: "appointment", salesTriggerType: salesTrigger, timestamp: new Date(),
            });
          } else {
            const allDaySlots = await db
              .select()
              .from(availableSlotsTable)
              .where(and(eq(availableSlotsTable.dayOfWeek, dayOfWeek), eq(availableSlotsTable.isActive, 1)));
            const slotsWithCapacity = [];
            for (const s of allDaySlots) {
              const [bc] = await db
                .select({ value: count() })
                .from(appointmentsTable)
                .where(
                  and(
                    eq(appointmentsTable.appointmentDate, apptDate),
                    eq(appointmentsTable.timeSlot, s.timeSlot),
                    sql`${appointmentsTable.status} != 'cancelled'`
                  )
                );
              if ((bc?.value ?? 0) < s.maxBookings) {
                slotsWithCapacity.push(s.timeSlot);
              }
            }
            const alternativeMsg = slotsWithCapacity.length > 0
              ? `عذراً، الموعد في الساعة ${apptTime} محجوز بالكامل. الأوقات المتاحة: ${slotsWithCapacity.join(", ")}`
              : `عذراً، الموعد في الساعة ${apptTime} محجوز بالكامل ولا توجد أوقات متاحة أخرى في هذا اليوم.`;
            await sendFbMessage(settings.pageAccessToken, senderId, alternativeMsg, settings.pageId ?? undefined);
            await db.insert(conversationsTable).values({
              fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
              message: alternativeMsg, sender: "bot",
              providerName: replyProviderName || null, modelName: replyModelName || null,
              sourceType: "appointment", salesTriggerType: salesTrigger, timestamp: new Date(),
            });
          }
        } else {
          const noSlotMsg = `عذراً، لا تتوفر مواعيد في هذا الوقت. يرجى اختيار وقت آخر.`;
          await sendFbMessage(settings.pageAccessToken, senderId, noSlotMsg, settings.pageId ?? undefined);
          await db.insert(conversationsTable).values({
            fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
            message: noSlotMsg, sender: "bot",
            providerName: replyProviderName || null, modelName: replyModelName || null,
            sourceType: "appointment", salesTriggerType: salesTrigger, timestamp: new Date(),
          });
        }
        continue;
      }

      const startOrderAction = parseStartOrderAction(replyText);
      if (startOrderAction && config.respondToOrders) {
        const product = allProducts.find(
          (p) => p.name.toLowerCase() === startOrderAction.product_name?.toLowerCase()
        );
        await db.delete(orderSessionsTable).where(eq(orderSessionsTable.fbUserId, senderId));
        await db.insert(orderSessionsTable).values({
          fbUserId: senderId,
          productName: startOrderAction.product_name,
          productId: product?.id ?? null,
          quantity: startOrderAction.quantity ?? 1,
          step: "collecting",
        });
        replyText = replyText.replace(/\{[\s\S]*?"action"\s*:\s*"start_order"[\s\S]*?\}/, "").trim();
        if (!replyText) {
          replyText = `بكل سرور! لإتمام طلبك لـ "${startOrderAction.product_name}" أحتاج بعض المعلومات:\nما هو اسمك الكامل؟`;
        }
        await sendFbMessage(settings.pageAccessToken, senderId, replyText, settings.pageId ?? undefined);
        await db.insert(conversationsTable).values({
          fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
          message: replyText, sender: "bot",
          providerName: replyProviderName || null, modelName: replyModelName || null,
          sourceType: "order_action", salesTriggerType: salesTrigger, timestamp: new Date(),
        });
        if (lastUserMsgId) {
          void db.update(conversationsTable)
            .set({ convertedToOrder: 1, conversionSource: "bot" })
            .where(eq(conversationsTable.id, lastUserMsgId));
        }
        continue;
      }

      const confirmOrderAction = parseConfirmOrderAction(replyText);
      if (confirmOrderAction && config.respondToOrders) {
        const [session] = await db.select().from(orderSessionsTable).where(eq(orderSessionsTable.fbUserId, senderId)).limit(1);
        if (session) {
          // Validate ALL 4 required fields before proceeding
          const missingFields: string[] = [];
          if (!confirmOrderAction.customer_name?.trim()) missingFields.push("الاسم الكامل");
          if (!confirmOrderAction.customer_phone?.trim()) {
            missingFields.push("رقم الهاتف");
          } else if (!isValidPhoneNumber(confirmOrderAction.customer_phone)) {
            missingFields.push("رقم هاتف صحيح (10 أو 12 رقمًا، أرقام فقط)");
          }
          if (!confirmOrderAction.customer_wilaya?.trim()) missingFields.push("الولاية");
          if (!confirmOrderAction.customer_address?.trim()) missingFields.push("العنوان التفصيلي");

          if (missingFields.length > 0) {
            const askMsg = `أحتاج بعض المعلومات الإضافية لإتمام طلبك:\nما هو ${missingFields[0]}؟`;
            await sendFbMessage(settings.pageAccessToken, senderId, askMsg, settings.pageId ?? undefined);
            await db.insert(conversationsTable).values({
              fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
              message: askMsg, sender: "bot",
              providerName: replyProviderName || null, modelName: replyModelName || null,
              sourceType: "order_action", salesTriggerType: salesTrigger, timestamp: new Date(),
            });
            continue;
          }

          const resolvedWilaya = confirmOrderAction.customer_wilaya
            ? resolveWilaya(confirmOrderAction.customer_wilaya) : null;

          await db.update(orderSessionsTable).set({
            customerName: confirmOrderAction.customer_name,
            customerPhone: confirmOrderAction.customer_phone,
            customerWilaya: resolvedWilaya,
            customerAddress: confirmOrderAction.customer_address ?? null,
            quantity: confirmOrderAction.quantity ?? session.quantity ?? 1,
            step: config.deliveryEnabled && resolvedWilaya ? "choosing_delivery" : "awaiting_confirm",
            updatedAt: new Date(),
          }).where(eq(orderSessionsTable.fbUserId, senderId));

          // ── If delivery enabled → ask delivery type first ──────────────────
          if (config.deliveryEnabled && resolvedWilaya) {
            const deliveryIntroMsg = `شكراً! تم جمع بيانات طلبك. الآن اختر طريقة التوصيل:`;
            await sendFbMessage(settings.pageAccessToken, senderId, deliveryIntroMsg, settings.pageId ?? undefined);
            await sendDeliveryOptions(settings.pageAccessToken, senderId, resolvedWilaya, settings.pageId ?? undefined);
            await db.insert(conversationsTable).values({
              fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
              message: deliveryIntroMsg, sender: "bot",
              providerName: replyProviderName || null, modelName: replyModelName || null,
              sourceType: "order_action", salesTriggerType: salesTrigger, timestamp: new Date(),
            });
            continue;
          }

          // ── No delivery → show standard summary ───────────────────────────
          const product = session.productId
            ? (await db.select().from(productsTable).where(eq(productsTable.id, session.productId)).limit(1))[0]
            : null;
          const unitPrice = product?.discountPrice ?? product?.originalPrice ?? 0;
          const qty = confirmOrderAction.quantity ?? session.quantity ?? 1;
          const total = unitPrice * qty;
          const currency = config.currency ?? "DZD";

          const summaryMsg =
            `📋 ملخص طلبك:\n` +
            `🛍️ المنتج: ${session.productName}\n` +
            `📦 الكمية: ${qty}\n` +
            `💰 السعر: ${total} ${currency}\n` +
            `👤 الاسم: ${confirmOrderAction.customer_name}\n` +
            `📱 الهاتف: ${confirmOrderAction.customer_phone}\n` +
            `📍 الولاية: ${resolvedWilaya ?? "—"}\n` +
            `🏠 العنوان: ${confirmOrderAction.customer_address ?? "—"}\n\n` +
            `هل تريد تأكيد الطلب؟`;

          try {
            await sendFbButtonMessage(
              settings.pageAccessToken, senderId, summaryMsg,
              [
                { title: "✅ تأكيد الطلب", payload: "CONFIRM_ORDER" },
                { title: "❌ إلغاء", payload: "CANCEL_ORDER" },
              ],
              settings.pageId ?? undefined
            );
          } catch {
            await sendFbMessage(settings.pageAccessToken, senderId, summaryMsg + "\n\nأرسل 'تأكيد' لتأكيد الطلب أو 'إلغاء' لإلغائه.", settings.pageId ?? undefined);
          }

          await db.insert(conversationsTable).values({
            fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
            message: summaryMsg, sender: "bot",
            providerName: replyProviderName || null, modelName: replyModelName || null,
            sourceType: "order_action", salesTriggerType: salesTrigger, timestamp: new Date(),
          });
          if (lastUserMsgId) {
            void db.update(conversationsTable)
              .set({ convertedToOrder: 1, conversionSource: "bot", conversionValue: total })
              .where(eq(conversationsTable.id, lastUserMsgId));
          }
          continue;
        }
      }

      const orderAction = parseOrderAction(replyText);
      if (orderAction && config.respondToOrders &&
        orderAction.customer_name && orderAction.customer_name.trim() !== "" &&
        orderAction.customer_phone && orderAction.customer_phone.trim() !== "" &&
        isValidPhoneNumber(orderAction.customer_phone) &&
        orderAction.customer_wilaya && orderAction.customer_wilaya.trim() !== "" &&
        orderAction.customer_address && orderAction.customer_address.trim() !== "") {
        const product = allProducts.find(
          (p) => p.name.toLowerCase() === orderAction.product_name?.toLowerCase()
        );
        const resolvedWilayaOA = orderAction.customer_wilaya ? resolveWilaya(orderAction.customer_wilaya) : null;
        await db.delete(orderSessionsTable).where(eq(orderSessionsTable.fbUserId, senderId));
        await db.insert(orderSessionsTable).values({
          fbUserId: senderId,
          productName: orderAction.product_name,
          productId: product?.id ?? null,
          quantity: orderAction.quantity ?? 1,
          customerName: orderAction.customer_name,
          customerPhone: orderAction.customer_phone,
          customerWilaya: resolvedWilayaOA,
          customerAddress: orderAction.customer_address ?? null,
          step: config.deliveryEnabled && resolvedWilayaOA ? "choosing_delivery" : "awaiting_confirm",
        });

        // ── If delivery enabled → ask delivery type first ──────────────────
        if (config.deliveryEnabled && resolvedWilayaOA) {
          const deliveryIntroMsg = `شكراً! تم جمع بيانات طلبك. الآن اختر طريقة التوصيل:`;
          await sendFbMessage(settings.pageAccessToken, senderId, deliveryIntroMsg, settings.pageId ?? undefined);
          await sendDeliveryOptions(settings.pageAccessToken, senderId, resolvedWilayaOA, settings.pageId ?? undefined);
          await db.insert(conversationsTable).values({
            fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
            message: deliveryIntroMsg, sender: "bot",
            providerName: replyProviderName || null, modelName: replyModelName || null,
            sourceType: "order_action", salesTriggerType: salesTrigger, timestamp: new Date(),
          });
          continue;
        }

        // ── No delivery → show standard summary ───────────────────────────
        const unitPrice = product?.discountPrice ?? product?.originalPrice ?? 0;
        const qty = orderAction.quantity ?? 1;
        const total = unitPrice * qty;
        const currency = config.currency ?? "DZD";

        const summaryMsg =
          `📋 ملخص طلبك:\n` +
          `🛍️ المنتج: ${orderAction.product_name}\n` +
          `📦 الكمية: ${qty}\n` +
          `💰 السعر: ${total} ${currency}\n` +
          `👤 الاسم: ${orderAction.customer_name}\n` +
          `📱 الهاتف: ${orderAction.customer_phone}\n` +
          `📍 الولاية: ${resolvedWilayaOA ?? "—"}\n` +
          `🏠 العنوان: ${orderAction.customer_address ?? "—"}\n\n` +
          `هل تريد تأكيد الطلب؟`;

        try {
          await sendFbButtonMessage(
            settings.pageAccessToken, senderId, summaryMsg,
            [
              { title: "✅ تأكيد الطلب", payload: "CONFIRM_ORDER" },
              { title: "❌ إلغاء", payload: "CANCEL_ORDER" },
            ],
            settings.pageId ?? undefined
          );
        } catch {
          await sendFbMessage(settings.pageAccessToken, senderId, summaryMsg + "\n\nأرسل 'تأكيد' لتأكيد الطلب أو 'إلغاء' لإلغائه.", settings.pageId ?? undefined);
        }

        await db.insert(conversationsTable).values({
          fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
          message: summaryMsg, sender: "bot",
          providerName: replyProviderName || null, modelName: replyModelName || null,
          sourceType: "order_action", salesTriggerType: salesTrigger, timestamp: new Date(),
        });
        if (lastUserMsgId) {
          void db.update(conversationsTable)
            .set({ convertedToOrder: 1, conversionSource: "bot", conversionValue: total })
            .where(eq(conversationsTable.id, lastUserMsgId));
        }
        continue;
      }

      {
        // ── PHASE 5 FEATURE 4: Human Guarantee Mode ────────────────────────────
        if ((config as any).humanGuaranteeEnabled) {
          replyText = replyText + "\n\n💬 إذا أردت التحدث مع شخص حقيقي، اكتب: \"بشري\"";
        }

        // Send reply — with quick replies on first message or product mention
        const replyTextLower = replyText.toLowerCase();
        const mentionedProduct = config.useQuickReplies
          ? allProducts.find((p) => replyTextLower.includes(p.name.toLowerCase()))
          : undefined;

        if (isFirstMessage && config.useQuickReplies) {
          const DEFAULT_QR_BUTTONS = [
            { title: "📦 استفسار منتجات", payload: "PRODUCTS" },
            { title: "📅 حجز موعد", payload: "APPOINTMENT" },
            { title: "🚚 خدمة التوصيل", payload: "DELIVERY" },
          ];
          let qrButtons = DEFAULT_QR_BUTTONS;
          if ((config as any).quickReplyButtons) {
            try {
              const parsed = JSON.parse((config as any).quickReplyButtons) as { title: string; payload: string }[];
              if (Array.isArray(parsed) && parsed.length > 0) qrButtons = parsed;
            } catch {}
          }
          try {
            await sendFbQuickReplies(settings.pageAccessToken, senderId, replyText, qrButtons.slice(0, 13), settings.pageId ?? undefined);
          } catch {
            await sendFbMessage(settings.pageAccessToken, senderId, replyText, settings.pageId ?? undefined);
          }
        } else if (mentionedProduct) {
          await sendFbMessage(settings.pageAccessToken, senderId, replyText, settings.pageId ?? undefined);
          try {
            await sendFbQuickReplies(
              settings.pageAccessToken,
              senderId,
              `🔷 ${mentionedProduct.name}`,
              [
                { title: "🛒 اطلب الآن", payload: `ORDER_NOW:${mentionedProduct.id}` },
                { title: "💰 السعر", payload: `PRICE_INFO:${mentionedProduct.id}` },
                { title: "📸 صورة المنتج", payload: `PRODUCT_IMAGE:${mentionedProduct.id}` },
              ],
              settings.pageId ?? undefined
            );
          } catch {}
        } else {
          await sendFbMessage(settings.pageAccessToken, senderId, replyText, settings.pageId ?? undefined);
        }

        await db.insert(conversationsTable).values({
          fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
          message: replyText, sender: "bot", sentiment: aiSentiment,
          confidenceScore: aiConfidenceScore,
          providerName: replyProviderName || null, modelName: replyModelName || null,
          sourceType: replySourceType, salesTriggerType: salesTrigger, timestamp: new Date(),
        });

        if (config.abandonedCartEnabled) {
          const replyLower = replyText.toLowerCase();
          const userMsgLower = messageText.toLowerCase();
          const mentionedProd = allProducts.find((p) => {
            const nameLower = p.name.toLowerCase();
            return replyLower.includes(nameLower) || userMsgLower.includes(nameLower);
          });
          const hasOrderAction = !!parseStartOrderAction(replyText) || !!parseConfirmOrderAction(replyText) || !!parseOrderAction(replyText);
          if (mentionedProd && !hasOrderAction) {
            const now = new Date().toISOString();
            const [existing] = await db.select().from(productInquiriesTable)
              .where(and(eq(productInquiriesTable.fbUserId, senderId), eq(productInquiriesTable.productName, mentionedProd.name), eq(productInquiriesTable.converted, 0)))
              .limit(1);
            if (existing) {
              await db.update(productInquiriesTable)
                .set({ inquiredAt: now, reminderSent: 0 })
                .where(eq(productInquiriesTable.id, existing.id));
            } else {
              await db.insert(productInquiriesTable).values({
                fbUserId: senderId,
                fbUserName: userName,
                productName: mentionedProd.name,
                productId: mentionedProd.id,
                inquiredAt: now,
                createdAt: now,
              });
            }
          }
        }

        // After AI response on 2nd message: if lead capture enabled and user has no lead, send capture message
        if (config.leadCaptureEnabled && !isFirstMessage) {
          const [existingLead] = await db
            .select()
            .from(leadsTable)
            .where(eq(leadsTable.fbUserId, senderId))
            .limit(1);

          const needsCapture = !existingLead || (!existingLead.phone && !existingLead.email);
          const msgCount = history.filter((h) => h.sender === "user").length;

          if (needsCapture && msgCount === 2) {
            const captureMsg = config.leadCaptureMessage ?? "يسعدنا خدمتك! هل يمكنك مشاركتنا رقم هاتفك للتواصل؟";
            await sendFbMessage(settings.pageAccessToken, senderId, captureMsg, settings.pageId ?? undefined);
            await db.insert(conversationsTable).values({
              fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
              message: captureMsg, sender: "bot", timestamp: new Date(),
            });
          }
        }
      }
    }

    for (const change of entry.changes ?? []) {
      if (change.field !== "feed") continue;
      const val = change.value;
      if (val?.item !== "comment") continue;

      if (!config.replyToComments) continue;

      const commentId = val.comment_id ?? "";
      const postId = val.post_id ?? "";
      const senderId = val.from?.id ?? val.sender_id ?? "";
      const commentText = val.message ?? "";
      const userName = val.from?.name ?? senderId;
      const profileUrl = `https://www.facebook.com/${senderId}`;

      const commentSystemPrompt = buildCommentSystemPrompt(config);
      let aiReply = "";
      try {
        aiReply = await callAIWithLoadBalancing(
          [{ role: "user", content: `Comment on our Facebook post: "${commentText}"` }],
          commentSystemPrompt
        );
      } catch {}

      if (aiReply && commentId) {
        await fetch(
          `https://graph.facebook.com/v25.0/${commentId}/comments?access_token=${settings.pageAccessToken}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: aiReply }),
          }
        );
      }

      let dmSent = 0;
      if (config.sendDmOnComment && senderId) {
        const dmMsg = `مرحباً ${userName}! لاحظت تعليقك، هل يمكنني مساعدتك بشيء؟ 😊`;
        try {
          await sendFbMessage(settings.pageAccessToken, senderId, dmMsg, settings.pageId ?? undefined);
          dmSent = 1;
        } catch {}
      }

      await db.insert(commentsLogTable).values({
        postId, commentId, fbUserId: senderId, fbUserName: userName,
        fbProfileUrl: profileUrl, commentText, aiReply,
        dmSent, timestamp: new Date(),
      });
    }
  }
});

export default router;
