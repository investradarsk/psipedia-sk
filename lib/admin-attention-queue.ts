import { ADOPTION_NOINDEX_STALE_DAYS, ADOPTION_STALE_DAYS } from "./adoption.ts";

export const ADMIN_ATTENTION_SOURCE_LIMIT = 50;
export const ADMIN_ATTENTION_QUERY_COUNT = 5;

export const adminAttentionSourceTypes = [
  "MODERATION_SUBMISSION",
  "NEWS_TIP",
  "DIRECTORY_CHANGE_REQUEST",
  "DIRECTORY_INQUIRY",
  "ADOPTION_STALE",
] as const;
export type AdminAttentionSourceType = (typeof adminAttentionSourceTypes)[number];

export const adminAttentionPriorities = ["HIGH", "MEDIUM", "LOW"] as const;
export type AdminAttentionPriority = (typeof adminAttentionPriorities)[number];

export type AdminAttentionMetadata = { label: string; value: string };

export type AdminAttentionItem = {
  key: string;
  sourceType: AdminAttentionSourceType;
  sourceId: string;
  title: string;
  reason: string;
  priority: AdminAttentionPriority;
  status: string;
  createdAt: string;
  relevantAt: string;
  ageDays: number;
  targetHref: string;
  metadata?: AdminAttentionMetadata[];
};

export type AdminAttentionFilters = {
  sourceType?: AdminAttentionSourceType | "all";
  priority?: AdminAttentionPriority | "all";
};

export const adminAttentionSourceLabels: Record<AdminAttentionSourceType, string> = {
  MODERATION_SUBMISSION: "Moderácia",
  NEWS_TIP: "Tipy pre redakciu",
  DIRECTORY_CHANGE_REQUEST: "Návrhy úprav",
  DIRECTORY_INQUIRY: "Dopyty",
  ADOPTION_STALE: "Adopcie",
};

export const adminAttentionPriorityLabels: Record<AdminAttentionPriority, string> = {
  HIGH: "Vysoká",
  MEDIUM: "Stredná",
  LOW: "Nízka",
};

const priorityRank: Record<AdminAttentionPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const DAY_MS = 86_400_000;

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ageDays(value: string, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - timestamp(value)) / DAY_MS));
}

function parseRiskFlagCount(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

const moderationTargets = {
  LOST_FOUND_CASE: { label: "Stratený / nájdený pes", href: "/admin/stratene-najdene" },
  ADOPTION_DOG: { label: "Pes na adopciu", href: "/admin/adopcie" },
} as const;

export type ModerationAttentionRow = {
  id: string;
  resourceType: string;
  operation: string;
  status: string;
  riskFlagsJson: string;
  createdAt: string;
  updatedAt: string;
};

export function mapModerationAttention(row: ModerationAttentionRow, now = new Date()): AdminAttentionItem | null {
  const target = moderationTargets[row.resourceType as keyof typeof moderationTargets];
  if (!target) return null;
  const riskFlagCount = parseRiskFlagCount(row.riskFlagsJson);
  const priority: AdminAttentionPriority = row.status === "QUARANTINED" || riskFlagCount > 0 ? "HIGH" : "MEDIUM";
  const reason = row.status === "QUARANTINED"
    ? "Podanie je v karanténe a vyžaduje kontrolu moderátora."
    : riskFlagCount > 0
      ? `Podanie čaká na moderáciu a má ${riskFlagCount} rizikový${riskFlagCount === 1 ? "" : "ch"} flag${riskFlagCount === 1 ? "" : "ov"}.`
      : row.status === "SUBMITTED"
        ? "Nové podanie čaká na zaradenie do moderácie."
        : "Podanie čaká na rozhodnutie moderátora.";
  return {
    key: `moderation:${row.id}`,
    sourceType: "MODERATION_SUBMISSION",
    sourceId: row.id,
    title: target.label,
    reason,
    priority,
    status: row.status,
    createdAt: row.createdAt,
    relevantAt: row.createdAt,
    ageDays: ageDays(row.createdAt, now),
    targetHref: target.href,
    metadata: [{ label: "Operácia", value: row.operation }],
  };
}

export type NewsTipAttentionRow = {
  id: number;
  title: string;
  topic: string;
  status: string;
  createdAt: string;
};

export function mapNewsTipAttention(row: NewsTipAttentionRow, now = new Date()): AdminAttentionItem {
  return {
    key: `news-tip:${row.id}`,
    sourceType: "NEWS_TIP",
    sourceId: String(row.id),
    title: row.title,
    reason: "Nový redakčný tip čaká na prvé spracovanie.",
    priority: "MEDIUM",
    status: row.status,
    createdAt: row.createdAt,
    relevantAt: row.createdAt,
    ageDays: ageDays(row.createdAt, now),
    targetHref: `/admin/tipy#tip-${row.id}`,
    metadata: [{ label: "Téma", value: row.topic }],
  };
}

export type DirectoryChangeRequestAttentionRow = {
  id: number;
  profileName: string;
  profileCategory: string;
  status: string;
  createdAt: string;
};

export function mapDirectoryChangeRequestAttention(row: DirectoryChangeRequestAttentionRow, now = new Date()): AdminAttentionItem {
  return {
    key: `directory-change:${row.id}`,
    sourceType: "DIRECTORY_CHANGE_REQUEST",
    sourceId: String(row.id),
    title: `Úprava profilu: ${row.profileName}`,
    reason: "Nový návrh zmeny profilu čaká na redakčnú kontrolu.",
    priority: "MEDIUM",
    status: row.status,
    createdAt: row.createdAt,
    relevantAt: row.createdAt,
    ageDays: ageDays(row.createdAt, now),
    targetHref: `/admin/adresar/navrhy#navrh-${row.id}`,
    metadata: [{ label: "Kategória", value: row.profileCategory }],
  };
}

export type DirectoryInquiryAttentionRow = {
  id: number;
  profileName: string;
  profileCategory: string;
  status: string;
  createdAt: string;
};

export function mapDirectoryInquiryAttention(row: DirectoryInquiryAttentionRow, now = new Date()): AdminAttentionItem {
  const elapsed = now.getTime() - timestamp(row.createdAt);
  const stale = elapsed >= DAY_MS;
  return {
    key: `directory-inquiry:${row.id}`,
    sourceType: "DIRECTORY_INQUIRY",
    sourceId: String(row.id),
    title: `Dopyt pre ${row.profileName}`,
    reason: stale ? "Nový dopyt je nevybavený viac ako 24 hodín." : "Nový dopyt čaká na prvé spracovanie.",
    priority: stale ? "HIGH" : "MEDIUM",
    status: row.status,
    createdAt: row.createdAt,
    relevantAt: row.createdAt,
    ageDays: ageDays(row.createdAt, now),
    targetHref: `/admin/dopyty#dopyt-${row.id}`,
    metadata: [{ label: "Kategória", value: row.profileCategory }],
  };
}

export type AdoptionStaleAttentionRow = {
  id: number;
  name: string;
  status: string;
  lastVerifiedAt: string | null;
  createdAt: string;
};

export function mapAdoptionStaleAttention(row: AdoptionStaleAttentionRow, now = new Date()): AdminAttentionItem {
  const relevantAt = row.lastVerifiedAt ?? row.createdAt;
  const daysSinceVerification = row.lastVerifiedAt ? ageDays(row.lastVerifiedAt, now) : null;
  const markedlyStale = row.lastVerifiedAt === null || (daysSinceVerification ?? 0) >= ADOPTION_NOINDEX_STALE_DAYS;
  const reason = row.lastVerifiedAt === null
    ? "Aktívna adopcia ešte nemá dátum posledného overenia."
    : markedlyStale
      ? `Aktívna adopcia nebola overená aspoň ${ADOPTION_NOINDEX_STALE_DAYS} dní.`
      : `Aktívna adopcia nebola overená aspoň ${ADOPTION_STALE_DAYS} dní.`;
  return {
    key: `adoption-stale:${row.id}`,
    sourceType: "ADOPTION_STALE",
    sourceId: String(row.id),
    title: row.name,
    reason,
    priority: markedlyStale ? "HIGH" : "MEDIUM",
    status: row.status,
    createdAt: row.createdAt,
    relevantAt,
    ageDays: ageDays(relevantAt, now),
    targetHref: `/admin/adopcie/${row.id}`,
  };
}

export function sortAdminAttentionItems(items: AdminAttentionItem[]) {
  return [...items].sort((a, b) => {
    const priority = priorityRank[a.priority] - priorityRank[b.priority];
    if (priority !== 0) return priority;
    const relevant = timestamp(a.relevantAt) - timestamp(b.relevantAt);
    if (relevant !== 0) return relevant;
    return a.key.localeCompare(b.key, "sk");
  });
}

export function filterAdminAttentionItems(items: AdminAttentionItem[], filters: AdminAttentionFilters) {
  return items.filter((item) =>
    (!filters.sourceType || filters.sourceType === "all" || item.sourceType === filters.sourceType)
    && (!filters.priority || filters.priority === "all" || item.priority === filters.priority));
}

export function summarizeAdminAttention(items: AdminAttentionItem[]) {
  const byPriority: Record<AdminAttentionPriority, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  const bySource = Object.fromEntries(adminAttentionSourceTypes.map((source) => [source, 0])) as Record<AdminAttentionSourceType, number>;
  for (const item of items) {
    byPriority[item.priority] += 1;
    bySource[item.sourceType] += 1;
  }
  return { total: items.length, byPriority, bySource };
}

export function isAdminAttentionSourceType(value: string): value is AdminAttentionSourceType {
  return (adminAttentionSourceTypes as readonly string[]).includes(value);
}

export function isAdminAttentionPriority(value: string): value is AdminAttentionPriority {
  return (adminAttentionPriorities as readonly string[]).includes(value);
}
