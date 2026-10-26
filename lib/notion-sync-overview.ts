/**
 * Read-only evidence from existing Notion ↔ Psipedia D1 mappings.
 * Counts and dates never establish live Notion availability or content parity.
 */
export const NOTION_SYNC_OVERVIEW_AREAS = [
  { key: "directory", label: "Adresár · služby", table: "directory_notion_sync", evidence: "MAPPINGS" },
  { key: "breeds", label: "Plemená", table: "breed_notion_sync", evidence: "MAPPINGS" },
  { key: "articles", label: "Články", table: "article_notion_sync", evidence: "MAPPINGS" },
  { key: "eshops", label: "E-shopy", table: "eshop_notion_sync", evidence: "MAPPINGS" },
  { key: "events", label: "Podujatia", table: "event_notion_sync", evidence: "MAPPINGS" },
  { key: "organizations", label: "Organizácie", table: "notion_agenda_sync", evidence: "MAPPINGS" },
  { key: "adoptions", label: "Adopcie", table: "notion_agenda_sync", evidence: "MAPPINGS" },
  { key: "help-cases", label: "Pomoc psom · prípady", table: "notion_agenda_sync", evidence: "MAPPINGS" },
  { key: "lost-found", label: "Stratené a nájdené", table: "notion_agenda_sync", evidence: "MAPPINGS" },
  { key: "service-catalog", label: "Katalóg služieb V3", table: "service_catalog_notion_auto_attempts", evidence: "VERIFIED_ATTEMPTS" },
  { key: "facebook-images", label: "Facebook obrázky", table: "facebook_image_posts", evidence: "LINKED_POSTS" },
] as const;

export type NotionOverviewArea = (typeof NOTION_SYNC_OVERVIEW_AREAS)[number]["key"];
export type NotionOverviewStatus = "RECORDED" | "EMPTY" | "SCHEMA_UNAVAILABLE" | "UNKNOWN";
export type NotionOverviewEvidence = "MAPPINGS" | "VERIFIED_ATTEMPTS" | "LINKED_POSTS";

export type NotionOverviewRow = {
  area: NotionOverviewArea;
  label: string;
  status: NotionOverviewStatus;
  evidence: NotionOverviewEvidence;
  count: number | null;
  lastMappingAt: string | null;
  /** Evidence of locally changed revisions/outbox work, NOT a Notion delivery queue. */
  pendingCount: number | null;
  pendingBasis: "REVISION_GAP" | "EDITORIAL_OUTBOX" | "NOT_RECORDED";
};

const KNOWN_TABLES = new Set<string>(NOTION_SYNC_OVERVIEW_AREAS.map((area) => area.table));

function finiteCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function validTimestamp(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

async function summarizeArea(
  db: D1Database,
  table: string,
  area: NotionOverviewArea,
): Promise<{ count: number | null; lastMappingAt: string | null }> {
  // All table names and SQL shapes are hardcoded, never interpolated from HTTP.
  let sql: string;
  if (table === "directory_notion_sync") {
    sql = "SELECT COUNT(*) AS count, MAX(last_synced_at) AS last_at FROM directory_notion_sync";
  } else if (table === "breed_notion_sync") {
    sql = "SELECT COUNT(*) AS count, MAX(last_synced_at) AS last_at FROM breed_notion_sync";
  } else if (table === "article_notion_sync") {
    sql = "SELECT COUNT(*) AS count, MAX(last_synced_at) AS last_at FROM article_notion_sync";
  } else if (table === "eshop_notion_sync") {
    sql = "SELECT COUNT(*) AS count, MAX(last_synced_at) AS last_at FROM eshop_notion_sync";
  } else if (table === "event_notion_sync") {
    sql = "SELECT COUNT(*) AS count, MAX(last_synced_at) AS last_at FROM event_notion_sync";
  } else if (table === "notion_agenda_sync") {
    sql = "SELECT COUNT(*) AS count, MAX(last_synced_at) AS last_at FROM notion_agenda_sync WHERE agenda=?";
  } else if (table === "service_catalog_notion_auto_attempts") {
    sql = "SELECT COUNT(*) AS count, MAX(finished_at) AS last_at " +
      "FROM service_catalog_notion_auto_attempts WHERE outcome='VERIFIED'";
  } else {
    // updated_at belongs to a Facebook post; it is NOT a Notion sync receipt.
    sql = "SELECT COUNT(*) AS count, NULL AS last_at FROM facebook_image_posts " +
      "WHERE notion_page_id IS NOT NULL AND TRIM(notion_page_id) <> ''";
  }
  const query = db.prepare(sql);
  const raw = table === "notion_agenda_sync"
    ? await query.bind(area).first<{ count: unknown; last_at: unknown }>()
    : await query.first<{ count: unknown; last_at: unknown }>();
  return { count: finiteCount(raw?.count), lastMappingAt: validTimestamp(raw?.last_at) };
}

type PendingEvidence = Pick<NotionOverviewRow, "pendingCount" | "pendingBasis">;

/** Optional, pre-existing evidence only. Failures must never look like zero backlog. */
async function pendingEvidence(db: D1Database, area: NotionOverviewArea,
  existing: ReadonlySet<string>): Promise<PendingEvidence> {
  let sql: string;
  let pendingBasis: PendingEvidence["pendingBasis"];
  if (area === "directory" && existing.has("directory_profiles")) {
    // Mapped records only: the canonical revision differs from the last D1
    // acknowledgement. This is an indicator, not proof of a Notion API failure.
    sql = "SELECT COUNT(*) AS count FROM directory_notion_sync m " +
      "JOIN directory_profiles p ON p.id=m.directory_profile_id " +
      "WHERE m.psipedia_updated_at IS NULL OR m.psipedia_updated_at <> p.updated_at";
    pendingBasis = "REVISION_GAP";
  } else if (area === "eshops" && existing.has("managed_eshops") && existing.has("eshop_ratings")) {
    sql = "SELECT COUNT(*) AS count FROM eshop_notion_sync m " +
      "JOIN managed_eshops e ON e.id=m.eshop_id " +
      "WHERE COALESCE(m.psipedia_updated_at,'') <> e.updated_at " +
      "OR EXISTS (SELECT 1 FROM eshop_ratings r WHERE r.eshop_id=e.id AND r.updated_at>m.last_synced_at)";
    pendingBasis = "REVISION_GAP";
  } else if (area === "articles" && existing.has("article_notion_editorial_outbox")) {
    // Durable queued editorial writebacks. Not every Article edit uses this outbox.
    sql = "SELECT COUNT(*) AS count FROM article_notion_editorial_outbox";
    pendingBasis = "EDITORIAL_OUTBOX";
  } else {
    return {pendingCount: null, pendingBasis: "NOT_RECORDED"};
  }
  try {
    const row = await db.prepare(sql).first<{count:unknown}>();
    return {pendingCount: finiteCount(row?.count), pendingBasis};
  } catch {
    return {pendingCount: null, pendingBasis: "NOT_RECORDED"};
  }
}

/** Bounded read-only aggregates with no Notion API calls and no full record fetch. */
export async function readNotionSyncOverview(db: D1Database): Promise<NotionOverviewRow[]> {
  const rows = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND " +
    "name IN ('directory_notion_sync','breed_notion_sync','article_notion_sync','eshop_notion_sync'," +
    "'event_notion_sync','notion_agenda_sync','service_catalog_notion_auto_attempts'," +
    "'facebook_image_posts','directory_profiles','managed_eshops','eshop_ratings'," +
    "'article_notion_editorial_outbox')",
  ).all<{ name: string }>();

  const existing = new Set(
    (rows.results ?? []).map((row) => row.name).filter((name) => KNOWN_TABLES.has(name)),
  );

  const result: NotionOverviewRow[] = [];
  for (const area of NOTION_SYNC_OVERVIEW_AREAS) {
    if (!existing.has(area.table)) {
      result.push({
        area: area.key,
        label: area.label,
        evidence: area.evidence,
        status: "SCHEMA_UNAVAILABLE",
        count: null,
        lastMappingAt: null,
        pendingCount: null,
        pendingBasis: "NOT_RECORDED",
      });
      continue;
    }
    try {
      const summary = await summarizeArea(db, area.table, area.key);
      const pending = await pendingEvidence(db, area.key, existing);
      result.push({
        area: area.key,
        label: area.label,
        evidence: area.evidence,
        status: summary.count === null ? "UNKNOWN" : summary.count === 0 ? "EMPTY" : "RECORDED",
        ...summary,
        ...pending,
      });
    } catch {
      result.push({
        area: area.key,
        label: area.label,
        evidence: area.evidence,
        status: "UNKNOWN",
        count: null,
        lastMappingAt: null,
        pendingCount: null,
        pendingBasis: "NOT_RECORDED",
      });
    }
  }
  return result;
}
