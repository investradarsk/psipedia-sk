export const automationEntityTypes = [
  "EVENT",
  "ORGANIZATION",
  "HELP_ITEM",
  "ADOPTION",
  "FOSTER",
  "LOST_FOUND",
  "DIRECTORY",
] as const;
export type AutomationEntityType = (typeof automationEntityTypes)[number];

export const automationFindingTypes = [
  "NEW_ENTITY",
  "POSSIBLE_UPDATE",
  "POSSIBLE_INACTIVE",
  "POSSIBLE_CANCELLED",
  "DUPLICATE_CANDIDATE",
  "SOURCE_ERROR",
] as const;
export type AutomationFindingType = (typeof automationFindingTypes)[number];

export const automationReviewStatuses = [
  "NEW",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "IGNORED",
  "SUPPRESSED",
  "RESOLVED",
] as const;
export type AutomationReviewStatus = (typeof automationReviewStatuses)[number];

export const automationConnectorTypes = ["STRUCTURED_JSON", "CONTROLLED_HTML", "MANUAL_IMPORT"] as const;
export type AutomationConnectorType = (typeof automationConnectorTypes)[number];

export const automationMatchQualities = [
  "EXACT_SOURCE_ID",
  "EXACT_CANONICAL_KEY",
  "STRONG_IDENTITY",
  "UNCERTAIN",
  "NONE",
] as const;
export type AutomationMatchQuality = (typeof automationMatchQualities)[number];

export const automationPriorities = ["HIGH", "MEDIUM", "LOW"] as const;
export type AutomationPriority = (typeof automationPriorities)[number];

export type AutomationSourceConfig = {
  recordsPath?: string;
  idField?: string;
  urlField?: string;
  timestampField?: string;
  fields?: Record<string, string>;
  staticFields?: Record<string, unknown>;
  htmlAdapterKey?: string;
};

export type AutomationSource = {
  id: number;
  sourceKey: string;
  label: string;
  entityType: AutomationEntityType;
  connectorType: AutomationConnectorType;
  sourceUrl: string | null;
  config: AutomationSourceConfig;
  enabled: boolean;
  cadenceMinutes: number;
  throttleMs: number;
  timeoutMs: number;
  retryMaxAttempts: number;
  retryBackoffMs: number;
  maxRecordsPerRun: number;
  nextCheckAt: string | null;
};

export type AutomationSourceRecord = {
  sourceRecordId: string;
  sourceUrl: string | null;
  sourceTimestamp: string | null;
  rawRecord: unknown;
  proposed: Record<string, unknown>;
};

export type AutomationCanonicalMatch = {
  entityType: AutomationEntityType;
  entityId: number | null;
  entityKey: string | null;
  quality: AutomationMatchQuality;
  before: Record<string, unknown> | null;
  candidates?: Array<{ id: number; key: string }>;
};

export type AutomationDiff = Record<string, { before: unknown; after: unknown }>;

export type AutomationFindingNotification = {
  id: number;
  sourceLabel: string;
  entityType: AutomationEntityType;
  findingType: AutomationFindingType;
  priority: AutomationPriority;
  sourceUrl: string | null;
  detectedAt: string;
  reviewStatus: AutomationReviewStatus;
};

const TRACKING_KEYS = new Set(["fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "_ga"]);
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.lan$/i,
  /\.home$/i,
  /^metadata\.google\.internal$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(?:1[6-9]|2\d|3[01])\./,
  /^\[?::1\]?$/,
];

export function isAutomationEntityType(value: unknown): value is AutomationEntityType {
  return typeof value === "string" && (automationEntityTypes as readonly string[]).includes(value);
}

export function isAutomationFindingType(value: unknown): value is AutomationFindingType {
  return typeof value === "string" && (automationFindingTypes as readonly string[]).includes(value);
}

export function isAutomationReviewStatus(value: unknown): value is AutomationReviewStatus {
  return typeof value === "string" && (automationReviewStatuses as readonly string[]).includes(value);
}

export function canonicalizeSourceUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || TRACKING_KEYS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

export function isSafeAutomationSourceUrl(value: unknown) {
  const normalized = canonicalizeSourceUrl(value);
  if (!normalized) return false;
  const url = new URL(normalized);
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) return false;
  if (url.hostname.includes(":")) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname)) return false;
  return true;
}

export function normalizeAutomationIdentity(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
}

export async function sha256Hex(value: unknown) {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : stableJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildAutomationDiff(before: Record<string, unknown> | null, proposed: Record<string, unknown>): AutomationDiff {
  if (!before) return Object.fromEntries(Object.entries(proposed).map(([key, after]) => [key, { before: null, after }]));
  const diff: AutomationDiff = {};
  for (const [key, after] of Object.entries(proposed)) {
    const previous = before[key] ?? null;
    if (stableJson(previous) !== stableJson(after ?? null)) diff[key] = { before: previous, after };
  }
  return diff;
}

export function classifyAutomationFinding(input: {
  match: AutomationCanonicalMatch;
  proposed: Record<string, unknown>;
}): { findingType: AutomationFindingType; diff: AutomationDiff } | null {
  if (input.match.quality === "UNCERTAIN") {
    return { findingType: "DUPLICATE_CANDIDATE", diff: buildAutomationDiff(input.match.before, input.proposed) };
  }
  if (!input.match.entityId) {
    return { findingType: "NEW_ENTITY", diff: buildAutomationDiff(null, input.proposed) };
  }
  const diff = buildAutomationDiff(input.match.before, input.proposed);
  if (Object.keys(diff).length === 0) return null;
  const beforeCancelled = Boolean(input.match.before?.cancelled);
  if (input.proposed.cancelled === true && !beforeCancelled) return { findingType: "POSSIBLE_CANCELLED", diff };
  const proposedStatus = normalizeAutomationIdentity(input.proposed.status);
  if (input.proposed.active === false || ["inactive", "archived", "closed", "expired", "adopted"].includes(proposedStatus)) {
    return { findingType: "POSSIBLE_INACTIVE", diff };
  }
  return { findingType: "POSSIBLE_UPDATE", diff };
}

export function automationFindingPriority(type: AutomationFindingType): AutomationPriority {
  if (type === "SOURCE_ERROR" || type === "POSSIBLE_CANCELLED") return "HIGH";
  if (type === "DUPLICATE_CANDIDATE") return "LOW";
  return "MEDIUM";
}

export function automationFindingFingerprint(input: {
  sourceKey: string;
  sourceRecordId: string;
  findingType: AutomationFindingType;
  canonicalEntityId: number | null;
  payloadHash: string;
}) {
  return [
    input.sourceKey,
    input.sourceRecordId,
    input.findingType,
    input.canonicalEntityId ?? "new",
    input.payloadHash,
  ].join(":");
}

export function boundedAutomationRecords<T>(records: T[], maxRecords: number) {
  const safe = Math.max(1, Math.min(500, Math.floor(maxRecords || 1)));
  return records.slice(0, safe);
}

export function retryBackoffMs(attempt: number, baseMs: number) {
  const safeAttempt = Math.max(0, Math.min(8, Math.floor(attempt)));
  const safeBase = Math.max(100, Math.min(30_000, Math.floor(baseMs || 1000)));
  return Math.min(30_000, safeBase * (2 ** safeAttempt));
}

export function shouldRetryAutomationStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function nextAutomationCheckAt(now: Date, cadenceMinutes: number) {
  const safe = Math.max(60, Math.min(43_200, Math.floor(cadenceMinutes || 1440)));
  return new Date(now.getTime() + safe * 60_000).toISOString();
}

export function shouldReopenSuppressedFinding(input: {
  reviewStatus: AutomationReviewStatus;
  suppressedUntil: string | null;
  now: Date;
  payloadChanged: boolean;
}) {
  if (input.payloadChanged) return true;
  if (input.reviewStatus !== "SUPPRESSED" || !input.suppressedUntil) return false;
  const until = Date.parse(input.suppressedUntil);
  return Number.isFinite(until) && until <= input.now.getTime();
}

export type AutomationReviewAction = "start-review" | "approve" | "reject" | "ignore" | "suppress";

export function automationReviewEffect(action: AutomationReviewAction) {
  const status: AutomationReviewStatus =
    action === "start-review" ? "IN_REVIEW"
      : action === "approve" ? "APPROVED"
        : action === "reject" ? "REJECTED"
          : action === "ignore" ? "IGNORED"
            : "SUPPRESSED";
  return {
    reviewStatus: status,
    canonicalWrite: false,
    publication: false,
  } as const;
}

export function automationCanonicalAdminHref(entityType: AutomationEntityType, id: number | null) {
  if (!id) return null;
  if (entityType === "EVENT") return `/admin/podujatia/${id}`;
  if (entityType === "ORGANIZATION") return `/admin/organizacie/${id}`;
  if (entityType === "DIRECTORY") return `/admin/adresar/${id}`;
  if (entityType === "ADOPTION") return `/admin/adopcie/${id}`;
  if (entityType === "LOST_FOUND") return `/admin/stratene-najdene/${id}`;
  return `/admin/pomoc/${id}`;
}


export function automationCanonicalNewHref(entityType: AutomationEntityType) {
  if (entityType === "EVENT") return "/admin/podujatia/nove";
  if (entityType === "ORGANIZATION") return "/admin/organizacie/novy";
  if (entityType === "DIRECTORY") return "/admin/adresar/novy";
  if (entityType === "ADOPTION") return "/admin/adopcie/novy";
  if (entityType === "LOST_FOUND") return "/admin/stratene-najdene/novy";
  return "/admin/pomoc/novy";
}
