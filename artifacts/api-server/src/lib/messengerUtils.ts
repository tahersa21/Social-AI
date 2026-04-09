import { db, conversationSessionsTable } from "@workspace/db";
import { eq, desc, and, gte, sql } from "drizzle-orm";

// ── Quick replies sender ──────────────────────────────────────────────────────
export async function sendFbQuickReplies(
  pageAccessToken: string,
  recipientId: string,
  message: string,
  quickReplies: Array<{ title: string; payload: string }>,
  pageId?: string
): Promise<void> {
  const endpoint = pageId ? `${pageId}/messages` : "me/messages";
  await fetch(
    `https://graph.facebook.com/v25.0/${endpoint}?access_token=${pageAccessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: {
          text: message,
          quick_replies: quickReplies.map((qr) => ({
            content_type: "text",
            title: qr.title,
            payload: qr.payload,
          })),
        },
      }),
    }
  );
}

// ── Message buffering (debounce rapid messages into one AI call) ──────────────
const messageBuffer = new Map<string, {
  messages: string[];
  timer: ReturnType<typeof setTimeout> | null;
  resolve: (combined: string) => void;
}>();

// Sentinel: resolves earlier handler with this value so it exits without an AI call
export const BUFFER_SKIP = "__buffer_skip__";

export function bufferMessage(senderId: string, text: string): Promise<string> {
  return new Promise((resolve) => {
    const existing = messageBuffer.get(senderId);
    if (existing) {
      if (existing.timer !== null) clearTimeout(existing.timer);
      existing.messages.push(text);
      existing.resolve(BUFFER_SKIP);
      existing.resolve = resolve;
    } else {
      messageBuffer.set(senderId, { messages: [text], timer: null, resolve });
    }

    const timer = setTimeout(() => {
      const buffered = messageBuffer.get(senderId);
      if (!buffered) return;
      const combined = buffered.messages.join(" | ");
      messageBuffer.delete(senderId);
      buffered.resolve(combined);
    }, 3000);

    messageBuffer.get(senderId)!.timer = timer;
  });
}

// ── Session management ────────────────────────────────────────────────────────
export async function getOrCreateSession(fbUserId: string): Promise<{ isNew: boolean }> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [existing] = await db.select()
    .from(conversationSessionsTable)
    .where(and(
      eq(conversationSessionsTable.fbUserId, fbUserId),
      gte(conversationSessionsTable.sessionEnd, twentyFourHoursAgo),
    ))
    .orderBy(desc(conversationSessionsTable.createdAt))
    .limit(1);

  if (existing) {
    await db.update(conversationSessionsTable)
      .set({
        sessionEnd: new Date().toISOString(),
        messageCount: sql`${conversationSessionsTable.messageCount} + 1`,
        aiCallsCount: sql`${conversationSessionsTable.aiCallsCount} + 1`,
      })
      .where(eq(conversationSessionsTable.id, existing.id));
    return { isNew: false };
  } else {
    await db.insert(conversationSessionsTable).values({
      fbUserId,
      sessionStart: new Date().toISOString(),
      sessionEnd: new Date().toISOString(),
      messageCount: 1,
    });
    return { isNew: true };
  }
}
