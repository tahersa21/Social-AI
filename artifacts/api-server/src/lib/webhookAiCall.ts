import { db, conversationsTable } from "@workspace/db";
import { fbSettingsTable, aiConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";

import {
  callAIWithMetadata,
  detectReplyLeak,
  sendFbMessage,
  type SalesTriggerType,
} from "./ai.js";

import { logPlatformEvent } from "./webhookUtils.js";
import { isUserPaused } from "./dbHelpers.js";

type AppSettings = typeof fbSettingsTable.$inferSelect;
type AppConfig   = typeof aiConfigTable.$inferSelect;

type AiMessage = { role: "user" | "assistant"; content: string };

export type AiCallResult =
  | { outcome: "handled" }
  | {
      outcome: "proceed";
      replyText: string;
      aiSentiment: string | null;
      aiConfidenceScore: number | null;
      replyProviderName: string;
      replyModelName: string;
      replySourceType: string;
    };

export type AiCallParams = {
  messages:     AiMessage[];
  systemPrompt: string;
  senderId:     string;
  userName:     string;
  profileUrl:   string | null;
  settings:     AppSettings & { pageAccessToken: string };
  config:       AppConfig;
  salesTrigger: SalesTriggerType;
};

export async function handleAiCall(p: AiCallParams): Promise<AiCallResult> {
  const {
    messages, systemPrompt,
    senderId, userName, profileUrl,
    settings, config, salesTrigger,
  } = p;

  // ── Call AI ──────────────────────────────────────────────────────────────────
  let replyText: string;
  let aiSentiment: string | null = null;
  let aiConfidenceScore: number | null = null;
  let replyProviderName = "";
  let replyModelName    = "";

  try {
    const aiResult    = await callAIWithMetadata(messages, systemPrompt);
    replyText         = aiResult.text;
    replyProviderName = aiResult.providerName;
    replyModelName    = aiResult.modelName;

    const sentimentMatch = replyText.match(/\[SENTIMENT:(positive|negative|neutral)\]/i);
    aiSentiment = sentimentMatch ? sentimentMatch[1]!.toLowerCase() : null;
    replyText   = replyText.replace(/\[SENTIMENT:(positive|negative|neutral)\]/gi, "").trim();

    const confidenceMatch = replyText.match(/\[CONFIDENCE:(0?\.\d+|1(?:\.0)?|0(?:\.0)?)\]/i);
    if (confidenceMatch) {
      aiConfidenceScore = parseFloat(confidenceMatch[1]!);
      replyText = replyText.replace(/\[CONFIDENCE:[^\]]+\]/gi, "").trim();
    }

    // Strip internal reasoning blocks that some models output before the actual reply.
    // Covers [THOUGHT]...[/THOUGHT] and <think>...</think> formats.
    replyText = replyText.replace(/\[THOUGHT\][\s\S]*?\[\/THOUGHT\]/gi, "").trim();
    replyText = replyText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  } catch (aiErr: any) {
    console.error("❌ Webhook AI error:", aiErr.message);
    console.error("❌ Error details:", aiErr.stack?.split("\n").slice(0, 3).join(" | "));

    const errMsgLower = (aiErr.message ?? "").toLowerCase();
    const is429 = errMsgLower.includes("429") || errMsgLower.includes("resource_exhausted") || errMsgLower.includes("quota exceeded") || errMsgLower.includes("rate limit") || errMsgLower.includes("too many requests");
    const is403 = errMsgLower.includes("403") || errMsgLower.includes("permission denied") || errMsgLower.includes("suspended") || errMsgLower.includes("api key not valid") || errMsgLower.includes("invalid api key");

    // ── 429 = مؤقت: رسالة فقط بدون تحويل للإنسان ───────────────────────────
    if (is429) {
      const msg429 = "عذراً، عدد الطلبات كبير حالياً. يرجى المحاولة بعد دقيقة. ⏳";
      try { await sendFbMessage(settings.pageAccessToken, senderId, msg429, settings.pageId ?? undefined); } catch {}
      await db.insert(conversationsTable).values({
        fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
        message: msg429, sender: "bot", timestamp: new Date(),
      });
      void logPlatformEvent("provider_failure", senderId, "rate_limit: " + aiErr.message?.substring(0, 80));
      return { outcome: "handled" };
    }

    // ── 403 / خطأ دائم: رسالة واحدة ثم تحويل للوضع البشري ──────────────────
    const fallbackMsg = is403
      ? (config.handoffMessage ?? "عذراً، لا أستطيع الرد حالياً. سيتواصل معك أحد ممثلينا قريباً. 🙏")
      : (config.handoffMessage ?? "عذراً، نواجه مشكلة تقنية مؤقتة. سيتواصل معك فريقنا قريباً. 🙏");

    const alreadyPaused = await isUserPaused(senderId);
    if (!alreadyPaused) {
      // تحويل المحادثة للوضع البشري
      await db.update(conversationsTable)
        .set({ isPaused: 1 })
        .where(eq(conversationsTable.fbUserId, senderId));
    }

    try { await sendFbMessage(settings.pageAccessToken, senderId, fallbackMsg, settings.pageId ?? undefined); } catch {}

    await db.insert(conversationsTable).values({
      fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
      message: fallbackMsg, sender: "bot", isPaused: 1, timestamp: new Date(),
    });

    void logPlatformEvent("provider_failure", senderId, (is403 ? "auth_error: " : "ai_error: ") + aiErr.message?.substring(0, 80));
    if (!alreadyPaused) {
      void logPlatformEvent("handoff", senderId, "reason=ai_failure");
      console.log(`[ai-fallback] AI failure → handoff activated for ${senderId}`);
    }

    return { outcome: "handled" };
  }

  // ── Confidence score action ───────────────────────────────────────────────────
  if (aiConfidenceScore !== null) {
    const threshold = parseFloat(config.confidenceThreshold ?? "0.5");
    const action    = config.confidenceBelowAction ?? "none";
    if (aiConfidenceScore < threshold && action !== "none") {
      void logPlatformEvent("low_confidence", senderId, `score=${aiConfidenceScore} threshold=${threshold}`);
      if (action === "handoff") {
        const alreadyPaused = await isUserPaused(senderId);
        if (!alreadyPaused) {
          await db.update(conversationsTable).set({ isPaused: 1 }).where(eq(conversationsTable.fbUserId, senderId));
          const handoffMsg = config.handoffMessage ?? "تم تحويلك إلى فريق الدعم البشري. سيتواصل معك أحد ممثلينا قريباً.";
          await sendFbMessage(settings.pageAccessToken, senderId, handoffMsg, settings.pageId ?? undefined);
          await db.insert(conversationsTable).values({
            fbUserId: senderId, fbUserName: userName, fbProfileUrl: profileUrl,
            message: handoffMsg, sender: "bot", isPaused: 1, confidenceScore: aiConfidenceScore,
            providerName: replyProviderName || null, modelName: replyModelName || null,
            sourceType: "free_generation", salesTriggerType: salesTrigger, timestamp: new Date(),
          });
          void logPlatformEvent("handoff", senderId, `reason=low_confidence score=${aiConfidenceScore}`);
          void logPlatformEvent("lost_risk_prevented", senderId, `reason=low_confidence score=${aiConfidenceScore}`);
          console.log(`[confidence] Low confidence (${aiConfidenceScore}) → handoff for ${senderId}`);
          return { outcome: "handled" };
        }
      } else if (action === "note") {
        replyText = replyText + "\n\n⚠️ ملاحظة: إجابتي ليست مؤكدة تماماً، يُنصح بالتواصل مع فريقنا للتأكد.";
      }
    }
  }

  // ── Detect sourceType ──────────────────────────────────────────────────────────
  let replySourceType = "free_generation";
  if (/\"action\"\s*:\s*\"check_order_status\"/.test(replyText))       replySourceType = "order_status";
  else if (/\"action\"\s*:\s*\"send_image\"/.test(replyText))          replySourceType = "image_action";
  else if (/\"action\"\s*:\s*\"create_appointment\"/.test(replyText))  replySourceType = "appointment";
  else if (/\"action\"\s*:\s*\"start_order\"/.test(replyText) || /\"action\"\s*:\s*\"confirm_order\"/.test(replyText)) replySourceType = "order_action";

  // ── Safe Mode — strict reply leak detection ────────────────────────────────────
  if (config.safeModeEnabled && (config.safeModeLevel === "strict") && detectReplyLeak(replyText)) {
    replyText = "يمكنني مساعدتك في الأسئلة المتعلقة بمنتجاتنا وخدماتنا. هل لديك سؤال محدد؟";
    void logPlatformEvent("safe_mode_blocked", senderId, "reply_leak_detected_strict_mode");
    console.log(`[safe-mode] Reply leak replaced for ${senderId} (strict mode)`);
  }

  return {
    outcome: "proceed",
    replyText,
    aiSentiment,
    aiConfidenceScore,
    replyProviderName,
    replyModelName,
    replySourceType,
  };
}
