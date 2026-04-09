import { Router, type IRouter } from "express";
import { db, aiConfigTable, productInquiriesTable } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";
import multer from "multer";
import { rDel } from "../lib/redisCache.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router: IRouter = Router();

router.get("/ai-config", async (_req, res): Promise<void> => {
  let [config] = await db.select().from(aiConfigTable).limit(1);
  if (!config) {
    [config] = await db
      .insert(aiConfigTable)
      .values({ botName: "مساعد المتجر", language: "auto", currency: "DZD" })
      .returning();
  }
  res.json(config);
});

router.put("/ai-config", upload.single("pageLogo"), async (req, res): Promise<void> => {
  let [config] = await db.select().from(aiConfigTable).limit(1);
  if (!config) {
    [config] = await db
      .insert(aiConfigTable)
      .values({ botName: "مساعد المتجر", language: "auto", currency: "DZD" })
      .returning();
  }

  const body = req.body as Record<string, string | undefined>;
  const logoUrl = req.file
    ? `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
    : undefined;

  const [updated] = await db
    .update(aiConfigTable)
    .set({
      botName: body.botName ?? config.botName,
      personality: body.personality ?? null,
      greetingMessage: body.greetingMessage ?? null,
      language: body.language ?? config.language,
      respondToOrders: body.respondToOrders !== undefined ? Number(body.respondToOrders) : config.respondToOrders,
      replyToComments: body.replyToComments !== undefined ? Number(body.replyToComments) : config.replyToComments,
      sendDmOnComment: body.sendDmOnComment !== undefined ? Number(body.sendDmOnComment) : config.sendDmOnComment,
      activeProviderId: body.activeProviderId !== undefined ? (body.activeProviderId ? Number(body.activeProviderId) : null) : config.activeProviderId,
      businessCountry: body.businessCountry ?? null,
      businessCity: body.businessCity ?? null,
      businessDomain: body.businessDomain ?? null,
      businessDomainCustom: body.businessDomainCustom ?? null,
      targetAudience: body.targetAudience ?? null,
      businessHoursStart: body.businessHoursStart ?? null,
      businessHoursEnd: body.businessHoursEnd ?? null,
      timezone: body.timezone ?? config.timezone,
      outsideHoursMessage: body.outsideHoursMessage ?? null,
      currency: body.currency ?? config.currency,
      pageName: body.pageName !== undefined ? body.pageName : config.pageName,
      pageDescription: body.pageDescription !== undefined ? body.pageDescription : config.pageDescription,
      pageLogoUrl: logoUrl ?? (body.pageLogoUrl !== undefined ? body.pageLogoUrl : config.pageLogoUrl),
      pageFacebookUrl: body.pageFacebookUrl !== undefined ? body.pageFacebookUrl : config.pageFacebookUrl,
      strictTopicMode: body.strictTopicMode !== undefined ? Number(body.strictTopicMode) : config.strictTopicMode,
      offTopicResponse: body.offTopicResponse !== undefined ? body.offTopicResponse : config.offTopicResponse,
      blockedKeywords: body.blockedKeywords !== undefined ? body.blockedKeywords : config.blockedKeywords,
      maxOffTopicMessages: body.maxOffTopicMessages !== undefined ? Number(body.maxOffTopicMessages) : config.maxOffTopicMessages,
      handoffKeyword: body.handoffKeyword !== undefined ? body.handoffKeyword : config.handoffKeyword,
      handoffMessage: body.handoffMessage !== undefined ? body.handoffMessage : config.handoffMessage,
      leadCaptureEnabled: body.leadCaptureEnabled !== undefined ? Number(body.leadCaptureEnabled) : config.leadCaptureEnabled,
      leadCaptureFields: body.leadCaptureFields !== undefined ? body.leadCaptureFields : config.leadCaptureFields,
      leadCaptureMessage: body.leadCaptureMessage !== undefined ? body.leadCaptureMessage : config.leadCaptureMessage,
      useQuickReplies: body.useQuickReplies !== undefined ? Number(body.useQuickReplies) : config.useQuickReplies,
      quickReplyButtons: body.quickReplyButtons !== undefined ? body.quickReplyButtons : config.quickReplyButtons,
      workingHoursEnabled: body.workingHoursEnabled !== undefined ? Number(body.workingHoursEnabled) : config.workingHoursEnabled,
      abandonedCartEnabled: body.abandonedCartEnabled !== undefined ? Number(body.abandonedCartEnabled) : config.abandonedCartEnabled,
      abandonedCartDelayHours: body.abandonedCartDelayHours !== undefined ? Number(body.abandonedCartDelayHours) : config.abandonedCartDelayHours,
      abandonedCartMessage: body.abandonedCartMessage !== undefined ? body.abandonedCartMessage : config.abandonedCartMessage,
      botEnabled: body.botEnabled !== undefined ? Number(body.botEnabled) : config.botEnabled,
      botDisabledMessage: body.botDisabledMessage !== undefined ? body.botDisabledMessage : config.botDisabledMessage,
      confidenceThreshold: body.confidenceThreshold !== undefined ? String(body.confidenceThreshold) : config.confidenceThreshold,
      confidenceBelowAction: body.confidenceBelowAction !== undefined ? body.confidenceBelowAction : config.confidenceBelowAction,
      safeModeEnabled: body.safeModeEnabled !== undefined ? Number(body.safeModeEnabled) : config.safeModeEnabled,
      safeModeLevel: body.safeModeLevel !== undefined ? body.safeModeLevel : config.safeModeLevel,
      customerMemoryEnabled: body.customerMemoryEnabled !== undefined ? Number(body.customerMemoryEnabled) : config.customerMemoryEnabled,
      salesBoostEnabled: body.salesBoostEnabled !== undefined ? Number(body.salesBoostEnabled) : config.salesBoostEnabled,
      salesBoostLevel: body.salesBoostLevel !== undefined ? body.salesBoostLevel : config.salesBoostLevel,
      priceLockEnabled: body.priceLockEnabled !== undefined ? Number(body.priceLockEnabled) : config.priceLockEnabled,
      humanGuaranteeEnabled: body.humanGuaranteeEnabled !== undefined ? Number(body.humanGuaranteeEnabled) : config.humanGuaranteeEnabled,
      smartEscalationEnabled: body.smartEscalationEnabled !== undefined ? Number(body.smartEscalationEnabled) : config.smartEscalationEnabled,
      appointmentsEnabled: body.appointmentsEnabled !== undefined ? Number(body.appointmentsEnabled) : config.appointmentsEnabled,
      updatedAt: new Date(),
    })
    .where(eq(aiConfigTable.id, config.id))
    .returning();

  await rDel("config");
  res.json(updated);
});

router.get("/ai-config/abandoned-cart-stats", async (_req, res): Promise<void> => {
  const [totalRow] = await db.select({ value: count() }).from(productInquiriesTable);
  const [sentRow] = await db.select({ value: count() }).from(productInquiriesTable).where(eq(productInquiriesTable.reminderSent, 1));
  const [convertedRow] = await db.select({ value: count() }).from(productInquiriesTable).where(eq(productInquiriesTable.converted, 1));
  const total = totalRow?.value ?? 0;
  const sent = sentRow?.value ?? 0;
  const converted = convertedRow?.value ?? 0;
  res.json({ totalInquiries: total, remindersSent: sent, conversions: converted, conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0 });
});

export default router;
