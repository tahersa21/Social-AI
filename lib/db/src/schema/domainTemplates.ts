import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const domainTemplatesTable = pgTable("domain_templates", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull().unique(),
  templateName: text("template_name").notNull(),
  botName: text("bot_name").notNull(),
  personality: text("personality").notNull(),
  greetingMessage: text("greeting_message").notNull(),
  sampleFaqs: text("sample_faqs").notNull().default("[]"),
  sampleProducts: text("sample_products").notNull().default("[]"),
});

export type DomainTemplate = typeof domainTemplatesTable.$inferSelect;
