/**
 * Hybrid cache layer for critical session data (shopctx).
 *
 * Priority:
 *   1. Redis (if REDIS_URL is set)  — persistent across server restarts
 *   2. In-memory TtlCache            — fast fallback, lost on restart
 *
 * The existing sync `cache` (cache.ts) is used as the in-memory layer
 * so the two are always in sync.  All reads/writes here also update
 * the in-memory cache so subsequent in-process reads are instant.
 */

import Redis from "ioredis";
import { cache } from "./cache.js";

let redis: Redis | null = null;

if (process.env["REDIS_URL"]) {
  try {
    redis = new Redis(process.env["REDIS_URL"], {
      lazyConnect:          true,
      maxRetriesPerRequest: 1,
      connectTimeout:       3000,
      commandTimeout:       2000,
    });

    redis.on("error", (err) => {
      console.warn("[redis] Connection error — falling back to in-memory cache:", err.message);
    });

    redis.on("connect", () => {
      console.log("[redis] Connected — persistent session caching active");
    });

  } catch (err) {
    console.warn("[redis] Failed to initialize — in-memory cache only:", err);
    redis = null;
  }
}

export const isRedisAvailable = (): boolean => redis !== null && redis.status === "ready";

/**
 * Read a key.
 * Tries Redis first; on miss or error falls back to in-memory cache.
 * On Redis hit, warms the in-memory cache with the remaining TTL.
 */
export async function rGet<T>(key: string): Promise<T | undefined> {
  if (redis) {
    try {
      const [raw, pttl] = await Promise.all([redis.get(key), redis.pttl(key)]);
      if (raw !== null) {
        const val = JSON.parse(raw) as T;
        if (pttl > 0) cache.set(key, val, pttl);
        return val;
      }
      return undefined;
    } catch {
      return cache.get<T>(key);
    }
  }
  return cache.get<T>(key);
}

/**
 * Write a key with TTL (in milliseconds).
 * Always writes to in-memory first (fast), then Redis (durable).
 */
export async function rSet<T>(key: string, value: T, ttlMs: number): Promise<void> {
  cache.set(key, value, ttlMs);
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), "PX", ttlMs);
    } catch (err) {
      console.warn(`[redis] rSet failed for "${key}":`, (err as Error).message);
    }
  }
}

/**
 * Delete a key from both in-memory and Redis.
 */
export async function rDel(key: string): Promise<void> {
  cache.del(key);
  if (redis) {
    try {
      await redis.del(key);
    } catch (err) {
      console.warn(`[redis] rDel failed for "${key}":`, (err as Error).message);
    }
  }
}

export { redis };
