/**
 * vertexAi.ts — مزود Vertex AI لـ Gemini
 *
 * يتصل بـ Vertex AI عبر Service Account JSON
 * ويدعم:
 *   - systemInstruction (مطلوب للمشروع — يحمل قواعد AI والكتالوج)
 *   - تاريخ المحادثة الكامل
 *   - الوسائط (صور) عبر inlineData
 *   - Token Cache في الذاكرة (50 دقيقة) لتجنب استدعاء Google في كل رسالة
 *
 * الاستخدام في ai.ts:
 *   import { callVertexAi } from "./vertexAi.js";
 *   // في callSingleProvider() → case "vertexai"
 */

import { GoogleAuth } from "google-auth-library";

// ─── الأنواع ───────────────────────────────────────────────────────────────────

export interface VertexAiConfig {
  projectId:          string;
  location:           string;
  modelName:          string;
  serviceAccountJson: string; // محتوى ملف JSON كاملاً
}

export interface VertexMessage {
  role:    "user" | "assistant";
  content: string;
}

export interface VertexMediaAttachment {
  mimeType: string;
  data:     string; // base64
}

// ─── الأنواع الداخلية لـ Vertex AI REST API ──────────────────────────────────

interface GeminiPart {
  text?:       string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiContent {
  role:  string;
  parts: GeminiPart[];
}

interface GeminiRequestBody {
  systemInstruction?: { parts: GeminiPart[] };
  contents:           GeminiContent[];
  generationConfig?: {
    temperature?:     number;
    maxOutputTokens?: number;
  };
}

// ─── Token Cache — يُجدَّد كل 50 دقيقة تلقائياً ───────────────────────────────

interface TokenCache {
  token:     string;
  expiresAt: number;
}

// مفتاح الـ cache: أول 20 حرف من الـ JSON (بما يكفي للتمييز بين حسابات مختلفة)
const _tokenCache = new Map<string, TokenCache>();

async function getVertexToken(serviceAccountJson: string): Promise<string> {
  const cacheKey = serviceAccountJson.substring(0, 20);
  const cached   = _tokenCache.get(cacheKey);

  if (cached && Date.now() < cached.expiresAt) {
    return cached.token; // ← 0ms، من الذاكرة
  }

  const credentials = JSON.parse(serviceAccountJson) as Record<string, unknown>;
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  const client        = await auth.getClient();
  const tokenResponse = await client.getAccessToken();

  if (!tokenResponse.token) {
    throw new Error("[vertexai] فشل الحصول على Access Token من Service Account");
  }

  _tokenCache.set(cacheKey, {
    token:     tokenResponse.token,
    expiresAt: Date.now() + 50 * 60 * 1000, // 50 دقيقة (Google tokens تنتهي بعد 60)
  });

  return tokenResponse.token;
}

// ─── بناء محتوى الطلب ─────────────────────────────────────────────────────────

/**
 * يحوِّل messages [{role, content}] إلى تنسيق Vertex AI
 *
 * messages = كل رسائل المحادثة بما فيها الأخيرة (الرسالة الحالية)
 * الرسالة الأخيرة يُمكن إضافة media إليها إذا وُجدت صورة
 */
function buildContents(
  messages:      VertexMessage[],
  media?:        VertexMediaAttachment,
): GeminiContent[] {
  if (messages.length === 0) return [];

  const contents: GeminiContent[] = messages.slice(0, -1).map((m) => ({
    role:  m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // الرسالة الأخيرة = الرسالة الحالية، قد تحمل صورة
  const lastMsg   = messages[messages.length - 1]!;
  const lastParts: GeminiPart[] = [];

  if (media) {
    lastParts.push({ inlineData: { mimeType: media.mimeType, data: media.data } });
  }

  if (lastMsg.content) {
    lastParts.push({ text: lastMsg.content });
  }

  contents.push({ role: "user", parts: lastParts });
  return contents;
}

/** استخراج النص من رد Vertex AI */
function extractText(data: unknown): string {
  const d = data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = d?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const raw = JSON.stringify(data).substring(0, 200);
    throw new Error(`[vertexai] رد فارغ من Vertex AI: ${raw}`);
  }
  return text;
}

// ─── الدالة الرئيسية — تُستدعى من ai.ts ─────────────────────────────────────

/**
 * callVertexAi — تُستدعى من callSingleProvider() في ai.ts
 *
 * @param config         إعدادات المزود (projectId, location, model, JSON)
 * @param messages       كل رسائل المحادثة [{role, content}] بما فيها الحالية
 * @param systemPrompt   system prompt كامل من buildSystemPrompt() (2000-3000 token)
 * @param media          صورة اختيارية (مُرفَقة بالرسالة الأخيرة)
 */
export async function callVertexAi(
  config:       VertexAiConfig,
  messages:     VertexMessage[],
  systemPrompt: string,
  media?:       VertexMediaAttachment,
): Promise<string> {
  const token    = await getVertexToken(config.serviceAccountJson);
  const contents = buildContents(messages, media);

  const body: GeminiRequestBody = { contents };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const url =
    `https://${config.location}-aiplatform.googleapis.com/v1` +
    `/projects/${config.projectId}` +
    `/locations/${config.location}` +
    `/publishers/google/models/${config.modelName}:generateContent`;

  const response = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text();

    // إذا انتهت صلاحية التوكن بشكل مبكر — نحذف الـ cache ويُجدَّد في الاستدعاء التالي
    if (response.status === 401) {
      _tokenCache.delete(config.serviceAccountJson.substring(0, 20));
    }

    throw new Error(`[vertexai] ${response.status}: ${errBody.substring(0, 300)}`);
  }

  return extractText(await response.json());
}

// ─── استدعاء multimodal (صورة / صوت) — للتحليل والتفريغ الصوتي ──────────────

/**
 * callVertexAiMultimodal — يُرسل نصاً + وسائط (صورة/صوت) لـ Vertex AI
 * يُستخدم في analyzeImageWithActiveProvider() و transcribeOrDescribeAttachment()
 */
export async function callVertexAiMultimodal(
  config:      VertexAiConfig,
  prompt:      string,
  mediaBase64: string,
  mimeType:    string,
  timeoutMs  = 20000,
): Promise<string> {
  const token = await getVertexToken(config.serviceAccountJson);

  const url =
    `https://${config.location}-aiplatform.googleapis.com/v1` +
    `/projects/${config.projectId}` +
    `/locations/${config.location}` +
    `/publishers/google/models/${config.modelName}:generateContent`;

  const body: GeminiRequestBody = {
    contents: [{
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: mediaBase64 } },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    if (response.status === 401) _tokenCache.delete(config.serviceAccountJson.substring(0, 20));
    const errBody = await response.text();
    throw new Error(`[vertexai] multimodal ${response.status}: ${errBody.substring(0, 300)}`);
  }

  return extractText(await response.json());
}

// ─── اختبار الاتصال — يُستدعى من صفحة Providers في الـ dashboard ─────────────

export async function testVertexConnection(
  config: VertexAiConfig,
): Promise<{ success: boolean; details: string }> {
  const validationError = validateVertexConfig(config);
  if (validationError) return { success: false, details: validationError };

  try {
    const text = await callVertexAi(
      config,
      [{ role: "user", content: "Say hello in one word." }],
      "You are a helpful assistant.",
    );
    return { success: true, details: `Response: ${text}` };
  } catch (err) {
    return { success: false, details: (err as Error).message };
  }
}

// ─── التحقق من صحة الإعدادات ─────────────────────────────────────────────────

export function validateVertexConfig(config: VertexAiConfig): string | null {
  if (!config.projectId)          return "Project ID مطلوب";
  if (!config.location)           return "Location مطلوب (مثال: us-central1)";
  if (!config.modelName)          return "اسم النموذج مطلوب";
  if (!config.serviceAccountJson) return "Service Account JSON مطلوب";

  try {
    const parsed = JSON.parse(config.serviceAccountJson) as Record<string, unknown>;
    if (parsed["type"] !== "service_account") {
      return "الملف JSON غير صالح — يجب أن يكون type: service_account";
    }
  } catch {
    return "الملف JSON غير صالح — تأكد من نسخه كاملاً";
  }

  return null;
}

/**
 * parseVertexConfig — تحويل حقول المزود من DB إلى VertexAiConfig
 *
 * الاتفاقية:
 *   provider.apiKey   → serviceAccountJson (JSON كاملاً مُشفَّراً)
 *   provider.baseUrl  → "projectId|location" (مفصول بـ |)
 *   provider.modelName → modelName
 *
 * مثال baseUrl: "my-gcp-project|us-central1"
 */
export function parseVertexConfig(
  apiKey:    string,
  baseUrl:   string | null,
  modelName: string,
): VertexAiConfig {
  const [projectId = "", location = "us-central1"] = (baseUrl ?? "").split("|");
  return { projectId, location, modelName, serviceAccountJson: apiKey };
}
