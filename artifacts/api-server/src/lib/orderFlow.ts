import {
  db, productsTable, ordersTable, conversationsTable, orderSessionsTable,
  leadsTable, productInquiriesTable, aiConfigTable, preOrderSessionsTable,
  preOrdersTable, userProductContextTable, deliveryPricesTable, faqsTable,
} from "@workspace/db";
import { cache } from "./cache.js";
import { rDel } from "./redisCache.js";
import { eq, and } from "drizzle-orm";
import { sendFbMessage, sendFbImageMessage, sendFbImageFromDataUrl, sendFbButtonMessage, summarizeProductForUser } from "./ai.js";
import { sendFbQuickReplies } from "./messengerUtils.js";
import {
  sendDeliveryOptions, sendCatalogPage, sendCatalogCategoryMenu, handleBrowseSub,
  type CatalogFilters,
} from "./catalogFlow.js";
import { buildProductImageUrl, resolveWilaya } from "./webhookUtils.js";
import { broadcastNotification } from "../routes/notifications.js";
import { ALGERIA_WILAYAS } from "../routes/deliveryPrices.js";

export async function handleProductPayload(
  payload: string,
  senderId: string,
  userName: string,
  pageAccessToken: string,
  pageId?: string
): Promise<boolean> {
  const [payloadAction, payloadProductId] = payload.split(":") as [string, string | undefined];
  const payloadProdId = payloadProductId ? Number(payloadProductId) : null;

  // ── ORDER_NOW ───────────────────────────────────────────────────────────────
  if (payloadAction === "ORDER_NOW") {
    const [targetProduct] = payloadProdId
      ? await db.select().from(productsTable).where(eq(productsTable.id, payloadProdId)).limit(1)
      : await db.select().from(productsTable).limit(1);

    if (targetProduct) {
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
            { title: "❌ لا، شكراً",      payload: "BROWSE_CATALOG" },
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

  // ── CONFIRM_ORDER ───────────────────────────────────────────────────────────
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
      deliveryType: session.deliveryType ?? null,
      deliveryPrice: deliveryPriceOrd || null,
      status: "pending",
      customerName: session.customerName,
      customerPhone: session.customerPhone,
      customerWilaya: session.customerWilaya,
      customerCommune: session.customerCommune ?? null,
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

    await rDel(`shopctx:${senderId}`);

    const deliveryLine = session.deliveryType
      ? `\n🚚 نوع التوصيل: ${session.deliveryType === "home" ? "للمنزل" : "مكتب البريد"} — ${deliveryPriceOrd === 0 ? "مجاني 🎁" : `${deliveryPriceOrd} ${currencyOrd}`}`
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
        const imgList  = JSON.parse(product.images) as string[];
        const dataUrl  = imgList[imgIndex] ?? imgList[0];
        if (dataUrl) await sendFbImageFromDataUrl(pageAccessToken, senderId, dataUrl, pageId);
      } catch (e) {
        console.warn("[orderFlow] Failed to send product image:", e instanceof Error ? e.message : String(e));
      }
    }
    return true;
  }

  // ── CANCEL_ORDER ────────────────────────────────────────────────────────────
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

  // ── DELIVERY_HOME / DELIVERY_OFFICE ─────────────────────────────────────────
  if (payloadAction === "DELIVERY_HOME" || payloadAction === "DELIVERY_OFFICE") {
    const [deliveryAppConfig] = await db.select().from(aiConfigTable).limit(1);
    if (!deliveryAppConfig?.deliveryEnabled) {
      const disabledMsg = "⛔ عذراً، خدمة التوصيل غير متاحة حالياً. يرجى التواصل معنا مباشرة للاستفسار.";
      await sendFbMessage(pageAccessToken, senderId, disabledMsg, pageId);
      await db.insert(conversationsTable).values({
        fbUserId: senderId, fbUserName: userName, fbProfileUrl: null,
        message: disabledMsg, sender: "bot", timestamp: new Date(),
      });
      return true;
    }

    const [session] = await db.select().from(orderSessionsTable)
      .where(eq(orderSessionsTable.fbUserId, senderId)).limit(1);
    if (!session) return false;

    const isHome = payloadAction === "DELIVERY_HOME";
    const deliveryType = isHome ? "home" : "office";

    let deliveryPrice = 0;
    if (session.customerWilaya) {
      const wilayaRec = ALGERIA_WILAYAS.find((w) => w.wilayaName === session.customerWilaya);
      const [wp] = wilayaRec
        ? await db.select().from(deliveryPricesTable)
            .where(eq(deliveryPricesTable.wilayaId, wilayaRec.wilayaId)).limit(1)
        : await db.select().from(deliveryPricesTable)
            .where(eq(deliveryPricesTable.wilayaName, session.customerWilaya)).limit(1);
      deliveryPrice = wp ? (isHome ? (wp.homePrice ?? 0) : (wp.officePrice ?? 0)) : 0;
    }

    await db.update(orderSessionsTable).set({
      deliveryType,
      deliveryPrice,
      step: "awaiting_confirm",
      updatedAt: new Date(),
    }).where(eq(orderSessionsTable.fbUserId, senderId));

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
      `🚚 ${deliveryLabel}: ${deliveryPrice === 0 ? "مجاني 🎁" : `${deliveryPrice} ${currency}`}\n` +
      `─────────────────\n` +
      `💵 الإجمالي: ${grandTotal} ${currency}\n` +
      `👤 الاسم: ${session.customerName ?? "—"}\n` +
      `📱 الهاتف: ${session.customerPhone ?? "—"}\n` +
      `📍 الولاية: ${session.customerWilaya ?? "—"}\n` +
      `🏘️ البلدية: ${session.customerCommune ?? "—"}\n` +
      `🏠 العنوان: ${session.customerAddress ?? "—"}\n\n` +
      `هل تريد تأكيد الطلب؟`;

    try {
      await sendFbButtonMessage(pageAccessToken, senderId, summaryMsg, [
        { title: "✅ تأكيد الطلب",    payload: "CONFIRM_ORDER" },
        { title: "🔄 تغيير التوصيل",  payload: "CHANGE_DELIVERY" },
        { title: "❌ إلغاء",           payload: "CANCEL_ORDER" },
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

  // ── CHANGE_DELIVERY ─────────────────────────────────────────────────────────
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

  // ── PRICE_INFO ──────────────────────────────────────────────────────────────
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

  // ── PRODUCT_IMAGE ───────────────────────────────────────────────────────────
  if (payloadAction === "PRODUCT_IMAGE") {
    const [imageProduct] = payloadProdId
      ? await db.select().from(productsTable).where(eq(productsTable.id, payloadProdId)).limit(1)
      : await db.select().from(productsTable).limit(1);
    if (imageProduct?.images) {
      try {
        const imgIndex = imageProduct.mainImageIndex ?? 0;
        const imgList  = JSON.parse(imageProduct.images) as string[];
        const dataUrl  = imgList[imgIndex] ?? imgList[0];
        if (dataUrl) await sendFbImageFromDataUrl(pageAccessToken, senderId, dataUrl, pageId);
      } catch (e) {
        console.warn("[orderFlow] Failed to send catalog product image:", e instanceof Error ? e.message : String(e));
      }
    } else {
      await sendFbMessage(pageAccessToken, senderId, "عذراً، لا تتوفر صور المنتجات حالياً.", pageId);
    }
    return true;
  }

  // ── BROWSE_CATALOG / PRODUCTS ────────────────────────────────────────────────
  if (payloadAction === "BROWSE_CATALOG" || payloadAction === "PRODUCTS") {
    await sendCatalogCategoryMenu(pageAccessToken, senderId, pageId);
    return true;
  }

  // ── BROWSE_UNCATEGORIZED ─────────────────────────────────────────────────────
  if (payloadAction === "BROWSE_UNCATEGORIZED") {
    await sendCatalogPage(pageAccessToken, senderId, { uncategorized: true }, 1, pageId);
    return true;
  }

  // ── BROWSE_SUB ───────────────────────────────────────────────────────────────
  if (payloadAction === "BROWSE_SUB") {
    const catId = payloadProdId;
    if (!catId) return false;
    return await handleBrowseSub(pageAccessToken, senderId, catId, pageId);
  }

  // ── APPOINTMENT ──────────────────────────────────────────────────────────────
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

  // ── DELIVERY ─────────────────────────────────────────────────────────────────
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
      const fmtDp = (p: number | null | undefined) => (!p || p === 0) ? "مجاني" : `${p} ${appConfig?.currency ?? "DZD"}`;
      const lines = [
        "🚚 أسعار التوصيل حسب الولاية:",
        "",
        ...sample.map((w) => `• ${w.wilayaName}: 🏠 ${fmtDp(w.homePrice)} / 🏢 ${fmtDp(w.officePrice)}`),
        deliveryPrices.length > 10
          ? `\n...و ${deliveryPrices.length - 10} ولاية أخرى. أرسل اسم ولايتك لمعرفة السعر الدقيق.`
          : "",
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

  // ── FAQ ──────────────────────────────────────────────────────────────────────
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

  // ── CONTACT ──────────────────────────────────────────────────────────────────
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

  // ── FILTER_CATEGORY ──────────────────────────────────────────────────────────
  if (payloadAction === "FILTER_CATEGORY") {
    const category = payloadProductId ?? "general";
    await sendCatalogPage(pageAccessToken, senderId, { category }, 1, pageId);
    return true;
  }

  // ── FILTER_BRAND ─────────────────────────────────────────────────────────────
  if (payloadAction === "FILTER_BRAND") {
    const brand = payloadProductId ?? "";
    await sendCatalogPage(pageAccessToken, senderId, { brand }, 1, pageId);
    return true;
  }

  // ── FILTER_PRICE_TIER ────────────────────────────────────────────────────────
  if (payloadAction === "FILTER_PRICE_TIER") {
    const tier = payloadProductId ?? "";
    await sendCatalogPage(pageAccessToken, senderId, { priceTier: tier }, 1, pageId);
    return true;
  }

  // ── BROWSE_PAGE ──────────────────────────────────────────────────────────────
  if (payloadAction === "BROWSE_PAGE") {
    const parts = payload.split(":");
    const filtersStr = parts[1] ?? "";
    const page = parseInt(parts[2] ?? "1", 10);
    const filters: CatalogFilters = {};
    for (const pair of filtersStr.split("&")) {
      const [k, v] = pair.split("=");
      if (k === "category"      && v) filters.category      = decodeURIComponent(v);
      if (k === "brand"         && v) filters.brand          = decodeURIComponent(v);
      if (k === "priceTier"     && v) filters.priceTier      = decodeURIComponent(v);
      if (k === "uncategorized" && v === "true") filters.uncategorized = true;
    }
    await sendCatalogPage(pageAccessToken, senderId, filters, page, pageId);
    return true;
  }

  // ── DETAILS ──────────────────────────────────────────────────────────────────
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

    // ── Helper: fallback to the classic structured layout ─────────────────────
    const buildFallbackText = (): string => {
      const lines: string[] = [`📦 *${product.name}*`];
      if (product.brand)    lines.push(`🏷️ العلامة: ${product.brand}`);
      if (product.category) lines.push(`📂 الفئة: ${product.category}`);
      if (product.itemType) lines.push(`🔖 النوع: ${product.itemType}`);
      if (product.priceTier) {
        const tierLabel: Record<string, string> = { budget: "اقتصادي 💚", mid_range: "متوسط 💛", premium: "ممتاز 💎" };
        lines.push(`💰 الفئة السعرية: ${tierLabel[product.priceTier] ?? product.priceTier}`);
      }
      lines.push(`💵 السعر: ${priceStr}`);
      lines.push(`📊 المخزون: ${stockStatus}`);
      if (product.description) lines.push(`\n📝 ${product.description}`);
      return lines.join("\n");
    };

    // ── Try AI summarization when description is meaningful (>30 chars) ───────
    let finalMessage: string;
    const hasDescription = !!product.description && product.description.trim().length > 30;

    if (hasDescription) {
      let aiSummary: string | null = null;
      try {
        aiSummary = await summarizeProductForUser({
          name:        product.name,
          description: product.description!,
          category:    product.category,
          brand:       product.brand,
          itemType:    product.itemType,
        });
      } catch {
        // Swallow — fall back below
      }

      if (aiSummary) {
        // AI success: conversational summary + pinned price/stock facts
        finalMessage = [
          `📦 *${product.name}*`,
          "",
          aiSummary,
          "",
          `💵 السعر: ${priceStr}`,
          `📊 المخزون: ${stockStatus}`,
        ].join("\n");
      } else {
        // All providers failed or returned garbage → classic layout
        finalMessage = buildFallbackText();
      }
    } else {
      // Description absent or too short → classic layout directly (no AI call)
      finalMessage = buildFallbackText();
    }

    await sendFbMessage(pageAccessToken, senderId, finalMessage, pageId);
    await db.insert(conversationsTable).values({
      fbUserId: senderId, fbUserName: userName, fbProfileUrl: null,
      message: finalMessage, sender: "bot", timestamp: new Date(),
    });

    if (isZeroStock) {
      const preOrderPrompt = "⚠️ هذا المنتج انتهت الكميةُ حالياً.\nيمكنك طلبه كطلب مسبق وسنقوم بإعلامك عند توفره.";
      await sendFbMessage(pageAccessToken, senderId, preOrderPrompt, pageId);
      await sendFbQuickReplies(
        pageAccessToken, senderId,
        "هل تريد تسجيل طلب مسبق؟",
        [
          { title: "✅ نعم، طلب مسبق", payload: `PREORDER_START:${product.id}` },
          { title: "❌ لا، شكراً",      payload: "BROWSE_CATALOG" },
        ],
        pageId
      );
    } else {
      const detailQRs = [
        { title: "🛒 اطلب الآن",         payload: `ORDER_NOW:${product.id}` },
        { title: "🔍 منتجات مشابهة",      payload: `FILTER_CATEGORY:${product.category ?? "general"}` },
        { title: "🏠 الفئات",             payload: "BROWSE_CATALOG" },
      ];
      await sendFbQuickReplies(pageAccessToken, senderId, "ماذا تريد أن تفعل؟", detailQRs, pageId);
    }

    await db
      .insert(userProductContextTable)
      .values({ fbUserId: senderId, productId: product.id, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userProductContextTable.fbUserId,
        set: { productId: product.id, updatedAt: new Date() },
      });
    return true;
  }

  // ── PREORDER_START ───────────────────────────────────────────────────────────
  if (payloadAction === "PREORDER_START") {
    const productId = payloadProdId;
    if (!productId) return false;
    const [product] = await db.select().from(productsTable)
      .where(eq(productsTable.id, productId)).limit(1);
    if (!product) {
      await sendFbMessage(pageAccessToken, senderId, "عذراً، لم يعد هذا المنتج متاحاً.", pageId);
      return true;
    }
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
        set: {
          productId: product.id, productName: product.name,
          step: "awaiting_name", customerName: null, createdAt: new Date(),
        },
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
