// ── AI Response Parsers ───────────────────────────────────────────────────────
// Pure regex/JSON parsers — no external dependencies.
// Extracted from ai.ts for clarity; re-exported via ai.ts for backward compat.

export function parseOrderAction(text: string): {
  action: string;
  product_name: string;
  quantity: number;
  customer_name?: string;
  customer_phone?: string;
  customer_wilaya?: string;
  customer_commune?: string;
  customer_address?: string;
  note: string;
} | null {
  const match = text.match(/\{[\s\S]*?"action"\s*:\s*"create_order"[\s\S]*?\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export function parseStartOrderAction(text: string): {
  action: string;
  product_name: string;
  quantity?: number;
} | null {
  const match = text.match(/\{[\s\S]*?"action"\s*:\s*"start_order"[\s\S]*?\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export function parseConfirmOrderAction(text: string): {
  action: string;
  product_name: string;
  quantity?: number;
  customer_name: string;
  customer_phone: string;
  customer_wilaya?: string;
  customer_commune?: string;
  customer_address?: string;
} | null {
  const match = text.match(/\{[\s\S]*?"action"\s*:\s*"confirm_order"[\s\S]*?\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export function parseBrowseCatalogAction(text: string): boolean {
  return /\{\s*"action"\s*:\s*"browse_catalog"\s*\}/.test(text);
}

export function parseSendImageAction(text: string): {
  action: string;
  product_name: string;
} | null {
  const match = text.match(/\{[\s\S]*?"action"\s*:\s*"send_image"[\s\S]*?\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export function parseAppointmentAction(text: string): {
  action: string;
  service_name: string;
  appointment_date: string;
  time_slot: string;
  note?: string;
} | null {
  const match = text.match(/\{[\s\S]*?"action"\s*:\s*"create_appointment"[\s\S]*?\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
