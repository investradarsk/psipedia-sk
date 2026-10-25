import {
  decideBidirectionalChange,
  differingAgendaSnapshotFields,
} from "./notion-bidirectional-reconciliation.ts";
import type { NotionAuditAgenda, NotionAuditPage } from "./notion-data-quality-audit.ts";

/**
 * AUDIT 02 — read-only evidence analysis, separate from every write-capable sync.
 * This module may read bounded D1 rows but never selects private contact,
 * address, latitude or longitude columns. It does not call Notion.
 */
export type AuditDecision = "UPDATE" | "UNCHANGED" | "CONFLICT" | "REVIEW" | "SKIPPED";
export type AuditReason =
  | "BIDIRECTIONAL_CONFLICT" | "CONFIRMED_SITE_REVIEW_REQUIRED"
  | "MISSING_HOUSE_NUMBER" | "INVALID_LOCALITY" | "ILLEGAL_INVOCATION"
  | "INVALID_PHONE" | "INVALID_EMAIL" | "INVALID_WEBSITE"
  | "REMOTE_IMAGE_HTTP_403" | "REMOTE_IMAGE_HTTP_522" | "INVALID_IMAGE_FORMAT"
  | "DUPLICATE_IDENTITY" | "GOOGLE_PLACE_MISMATCH" | "PRIVACY_REVIEW_REQUIRED"
  | "LEGACY_BASELINE_MISMATCH" | "MISSING_MAPPING" | "ORPHAN_MAPPING"
  | "MAPPING_CONFLICT" | "MISSING_CANONICAL" | "UNKNOWN_SNAPSHOT"
  | "UNKNOWN_SOURCE" | "NOT_REQUIRED" | "NO_PSID" | "SYNC_ERROR";

export type AuditMapping = {
  notion_page_id: string;
  entity_id: number;
  content_hash: string | null;
  notion_last_edited_time: string | null;
  psipedia_updated_at: string | null;
};
export type AuditD1Evidence = {
  coverage: "VERIFIED" | "UNKNOWN";
  mappings: AuditMapping[];
  canonicalIds: number[];
};
export type AuditHashes = {
  baseline: string | null;
  notion: string | null;
  canonical: string | null;
};
export type AuditItem = {
  notionPageId: string;
  psipediaId: string;
  decision: AuditDecision;
  reason: AuditReason | null;
  mapping: "MATCH" | "MISSING" | "CONFLICT" | "UNKNOWN";
  canonical: "EXISTS" | "MISSING" | "UNKNOWN";
  baseline: "PRESENT" | "MISSING" | "UNKNOWN";
  notionChanged: boolean | null;
  d1Changed: boolean | null;
  fieldNames: string[] | null;
};
const AGENDA_TABLES: Record<NotionAuditAgenda, { table: string; mapping: string; key: string; agenda?: string }> = {
  directory: { table: "directory_profiles", mapping: "directory_notion_sync", key: "directory_profile_id" },
  events: { table: "managed_events", mapping: "event_notion_sync", key: "event_id" },
  organizations: { table: "help_organizations", mapping: "notion_agenda_sync", key: "entity_id", agenda: "organizations" },
  adoptions: { table: "adoption_dogs", mapping: "notion_agenda_sync", key: "entity_id", agenda: "adoptions" },
  "help-cases": { table: "help_cases", mapping: "notion_agenda_sync", key: "entity_id", agenda: "help-cases" },
  "lost-found": { table: "lost_found_dog_reports", mapping: "notion_agenda_sync", key: "entity_id", agenda: "lost-found" },
};

function propertyText(page: NotionAuditPage, name: string): string {
  const prop = page.properties?.[name];
  if (!prop) return "";
  const items = Array.isArray(prop.rich_text) ? prop.rich_text : Array.isArray(prop.title) ? prop.title : [];
  const value = items.map((item) => {
    if (!item || typeof item !== "object") return "";
    const part = item as { plain_text?: unknown; text?: { content?: unknown } };
    return typeof part.plain_text === "string" ? part.plain_text
      : typeof part.text?.content === "string" ? part.text.content : "";
  }).join("").trim();
  if (value) return value;
  if (typeof prop.number === "number") return String(prop.number);
  if (typeof prop.url === "string") return prop.url.trim();
  if (prop.select && typeof prop.select === "object") {
    const select = prop.select as { name?: unknown };
    if (typeof select.name === "string") return select.name;
  }
  return "";
}
function flag(page: NotionAuditPage, name: string) {
  return page.properties?.[name]?.checkbox === true;
}
function entityId(value: string): number | null {
  if (!/^[1-9]\d{0,12}$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}
function placeholders(n: number) {
  return "(" + Array.from({ length: n }, () => "?").join(",") + ")";
}

/** Read only IDs + stored baseline/metadata, for this single Notion page. */
export async function loadAuditD1Evidence(
  database: D1Database,
  agenda: NotionAuditAgenda,
  pages: NotionAuditPage[],
): Promise<AuditD1Evidence> {
  if (pages.length > 100) throw new Error("AUDIT_BATCH_LIMIT");
  const cfg = AGENDA_TABLES[agenda];
  const pageIds = [...new Set(pages.map((p) => p.id).filter(Boolean))];
  const ids = [...new Set(pages.map((p) => entityId(propertyText(p, "Psipedia ID"))).filter((id): id is number => id !== null))];
  if (pageIds.length === 0) return { coverage: "VERIFIED", mappings: [], canonicalIds: [] };
  try {
    // 100 Notion IDs plus 100 canonical IDs exceed Cloudflare D1's small
    // statement variable budget. Query bounded slices and deduplicate identity
    // evidence without changing the live synchronization or writing to D1.
    const mappings = new Map<string, AuditMapping>();
    const BATCH = 40;
    for (let offset = 0; offset < Math.max(pageIds.length, ids.length); offset += BATCH) {
      const scopedPages = pageIds.slice(offset, offset + BATCH);
      const scopedIds = ids.slice(offset, offset + BATCH);
      const clauses: string[] = [];
      const params: Array<string | number> = [];
      if (scopedPages.length) {
        clauses.push("notion_page_id IN " + placeholders(scopedPages.length));
        params.push(...scopedPages);
      }
      if (scopedIds.length) {
        clauses.push(cfg.key + " IN " + placeholders(scopedIds.length));
        params.push(...scopedIds);
      }
      const sql = "SELECT notion_page_id, " + cfg.key + " AS entity_id, content_hash, notion_last_edited_time, psipedia_updated_at FROM "
        + cfg.mapping + " WHERE " + (cfg.agenda ? "agenda = ? AND " : "") + "(" + clauses.join(" OR ") + ")"
        + " ORDER BY notion_page_id ASC LIMIT 201";
      const rows = await database.prepare(sql).bind(...(cfg.agenda ? [cfg.agenda, ...params] : params)).all<AuditMapping>();
      if ((rows.results ?? []).length > 200) return { coverage: "UNKNOWN", mappings: [], canonicalIds: [] };
      for (const row of rows.results ?? []) mappings.set(row.notion_page_id + ":" + row.entity_id, row);
      if (mappings.size > 200) return { coverage: "UNKNOWN", mappings: [], canonicalIds: [] };
    }
    const canonical = ids.length
      ? await database.prepare("SELECT id FROM " + cfg.table + " WHERE id IN " + placeholders(ids.length) + " ORDER BY id ASC LIMIT 100")
        .bind(...ids).all<{ id: number }>()
      : { results: [] as { id: number }[] };
    return {
      coverage: "VERIFIED",
      mappings: [...mappings.values()],
      canonicalIds: (canonical.results ?? []).map((row) => Number(row.id)),
    };
  } catch {
    // Old installations/missing tables/temporary D1 failures are UNKNOWN,
    // never assumed absent. Do not leak SQL exceptions in a public log.
    return { coverage: "UNKNOWN", mappings: [], canonicalIds: [] };
  }
}

function validHash(value: string | null | undefined) {
  return Boolean(value && /^[a-f0-9]{64}$/i.test(value));
}

/**
 * Proven hashes must use the same canonical snapshot contract; Notion's
 * historical "Sync hash" property is NOT a current Notion snapshot hash.
 * No UPDATE recommendation is emitted without all three current proofs.
 */
export function classifyAuditHashes(hashes: AuditHashes, guarded: boolean): {
  decision: AuditDecision;
  reason: AuditReason | null;
  notionChanged: boolean | null;
  d1Changed: boolean | null;
} {
  if (!validHash(hashes.baseline) || !validHash(hashes.notion) || !validHash(hashes.canonical)) {
    return { decision: "REVIEW", reason: validHash(hashes.baseline) ? "UNKNOWN_SNAPSHOT" : "LEGACY_BASELINE_MISMATCH",
      notionChanged: null, d1Changed: null };
  }
  const decision = decideBidirectionalChange({
    baselineHash: hashes.baseline!,
    notionHash: hashes.notion!,
    psipediaHash: hashes.canonical!,
  });
  if (decision.decision === "CONFLICT") return {
    decision: "CONFLICT", reason: "BIDIRECTIONAL_CONFLICT",
    notionChanged: true, d1Changed: true,
  };
  if (decision.decision === "UNCHANGED") return {
    decision: "UNCHANGED", reason: null,
    notionChanged: decision.notionChanged, d1Changed: decision.psipediaChanged,
  };
  return {
    decision: guarded ? "REVIEW" : "UPDATE",
    reason: guarded ? "PRIVACY_REVIEW_REQUIRED" : null,
    notionChanged: decision.notionChanged, d1Changed: decision.psipediaChanged,
  };
}

/** Field *names* only, for fixture-supplied independent snapshots (incl. event 187). */
export function auditFieldNames(
  agenda: NotionAuditAgenda,
  notion: Record<string, unknown> | null,
  canonical: Record<string, unknown> | null,
): string[] | null {
  return notion && canonical ? differingAgendaSnapshotFields(agenda, notion, canonical) : null;
}

function privacyGuard(agenda: NotionAuditAgenda, page: NotionAuditPage) {
  if (agenda !== "help-cases" && agenda !== "lost-found" && agenda !== "adoptions") return false;
  const visibility = propertyText(page, "Verejná viditeľnosť").toUpperCase();
  const precision = propertyText(page, "Presnosť lokality").toUpperCase();
  const hasCoordinates = typeof page.properties?.Latitude?.number === "number"
    && typeof page.properties?.Longitude?.number === "number";
  // No confirmed public precision is NOT proof that exposing a location is safe.
  return visibility.includes("PRIVATE") || precision.includes("PRIVATE")
    || precision.includes("APPROX") || (hasCoordinates && !visibility.includes("EXACT_PUBLIC"));
}

export function analyzeAuditEvidence(
  agenda: NotionAuditAgenda,
  pages: NotionAuditPage[],
  d1: AuditD1Evidence,
  proofs: Record<string, { notion: string | null; canonical: string | null; notionFields?: Record<string, unknown>; canonicalFields?: Record<string, unknown> }> = {},
): {
  evidence: "VERIFIED_IDS_ONLY" | "UNKNOWN";
  totals: Record<AuditDecision, number>;
  reasons: Record<string, number>;
  items: AuditItem[];
  unknown: string[];
} {
  if (pages.length > 100) throw new Error("AUDIT_BATCH_LIMIT");
  const totals: Record<AuditDecision, number> = { UPDATE: 0, UNCHANGED: 0, CONFLICT: 0, REVIEW: 0, SKIPPED: 0 };
  const reasons: Record<string, number> = {};
  const seenIds = new Map<string, number>();
  const seenUrls = new Map<string, number>();
  for (const page of pages) {
    const id = propertyText(page, "Psipedia ID");
    const url = propertyText(page, "URL Psipedia");
    if (id) seenIds.set(id, (seenIds.get(id) ?? 0) + 1);
    if (url) seenUrls.set(url, (seenUrls.get(url) ?? 0) + 1);
  }
  const canonical = new Set(d1.canonicalIds);
  const items: AuditItem[] = pages.map((page) => {
    const id = propertyText(page, "Psipedia ID");
    const numericId = entityId(id);
    const url = propertyText(page, "URL Psipedia");
    const mappingsByPage = d1.mappings.filter((row) => row.notion_page_id === page.id);
    const mappingsByEntity = numericId === null ? [] : d1.mappings.filter((row) => Number(row.entity_id) === numericId);
    const mapping = mappingsByPage[0] ?? mappingsByEntity[0];
    const record: AuditItem = {
      notionPageId: page.id, psipediaId: id,
      decision: "REVIEW", reason: "UNKNOWN_SNAPSHOT", mapping: "UNKNOWN",
      canonical: "UNKNOWN", baseline: "UNKNOWN", notionChanged: null, d1Changed: null, fieldNames: null,
    };
    if (d1.coverage !== "VERIFIED") {
      record.reason = "UNKNOWN_SOURCE";
    } else if (!numericId) {
      record.decision = "SKIPPED";
      record.reason = "NO_PSID";
      record.mapping = "MISSING";
    } else {
      record.canonical = canonical.has(numericId) ? "EXISTS" : "MISSING";
      record.mapping = mapping ? "MATCH" : "MISSING";
      record.baseline = mapping ? validHash(mapping.content_hash) ? "PRESENT" : "MISSING" : "MISSING";
      if ((seenIds.get(id) ?? 0) > 1 || (url && (seenUrls.get(url) ?? 0) > 1)
        || mappingsByPage.length > 1 || mappingsByEntity.length > 1) {
        record.decision = "CONFLICT";
        record.reason = "DUPLICATE_IDENTITY";
        record.mapping = "CONFLICT";
      } else if (mapping && (mapping.notion_page_id !== page.id || Number(mapping.entity_id) !== numericId)) {
        record.decision = "CONFLICT";
        record.reason = "MAPPING_CONFLICT";
        record.mapping = "CONFLICT";
      } else if (mapping && record.canonical === "MISSING") {
        record.reason = "ORPHAN_MAPPING";
      } else if (record.canonical === "MISSING") {
        record.reason = "MISSING_CANONICAL";
      } else if (!mapping) {
        record.reason = "MISSING_MAPPING";
      } else {
        const confirmed = flag(page, "Potvrdená prevádzka") || flag(page, "Google miesto aktuálne");
        const notRequired = flag(page, "Google Maps netreba");
        const privateGeo = privacyGuard(agenda, page);
        const proof = proofs[page.id];
        const decision = classifyAuditHashes({
          baseline: mapping.content_hash,
          notion: proof?.notion ?? null,
          canonical: proof?.canonical ?? null,
        }, confirmed || notRequired || privateGeo);
        Object.assign(record, decision);
        if (decision.decision === "REVIEW" && decision.reason === "PRIVACY_REVIEW_REQUIRED") {
          record.reason = confirmed ? "CONFIRMED_SITE_REVIEW_REQUIRED"
            : notRequired ? "NOT_REQUIRED" : "PRIVACY_REVIEW_REQUIRED";
        } else if (privateGeo && decision.decision !== "CONFLICT" && decision.decision !== "UNCHANGED") {
          record.reason = "PRIVACY_REVIEW_REQUIRED";
        } else if (confirmed && decision.decision === "REVIEW") {
          record.reason = "CONFIRMED_SITE_REVIEW_REQUIRED";
        } else if (notRequired && decision.decision === "REVIEW") {
          record.reason = "NOT_REQUIRED";
        }
        record.fieldNames = auditFieldNames(agenda, proof?.notionFields ?? null, proof?.canonicalFields ?? null);
      }
    }
    totals[record.decision] += 1;
    if (record.reason) reasons[record.reason] = (reasons[record.reason] ?? 0) + 1;
    return record;
  });
  return {
    evidence: d1.coverage === "VERIFIED" ? "VERIFIED_IDS_ONLY" : "UNKNOWN",
    totals, reasons, items,
    unknown: [
      "CURRENT_NOTION_SNAPSHOT_HASH", "CURRENT_D1_SNAPSHOT_HASH",
      "CROSS_BATCH_DUPLICATES", "GLOBAL_ORPHAN_MAPPINGS", "GOOGLE_PLACE_ID_MATCH",
      "NOTION_CREATED_TIME_TIES", "IMMUTABLE_NOTION_SNAPSHOT",
      ...(d1.coverage === "VERIFIED" ? [] : ["D1_MAPPING_AND_CANONICAL_COVERAGE"]),
    ],
  };
}
