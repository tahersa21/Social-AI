/**
 * API Transformer — converts between OpenAI-standard format and custom API formats.
 *
 * Supported formats:
 *   openai          → standard OpenAI /v1/chat/completions  (messages array)
 *   anthropic       → Anthropic /v1/messages                (messages array + x-api-key)
 *   raw_single      → Custom endpoint, body: { model, message: "string" }
 *   raw_messages    → Custom endpoint, body: { model, messages: [...] }
 */

export type ApiFormat = "openai" | "anthropic" | "raw_single" | "raw_messages";

/**
 * Resolve the canonical provider type from a raw providerType string and base URL.
 * Handles both explicit named types and "custom" providers detected by URL.
 */
export function resolveProviderType(rawType: string, url: string): string {
  if (rawType.includes("gemini") || url.includes("generativelanguage.googleapis.com")) return "gemini";
  if (rawType === "anthropic" || (rawType === "custom" && url.includes("anthropic.com"))) return "anthropic";
  if (rawType === "orbit" || (rawType === "custom" && url.includes("orbit-provider.com"))) return "orbit";
  if (rawType === "agentrouter" || (rawType === "custom" && url.includes("agentrouter.org"))) return "agentrouter";
  if (rawType === "deepseek" || (rawType === "custom" && url.includes("deepseek.com"))) return "deepseek";
  if (rawType === "groq" || (rawType === "custom" && url.includes("groq.com"))) return "groq";
  if (rawType === "openrouter" || (rawType === "custom" && url.includes("openrouter.ai"))) return "openrouter";
  if (rawType === "openai" || (rawType === "custom" && url.includes("openai.com"))) return "openai";
  if (rawType !== "custom") return rawType;
  return "openai";
}

export interface TransformerInput {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens?: number;
}

export interface TransformerResult {
  text: string;
}

/**
 * Detect which API format a provider uses based on its providerType string.
 */
export function detectApiFormat(providerType: string): ApiFormat {
  const t = providerType.toLowerCase().trim();
  if (t === "raw_single" || t === "مخصص (رسالة واحدة)") return "raw_single";
  if (t === "raw_messages" || t === "مخصص (مصفوفة)") return "raw_messages";
  if (t === "anthropic" || t === "orbit" || t === "agentrouter") return "anthropic";
  return "openai";
}

/**
 * Parse SSE (Server-Sent Events) streaming response text into concatenated content.
 * Handles: data: {"content":"..."} data: {"done":true}
 */
function parseSseText(rawText: string): string | null {
  const lines = rawText.split(/\r?\n/).filter(l => l.startsWith("data:"));
  if (lines.length === 0) return null;

  const parts: string[] = [];
  for (const line of lines) {
    const jsonStr = line.replace(/^data:\s*/, "").trim();
    if (!jsonStr || jsonStr === "[DONE]") continue;
    try {
      const obj = JSON.parse(jsonStr) as Record<string, unknown>;
      if (obj["done"] === true) continue;
      const extracted = extractResponseText(obj);
      if (extracted) parts.push(extracted);
    } catch { /* skip malformed line */ }
  }
  return parts.length > 0 ? parts.join("") : null;
}

/**
 * Extract text from a custom API response by trying common field names.
 */
function extractResponseText(data: Record<string, unknown>): string {
  const candidates = [
    "content",
    "response",
    "text",
    "message",
    "output",
    "result",
    "answer",
    "reply",
    "generated_text",
  ];

  for (const key of candidates) {
    const val = data[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }

  const choices = data["choices"] as Array<{ message?: { content?: string }; text?: string; delta?: { content?: string } }> | undefined;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0];
    if (first?.message?.content) return first.message.content;
    if (first?.delta?.content) return first.delta.content;
    if (typeof first?.text === "string" && first.text.trim()) return first.text.trim();
  }

  const candidates2 = ["data", "body", "payload"];
  for (const key of candidates2) {
    const nested = data[key];
    if (nested && typeof nested === "object") {
      const found = extractResponseText(nested as Record<string, unknown>);
      if (found) return found;
    }
  }

  return JSON.stringify(data).substring(0, 300);
}

/**
 * Parse raw response text — handles plain JSON and SSE streaming formats.
 */
function parseRawResponse(rawText: string): Record<string, unknown> | null {
  const trimmed = rawText.trim();

  if (trimmed.startsWith("data:")) {
    const sseResult = parseSseText(trimmed);
    if (sseResult !== null) return { _sse_text: sseResult };
    return null;
  }

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Call any provider using its detected format.
 * This is the single entry point used by both ai.ts and providers.ts (test).
 */
export async function callWithFormat(
  format: ApiFormat,
  input: TransformerInput
): Promise<TransformerResult> {
  const { apiKey, baseUrl, model, systemPrompt, messages, maxTokens = 1024 } = input;
  const cleanBase = baseUrl.replace(/\/$/, "");
  const lastUserMessage = messages.filter(m => m.role === "user").pop()?.content ?? "Hello";

  if (format === "raw_single") {
    const body: Record<string, unknown> = {
      model,
      message: lastUserMessage,
    };
    if (systemPrompt) body["system"] = systemPrompt;

    const response = await fetch(cleanBase, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const rawText = await response.text();
    if (rawText.trim().startsWith("<")) {
      throw new Error(`Raw API returned HTML instead of JSON (${cleanBase}). تحقق من الرابط ومفتاح API.`);
    }

    const data = parseRawResponse(rawText);
    if (!data) {
      throw new Error(`Raw API returned unparseable response: ${rawText.substring(0, 200)}`);
    }

    if (data["_sse_text"]) return { text: data["_sse_text"] as string };

    if (data["error"]) {
      const errMsg = typeof data["error"] === "string"
        ? data["error"]
        : (data["error"] as { message?: string })?.message ?? JSON.stringify(data["error"]);
      throw new Error(`Raw API error: ${errMsg}`);
    }

    return { text: extractResponseText(data) };
  }

  if (format === "raw_messages") {
    const allMessages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) allMessages.push({ role: "system", content: systemPrompt });
    allMessages.push(...messages);

    const body: Record<string, unknown> = {
      model,
      messages: allMessages,
    };

    const response = await fetch(cleanBase, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const rawText = await response.text();
    if (rawText.trim().startsWith("<")) {
      throw new Error(`Raw API returned HTML instead of JSON (${cleanBase}). تحقق من الرابط ومفتاح API.`);
    }

    const data = parseRawResponse(rawText);
    if (!data) {
      throw new Error(`Raw API returned unparseable response: ${rawText.substring(0, 200)}`);
    }

    if (data["_sse_text"]) return { text: data["_sse_text"] as string };

    if (data["error"]) {
      const errMsg = typeof data["error"] === "string"
        ? data["error"]
        : (data["error"] as { message?: string })?.message ?? JSON.stringify(data["error"]);
      throw new Error(`Raw API error: ${errMsg}`);
    }

    return { text: extractResponseText(data) };
  }

  throw new Error(`Unsupported format: ${format} — use callOpenAICompatible or callAnthropicCompatible instead`);
}

/**
 * Quick test call (short message, small tokens) for provider health check.
 */
export async function testWithFormat(
  format: ApiFormat,
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<string> {
  const result = await callWithFormat(format, {
    apiKey,
    baseUrl,
    model,
    systemPrompt: "You are a helpful assistant.",
    messages: [{ role: "user", content: "Say hello in one word" }],
    maxTokens: 10,
  });
  return result.text;
}
