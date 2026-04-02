import jwt from "jsonwebtoken";
import crypto from "crypto";

let jwtSecret: string;

function getSecret(): string {
  if (jwtSecret) return jwtSecret;
  const envSecret = process.env["JWT_SECRET"];
  if (envSecret) {
    jwtSecret = envSecret;
  } else {
    jwtSecret = crypto.randomBytes(32).toString("hex");
    console.warn("[auth] WARNING: JWT_SECRET not set — using random key (tokens will invalidate on restart)");
  }
  return jwtSecret;
}

export function signToken(payload: { id: number; username: string }): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): { id: number; username: string } | null {
  try {
    return jwt.verify(token, getSecret()) as { id: number; username: string };
  } catch {
    return null;
  }
}
