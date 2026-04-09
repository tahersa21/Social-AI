/**
 * priceVerification.ts — طبقة الحماية الثانية للأسعار
 *
 * متى تعمل:
 *   بعد رد الـ AI مباشرةً، قبل إرسال أي رسالة للعميل.
 *   تُفعَّل فقط عندما يذكر الـ AI سعراً بجانب اسم منتج موجود في الكتالوج.
 *
 * ما تفعله:
 *   1. تستخرج كل الأسعار المذكورة في الرد
 *   2. تربط كل سعر بالمنتج الذي ذُكر بالقرب منه
 *   3. تقارن بسعر DB الحقيقي
 *   4. إذا وُجد تناقض → تستبدل الرد برسالة آمنة
 *
 * ما لا تفعله (لتجنب الإيجابيات الكاذبة):
 *   - لا تفحص الأسعار المذكورة بدون اسم منتج (رسوم شحن، كميات، خصومات)
 *   - لا تفحص الأسعار المذكورة في سياق تاريخي ("كان سعره...")
 */

import type { Product } from "@workspace/db";

export type PriceVerifyResult =
  | { safe: true }
  | { safe: false; reason: string; corrected: string };

// ── استخراج الأسعار ────────────────────────────────────────────────────────────

/** تحويل الأرقام العربية لأرقام لاتينية */
function normalizeArabicNumerals(s: string): string {
  return s
    .replace(/٠/g, "0").replace(/١/g, "1").replace(/٢/g, "2")
    .replace(/٣/g, "3").replace(/٤/g, "4").replace(/٥/g, "5")
    .replace(/٦/g, "6").replace(/٧/g, "7").replace(/٨/g, "8")
    .replace(/٩/g, "9");
}

/** تحويل نص رقم (قد يحتوي فواصل/نقاط) إلى عدد عشري */
function parsePrice(raw: string): number | null {
  const clean = normalizeArabicNumerals(raw)
    .replace(/\s/g, "")
    .replace(/,/g, "");
  const n = parseFloat(clean);
  return isNaN(n) || n <= 0 ? null : n;
}

interface PriceMention {
  value: number;
  index: number;
}

/**
 * يستخرج كل الأسعار المذكورة في النص مع موقعها
 * يبحث عن: "95000 دج" / "95,000 DZD" / "٩٥٠٠٠ دينار" إلخ.
 */
function extractPriceMentions(text: string): PriceMention[] {
  const results: PriceMention[] = [];
  const re = /(\d[\d,.\s]{0,9})\s*(دج|dzd|da\b|دينار|ريال|درهم|جنيه|sar\b|mad\b|egp\b)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const val = parsePrice(m[1]!);
    if (val !== null && val >= 10) {
      results.push({ value: val, index: m.index });
    }
  }
  return results;
}

// ── ربط السعر بالمنتج ─────────────────────────────────────────────────────────

const HISTORY_MARKERS = /كان سعره|كان يكلف|سابقاً|قديماً|previously|used to|was priced/i;

/**
 * يبحث عن سعر مذكور بالقرب من اسم منتج محدد (خلال 100 حرف)
 * يتجاهل الأسعار في سياق تاريخي (كان سعره...)
 */
function findPriceNearProductName(
  text: string,
  productName: string,
  priceMentions: PriceMention[]
): number | null {
  const textLower = text.toLowerCase();
  const nameLower = productName.toLowerCase();
  let searchFrom = 0;
  let closestPrice: number | null = null;
  let closestDist = Infinity;

  while (true) {
    const nameIdx = textLower.indexOf(nameLower, searchFrom);
    if (nameIdx === -1) break;

    const windowStart = Math.max(0, nameIdx - 30);
    const windowEnd   = nameIdx + productName.length + 100;
    const window      = text.slice(windowStart, windowEnd);

    if (HISTORY_MARKERS.test(window)) {
      searchFrom = nameIdx + 1;
      continue;
    }

    for (const pm of priceMentions) {
      if (pm.index < windowStart || pm.index > windowEnd) continue;
      const dist = Math.abs(pm.index - nameIdx);
      if (dist < closestDist) {
        closestDist  = dist;
        closestPrice = pm.value;
      }
    }
    searchFrom = nameIdx + 1;
  }

  return closestPrice;
}

// ── المقارنة مع قاعدة البيانات ────────────────────────────────────────────────

/** هامش تسامح 1% للتفاوت في التقريب */
function pricesMatch(stated: number, expected: number): boolean {
  if (expected === 0) return stated === 0;
  return Math.abs(stated - expected) / expected < 0.01;
}

function effectivePrice(p: Product): number | null {
  return p.discountPrice ?? p.originalPrice ?? null;
}

// ── الدالة الرئيسية ────────────────────────────────────────────────────────────

/**
 * يفحص رد الـ AI ويتحقق من صحة أي سعر مذكور بجانب اسم منتج
 *
 * @param replyText    النص الكامل لرد الـ AI
 * @param products     قائمة المنتجات المتاحة في المخزن (availableInStock)
 * @param activeProduct المنتج الذي يناقشه العميل حالياً (إن وُجد)
 * @returns { safe: true } أو { safe: false, reason, corrected }
 */
export function verifyReplyPrices(
  replyText:     string,
  products:      Product[],
  activeProduct?: Product
): PriceVerifyResult {

  const priceMentions = extractPriceMentions(replyText);

  // لا أسعار مذكورة → آمن تماماً
  if (priceMentions.length === 0) return { safe: true };

  // قائمة المنتجات للفحص: ابدأ بالمنتج النشط إذا وُجد
  const productsToCheck: Product[] = activeProduct
    ? [activeProduct, ...products.filter((p) => p.id !== activeProduct.id)]
    : products;

  for (const product of productsToCheck) {
    const dbPrice = effectivePrice(product);
    if (dbPrice === null) continue; // سعر غير محدد → يُعالَج بقاعدة الـ prompt

    const statedPrice = findPriceNearProductName(replyText, product.name, priceMentions);
    if (statedPrice === null) continue; // المنتج مذكور بدون سعر → لا مشكلة

    if (!pricesMatch(statedPrice, dbPrice)) {
      const priceLabel = product.discountPrice != null
        ? `${product.discountPrice.toLocaleString("fr-DZ")} دج (بعد التخفيض من ${product.originalPrice?.toLocaleString("fr-DZ")} دج)`
        : `${dbPrice.toLocaleString("fr-DZ")} دج`;

      return {
        safe:      false,
        reason:    `price_mismatch: product="${product.name}" stated=${statedPrice} db=${dbPrice}`,
        corrected: `سعر ${product.name} هو ${priceLabel}. للاستفسار أو الطلب تواصل معنا مباشرة. 🙏`,
      };
    }
  }

  return { safe: true };
}
