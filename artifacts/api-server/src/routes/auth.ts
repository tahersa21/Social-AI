import { Router, type IRouter } from "express";
import bcrypt from "bcrypt";
import { db, adminUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, verifyToken } from "../lib/auth.js";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ message: "Username and password required" });
    return;
  }

  const [user] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.username, username))
    .limit(1);

  if (!user) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const token = signToken({ id: user.id, username: user.username });
  res.json({ token, user: { id: user.id, username: user.username } });
});

router.post("/auth/logout", async (_req, res): Promise<void> => {
  res.json({ message: "Logged out" });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const payload = verifyToken(authHeader.slice(7));
  if (!payload) {
    res.status(401).json({ message: "Invalid token" });
    return;
  }

  res.json({ id: payload.id, username: payload.username });
});

export default router;
