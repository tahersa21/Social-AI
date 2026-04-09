/**
 * Hybrid rate limiting — Redis Sorted Sets (sliding window) + in-memory fallback.
 * All functions are async to support both backends transparently.
 *
 * Redis Sorted Set strategy:
 *   1. ZREMRANGEBYSCORE — remove timestamps outside the window
 *   2. ZADD             — add current timestamp as a new entry
 *   3. ZCOUNT           — count entries inside the window
 *   4. PEXPIRE          — auto-expire the key after window ms
 *   If count > max the new entry is removed and false is returned.
 */

import { redis } from "./redisCache.js";

// ── In-memory fallback maps ───────────────────────────────────────────────────
const attachmentFallback = new Map<string, number[]>();
const textFallback       = new Map<string, number[]>();
const webhookIpFallback  = new Map<string, number[]>();

// ── Limits ────────────────────────────────────────────────────────────────────
const ATTACHMENT_MAX       = 5;
const ATTACHMENT_WINDOW_MS = 2 * 60 * 1000;
const TEXT_MAX             = 30;
const TEXT_WINDOW_MS       = 60 * 1000;
const WEBHOOK_IP_MAX       = 120;
const WEBHOOK_IP_WINDOW_MS = 60 * 1000;

// ── Periodic cleanup for in-memory fallbacks ──────────────────────────────────
function cleanMap(map: Map<string, number[]>, windowMs: number): void {
  const now = Date.now();
  for (const [key, timestamps] of map.entries()) {
    const fresh = timestamps.filter((t) => now - t < windowMs);
    if (fresh.length === 0) map.delete(key);
    else map.set(key, fresh);
  }
}
setInterval(() => cleanMap(attachmentFallback, ATTACHMENT_WINDOW_MS), 10 * 60 * 1000);
setInterval(() => cleanMap(textFallback,       TEXT_WINDOW_MS),        5 * 60 * 1000);
setInterval(() => cleanMap(webhookIpFallback,  WEBHOOK_IP_WINDOW_MS), 10 * 60 * 1000);

// ── Core sliding-window check ─────────────────────────────────────────────────
async function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
  fallback: Map<string, number[]>,
): Promise<boolean> {
  const now         = Date.now();
  const windowStart = now - windowMs;

  if (redis && redis.status === "ready") {
    try {
      const rlKey  = `rl:${key}`;
      const member = `${now}:${Math.random()}`;

      const results = await redis
        .pipeline()
        .zremrangebyscore(rlKey, "-inf", windowStart - 1)
        .zadd(rlKey, now, member)
        .zcount(rlKey, windowStart, "+inf")
        .pexpire(rlKey, windowMs)
        .exec();

      const count = (results?.[2]?.[1] as number) ?? 0;

      if (count > max) {
        void redis.zrem(rlKey, member);
        return false;
      }
      return true;
    } catch {
      // fall through to in-memory
    }
  }

  // ── In-memory fallback ────────────────────────────────────────────────────
  const prev = (fallback.get(key) ?? []).filter((t) => t >= windowStart);
  if (prev.length >= max) return false;
  fallback.set(key, [...prev, now]);
  return true;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Max 5 attachments per 2 min per user */
export async function checkAttachmentRateLimit(userId: string): Promise<boolean> {
  return checkRateLimit(`att:${userId}`, ATTACHMENT_MAX, ATTACHMENT_WINDOW_MS, attachmentFallback);
}

/** Max 30 text messages per 60s per sender */
export async function checkTextRateLimit(userId: string): Promise<boolean> {
  return checkRateLimit(`txt:${userId}`, TEXT_MAX, TEXT_WINDOW_MS, textFallback);
}

/** Max 120 webhook requests per 60s per IP */
export async function checkWebhookRequestRate(ip: string): Promise<boolean> {
  return checkRateLimit(`wip:${ip}`, WEBHOOK_IP_MAX, WEBHOOK_IP_WINDOW_MS, webhookIpFallback);
}
