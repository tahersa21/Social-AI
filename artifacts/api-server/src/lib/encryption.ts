import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env["ENCRYPTION_KEY"] ?? "";
  if (!raw) throw new Error("ENCRYPTION_KEY environment variable is required");
  return Buffer.from(raw.padEnd(KEY_LENGTH, "0").slice(0, KEY_LENGTH));
}

export function encrypt(text: string): string {
  if (!text) return "";
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText || !encryptedText.includes(":")) return "";
  const [ivHex, dataHex] = encryptedText.split(":");
  const iv = Buffer.from(ivHex!, "hex");
  const data = Buffer.from(dataHex!, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function maskKey(key: string): string {
  if (!key || key.length < 8) return "••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}
