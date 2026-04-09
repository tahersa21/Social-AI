import {
  db,
  aiConfigTable,
  orderSessionsTable,
  preOrderSessionsTable,
  preOrdersTable,
  conversationsTable,
  deliveryPricesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sendFbMessage } from "./ai.js";
import { sendDeliveryOptions } from "./catalogFlow.js";
import { handleProductPayload } from "./orderFlow.js";
import { isValidPhoneNumber, extractPhone, logPlatformEvent, resolveWilaya } from "./webhookUtils.js";
import { ALGERIA_WILAYAS } from "../routes/deliveryPrices.js";
import { saveConversation } from "./dbHelpers.js";

type AppConfig = typeof aiConfigTable.$inferSelect;

export type MsgCtx = {
  senderId: string;
  userName: string;
  profileUrl: string | null;
  rawMessageText: string;
  pageAccessToken: string;
  pageId: string | undefined;
  config: AppConfig;
};

export async function handlePreOrderSession(ctx: MsgCtx): Promise<boolean> {
  const { senderId, userName, profileUrl, rawMessageText, pageAccessToken, pageId } = ctx;

  const [preOrderSession] = await db.select().from(preOrderSessionsTable)
    .where(eq(preOrderSessionsTable.fbUserId, senderId)).limit(1);
  if (!preOrderSession) return false;

  await saveConversation({ fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl, message: rawMessageText, sender: "user" });

  if (preOrderSession.step === "awaiting_name") {
    const trimmedName = rawMessageText.trim();
    if (trimmedName.length < 2) {
      const nameErr = "يرجى إرسال اسمك الكامل (على الأقل حرفان).";
      await sendFbMessage(pageAccessToken, senderId, nameErr, pageId);
      await saveConversation({ fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl, message: nameErr, sender: "bot" });
      return true;
    }
    await db.update(preOrderSessionsTable)
      .set({ customerName: trimmedName, step: "awaiting_phone" })
      .where(eq(preOrderSessionsTable.fbUserId, senderId));
    const askPhone = `شكراً ${trimmedName}! 📱 الآن أرسل لي رقم هاتفك للتواصل معك عند توفر المنتج.`;
    await sendFbMessage(pageAccessToken, senderId, askPhone, pageId);
    await saveConversation({ fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl, message: askPhone, sender: "bot" });
    return true;
  }

  if (preOrderSession.step === "awaiting_phone") {
    const rawPhone = rawMessageText.trim();
    if (!isValidPhoneNumber(rawPhone)) {
      const phoneErr = "⚠️ رقم الهاتف غير صحيح.\nيرجى إرسال رقم مكوّن من:\n• 10 أرقام (مثال: 0551234567)\n• 12 رقمًا مع رمز الدولة (مثال: 213551234567)";
      await sendFbMessage(pageAccessToken, senderId, phoneErr, pageId);
      await saveConversation({ fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl, message: phoneErr, sender: "bot" });
      return true;
    }
    const phone = extractPhone(rawMessageText) ?? rawPhone;
    await db.insert(preOrdersTable).values({
      fbUserId: senderId,
      fbUserName: preOrderSession.customerName ?? userName,
      productId: preOrderSession.productId,
      productName: preOrderSession.productName,
      phone, status: "pending", createdAt: new Date(),
    }).onConflictDoNothing();
    await db.delete(preOrderSessionsTable).where(eq(preOrderSessionsTable.fbUserId, senderId));
    const confirmMsg =
      `✅ تم تسجيل طلبك المسبق لـ "${preOrderSession.productName}" بنجاح!\n` +
      `سيتم التواصل معك على الرقم ${phone} فور توفر المنتج.\nشكراً لك! 🙏`;
    await sendFbMessage(pageAccessToken, senderId, confirmMsg, pageId);
    await saveConversation({ fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl, message: confirmMsg, sender: "bot" });
    void logPlatformEvent("preorder_created", senderId, `product=${preOrderSession.productName} phone=${phone}`);
    return true;
  }

  return false;
}

export async function handleDeliverySession(ctx: MsgCtx): Promise<boolean> {
  const { senderId, userName, profileUrl, rawMessageText, pageAccessToken, pageId } = ctx;

  const [deliverySession] = await db.select().from(orderSessionsTable)
    .where(and(eq(orderSessionsTable.fbUserId, senderId), eq(orderSessionsTable.step, "choosing_delivery")))
    .limit(1);
  if (!deliverySession) return false;

  await saveConversation({ fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl, message: rawMessageText, sender: "user" });

  const msgLowerD      = rawMessageText.trim().toLowerCase();
  const isHomeIntent   = /منزل|home|بيت|دار|للمنزل|منزلي|بيتي/.test(msgLowerD);
  const isOfficeIntent = /مكتب|office|بريد|poste|للمكتب|bureau/.test(msgLowerD);

  if (isHomeIntent || isOfficeIntent) {
    await handleProductPayload(
      isHomeIntent ? "DELIVERY_HOME" : "DELIVERY_OFFICE",
      senderId, userName, pageAccessToken, pageId
    );
  } else {
    if (deliverySession.customerWilaya) {
      await sendDeliveryOptions(pageAccessToken, senderId, deliverySession.customerWilaya, pageId);
      await saveConversation({ fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl, message: `🚚 اختر نوع التوصيل إلى ${deliverySession.customerWilaya}:`, sender: "bot" });
    } else {
      const chooseMsg = "يرجى اختيار نوع التوصيل:";
      await sendFbMessage(pageAccessToken, senderId, chooseMsg, pageId);
      await saveConversation({ fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl, message: chooseMsg, sender: "bot" });
    }
  }
  return true;
}

export async function handleConfirmSession(ctx: MsgCtx): Promise<boolean> {
  const { senderId, userName, profileUrl, rawMessageText, pageAccessToken, pageId, config } = ctx;

  const [confirmSession] = await db.select().from(orderSessionsTable)
    .where(and(eq(orderSessionsTable.fbUserId, senderId), eq(orderSessionsTable.step, "awaiting_confirm")))
    .limit(1);
  if (!confirmSession || !confirmSession.deliveryType || !config.deliveryEnabled) return false;

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
  if (!wantsToChangeDelivery || !confirmSession.customerWilaya) return false;

  await saveConversation({ fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl, message: rawMessageText, sender: "user" });

  const isHomeMsg   = /منزل|home|بيت|دار/.test(msgLowerC);
  const isOfficeMsg = /مكتب|office|بريد|poste|bureau/.test(msgLowerC);

  if (isHomeMsg || isOfficeMsg) {
    await handleProductPayload(
      isHomeMsg ? "DELIVERY_HOME" : "DELIVERY_OFFICE",
      senderId, userName, pageAccessToken, pageId
    );
  } else {
    const changeMsg = "بالطبع! اختر نوع التوصيل الجديد:";
    await sendFbMessage(pageAccessToken, senderId, changeMsg, pageId);
    await sendDeliveryOptions(pageAccessToken, senderId, confirmSession.customerWilaya, pageId);
    await db.update(orderSessionsTable).set({ step: "choosing_delivery", updatedAt: new Date() })
      .where(eq(orderSessionsTable.fbUserId, senderId));
    await saveConversation({ fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl, message: changeMsg, sender: "bot" });
  }
  return true;
}

export async function handleOrderMidFlow(ctx: MsgCtx): Promise<boolean> {
  const { senderId, userName, profileUrl, rawMessageText, pageAccessToken, pageId, config } = ctx;

  const [activeOrderSession] = await db.select().from(orderSessionsTable)
    .where(eq(orderSessionsTable.fbUserId, senderId)).limit(1);
  if (!activeOrderSession || activeOrderSession.step !== "collecting") return false;

  const msgLowerOS = rawMessageText.trim().toLowerCase();

  const isDeliveryPriceInquiry =
    /سعر.*(توصيل|delivery)|توصيل.*(بقده|بكم|قديش|كم|سعر|ثمن|بكاش)|بقده.*توصيل|قديش.*توصيل|كم.*توصيل|delivery.*(price|cost)/i.test(msgLowerOS);

  if (isDeliveryPriceInquiry && config.deliveryEnabled) {
    await saveConversation({ fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl, message: rawMessageText, sender: "user" });

    const wilayaFromMsg = resolveWilaya(rawMessageText, ALGERIA_WILAYAS);
    const wilayaToUse   = wilayaFromMsg ?? activeOrderSession.customerWilaya;

    if (wilayaToUse) {
      const wilayaRec = ALGERIA_WILAYAS.find((w) => w.wilayaName === wilayaToUse);
      const [wp] = wilayaRec
        ? await db.select().from(deliveryPricesTable).where(eq(deliveryPricesTable.wilayaId, wilayaRec.wilayaId)).limit(1)
        : await db.select().from(deliveryPricesTable).where(eq(deliveryPricesTable.wilayaName, wilayaToUse)).limit(1);

      const currency = config.currency ?? "DZD";
      const fmtPrice = (p: number | null | undefined) => (!p || p === 0) ? "مجاني 🎁" : `${p} ${currency}`;
      const deliveryInfoMsg = wp
        ? `🚚 سعر التوصيل إلى ولاية ${wilayaToUse}:\n🏠 توصيل للمنزل: ${fmtPrice(wp.homePrice)}\n🏢 مكتب البريد: ${fmtPrice(wp.officePrice)}\n\nهل تريد المتابعة في إتمام طلبك؟`
        : `⚠️ لم نجد سعر التوصيل لولاية "${wilayaToUse}" حالياً. تواصل معنا مباشرة للاستفسار.\n\nهل تريد المتابعة في إتمام طلبك؟`;
      await sendFbMessage(pageAccessToken, senderId, deliveryInfoMsg, pageId);
      await saveConversation({ fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl, message: deliveryInfoMsg, sender: "bot" });
    } else {
      const allPrices = await db.select().from(deliveryPricesTable);
      const currency  = config.currency ?? "DZD";
      const fmtP = (p: number | null | undefined) => (!p || p === 0) ? "مجاني" : `${p} ${currency}`;
      const sample    = allPrices.slice(0, 8);
      const priceMsg  = allPrices.length > 0
        ? `🚚 أسعار التوصيل حسب الولاية:\n${sample.map((w) => `• ${w.wilayaName}: 🏠 ${fmtP(w.homePrice)} / 🏢 ${fmtP(w.officePrice)}`).join("\n")}${allPrices.length > 8 ? `\n...و ${allPrices.length - 8} ولاية أخرى.` : ""}\n\nأرسل اسم ولايتك لمعرفة سعرها الدقيق.`
        : "🚚 للاستفسار عن أسعار التوصيل، تواصل معنا مباشرة.";
      await sendFbMessage(pageAccessToken, senderId, priceMsg, pageId);
      await saveConversation({ fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl, message: priceMsg, sender: "bot" });
    }
    return true;
  }

  const isProductChangeIntent =
    /\b(بدي|أريد|اريد|نبغي|حابب|عندي نية|بغيت).{0,15}(منتج|هاتف|جهاز|شيء|حاجة).{0,10}(غير|ثاني|آخر|اخر|بديل)\b/i.test(msgLowerOS) ||
    /\b(مارايك|مراك|رايك|رأيك).{0,15}(هاتف|منتج|جهاز|اخر|آخر|ثاني)\b/i.test(msgLowerOS) ||
    /\b(غير|بدّل|بدل|بدله|غيره).{0,10}(المنتج|الطلب|الهاتف|الجهاز)\b/i.test(msgLowerOS) ||
    /\b(ما.{0,5}(اريد|أريد|نبغي|حابب).{0,10}(هذا|هاذا|هذه)).{0,10}(منتج|هاتف|جهاز)?\b/i.test(msgLowerOS) ||
    /\b(منتج|هاتف|جهاز).{0,10}(آخر|اخر|ثاني|غير|بديل)\b/i.test(msgLowerOS);

  if (isProductChangeIntent) {
    await db.delete(orderSessionsTable).where(eq(orderSessionsTable.fbUserId, senderId));
  }

  return false;
}
