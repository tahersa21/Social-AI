// ── AI Safety Filters & Detection Utilities ───────────────────────────────────
// Pure pattern-matching functions — no external dependencies.
// Extracted from ai.ts for clarity; re-exported via ai.ts for backward compat.

// ── Safe Mode: jailbreak / prompt-injection patterns ─────────────────────────
const JAILBREAK_PATTERNS: RegExp[] = [
  /ignore\s+(all|previous|your|the)\s+(previous\s+|prior\s+|above\s+)?(instructions?|system\s*prompt|rules?|guidelines?)/i,
  /forget\s+(everything|all|your|the)\s+(previous\s+|prior\s+)?(instructions?|rules?|training)/i,
  /you\s+are\s+now\s+(a|an|my|the)\s+/i,
  /pretend\s+(you\s+are|to\s+be|you'?re)/i,
  /act\s+as\s+(if\s+you\s+are|a|an|my|the)\s+/i,
  /roleplay\s+as\b/i,
  /do\s+anything\s+now/i,
  /\bDAN\s+mode\b/i,
  /developer\s+mode/i,
  /override\s+(your\s+|the\s+)?(instructions?|system|safety|filters?)/i,
  /bypass\s+(your\s+|the\s+)?(restrictions?|safety|filters?|guidelines?)/i,
  /reveal\s+(your|the)\s+(instructions?|system\s*prompt|prompt)/i,
  /what\s+(are|were)\s+your\s+instructions/i,
  /show\s+me\s+(your|the)\s+(instructions?|system\s*prompt)/i,
  /print\s+(your|the)\s+(instructions?|system\s*prompt|prompt)/i,
  /repeat\s+(your|the)\s+(instructions?|system\s*prompt)/i,
  /\bsystem\s*prompt\b/i,
  /\bjailbreak\b/i,
  /تجاهل\s+التعليمات/i,
  /انس\s+التعليمات/i,
  /تجاهل\s+كل/i,
  /تصرف\s+كأنك/i,
  /الآن\s+أنت/i,
  /الوضع\s+المطور/i,
  /تجاوز\s+القيود/i,
  /أظهر\s+التعليمات/i,
  /ما\s+هي\s+تعليماتك/i,
  /اكشف\s+عن\s+(تعليماتك|النظام)/i,
];

// ── Safe Mode: reply instruction-leak patterns (strict mode only) ─────────────
const REPLY_LEAK_PATTERNS: RegExp[] = [
  /my\s+system\s+prompt/i,
  /my\s+instructions?\s+(say|tell|are|is)/i,
  /i\s+(have\s+been|was)\s+instructed/i,
  /according\s+to\s+my\s+(instructions?|guidelines?|system\s*prompt)/i,
  /my\s+(training|guidelines)\s+(say|tell)/i,
  /as\s+instructed\s+by/i,
  /my\s+prompt\s+(says?|tells?|instructs?)/i,
  /تعليماتي\s+تقول/i,
  /البرومبت\s+الخاص\s+بي/i,
  /نظامي\s+يقول/i,
];

export function detectJailbreak(text: string): boolean {
  return JAILBREAK_PATTERNS.some((p) => p.test(text));
}

export function detectReplyLeak(text: string): boolean {
  return REPLY_LEAK_PATTERNS.some((p) => p.test(text));
}

// ── PHASE 4 TASK 2: Sales Trigger Detection ───────────────────────────────────
export type SalesTriggerType =
  | "price_inquiry"
  | "buying_intent"
  | "hesitation"
  | "discount_request"
  | "comparison"
  | null;

const SALES_TRIGGERS: Array<{ type: Exclude<SalesTriggerType, null>; patterns: RegExp[] }> = [
  {
    type: "price_inquiry",
    patterns: [
      /\bالسعر\b|\bثمن\b|\bكم\b|\bبكم\b|\bبقداش\b|\bتمن\b|\bسعر\b|\bprice\b|\bhow much\b|\bcost\b/i,
    ],
  },
  {
    type: "buying_intent",
    patterns: [
      /\bأريد\b|\bأبغى\b|\bابغى\b|\bنبي\b|\bبغيت\b|\bعاوز\b|\bعايز\b|\bطلب\b|\bاشتري\b|\bبي\b|\bbuy\b|\border\b|\bwant\b|\bpurchase\b/i,
    ],
  },
  {
    type: "hesitation",
    patterns: [
      /\bغالي\b|\bمش متأكد\b|\bما عارف\b|\bما أعرف\b|\bمحتاج أفكر\b|\bنفكر\b|\bمو ضروري\b|\bexpensive\b|\bnot sure\b|\bneed to think\b|\bdunno\b/i,
    ],
  },
  {
    type: "discount_request",
    patterns: [
      /\bخصم\b|\bتخفيض\b|\bرخيص\b|\bأقل\b|\bنقصان\b|\bdiscount\b|\bpromo\b|\bdeal\b|\bcoupon\b|\boffer\b/i,
    ],
  },
  {
    type: "comparison",
    patterns: [
      /\bأفضل\b|\bفرق\b|\bمقارنة\b|\bإيهم\b|\bأيهم\b|\bالأحسن\b|\bأي واحد\b|\bأنسب\b|\bbetter\b|\bdifference\b|\bcompare\b|\bvs\b|\bversus\b/i,
    ],
  },
];

export function detectSalesTrigger(text: string): SalesTriggerType {
  for (const trigger of SALES_TRIGGERS) {
    if (trigger.patterns.some((p) => p.test(text))) {
      return trigger.type;
    }
  }
  return null;
}

// Exported because buildSystemPrompt in ai.ts uses it to inject sales context.
export const SALES_TRIGGER_CONTEXT: Record<Exclude<SalesTriggerType, null>, string> = {
  price_inquiry:
    "The customer is asking about price. Mention the exact price clearly, highlight value for money, and invite them to order. If multiple products fit, list prices concisely.",
  buying_intent:
    "The customer shows strong buying intent. Guide them gently toward completing the order. Confirm product availability, suggest sizes/colors/variants if relevant, and offer to start the order now.",
  hesitation:
    "The customer seems hesitant. Acknowledge their concern, reassure with benefits (quality, warranty, fast delivery), offer social proof if available, and ask what's holding them back.",
  discount_request:
    "The customer is asking for a discount or better price. Be honest about pricing policy. You may mention any active offers or bundles. Do not invent discounts not confirmed by the store.",
  comparison:
    "The customer is comparing products or asking which is better. Give an honest, helpful comparison highlighting the best fit for their needs. Guide them toward the most suitable product.",
};

// ── كشف نية حجز الموعيد ──────────────────────────────────────────────────────
const BOOKING_KEYWORDS = [
  "حجز", "موعد", "أريد حجز", "ابي حجز", "بغيت موعد", "نحجز", "نحجزلي",
  "appointment", "book", "booking", "réservation", "rendez-vous", "rdv",
  "réserver", "prendre rendez", "متى تكونون", "الأوقات المتاحة", "وقت فراغ",
  "دور", "قائمة الانتظار", "فترة", "ميعاد", "تحجزلي", "هل يمكنني الحجز",
];

export function detectBookingIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return BOOKING_KEYWORDS.some((kw) => lower.includes(kw));
}
