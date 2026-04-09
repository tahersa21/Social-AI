import {
  db,
  productsTable,
  conversationsTable,
  ordersTable,
  appointmentsTable,
  availableSlotsTable,
  orderSessionsTable,
  productInquiriesTable,
  fbSettingsTable,
  aiConfigTable,
} from "@workspace/db";
import { eq, and, sql, count } from "drizzle-orm";
import { cache } from "./cache.js";
import { broadcastNotification } from "../routes/notifications.js";
import { ALGERIA_WILAYAS } from "../routes/deliveryPrices.js";

import {
  sendFbMessage, sendFbImageFromDataUrl, sendFbButtonMessage,
  parseOrderAction, parseStartOrderAction, parseConfirmOrderAction,
  parseAppointmentAction, parseSendImageAction, parseBrowseCatalogAction,
  type SalesTriggerType,
} from "./ai.js";

import {
  parseCheckOrderStatusAction,
  isValidPhoneNumber, resolveWilaya,
} from "./webhookUtils.js";

import { sendCatalogCategoryMenu, sendDeliveryOptions } from "./catalogFlow.js";

type AppSettings = typeof fbSettingsTable.$inferSelect;
type AppConfig   = typeof aiConfigTable.$inferSelect;
type AppProduct  = typeof productsTable.$inferSelect;

export type ActionCtx = {
  senderId:         string;
  userName:         string;
  profileUrl:       string | null;
  replyText:        string;
  settings:         AppSettings & { pageAccessToken: string };
  config:           AppConfig;
  allProducts:      AppProduct[];
  salesTrigger:     SalesTriggerType;
  replyProviderName: string;
  replyModelName:   string;
  lastUserMsgId:    number | null;
};

// ── check_order_status ────────────────────────────────────────────────────────
export async function handleCheckOrderStatus(ctx: ActionCtx): Promise<boolean> {
  if (!parseCheckOrderStatusAction(ctx.replyText)) return false;
  const { senderId, userName, profileUrl, settings, replyProviderName, replyModelName, salesTrigger } = ctx;

  const STATUS_EMOJI: Record<string, string> = { pending: "⏳", confirmed: "✅", delivered: "📦", cancelled: "❌" };
  const STATUS_LABEL: Record<string, string> = { pending: "قيد الانتظار", confirmed: "مؤكد", delivered: "تم التوصيل", cancelled: "ملغى" };

  const latestOrders = await db.select().from(ordersTable)
    .where(eq(ordersTable.fbUserId, senderId))
    .orderBy(sql`${ordersTable.createdAt} DESC`).limit(1);

  let statusMsg: string;
  if (latestOrders.length > 0) {
    const order   = latestOrders[0]!;
    const emoji   = STATUS_EMOJI[order.status] ?? "📋";
    const label   = STATUS_LABEL[order.status] ?? order.status;
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
  return true;
}

// ── browse_catalog ────────────────────────────────────────────────────────────
export async function handleBrowseCatalog(ctx: ActionCtx): Promise<boolean> {
  if (!parseBrowseCatalogAction(ctx.replyText)) return false;
  const { senderId, settings } = ctx;

  const alreadyShown = cache.get<boolean>(`catalog_shown:${senderId}`);
  if (alreadyShown) {
    const nudge = "يمكنك الضغط على إحدى فئات القائمة أعلاه 👆 أو أخبرني مباشرة بالمنتج الذي تبحث عنه.";
    await sendFbMessage(settings.pageAccessToken, senderId, nudge, settings.pageId ?? undefined);
    cache.del(`catalog_shown:${senderId}`);
  } else {
    await sendCatalogCategoryMenu(settings.pageAccessToken, senderId, settings.pageId ?? undefined);
    cache.set(`catalog_shown:${senderId}`, true, 90 * 1000);
  }
  return true;
}

// ── send_image ────────────────────────────────────────────────────────────────
export async function handleSendImage(ctx: ActionCtx): Promise<boolean> {
  const sendImageAction = parseSendImageAction(ctx.replyText);
  if (!sendImageAction) return false;
  const { senderId, userName, profileUrl, settings, allProducts, replyProviderName, replyModelName, salesTrigger } = ctx;

  const searchName   = (sendImageAction.product_name ?? "").toLowerCase().trim();
  const imageProduct = searchName
    ? allProducts.find((p) => p.name.toLowerCase().includes(searchName) || searchName.includes(p.name.toLowerCase()))
    : null;

  let botMsg = "عذراً، لا تتوفر صورة لهذا المنتج حالياً.";
  if (imageProduct?.images) {
    try {
      const imgIndex = imageProduct.mainImageIndex ?? 0;
      const imgList  = JSON.parse(imageProduct.images) as string[];
      const dataUrl  = imgList[imgIndex] ?? imgList[0];
      if (!dataUrl) throw new Error("no image data");
      botMsg = `إليك صورة ${imageProduct.name} 📸`;
      await sendFbMessage(settings.pageAccessToken, senderId, botMsg, settings.pageId ?? undefined);
      await sendFbImageFromDataUrl(settings.pageAccessToken, senderId, dataUrl, settings.pageId ?? undefined);
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
  return true;
}

// ── appointment ───────────────────────────────────────────────────────────────
export async function handleAppointment(ctx: ActionCtx): Promise<boolean> {
  const appointmentAction = parseAppointmentAction(ctx.replyText);
  if (!appointmentAction) return false;
  const { senderId, userName, profileUrl, settings, replyProviderName, replyModelName, salesTrigger } = ctx;

  const apptDate  = appointmentAction.appointment_date;
  const apptTime  = appointmentAction.time_slot;
  const d         = new Date(apptDate);
  const dayOfWeek = d.getDay();

  const slots = await db.select().from(availableSlotsTable)
    .where(and(
      eq(availableSlotsTable.dayOfWeek, dayOfWeek),
      eq(availableSlotsTable.timeSlot, apptTime),
      eq(availableSlotsTable.isActive, 1),
    ));

  if (slots.length > 0) {
    const slot = slots[0]!;
    const [bookingCount] = await db.select({ value: count() }).from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.appointmentDate, apptDate),
        eq(appointmentsTable.timeSlot, apptTime),
        sql`${appointmentsTable.status} != 'cancelled'`,
      ));

    if ((bookingCount?.value ?? 0) < slot.maxBookings) {
      await db.insert(appointmentsTable).values({
        fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
        serviceName:     appointmentAction.service_name ?? null,
        appointmentDate: apptDate, timeSlot: apptTime,
        status: "pending", note: appointmentAction.note ?? null, source: "messenger",
      });
      broadcastNotification({
        type:  "new_appointment",
        title: "موعد جديد!",
        body:  `${userName} حجز موعد ${apptDate} الساعة ${apptTime}`,
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
      const allDaySlots = await db.select().from(availableSlotsTable)
        .where(and(eq(availableSlotsTable.dayOfWeek, dayOfWeek), eq(availableSlotsTable.isActive, 1)));
      const slotsWithCapacity: string[] = [];
      for (const s of allDaySlots) {
        const [bc] = await db.select({ value: count() }).from(appointmentsTable)
          .where(and(
            eq(appointmentsTable.appointmentDate, apptDate),
            eq(appointmentsTable.timeSlot, s.timeSlot),
            sql`${appointmentsTable.status} != 'cancelled'`,
          ));
        if ((bc?.value ?? 0) < s.maxBookings) slotsWithCapacity.push(s.timeSlot);
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
    const noSlotMsg = "عذراً، لا تتوفر مواعيد في هذا الوقت. يرجى اختيار وقت آخر.";
    await sendFbMessage(settings.pageAccessToken, senderId, noSlotMsg, settings.pageId ?? undefined);
    await db.insert(conversationsTable).values({
      fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
      message: noSlotMsg, sender: "bot",
      providerName: replyProviderName || null, modelName: replyModelName || null,
      sourceType: "appointment", salesTriggerType: salesTrigger, timestamp: new Date(),
    });
  }
  return true;
}

// ── start_order ───────────────────────────────────────────────────────────────
export async function handleStartOrder(ctx: ActionCtx): Promise<boolean> {
  const startOrderAction = parseStartOrderAction(ctx.replyText);
  if (!startOrderAction || !ctx.config.respondToOrders) return false;
  const { senderId, userName, profileUrl, settings, allProducts, salesTrigger, replyProviderName, replyModelName, lastUserMsgId } = ctx;
  let replyText = ctx.replyText;

  const product = allProducts.find((p) => p.name.toLowerCase() === startOrderAction.product_name?.toLowerCase());
  await db.delete(orderSessionsTable).where(eq(orderSessionsTable.fbUserId, senderId));
  await db.insert(orderSessionsTable).values({
    fbUserId:    senderId,
    productName: startOrderAction.product_name,
    productId:   product?.id ?? null,
    quantity:    startOrderAction.quantity ?? 1,
    step:        "collecting",
  });
  replyText = replyText.replace(/\{[\s\S]*?"action"\s*:\s*"start_order"[\s\S]*?\}/, "").trim();
  if (!replyText) replyText = `بكل سرور! لإتمام طلبك لـ "${startOrderAction.product_name}" أحتاج بعض المعلومات:\nما هو اسمك الكامل؟`;
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
  return true;
}

// ── confirm_order ─────────────────────────────────────────────────────────────
export async function handleConfirmOrder(ctx: ActionCtx): Promise<boolean> {
  const confirmOrderAction = parseConfirmOrderAction(ctx.replyText);
  if (!confirmOrderAction || !ctx.config.respondToOrders) return false;
  const { senderId, userName, profileUrl, settings, config, salesTrigger, replyProviderName, replyModelName, lastUserMsgId } = ctx;

  const [session] = await db.select().from(orderSessionsTable)
    .where(eq(orderSessionsTable.fbUserId, senderId)).limit(1);
  if (!session) return false;

  const missingFields: string[] = [];
  if (!confirmOrderAction.customer_name?.trim())   missingFields.push("الاسم الكامل");
  if (!confirmOrderAction.customer_phone?.trim()) {
    missingFields.push("رقم الهاتف");
  } else if (!isValidPhoneNumber(confirmOrderAction.customer_phone)) {
    missingFields.push("رقم هاتف صحيح (10 أو 12 رقمًا، أرقام فقط)");
  }
  if (!confirmOrderAction.customer_wilaya?.trim())  missingFields.push("الولاية");
  if (!confirmOrderAction.customer_commune?.trim()) missingFields.push("البلدية");
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
    return true;
  }

  const resolvedWilaya = confirmOrderAction.customer_wilaya
    ? resolveWilaya(confirmOrderAction.customer_wilaya, ALGERIA_WILAYAS) : null;

  if (config.deliveryEnabled && confirmOrderAction.customer_wilaya && !resolvedWilaya) {
    const askNumMsg =
      `لم نتعرف على الولاية "${confirmOrderAction.customer_wilaya}" 😕\n` +
      `يرجى إدخال **رقم** ولايتك (مثال: 16 للجزائر، 31 لوهران، 39 للوادي).`;
    await sendFbMessage(settings.pageAccessToken, senderId, askNumMsg, settings.pageId ?? undefined);
    await db.insert(conversationsTable).values({
      fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
      message: askNumMsg, sender: "bot",
      providerName: replyProviderName || null, modelName: replyModelName || null,
      sourceType: "order_action", salesTriggerType: salesTrigger, timestamp: new Date(),
    });
    return true;
  }

  await db.update(orderSessionsTable).set({
    customerName:    confirmOrderAction.customer_name,
    customerPhone:   confirmOrderAction.customer_phone,
    customerWilaya:  resolvedWilaya,
    customerCommune: confirmOrderAction.customer_commune ?? null,
    customerAddress: confirmOrderAction.customer_address ?? null,
    quantity:        confirmOrderAction.quantity ?? session.quantity ?? 1,
    step:            config.deliveryEnabled && resolvedWilaya ? "choosing_delivery" : "awaiting_confirm",
    updatedAt:       new Date(),
  }).where(eq(orderSessionsTable.fbUserId, senderId));

  if (config.deliveryEnabled && resolvedWilaya) {
    const deliveryIntroMsg = "شكراً! تم جمع بيانات طلبك. الآن اختر طريقة التوصيل:";
    await sendFbMessage(settings.pageAccessToken, senderId, deliveryIntroMsg, settings.pageId ?? undefined);
    await sendDeliveryOptions(settings.pageAccessToken, senderId, resolvedWilaya, settings.pageId ?? undefined);
    await db.insert(conversationsTable).values({
      fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
      message: deliveryIntroMsg, sender: "bot",
      providerName: replyProviderName || null, modelName: replyModelName || null,
      sourceType: "order_action", salesTriggerType: salesTrigger, timestamp: new Date(),
    });
    return true;
  }

  const product   = session.productId
    ? (await db.select().from(productsTable).where(eq(productsTable.id, session.productId)).limit(1))[0]
    : null;
  const unitPrice = product?.discountPrice ?? product?.originalPrice ?? 0;
  const qty       = confirmOrderAction.quantity ?? session.quantity ?? 1;
  const total     = unitPrice * qty;
  const currency  = config.currency ?? "DZD";

  const summaryMsg =
    `📋 ملخص طلبك:\n` +
    `🛍️ المنتج: ${session.productName}\n` +
    `📦 الكمية: ${qty}\n` +
    `💰 السعر: ${total} ${currency}\n` +
    `👤 الاسم: ${confirmOrderAction.customer_name}\n` +
    `📱 الهاتف: ${confirmOrderAction.customer_phone}\n` +
    `📍 الولاية: ${resolvedWilaya ?? "—"}\n` +
    `🏘️ البلدية: ${confirmOrderAction.customer_commune ?? "—"}\n` +
    `🏠 العنوان: ${confirmOrderAction.customer_address ?? "—"}\n\n` +
    `هل تريد تأكيد الطلب؟`;

  try {
    await sendFbButtonMessage(
      settings.pageAccessToken, senderId, summaryMsg,
      [
        { title: "✅ تأكيد الطلب", payload: "CONFIRM_ORDER" },
        { title: "❌ إلغاء",        payload: "CANCEL_ORDER" },
      ],
      settings.pageId ?? undefined,
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
  return true;
}

// ── create_order (direct — all fields provided by AI in one shot) ──────────────
export async function handleCreateOrder(ctx: ActionCtx): Promise<boolean> {
  const orderAction = parseOrderAction(ctx.replyText);
  if (
    !orderAction || !ctx.config.respondToOrders ||
    !orderAction.customer_name?.trim() || !orderAction.customer_phone?.trim() ||
    !isValidPhoneNumber(orderAction.customer_phone) ||
    !orderAction.customer_wilaya?.trim() || !orderAction.customer_address?.trim()
  ) return false;

  const { senderId, userName, profileUrl, settings, config, allProducts, salesTrigger, replyProviderName, replyModelName, lastUserMsgId } = ctx;

  const product          = allProducts.find((p) => p.name.toLowerCase() === orderAction.product_name?.toLowerCase());
  const resolvedWilayaOA = orderAction.customer_wilaya ? resolveWilaya(orderAction.customer_wilaya, ALGERIA_WILAYAS) : null;

  if (config.deliveryEnabled && orderAction.customer_wilaya && !resolvedWilayaOA) {
    const askNumMsg =
      `لم نتعرف على الولاية "${orderAction.customer_wilaya}" 😕\n` +
      `يرجى إدخال **رقم** ولايتك (مثال: 16 للجزائر، 31 لوهران، 39 للوادي).`;
    await sendFbMessage(settings.pageAccessToken, senderId, askNumMsg, settings.pageId ?? undefined);
    await db.insert(conversationsTable).values({
      fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
      message: askNumMsg, sender: "bot",
      providerName: replyProviderName || null, modelName: replyModelName || null,
      sourceType: "order_action", salesTriggerType: salesTrigger, timestamp: new Date(),
    });
    return true;
  }

  await db.delete(orderSessionsTable).where(eq(orderSessionsTable.fbUserId, senderId));
  await db.insert(orderSessionsTable).values({
    fbUserId:        senderId,
    productName:     orderAction.product_name,
    productId:       product?.id ?? null,
    quantity:        orderAction.quantity ?? 1,
    customerName:    orderAction.customer_name,
    customerPhone:   orderAction.customer_phone,
    customerWilaya:  resolvedWilayaOA,
    customerCommune: orderAction.customer_commune ?? null,
    customerAddress: orderAction.customer_address ?? null,
    step:            config.deliveryEnabled && resolvedWilayaOA ? "choosing_delivery" : "awaiting_confirm",
  });

  if (config.deliveryEnabled && resolvedWilayaOA) {
    const deliveryIntroMsg = "شكراً! تم جمع بيانات طلبك. الآن اختر طريقة التوصيل:";
    await sendFbMessage(settings.pageAccessToken, senderId, deliveryIntroMsg, settings.pageId ?? undefined);
    await sendDeliveryOptions(settings.pageAccessToken, senderId, resolvedWilayaOA, settings.pageId ?? undefined);
    await db.insert(conversationsTable).values({
      fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
      message: deliveryIntroMsg, sender: "bot",
      providerName: replyProviderName || null, modelName: replyModelName || null,
      sourceType: "order_action", salesTriggerType: salesTrigger, timestamp: new Date(),
    });
    return true;
  }

  const unitPrice = product?.discountPrice ?? product?.originalPrice ?? 0;
  const qty       = orderAction.quantity ?? 1;
  const total     = unitPrice * qty;
  const currency  = config.currency ?? "DZD";

  const summaryMsg =
    `📋 ملخص طلبك:\n` +
    `🛍️ المنتج: ${orderAction.product_name}\n` +
    `📦 الكمية: ${qty}\n` +
    `💰 السعر: ${total} ${currency}\n` +
    `👤 الاسم: ${orderAction.customer_name}\n` +
    `📱 الهاتف: ${orderAction.customer_phone}\n` +
    `📍 الولاية: ${resolvedWilayaOA ?? "—"}\n` +
    `🏘️ البلدية: ${orderAction.customer_commune ?? "—"}\n` +
    `🏠 العنوان: ${orderAction.customer_address ?? "—"}\n\n` +
    `هل تريد تأكيد الطلب؟`;

  try {
    await sendFbButtonMessage(
      settings.pageAccessToken, senderId, summaryMsg,
      [
        { title: "✅ تأكيد الطلب", payload: "CONFIRM_ORDER" },
        { title: "❌ إلغاء",        payload: "CANCEL_ORDER" },
      ],
      settings.pageId ?? undefined,
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
  return true;
}
