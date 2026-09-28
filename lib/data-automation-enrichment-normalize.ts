import {
  canonicalizeSourceUrl,
  normalizeAutomationIdentity,
  type AutomationEntityType,
} from "./data-automation.ts";
import { normalizeAutomationEmail, normalizeAutomationPhone } from "./data-automation-identity.ts";
import {
  automationEntityEnrichmentTemplate,
  type AutomationEnrichmentNormalizer,
  type EntityEnrichmentField,
} from "./data-automation-enrichment-template.ts";

function text(value: unknown, max = 1000) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const clean = String(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return clean ? clean.slice(0, max) : null;
}

function email(value: unknown) {
  if (typeof value !== "string") return null;
  let clean = value.trim().replace(/^mailto:/i, "").split("?")[0]?.trim() ?? "";
  try {
    clean = decodeURIComponent(clean);
  } catch {
    return null;
  }
  const normalized = normalizeAutomationEmail(clean)?.toLowerCase() ?? null;
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  if (/^(?:no-?reply|noreply)@/i.test(normalized)) return null;
  return normalized;
}

function phone(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  let clean = String(value).trim().replace(/^tel:/i, "");
  try {
    clean = decodeURIComponent(clean);
  } catch {
    return null;
  }
  return normalizeAutomationPhone(clean);
}

function canonicalUrl(value: unknown) {
  return typeof value === "string" ? canonicalizeSourceUrl(value) : null;
}

function social(value: unknown, network: "facebook" | "instagram") {
  const canonical = canonicalUrl(value);
  if (!canonical) return null;
  try {
    const url = new URL(canonical);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (network === "facebook") {
      if (!["facebook.com","m.facebook.com","fb.com"].includes(host)) return null;
      if (!url.pathname || url.pathname === "/" || /^\/(?:sharer|share\.php|dialog|login)(?:\/|$)/i.test(url.pathname)) return null;
    } else {
      if (host !== "instagram.com") return null;
      if (!url.pathname || url.pathname === "/" || /^\/(?:accounts|developer|login)(?:\/|$)/i.test(url.pathname)) return null;
    }
    return canonical;
  } catch {
    return null;
  }
}

function date(value: unknown) {
  const exact = text(value, 40);
  if (!exact) return null;
  const iso = exact.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const sk = exact.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  const parts = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : sk
      ? [Number(sk[3]), Number(sk[2]), Number(sk[1])]
      : null;
  if (!parts) return null;
  const [year, month, day] = parts;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return String(year) + "-" + String(month).padStart(2,"0") + "-" + String(day).padStart(2,"0");
}

function time(value: unknown) {
  const exact = text(value, 20);
  const match = exact?.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return String(hour).padStart(2,"0") + ":" + String(minute).padStart(2,"0");
}

function number(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const clean = value.trim().replace(",", ".");
  return /^-?\d+(?:\.\d+)?$/.test(clean) && Number.isFinite(Number(clean)) ? Number(clean) : null;
}

function bool(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  if (typeof value !== "string") return null;
  const normalized = normalizeAutomationIdentity(value);
  if (["ano","yes","true"].includes(normalized)) return true;
  if (["nie","no","false"].includes(normalized)) return false;
  return null;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return null;
  const values = [...new Set(
    value.map((item) => text(item, 300)).filter((item): item is string => Boolean(item)),
  )];
  return values.length ? values.slice(0, 40) : null;
}

function normalize(normalizer: AutomationEnrichmentNormalizer, value: unknown) {
  switch (normalizer) {
    case "TEXT": return text(value);
    case "LONG_TEXT": return text(value, 10000);
    case "PHONE": return phone(value);
    case "EMAIL": return email(value);
    case "URL": return canonicalUrl(value);
    case "FACEBOOK": return social(value, "facebook");
    case "INSTAGRAM": return social(value, "instagram");
    case "DATE": return date(value);
    case "TIME": return time(value);
    case "NUMBER": return number(value);
    case "BOOLEAN": return bool(value);
    case "STRING_ARRAY": return stringArray(value);
  }
}

function rawValue(proposed: Record<string, unknown>, field: EntityEnrichmentField) {
  for (const key of [field.canonicalField, ...field.aliases]) {
    if (!Object.prototype.hasOwnProperty.call(proposed, key)) continue;
    const value = proposed[key];
    if (value !== undefined && value !== null && !(typeof value === "string" && !value.trim())) return value;
  }
  return undefined;
}

export function normalizeAutomationEnrichmentProposal(
  entityType: AutomationEntityType,
  proposed: Record<string, unknown>,
) {
  const output: Record<string, unknown> = {};
  for (const field of Object.values(automationEntityEnrichmentTemplate(entityType).fields)) {
    const raw = rawValue(proposed, field);
    if (raw === undefined) continue;
    const value = normalize(field.normalization, raw);
    if (value !== null && value !== undefined && !(typeof value === "string" && !value.trim())) {
      output[field.canonicalField] = value;
    }
  }
  return output;
}

export function automationEnrichmentCompleteness(
  entityType: AutomationEntityType,
  proposed: Record<string, unknown>,
) {
  const template = automationEntityEnrichmentTemplate(entityType);
  const normalized = normalizeAutomationEnrichmentProposal(entityType, proposed);
  const present: string[] = [];
  const missingIdentity: string[] = [];
  const missingHighValue: string[] = [];
  const missingOptional: string[] = [];
  const missingEnrichable: string[] = [];
  let completeForDraft = true;

  for (const field of Object.values(template.fields)) {
    const has = Object.prototype.hasOwnProperty.call(normalized, field.canonicalField);
    if (has) {
      present.push(field.canonicalField);
      continue;
    }
    if (field.requiredForDraft) completeForDraft = false;
    if (field.priority === "IDENTITY") missingIdentity.push(field.canonicalField);
    else if (field.priority === "HIGH_VALUE") missingHighValue.push(field.canonicalField);
    else missingOptional.push(field.canonicalField);
    if (field.enrichmentAllowed) missingEnrichable.push(field.canonicalField);
  }

  return { present, missingIdentity, missingHighValue, missingOptional, missingEnrichable, completeForDraft };
}
