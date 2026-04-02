import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";

export const availableSlotsTable = pgTable("available_slots", {
  id: serial("id").primaryKey(),
  dayOfWeek: integer("day_of_week").notNull(),
  timeSlot: text("time_slot").notNull(),
  isActive: integer("is_active").notNull().default(1),
  maxBookings: integer("max_bookings").notNull().default(1),
});

export type AvailableSlot = typeof availableSlotsTable.$inferSelect;
