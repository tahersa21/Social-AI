import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const commentsLogTable = pgTable("comments_log", {
  id: serial("id").primaryKey(),
  postId: text("post_id"),
  commentId: text("comment_id"),
  fbUserId: text("fb_user_id").notNull(),
  fbUserName: text("fb_user_name"),
  fbProfileUrl: text("fb_profile_url"),
  commentText: text("comment_text"),
  aiReply: text("ai_reply"),
  dmSent: integer("dm_sent").notNull().default(0),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCommentLogSchema = createInsertSchema(commentsLogTable).omit({ id: true });
export type InsertCommentLog = z.infer<typeof insertCommentLogSchema>;
export type CommentLog = typeof commentsLogTable.$inferSelect;
