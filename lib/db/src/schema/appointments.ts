import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const appointmentsTable = pgTable("appointments", {
  id: serial("id").primaryKey(),
  fbUserId: text("fb_user_id").notNull(),
  fbUserName: text("fb_user_name"),
  fbProfileUrl: text("fb_profile_url"),
  serviceName: text("service_name"),
  appointmentDate: text("appointment_date"),
  timeSlot: text("time_slot"),
  status: text("status").notNull().default("pending"),
  note: text("note"),
  source: text("source").notNull().default("messenger"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Appointment = typeof appointmentsTable.$inferSelect;
