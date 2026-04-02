import { Router, type IRouter, type Request, type Response } from "express";
import { verifyToken } from "../lib/auth.js";

const router: IRouter = Router();

export type NotificationType = "new_message" | "new_order" | "new_appointment";

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  route?: string;
}

const clients = new Map<string, Response>();
let clientIdCounter = 0;

export function broadcastNotification(payload: NotificationPayload): void {
  const data = JSON.stringify(payload);
  for (const [id, res] of clients) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch {
      clients.delete(id);
    }
  }
}

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
