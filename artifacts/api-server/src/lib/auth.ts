import jwt from "jsonwebtoken";
import crypto from "crypto";
import fs from "fs";
import path from "path";

// ── JWT secret — persisted so sessions survive restarts ───────────────────────
// Priority:
//   1. JWT_SECRET env var (recommended for production — set it!)
//   2. .jwt_secret file   (auto-created on first run; survives restarts)
//   3. In-memory random   (last resort — sessions lost on every restart)
const SECRET_FILE = path.resolve(process.cwd(), ".jwt_secret");
let jwtSecret: string;

function getSecret(): string {
  if (jwtSecret) return jwtSecret;

  const envSecret = process.env["JWT_SECRET"];
  if (envSecret) {
    jwtSecret = envSecret;
    return jwtSecret;
  }

  // Try to load a previously persisted secret
  try {
    if (fs.existsSync(SECRET_FILE)) {
      const persisted = fs.readFileSync(SECRET_FILE, "utf8").trim();
      if (persisted.length >= 32) {
        jwtSecret = persisted;
        console.warn(
          "[auth] JWT_SECRET not set — loaded persisted key from .jwt_secret file.\n" +
          "       Set JWT_SECRET env var in production to avoid depending on this file."
        );
        return jwtSecret;
      }
    }
  } catch {
    // fall through to generate
  }

  // Generate a new secret and persist it for future restarts
  jwtSecret = crypto.randomBytes(32).toString("hex");
  try {
    fs.writeFileSync(SECRET_FILE, jwtSecret, { mode: 0o600 });
    console.warn(
      "[auth] JWT_SECRET not set — generated new key and saved to .jwt_secret.\n" +
      "       Sessions will survive restarts. Set JWT_SECRET env var in production."
    );
  } catch {
    console.warn(
      "[auth] JWT_SECRET not set and .jwt_secret file not writable — sessions will invalidate on restart.\n" +
      "       Set JWT_SECRET env var to fix this."
    );
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
