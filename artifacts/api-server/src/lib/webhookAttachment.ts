import { db, conversationsTable } from "@workspace/db";
import { fbSettingsTable, aiConfigTable } from "@workspace/db";

import {
  sendFbMessage,
  getFbUserName,
  isWithinBusinessHours,
  transcribeOrDescribeAttachment,
} from "./ai.js";

import {
  checkAttachmentRateLimit,
  logPlatformEvent,
} from "./webhookUtils.js";

import { isUserPaused } from "./dbHelpers.js";
import { broadcastNotification } from "../routes/notifications.js";

type AppSettings = typeof fbSettingsTable.$inferSelect;
type AppConfig   = typeof aiConfigTable.$inferSelect;

type EventMessage = {
  text?: string;
  attachments?: Array<{ type: string; payload: { url?: string } }>;
} | undefined;

export type AttachmentResult =
  | { handled: "skip" }
  | { handled: false }
  | { handled: true; effectiveText: string };

export async function handleAttachment(
  eventMessage: EventMessage,
  senderId: string,
  settings: AppSettings & { pageAccessToken: string },
  config: AppConfig,
): Promise<AttachmentResult> {
  // Only handle attachment-only messages (no text)
  if (eventMessage?.text) return { handled: false };

  const attList  = eventMessage?.attachments ?? [];
  const imageAtt = attList.find((a) => a.type === "image");
  const audioAtt = attList.find((a) => a.type === "audio");
  const videoAtt = attList.find((a) => a.type === "video");

  if (!imageAtt && !audioAtt && !videoAtt) return { handled: false };

  const { name: attUserName, profileUrl: attProfileUrl } =
    await getFbUserName(settings.pageAccessToken, senderId);

  if (!config.botEnabled) {
    const disabledMsg = config.botDisabledMessage ?? "عذراً، المساعد الذكي غير متاح حالياً. يرجى التواصل معنا لاحقاً.";
    await sendFbMessage(settings.pageAccessToken, senderId, disabledMsg, settings.pageId ?? undefined);
    return { handled: "skip" };
  }

  if (await isUserPaused(senderId)) return { handled: "skip" };

  if (
    config.workingHoursEnabled !== 0 &&
    !isWithinBusinessHours(config.businessHoursStart, config.businessHoursEnd, config.timezone ?? "Africa/Algiers")
  ) {
    const outsideMsg = config.outsideHoursMessage ?? "مرحباً! نحن حالياً خارج ساعات العمل. يرجى التواصل معنا خلال ساعات العمل.";
    await sendFbMessage(settings.pageAccessToken, senderId, outsideMsg, settings.pageId ?? undefined);
    return { handled: "skip" };
  }

  const att      = imageAtt ?? audioAtt ?? videoAtt!;
  const attType: "image" | "audio" | "video" = imageAtt ? "image" : audioAtt ? "audio" : "video";
  const attUrl   = att.payload.url;
  const attLabel = attType === "image" ? "[صورة]" : attType === "audio" ? "[رسالة صوتية]" : "[فيديو]";

  await db.insert(conversationsTable).values({
    fbUserId: senderId, fbUserName: attUserName, fbProfileUrl: attProfileUrl,
    message: attLabel, sender: "user", timestamp: new Date(),
  });

  broadcastNotification({
    type: "new_message",
    title: `${attType === "image" ? "صورة" : attType === "audio" ? "رسالة صوتية" : "فيديو"} من ${attUserName}`,
    body: attLabel,
    route: "/conversations",
  });

  if (!attUrl) {
    const errMsg = "عذراً، لم أتمكن من معالجة المرفق. يرجى المحاولة مجدداً.";
    await sendFbMessage(settings.pageAccessToken, senderId, errMsg, settings.pageId ?? undefined);
    await db.insert(conversationsTable).values({
      fbUserId: senderId, fbUserName: attUserName, fbProfileUrl: attProfileUrl,
      message: errMsg, sender: "bot", timestamp: new Date(),
    });
    return { handled: "skip" };
  }

  if (!await checkAttachmentRateLimit(senderId)) {
    const rateLimitMsg = "📸 تم إرسال عدد كبير من الملفات. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.";
    await sendFbMessage(settings.pageAccessToken, senderId, rateLimitMsg, settings.pageId ?? undefined);
    await db.insert(conversationsTable).values({
      fbUserId: senderId, fbUserName: attUserName, fbProfileUrl: attProfileUrl,
      message: rateLimitMsg, sender: "bot", timestamp: new Date(),
    });
    void logPlatformEvent("attachment_rate_limited", senderId, `type=${attType}`);
    return { handled: "skip" };
  }

  const transcription = await transcribeOrDescribeAttachment(attUrl, attType, settings.pageAccessToken);

  if (!transcription) {
    const errMsg = attType === "audio"
      ? "عذراً، لم أتمكن من فهم الرسالة الصوتية. يرجى كتابة استفسارك."
      : "عذراً، لم أتمكن من تحليل الملف. يرجى كتابة استفسارك.";
    await sendFbMessage(settings.pageAccessToken, senderId, errMsg, settings.pageId ?? undefined);
    await db.insert(conversationsTable).values({
      fbUserId: senderId, fbUserName: attUserName, fbProfileUrl: attProfileUrl,
      message: errMsg, sender: "bot", sourceType: "multimodal_error", timestamp: new Date(),
    });
    void logPlatformEvent("multimodal_transcription_failed", senderId, `type=${attType}`);
    return { handled: "skip" };
  }

  const effectiveText = attType === "image" || attType === "video"
    ? `${attLabel}: ${transcription}`
    : transcription;

  console.log(`[multimodal] ${attType} → normal flow: "${effectiveText.substring(0, 80)}"`);
  void logPlatformEvent("multimodal_transcribed", senderId, `type=${attType} text="${effectiveText.substring(0, 80)}"`);

  return { handled: true, effectiveText };
}
