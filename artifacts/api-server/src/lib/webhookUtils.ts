import { db, platformEventsTable } from "@workspace/db";
import crypto from "crypto";

// ── Rate limiters — hybrid Redis + in-memory (see rateLimit.ts) ──────────────
export { checkAttachmentRateLimit, checkTextRateLimit, checkWebhookRequestRate } from "./rateLimit.js";

// ── Replay attack protection — reject events older than 10 minutes ────────────
// Facebook timestamps are in milliseconds. Allows legitimate retries (< 10 min)
// while blocking captured-and-replayed payloads after the window.
const STALE_EVENT_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export function isStaleWebhookEvent(timestampMs: number | undefined): boolean {
  if (!timestampMs) return false; // no timestamp → let idempotency handle it
  return Date.now() - timestampMs > STALE_EVENT_THRESHOLD_MS;
}

// ── Frustration keywords that trigger Conversation Rescue ────────────────────
export const RESCUE_KEYWORDS = [
  "ما فهمت", "مش فاهم", "لا أفهم", "مافهمتش", "ما فهمتوش",
  "كلامك ما فهمتوش", "محتاج إنسان", "ابغى إنسان", "أريد إنسان",
  "بشري", "إنسان حقيقي", "human", "real person", "real human",
  "مش عارف", "ما عندكش حل", "ما تساعدنيش", "ما تنفعش",
  "مزعج", "محبط", "زهقت", "تعبت",
];

// ── Helper: log to platform_events table (fire-and-forget) ───────────────────
export async function logPlatformEvent(
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

// ── Webhook signature verification ───────────────────────────────────────────
export function verifyWebhookSignature(
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

// ── Sentiment analysis ────────────────────────────────────────────────────────
export function analyzeSentiment(text: string): "positive" | "negative" | "neutral" {
  const lower = text.toLowerCase();
  const positiveWords = ["شكرا", "شكراً", "ممتاز", "رائع", "جيد", "جيدة", "احسنت", "حلو", "عجبني", "حسن", "مشكور", "يسلمو", "بارك", "ممتازة", "واو", "بديع", "جميل", "رائعة", "تمام", "مرحبا", "مرحباً", "اهلا", "أهلاً", "great", "good", "excellent", "thanks", "thank", "amazing", "wonderful", "perfect"];
  const negativeWords = ["مشكلة", "غاضب", "سيء", "رديء", "ما عجبني", "مو عاجبني", "غير راضي", "زعلان", "كذب", "غش", "احتيال", "وحش", "مجنون", "مو حلو", "تاعبني", "مزعج", "bad", "terrible", "awful", "problem", "issue", "angry", "mad", "hate", "worst", "horrible", "disgusting"];
  let posScore = 0, negScore = 0;
  for (const w of positiveWords) if (lower.includes(w)) posScore++;
  for (const w of negativeWords) if (lower.includes(w)) negScore++;
  if (posScore > negScore) return "positive";
  if (negScore > posScore) return "negative";
  return "neutral";
}

// ── Phone extraction ──────────────────────────────────────────────────────────
export function extractPhone(text: string): string | null {
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

// ── Phone validation ──────────────────────────────────────────────────────────
export function isValidPhoneNumber(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 12;
}

// ── Email extraction ──────────────────────────────────────────────────────────
export function extractEmail(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

// ── Arabic text normalizer ────────────────────────────────────────────────────
export function normalizeAr(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[أإآ]/g, "ا")
    .replace(/[ئى]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F]/g, "")
    .toLowerCase();
}

// ── Wilaya aliases ────────────────────────────────────────────────────────────
export const WILAYA_ALIASES: Record<string, string> = {
  "شلف": "الشلف", "شليف": "الشلف", "chlef": "الشلف", "chelf": "الشلف",
  "اغواط": "الأغواط", "laghouat": "الأغواط",
  "ام البواقي": "أم البواقي", "oum el bouaghi": "أم البواقي",
  "batna": "باتنة",
  "بجاجة": "بجاية", "bgayet": "بجاية", "bgayeth": "بجاية", "bejaia": "بجاية",
  "biskra": "بسكرة",
  "blida": "البليدة",
  "bouira": "البويرة",
  "tamanrasset": "تمنراست", "تمنرست": "تمنراست",
  "tlemcen": "تلمسان",
  "tiaret": "تيارت",
  "تيزيوزو": "تيزي وزو", "تيزي": "تيزي وزو", "tizi": "تيزي وزو", "tizi ouzou": "تيزي وزو",
  "الجزائر": "الجزائر العاصمة", "العاصمة": "الجزائر العاصمة", "الجزاير": "الجزائر العاصمة", "جزاير": "الجزائر العاصمة",
  "alger": "الجزائر العاصمة", "algiers": "الجزائر العاصمة",
  "jelfa": "الجلفة", "djelfa": "الجلفة",
  "jijel": "جيجل",
  "ستيف": "سطيف", "setif": "سطيف", "sétif": "سطيف",
  "skikda": "سكيكدة",
  "sidi bel abbes": "سيدي بلعباس", "sba": "سيدي بلعباس",
  "بون": "عنابة", "annaba": "عنابة",
  "guelma": "قالمة",
  "قصنطينة": "قسنطينة", "كونستانتين": "قسنطينة", "constantine": "قسنطينة", "قسنطينه": "قسنطينة",
  "medea": "المدية", "مديه": "المدية",
  "mostaganem": "مستغانم", "مستغنم": "مستغانم",
  "مسيلة": "المسيلة", "msila": "المسيلة",
  "mascara": "معسكر",
  "ouargla": "ورقلة", "ورقله": "ورقلة",
  "oran": "وهران",
  "el bayadh": "البيض",
  "illizi": "إليزي", "اليزي": "إليزي",
  "برج": "برج بوعريريج", "bba": "برج بوعريريج", "bordj bou arreridj": "برج بوعريريج",
  "بومرد": "بومرداس", "boumerdes": "بومرداس",
  "el tarf": "الطارف",
  "tindouf": "تندوف",
  "tissemsilt": "تيسمسيلت",
  "واد سوف": "الوادي", "وادسوف": "الوادي", "وادي سوف": "الوادي",
  "بلاد سوف": "الوادي", "سوف": "الوادي", "el oued": "الوادي", "eloued": "الوادي",
  "khenchela": "خنشلة",
  "سوق اهراس": "سوق أهراس", "souk ahras": "سوق أهراس",
  "tipaza": "تيبازة", "تيبازه": "تيبازة",
  "mila": "ميلة",
  "ain defla": "عين الدفلى",
  "naama": "النعامة",
  "ain temouchent": "عين تموشنت",
  "ghardaia": "غرداية", "غردايه": "غرداية",
  "relizane": "غليزان",
  "touggourt": "تقرت",
  "djanet": "جانت",
  "el meghaier": "المغير",
  "el meniaa": "المنيعة",
  "bir el ater": "بئر العاتر", "بير العاتر": "بئر العاتر", "bir el-ater": "بئر العاتر",
  "وادي الفضة": "العريشة", "el arich": "العريشة", "el aricha": "العريشة",
};

// ── Wilaya resolver ───────────────────────────────────────────────────────────
export function resolveWilaya(
  input: string,
  ALGERIA_WILAYAS: Array<{ wilayaId: number; wilayaName: string }>
): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= 69) {
    const found = ALGERIA_WILAYAS.find((w) => w.wilayaId === num);
    if (found) return found.wilayaName;
  }

  const norm = normalizeAr(trimmed);
  const aliasMatch = Object.keys(WILAYA_ALIASES).find((k) => normalizeAr(k) === norm);
  if (aliasMatch) return WILAYA_ALIASES[aliasMatch]!;

  const exact = ALGERIA_WILAYAS.find((w) => w.wilayaName === trimmed);
  if (exact) return exact.wilayaName;

  const normExact = ALGERIA_WILAYAS.find((w) => normalizeAr(w.wilayaName) === norm);
  if (normExact) return normExact.wilayaName;

  const normPartial = ALGERIA_WILAYAS.find((w) => {
    const normW = normalizeAr(w.wilayaName);
    return normW.includes(norm) || norm.includes(normW);
  });
  if (normPartial) return normPartial.wilayaName;

  return null;
}

// ── Category emoji helper ─────────────────────────────────────────────────────
const CATEGORY_EMOJIS: Record<string, string> = {
  phones: "📱", هواتف: "📱", courses: "📚", كورسات: "📚", fashion: "👗", أزياء: "👗",
  food: "🍽️", طعام: "🍽️", electronics: "⚡", إلكترونيات: "⚡", beauty: "💄", جمال: "💄",
  cars: "🚗", سيارات: "🚗", real_estate: "🏠", عقارات: "🏠", general: "📦", عام: "📦",
  سعر: "💰", price: "💰", نوع: "🏷️", type: "🏷️", علامة: "🏷️", brand: "🏷️",
  ضعيف: "🟢", متوسط: "🟡", قوي: "🔴", قوية: "🔴",
};
export const getCatEmoji = (cat: string) => CATEGORY_EMOJIS[cat.toLowerCase()] ?? "🏷️";

// ── Category path builder ─────────────────────────────────────────────────────
export function buildCatFullPath(
  catId: number,
  allCats: Array<{ id: number; name: string; parentId: number | null }>
): string {
  const cat = allCats.find((c) => c.id === catId);
  if (!cat) return "";
  if (!cat.parentId) return cat.name;
  const parentPath = buildCatFullPath(cat.parentId, allCats);
  return parentPath ? `${parentPath}/${cat.name}` : cat.name;
}

// ── App base URL helper ───────────────────────────────────────────────────────
// Priority: APP_URL (any environment) → REPLIT_DOMAINS → REPLIT_DEV_DOMAIN
export function getAppBaseUrl(): string {
  if (process.env["APP_URL"]) return process.env["APP_URL"].replace(/\/$/, "");
  if (process.env["REPLIT_DOMAINS"]) {
    const domains = process.env["REPLIT_DOMAINS"].split(",").map((d) => d.trim()).filter(Boolean);
    if (domains.length > 0) return `https://${domains[0]}`;
  }
  if (process.env["REPLIT_DEV_DOMAIN"]) return `https://${process.env["REPLIT_DEV_DOMAIN"]}`;
  return "";
}

// ── Product image URL builder ─────────────────────────────────────────────────
export function buildProductImageUrl(productId: number, imageIndex: number): string {
  return `${getAppBaseUrl()}/api/products/image/${productId}/${imageIndex}`;
}

// ── Action parsers ────────────────────────────────────────────────────────────
export function parseSaveLeadAction(
  text: string
): { action: string; phone?: string; email?: string; notes?: string } | null {
  const match = text.match(/\{[\s\S]*?"action"\s*:\s*"save_lead"[\s\S]*?\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as { action: string; phone?: string; email?: string; notes?: string };
  } catch {
    return null;
  }
}

export function parseCheckOrderStatusAction(text: string): boolean {
  return /\{[\s\S]*?"action"\s*:\s*"check_order_status"[\s\S]*?\}/.test(text);
}
