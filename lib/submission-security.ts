const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const HTML_LIKE = /<\s*\/?\s*[a-z][^>]*>/i;
const SCRIPT_SCHEME = /(?:javascript|vbscript)\s*:/i;
const EVENT_HANDLER = /\bon[a-z]+\s*=/i;
const EMAIL_LIKE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_LIKE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const FORBIDDEN_AUDIT_KEY = /(email|phone|mobile|address|exact_?lat|exact_?lng|token|secret|password|pii)/i;

export function normalizePlainText(value: unknown, options: { min?: number; max: number; field: string }) {
  if (typeof value !== "string") throw new Error(`${options.field}: invalid type`);
  const normalized = value.normalize("NFC").replace(CONTROL_CHARACTERS, "").trim();
  if ((options.min ?? 0) > normalized.length) throw new Error(`${options.field}: too short`);
  if (normalized.length > options.max) throw new Error(`${options.field}: too long`);
  if (HTML_LIKE.test(normalized) || SCRIPT_SCHEME.test(normalized) || EVENT_HANDLER.test(normalized)) {
    throw new Error(`${options.field}: HTML or executable content is not allowed`);
  }
  return normalized;
}

export function isHoneypotTriggered(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function redactAuditString(value: string) {
  return value.replace(EMAIL_LIKE, "[redacted-email]").replace(PHONE_LIKE, "[redacted-phone]");
}

export function sanitizeAuditPayload(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactAuditString(value).slice(0, 1000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 100).map(sanitizeAuditPayload);
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = FORBIDDEN_AUDIT_KEY.test(key) ? "[redacted]" : sanitizeAuditPayload(item);
    }
    return output;
  }
  return "[unsupported]";
}

export function safeAuditJson(value: unknown) {
  return JSON.stringify(sanitizeAuditPayload(value));
}
