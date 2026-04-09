import { db, commentsLogTable, aiConfigTable, fbSettingsTable, productsTable, userProductContextTable, conversationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { callAIWithLoadBalancing, sendFbMessage, buildCommentSystemPrompt } from "./ai.js";

// ── قفل في الذاكرة لمنع race condition ──────────────────────────────────────
const _processingComments = new Set<string>();

type AppConfig  = typeof aiConfigTable.$inferSelect;
type FbSettings = typeof fbSettingsTable.$inferSelect;
type Product    = typeof productsTable.$inferSelect;

export type CommentChangeValue = {
  item?: string;
  comment_id?: string;
  post_id?: string;
  from?: { id: string; name?: string };
  message?: string;
  sender_id?: string;
};

// ── إزالة التشكيل والتطبيع ───────────────────────────────────────────────────
function normalize(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, "") // إزالة التشكيل
    .replace(/[أإآا]/g, "ا")               // توحيد الألف
    .replace(/ة/g, "ه")                    // توحيد التاء المربوطة
    .replace(/ى/g, "ي")                    // توحيد الياء
    .replace(/[-_،,]/g, " ")               // فواصل → مسافة
    .replace(/\s+/g, " ")                  // مسافات متعددة → واحدة
    .toLowerCase()
    .trim();
}

// ── كلمات الوقف العربية والأجنبية التي تُحذف من المطابقة ───────────────────
const STOP_WORDS = new Set([
  "في","من","إلى","على","عن","مع","هذا","هذه","التي","الذي","وهو","وهي",
  "كان","كانت","لكن","أو","أن","قد","كل","هل","لا","ما","لي","إن","عند",
  "the","a","an","of","in","on","for","with","and","or","is","are","this",
  "le","la","les","de","du","des","et","ou","un","une","avec",
]);

function significantWords(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

// ── مطابقة المنتج من نص المنشور بنظام النقاط ────────────────────────────────
export function matchProductFromText(
  postText: string,
  products: Pick<Product, "id" | "name" | "category" | "brand" | "itemType">[],
): (Pick<Product, "id" | "name" | "category" | "brand" | "itemType"> & { score: number }) | null {
  const postNorm  = normalize(postText);
  const postWords = significantWords(postText);

  let best: (typeof products[0] & { score: number }) | null = null;

  for (const p of products) {
    const nameParts  = [p.name, p.brand, p.category, p.itemType].filter(Boolean) as string[];
    const fullLabel  = nameParts.join(" ");
    const labelNorm  = normalize(fullLabel);
    const labelWords = significantWords(fullLabel);

    let score = 0;

    // 1) مطابقة تامة للاسم الكامل
    if (postNorm.includes(labelNorm)) {
      score = 100;
    } else {
      // 2) عدد الكلمات المفتاحية الموجودة في المنشور
      const matched = labelWords.filter(w => postWords.includes(w) || postNorm.includes(w));
      if (labelWords.length > 0) {
        const ratio = matched.length / labelWords.length;
        if (ratio >= 1)    score = 90;          // جميع الكلمات
        else if (ratio >= 0.7) score = 70;      // 70%+ من الكلمات
        else if (ratio >= 0.5) score = 50;      // نصف الكلمات
        else if (matched.length >= 1 && labelWords.length <= 2) score = 35; // كلمة مميزة واحدة
      }
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { ...p, score };
    }
  }

  // نتجاهل النتائج الضعيفة جداً
  return (best && best.score >= 35) ? best : null;
}

// ── كشف نية التعليق بدون AI (توفير التوكن) ─────────────────────────────────
type CommentIntent = "price" | "specs" | "availability" | "order" | "general";

function detectIntent(commentText: string): CommentIntent {
  const t = normalize(commentText);
  if (/سعر|بكم|كم ثمن|prix|price|cost|ثمن|تمن|ك قيمة/.test(t)) return "price";
  if (/مواصفات|وصف|تفاصيل|معلومات|كيف|شرح|specs|detail|feature/.test(t)) return "specs";
  if (/متوفر|موجود|stock|dispo|available/.test(t)) return "availability";
  if (/طلب|اشتري|اشترى|commande|order|acheter/.test(t)) return "order";
  return "general";
}

// ── بناء prompt DM مع منتج محدد ─────────────────────────────────────────────
function buildCommentDmPrompt(
  config: AppConfig,
  product: Product,
  intent: CommentIntent,
): string {
  const currency = config.currency ?? "DZD";
  const priceStr = product.discountPrice != null
    ? `${product.discountPrice} ${currency} (بدل ${product.originalPrice} ${currency})`
    : `${product.originalPrice ?? "?"} ${currency}`;

  const intentGuide: Record<CommentIntent, string> = {
    price:        "العميل يسأل عن السعر — ابدأ بالسعر مباشرة بدون مقدمة.",
    specs:        "العميل يسأل عن المواصفات — اذكر التفاصيل المتوفرة مباشرة.",
    availability: "العميل يسأل عن التوفر — أخبره بالمخزون مباشرة.",
    order:        "العميل يريد الطلب — استقبله وأرشده لخطوات الشراء.",
    general:      "قدّم معلومات مفيدة عن المنتج ومميزاته.",
  };

  const productBlock = [
    `المنتج: ${product.name}`,
    product.description ? `الوصف: ${product.description.substring(0, 300)}` : "",
    `السعر: ${priceStr}`,
    product.brand    ? `العلامة التجارية: ${product.brand}` : "",
    product.category ? `الفئة: ${product.category}`        : "",
    product.stockQuantity > 0
      ? `التوفر: متوفر (${product.stockQuantity} قطعة)`
      : "التوفر: غير متوفر حالياً",
  ].filter(Boolean).join("\n");

  return `أنت ${config.botName ?? "مساعد المتجر"} — هذه رسالة خاصة لعميل علّق على منشور عن منتجنا.

معلومات المنتج:
${productBlock}

توجيه: ${intentGuide[intent]}

قواعد:
- رد مباشر ومختصر (2-4 جمل)
- لا تقل "كيف أساعدك" أو "ما الذي تريده" — أنت تعرف ما يريد
- لا تقل "راسلنا" أو "تواصل معنا" — أنت تكلمه الآن
- اكتب بنفس لغة العميل (عربية/فرنسية/إنجليزية)
- لا JSON في ردك

النشاط: ${config.businessDomain ?? "عام"} | البلد: ${config.businessCountry ?? ""}`;
}

// ── بناء prompt DM عام (بدون منتج محدد) ────────────────────────────────────
function buildGeneralDmPrompt(
  config: AppConfig,
  postText: string,
  intent: CommentIntent,
): string {
  const intentGuide: Record<CommentIntent, string> = {
    price:        "العميل يسأل عن السعر — أجب بأفضل ما لديك أو اطلب توضيح المنتج بلطف.",
    specs:        "العميل يسأل عن المواصفات — أجب بما تعرفه عن المنشور.",
    availability: "العميل يسأل عن التوفر — أجب بما تعرفه.",
    order:        "العميل يريد الطلب — استقبله وأرشده.",
    general:      "أجب على استفسار العميل بشكل مفيد.",
  };

  return `أنت ${config.botName ?? "مساعد المتجر"} — هذه رسالة خاصة (Messenger) لعميل علّق على منشور في صفحتنا.

${postText ? `محتوى المنشور الذي علّق عليه:\n"${postText.substring(0, 400)}"` : ""}

توجيه: ${intentGuide[intent]}

قواعد:
- رد مباشر ومفيد (2-4 جمل)
- لا تقل "راسلنا" أو "تواصل معنا" — أنت تكلمه الآن في الخاص
- لا تقل "كيف أساعدك" إذا كانت النية واضحة
- اكتب بنفس لغة العميل (عربية/فرنسية/إنجليزية)
- لا JSON في ردك

النشاط: ${config.businessDomain ?? "عام"} | البلد: ${config.businessCountry ?? ""}`;
}

// ── رد على التعليق عبر Graph API ────────────────────────────────────────────
async function replyToComment(
  commentId: string,
  message: string,
  pageAccessToken: string,
): Promise<void> {
  const url = `https://graph.facebook.com/v25.0/${commentId}/comments?access_token=${pageAccessToken}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const data = (await resp.json()) as { id?: string; error?: { message: string; code: number } };
  if (data.error) {
    throw new Error(`FB API error ${resp.status}: ${JSON.stringify(data)}`);
  }
}

// ── جلب نص المنشور من Graph API ─────────────────────────────────────────────
async function fetchPostText(postId: string, pageAccessToken: string): Promise<string> {
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v25.0/${postId}?fields=message,story&access_token=${pageAccessToken}`
    );
    if (!resp.ok) return "";
    const data = await resp.json() as { message?: string; story?: string };
    return (data.message ?? data.story ?? "").trim();
  } catch {
    return "";
  }
}

// ── حفظ سياق المنتج في DB ────────────────────────────────────────────────────
async function saveProductContext(senderId: string, productId: number, productName: string): Promise<void> {
  try {
    await db
      .insert(userProductContextTable)
      .values({ fbUserId: senderId, productId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userProductContextTable.fbUserId,
        set: { productId, updatedAt: new Date() },
      });
    console.log(`[commentHandler] Product context saved for ${senderId}: ${productName}`);
  } catch (err) {
    console.error("[commentHandler] Failed to save product context:", (err as Error).message);
  }
}

// ── المعالج الرئيسي ───────────────────────────────────────────────────────────
export async function handlePageComment(
  val: CommentChangeValue,
  settings: FbSettings,
  config: AppConfig,
): Promise<void> {
  const commentId   = val.comment_id ?? "";
  const postId      = val.post_id    ?? "";
  const senderId    = val.from?.id   ?? val.sender_id ?? "";
  const commentText = val.message    ?? "";
  const userName    = val.from?.name ?? senderId;
  const profileUrl  = `https://www.facebook.com/${senderId}`;

  // ── منع التكرار (طبقة 1): قفل في الذاكرة ────────────────────────────────────
  if (commentId) {
    if (_processingComments.has(commentId)) {
      console.log(`[commentHandler] In-flight duplicate ${commentId} — skipping`);
      return;
    }
    _processingComments.add(commentId);
  }

  try {
    // ── منع التكرار (طبقة 2): فحص DB ─────────────────────────────────────────
    if (commentId) {
      const [existing] = await db
        .select({ id: commentsLogTable.id })
        .from(commentsLogTable)
        .where(eq(commentsLogTable.commentId, commentId))
        .limit(1);
      if (existing) {
        console.log(`[commentHandler] DB duplicate comment ${commentId} — skipping`);
        return;
      }
    }

    // ── جلب نص المنشور ────────────────────────────────────────────────────────
    let postText = "";
    if (postId && settings.pageAccessToken) {
      postText = await fetchPostText(postId, settings.pageAccessToken);
      if (postText) {
        console.log(`[commentHandler] Post fetched (${postText.length} chars) for ${postId}`);
      }
    }

    // ── مطابقة المنتج من نص المنشور ──────────────────────────────────────────
    let matchedProduct: Product | null = null;
    if (postText) {
      const allProducts = await db
        .select()
        .from(productsTable)
        .where(eq(productsTable.status, "available"));

      const match = matchProductFromText(postText, allProducts);
      if (match) {
        // جلب كامل بيانات المنتج المطابق
        const [full] = await db
          .select()
          .from(productsTable)
          .where(eq(productsTable.id, match.id))
          .limit(1);
        matchedProduct = full ?? null;
        if (matchedProduct) {
          console.log(`[commentHandler] Matched product: "${matchedProduct.name}" (score=${match.score})`);
        }
      } else {
        console.log(`[commentHandler] No product matched in post text`);
      }
    }

    // ── كشف نية التعليق ───────────────────────────────────────────────────────
    const intent = detectIntent(commentText);
    console.log(`[commentHandler] Comment intent: ${intent}`);

    // ── استدعاء AI للتعليق العام (قصير، بدون أسعار) ──────────────────────────
    let publicCommentAiReply = "";
    try {
      const commentSystemPrompt = buildCommentSystemPrompt(config);
      const aiUserContent = postText
        ? `محتوى المنشور:\n"${postText}"\n\nتعليق العميل:\n"${commentText}"`
        : `تعليق العميل:\n"${commentText}"`;
      publicCommentAiReply = await callAIWithLoadBalancing(
        [{ role: "user", content: aiUserContent }],
        commentSystemPrompt,
      );
    } catch (err) {
      console.error("❌ Comment public reply AI error:", (err as Error).message);
    }

    // ── إرسال الـ DM ─────────────────────────────────────────────────────────
    let dmSent = 0;
    if (config.sendDmOnComment && senderId && settings.pageAccessToken) {
      let dmText = "";

      if (matchedProduct) {
        // استدعاء AI مُركَّز بمعلومات المنتج المطابق
        try {
          const dmSystemPrompt = buildCommentDmPrompt(config, matchedProduct, intent);
          const dmUserContent  = `العميل علّق على المنشور: "${commentText}"`;
          dmText = await callAIWithLoadBalancing(
            [{ role: "user", content: dmUserContent }],
            dmSystemPrompt,
          );
          console.log(`[commentHandler] DM sent with product context (intent: ${intent})`);
        } catch (err) {
          console.error("❌ DM AI error (product):", (err as Error).message);
        }
      } else {
        // لا يوجد منتج مطابق → prompt عام للـ DM (ليس prompt التعليق!)
        try {
          const dmSystemPrompt = buildGeneralDmPrompt(config, postText, intent);
          const dmUserContent  = `العميل علّق على منشور صفحتنا: "${commentText}"`;
          dmText = await callAIWithLoadBalancing(
            [{ role: "user", content: dmUserContent }],
            dmSystemPrompt,
          );
          console.log(`[commentHandler] DM sent with general context (intent: ${intent})`);
        } catch (err) {
          console.error("❌ DM AI error (general):", (err as Error).message);
        }
      }

      if (!dmText) {
        dmText = `مرحباً ${userName}! شكراً لتواصلك معنا، كيف يمكنني مساعدتك؟ 😊`;
      }

      try {
        // 1) حفظ سياق المنتج أولاً قبل الإرسال (await لا void — يمنع race condition)
        if (matchedProduct && senderId) {
          await saveProductContext(senderId, matchedProduct.id, matchedProduct.name);
        }

        // 2) إرسال الـ DM
        await sendFbMessage(settings.pageAccessToken, senderId, dmText, settings.pageId ?? undefined);
        dmSent = 1;
        console.log(`[commentHandler] DM sent to ${senderId}`);

        // 3) حفظ تعليق المستخدم + رد البوت في سجل المحادثة
        //    هذا يضمن أن AI يرى السياق الكامل عند الرد التالي
        if (senderId) {
          const userMsg = commentText
            ? `[تعليق على منشور] ${commentText}`
            : "[تعليق على منشور]";
          await db.insert(conversationsTable).values([
            {
              fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
              message: userMsg, sender: "user",
              sourceType: "comment", timestamp: new Date(),
            },
            {
              fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
              message: dmText, sender: "bot",
              sourceType: "comment_dm", timestamp: new Date(),
            },
          ]);
          console.log(`[commentHandler] Conversation saved for ${senderId}`);
        }
      } catch (err) {
        console.error("❌ Failed to send DM or save conversation:", (err as Error).message);
      }
    }

    // ── رد على التعليق العام ─────────────────────────────────────────────────
    if (commentId && settings.pageAccessToken) {
      const publicReply = dmSent
        ? `✅ ${userName ? `@${userName.split(" ")[0]} ` : ""}تم الرد عليك في الخاص 📩`
        : (publicCommentAiReply || "");

      if (publicReply) {
        try {
          await replyToComment(commentId, publicReply, settings.pageAccessToken);
          console.log(`✅ Public reply posted on comment ${commentId}`);
        } catch (err) {
          console.error("❌ Failed to post comment reply:", (err as Error).message);
        }
      }
    }

    // ── تسجيل في DB ──────────────────────────────────────────────────────────
    await db.insert(commentsLogTable).values({
      postId, commentId, fbUserId: senderId, fbUserName: userName,
      fbProfileUrl: profileUrl, commentText, aiReply: dmSent ? "DM sent" : publicCommentAiReply,
      dmSent, timestamp: new Date(),
    });

  } finally {
    if (commentId) _processingComments.delete(commentId);
  }
}
