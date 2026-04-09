/**
 * Exact Match Cache — طبقة كاش للردود المتكررة
 *
 * تعمل على المبدأ التالي:
 *   cache key = hash(رسالة_منظَّمة) + ":" + hash(المنتجات_المتاحة_مع_أسعارها)
 *
 * القواعد:
 *   - رسائل الضمائر (هو، سعره، ذلك...) لا تُخزَّن
 *   - المستخدم مع activeProduct لا يُخدَم من الكاش
 *   - المستخدم في جلسة تسوق نشطة (activeCategory) لا يُخدَم من الكاش
 *   - الردود التي تحتوي JSON أوامر شراء لا تُخزَّن
 *   - TTL: 4 ساعات (يبطل تلقائياً عند تغيير أسعار المنتجات لأن hash يتغير)
 */

import crypto from "crypto";
import { rGet, rSet } from "./redisCache.js";

const EXACT_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 ساعات

// ── الكلمات التي تجعل الرد مرتبطاً بالسياق — لا يُكاش ──────────────────────
const CONTEXT_WORDS_AR = [
  "هو", "هي", "هم", "هذا", "هذه", "هذاه", "ذلك", "تلك",
  "سعره", "ثمنه", "كم سعره", "كم ثمنه", "بكم", "بشحاله",
  "طلبي", "طلبك", "أنا", "معي", "عندي", "لي", "لديك", "فيه",
];
const CONTEXT_PATTERN_AR = new RegExp(`\\b(${CONTEXT_WORDS_AR.join("|")})\\b`, "i");
const CONTEXT_PATTERN_EN = /\b(it|its|this one|that one|them|they|my order|your price)\b/i;

function hasContextDependentWords(text: string): boolean {
  return CONTEXT_PATTERN_AR.test(text) || CONTEXT_PATTERN_EN.test(text);
}

// ── تطبيع النص قبل بناء الـ hash ─────────────────────────────────────────────
function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")    // توحيد الهمزات
    .replace(/[ىي]/g, "ي")     // توحيد الياء
    .replace(/ة/g, "ه")        // توحيد التاء المربوطة
    .replace(/\s+/g, " ")      // توحيد المسافات
    .replace(/[?؟!،,.]/g, "")  // إزالة علامات الترقيم
    .replace(/\u064B-\u065F/g, ""); // إزالة التشكيل
}

// ── hash النص المحوَّل (10 chars) ────────────────────────────────────────────
function hashText(text: string): string {
  return crypto.createHash("md5").update(normalizeText(text)).digest("hex").substring(0, 10);
}

// ── hash المنتجات (8 chars) — يتغير عند تغيير سعر أو مخزون أي منتج ──────────
function hashProducts(
  products: Array<{
    id: number;
    name: string;
    originalPrice?: number | null;
    discountPrice?: number | null;
    stockQuantity: number;
  }>
): string {
  const sig = products
    .map((p) => `${p.id}:${p.name}:${p.originalPrice ?? 0}:${p.discountPrice ?? 0}:${p.stockQuantity}`)
    .join("|");
  return crypto.createHash("md5").update(sig).digest("hex").substring(0, 8);
}

// ── بناء مفتاح الكاش ──────────────────────────────────────────────────────────
export function buildCacheKey(
  messageText: string,
  availableProducts: Array<{
    id: number;
    name: string;
    originalPrice?: number | null;
    discountPrice?: number | null;
    stockQuantity: number;
  }>
): string {
  return `exact:${hashText(messageText)}:${hashProducts(availableProducts)}`;
}

// ── هل هذه الرسالة مؤهلة للبحث في الكاش؟ ────────────────────────────────────
export function isCacheable(
  messageText: string,
  hasActiveProduct: boolean,
  hasActiveShoppingCategory: boolean
): boolean {
  if (messageText.length < 4) return false;           // رسالة قصيرة جداً
  if (hasActiveProduct) return false;                 // سياق منتج محدد
  if (hasActiveShoppingCategory) return false;        // جلسة تصفح نشطة
  if (hasContextDependentWords(messageText)) return false; // ضمائر إشارية
  return true;
}

// ── هل الرد مؤهل للتخزين؟ ────────────────────────────────────────────────────
export function isResponseStorable(replyText: string): boolean {
  if (replyText.length < 20) return false;            // رد قصير جداً
  if (replyText.length > 2000) return false;          // رد طويل جداً (مخصص)
  if (replyText.includes('"action"')) return false;   // يحتوي JSON أوامر شراء
  if (replyText.includes("orderRef")) return false;   // يحتوي رقم طلب
  if (replyText.includes("ORDER-")) return false;     // رقم طلب بصيغة أخرى
  return true;
}

// ── قراءة من الكاش ───────────────────────────────────────────────────────────
export async function getCachedReply(cacheKey: string): Promise<string | undefined> {
  return rGet<string>(cacheKey);
}

// ── تخزين في الكاش ───────────────────────────────────────────────────────────
export async function storeCachedReply(cacheKey: string, replyText: string): Promise<void> {
  await rSet(cacheKey, replyText, EXACT_CACHE_TTL_MS);
}

// ── حذف كل مفاتيح الكاش (عند تعديل المنتجات) ────────────────────────────────
// ملاحظة: hash المنتجات يتغير تلقائياً عند أي تعديل،
// لذا الحذف اليدوي غير ضروري في معظم الحالات،
// لكنه متاح كـ fallback عند الحاجة.
export const EXACT_CACHE_PREFIX = "exact:";
