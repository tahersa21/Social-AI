import { Router, type IRouter, type Request, type Response } from "express";
import { verifyToken } from "../lib/auth.js";
import Redis from "ioredis";

const router: IRouter = Router();

export type NotificationType = "new_message" | "new_order" | "new_appointment";

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  route?: string;
}

// ── SSE client registry (local to this process instance) ─────────────────────
const clients = new Map<string, Response>();
let clientIdCounter = 0;

// ── Redis Pub/Sub — optional, enables multi-instance broadcasting ─────────────
const CHANNEL = "fb_notifications";
let publisher: Redis | null  = null;
let subscriber: Redis | null = null;

if (process.env["REDIS_URL"]) {
  try {
    const redisOpts = {
      lazyConnect:          true,
      maxRetriesPerRequest: 1,
      connectTimeout:       3000,
      commandTimeout:       2000,
    };

    publisher  = new Redis(process.env["REDIS_URL"], redisOpts);
    subscriber = new Redis(process.env["REDIS_URL"], redisOpts);

    subscriber.subscribe(CHANNEL, (err) => {
      if (err) {
        console.warn("[redis] SSE subscriber failed:", err.message);
        subscriber = null;
        publisher  = null;
      }
    });

    subscriber.on("message", (_ch: string, data: string) => {
      localBroadcast(data);
    });

    publisher.on("error",  (err) => { console.warn("[redis] SSE publisher error:", err.message); });
    subscriber.on("error", (err) => { console.warn("[redis] SSE subscriber error:", err.message); });

    console.log("[redis] SSE Pub/Sub initialized");
  } catch (err) {
    console.warn("[redis] SSE Pub/Sub init failed — in-process only:", (err as Error).message);
    publisher  = null;
    subscriber = null;
  }
}

// ── Local (in-process) broadcast ─────────────────────────────────────────────
function localBroadcast(data: string): void {
  for (const [id, res] of clients) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch {
      clients.delete(id);
    }
  }
}

// ── Public broadcast — uses Redis Pub/Sub when available ─────────────────────
export function broadcastNotification(payload: NotificationPayload): void {
  const data = JSON.stringify(payload);
  if (publisher && publisher.status === "ready") {
    void publisher.publish(CHANNEL, data);
  } else {
    localBroadcast(data);
  }
}

// ── SSE stream endpoint ───────────────────────────────────────────────────────
router.get("/notifications/stream", (req: Request, res: Response): void => {
  const token = req.query["token"] as string | undefined;
  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ message: "Invalid or expired token" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write(":ok\n\n");

  const clientId = `sse-${++clientIdCounter}`;
  clients.set(clientId, res);

  const pingInterval = setInterval(() => {
    try {
      res.write(":ping\n\n");
    } catch {
      clearInterval(pingInterval);
      clients.delete(clientId);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(pingInterval);
    clients.delete(clientId);
  });
});

export default router;
