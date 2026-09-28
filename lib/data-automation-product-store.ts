import { env } from "cloudflare:workers";
import {
  automationCanonicalAdminHref,
  canonicalizeSourceUrl,
  sha256Hex,
  stableJson,
  type AutomationDiff,
  type AutomationEntityType,
  type AutomationFindingType,
} from "./data-automation.ts";
import {
  automationProductCategoryForEntity,
  automationServiceDirectoryCategories,
  type AutomationProductCategorySlug,
} from "./data-automation-product-model.ts";

type Database = Pick<D1Database, "prepare" | "batch">;
type RuntimeBindings = { DB?: D1Database };

export type CanonicalExternalProvenanceType =
  | "AUTOMATION_SOURCE_RECORD"
  | "DIRECT_ENTITY_DISCOVERY"
  | "DIRECT_ENTITY_REFRESH";

export type AutomationDirectRefreshSetting = {
  categorySlug: Extract<AutomationProductCategorySlug, "veterinari" | "psie-sluzby" | "utulky-organizacie">;
  entityType: "DIRECTORY" | "ORGANIZATION";
  enabled: boolean;
  cadenceMinutes: number;
  cursorEntityId: number;
  nextCheckAt: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
};

export type AutomationCanonicalContentLink = {
  entityType: AutomationEntityType;
  canonicalEntityId: number;
  label: string;
  status: string;
  secondary: string | null;
  href: string;
};

export type AutomationUpdateSuggestionSummary = {
  id: number;
  entityType: AutomationEntityType;
  canonicalEntityId: number;
  label: string;
  suggestionType: "POSSIBLE_UPDATE" | "POSSIBLE_INACTIVE" | "POSSIBLE_CANCELLED";
  field: string | null;
  value: string | null;
  href: string;
  sourceUrl: string | null;
  lastDetectedAt: string;
  origin: "DIRECT_ENTITY" | "FEED_SOURCE";
};

function database(input?: Database) {
  if (input?.prepare) return input;
  const bound = (env as unknown as RuntimeBindings).DB;
  if (bound?.prepare) return bound;
  throw new Error("Automation product model nemá pripojenú databázu.");
}

function parseJson(value: unknown) {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizedUrl(value: unknown) {
  return canonicalizeSourceUrl(value) ?? "";
}

function host(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function boundedUnique(values: string[], limit: number) {
  return [...new Set(values.filter(Boolean))].slice(0, limit);
}

export async function upsertCanonicalExternalProvenance(input: {
  entityType: AutomationEntityType;
  canonicalEntityId: number;
  externalSourceUrl?: string | null;
  externalRecordId: string;
  provenanceType: CanonicalExternalProvenanceType;
  detectedAt: string;
}, databaseInput?: Database) {
  const db = database(databaseInput);
  const externalSourceUrl = normalizedUrl(input.externalSourceUrl);
  const externalRecordId = input.externalRecordId.trim().slice(0, 240);
  if (!externalRecordId) throw new Error("canonical_external_provenance_record_id_missing");
  await db.prepare(`INSERT INTO canonical_external_provenance (
      entity_type,canonical_entity_id,external_source_url,external_record_id,provenance_type,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(entity_type,external_source_url,external_record_id)
    DO UPDATE SET canonical_entity_id=excluded.canonical_entity_id,
      provenance_type=excluded.provenance_type,updated_at=excluded.updated_at`).bind(
        input.entityType,
        input.canonicalEntityId,
        externalSourceUrl,
        externalRecordId,
        input.provenanceType,
        input.detectedAt,
        input.detectedAt,
      ).run();
}

export async function upsertDirectEntityUpdateSuggestion(input: {
  entityType: AutomationEntityType;
  canonicalEntityId: number;
  categorySlug: Extract<AutomationProductCategorySlug, "veterinari" | "psie-sluzby" | "utulky-organizacie">;
  externalSourceUrl?: string | null;
  externalRecordId: string;
  suggestionType: Extract<AutomationFindingType, "POSSIBLE_UPDATE" | "POSSIBLE_INACTIVE" | "POSSIBLE_CANCELLED">;
  before: Record<string, unknown>;
  proposed: Record<string, unknown>;
  diff: AutomationDiff;
  detectedAt: string;
}, databaseInput?: Database) {
  const db = database(databaseInput);
  const externalSourceUrl = normalizedUrl(input.externalSourceUrl);
  const fingerprint = await sha256Hex({
    entityType: input.entityType,
    canonicalEntityId: input.canonicalEntityId,
    externalSourceUrl,
    externalRecordId: input.externalRecordId,
    suggestionType: input.suggestionType,
  });
  const proposedJson = stableJson(input.proposed);
  const diffJson = stableJson(input.diff);
  await db.prepare(`INSERT INTO automation_update_suggestions (
      entity_type,canonical_entity_id,category_slug,external_source_url,external_record_id,suggestion_type,
      before_json,proposed_json,diff_json,fingerprint,status,first_detected_at,last_detected_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,'OPEN',?,?)
    ON CONFLICT(fingerprint) DO UPDATE SET
      before_json=excluded.before_json,proposed_json=excluded.proposed_json,diff_json=excluded.diff_json,
      status=CASE
        WHEN automation_update_suggestions.proposed_json=excluded.proposed_json
         AND automation_update_suggestions.diff_json=excluded.diff_json
        THEN automation_update_suggestions.status
        ELSE 'OPEN'
      END,
      last_detected_at=excluded.last_detected_at`).bind(
        input.entityType,
        input.canonicalEntityId,
        input.categorySlug,
        externalSourceUrl,
        input.externalRecordId.trim().slice(0, 240),
        input.suggestionType,
        JSON.stringify(input.before),
        proposedJson,
        diffJson,
        fingerprint,
        input.detectedAt,
        input.detectedAt,
      ).run();
}

function mapRefreshSetting(row: Record<string, unknown>): AutomationDirectRefreshSetting {
  return {
    categorySlug: String(row.category_slug) as AutomationDirectRefreshSetting["categorySlug"],
    entityType: String(row.entity_type) as AutomationDirectRefreshSetting["entityType"],
    enabled: Boolean(row.enabled),
    cadenceMinutes: Number(row.cadence_minutes),
    cursorEntityId: Number(row.cursor_entity_id ?? 0),
    nextCheckAt: row.next_check_at ? String(row.next_check_at) : null,
    lastCheckedAt: row.last_checked_at ? String(row.last_checked_at) : null,
    lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
    lastErrorAt: row.last_error_at ? String(row.last_error_at) : null,
    lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
  };
}

export async function getDirectEntityRefreshSetting(
  categorySlug: string,
  databaseInput?: Database,
) {
  const db = database(databaseInput);
  const row = await db.prepare(`SELECT * FROM automation_direct_refresh_settings
    WHERE category_slug=? LIMIT 1`).bind(categorySlug).first<Record<string, unknown>>();
  return row ? mapRefreshSetting(row) : null;
}

export async function configureDirectEntityRefreshSetting(input: {
  categorySlug: AutomationDirectRefreshSetting["categorySlug"];
  enabled: boolean;
  cadenceMinutes: number;
  now?: Date;
}, databaseInput?: Database) {
  const db = database(databaseInput);
  const cadence = Math.floor(input.cadenceMinutes);
  if (!Number.isSafeInteger(cadence) || cadence < 60 || cadence > 43_200) {
    throw new Error("automation_direct_refresh_cadence_invalid");
  }
  const at = (input.now ?? new Date()).toISOString();
  await db.prepare(`UPDATE automation_direct_refresh_settings SET
      enabled=?,cadence_minutes=?,next_check_at=?,cursor_entity_id=CASE WHEN ?=0 THEN 0 ELSE cursor_entity_id END,
      updated_at=?
    WHERE category_slug=?`).bind(
      input.enabled ? 1 : 0,
      cadence,
      input.enabled ? at : null,
      input.enabled ? 1 : 0,
      at,
      input.categorySlug,
    ).run();
  return getDirectEntityRefreshSetting(input.categorySlug, db);
}

export async function listDueDirectEntityRefreshSettings(
  databaseInput?: Database,
  now = new Date(),
  limit = 1,
) {
  const db = database(databaseInput);
  const result = await db.prepare(`SELECT * FROM automation_direct_refresh_settings
    WHERE enabled=1 AND (next_check_at IS NULL OR next_check_at<=?)
    ORDER BY COALESCE(next_check_at,'') ASC,category_slug ASC LIMIT ?`).bind(
      now.toISOString(),
      Math.max(1, Math.min(3, limit)),
    ).all<Record<string, unknown>>();
  return result.results.map(mapRefreshSetting);
}

export type DirectRefreshCandidate = {
  id: number;
  entityType: "DIRECTORY" | "ORGANIZATION";
  category: string | null;
  sourceUrl: string;
};

export async function listDirectRefreshCandidates(
  setting: AutomationDirectRefreshSetting,
  databaseInput?: Database,
  batchSize = 20,
) {
  const db = database(databaseInput);
  const limit = Math.max(1, Math.min(50, Math.floor(batchSize)));
  if (setting.categorySlug === "utulky-organizacie") {
    const result = await db.prepare(`SELECT id,website_url FROM help_organizations
      WHERE id>? AND website_url IS NOT NULL AND TRIM(website_url)<>''
      ORDER BY id ASC LIMIT ?`).bind(setting.cursorEntityId, limit).all<Record<string, unknown>>();
    return result.results.map((row) => ({
      id: Number(row.id),
      entityType: "ORGANIZATION" as const,
      category: null,
      sourceUrl: normalizedUrl(row.website_url),
    })).filter((row) => Boolean(row.sourceUrl));
  }

  const categories = setting.categorySlug === "veterinari"
    ? ["veterinari"]
    : automationServiceDirectoryCategories;
  const placeholders = categories.map(() => "?").join(",");
  const result = await db.prepare(`SELECT id,category,website_url FROM directory_profiles
    WHERE id>? AND category IN (${placeholders})
      AND website_url IS NOT NULL AND TRIM(website_url)<>''
    ORDER BY id ASC LIMIT ?`).bind(
      setting.cursorEntityId,
      ...categories,
      limit,
    ).all<Record<string, unknown>>();
  return result.results.map((row) => ({
    id: Number(row.id),
    entityType: "DIRECTORY" as const,
    category: String(row.category ?? ""),
    sourceUrl: normalizedUrl(row.website_url),
  })).filter((row) => Boolean(row.sourceUrl));
}

export async function finishDirectEntityRefreshSetting(input: {
  setting: AutomationDirectRefreshSetting;
  lastEntityId: number;
  batchWasFull: boolean;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  errorCode?: string | null;
  now?: Date;
}, databaseInput?: Database) {
  const db = database(databaseInput);
  const now = input.now ?? new Date();
  const at = now.toISOString();
  const cursor = input.batchWasFull ? Math.max(0, input.lastEntityId) : 0;
  const next = input.batchWasFull
    ? new Date(now.getTime() + 60 * 60_000).toISOString()
    : new Date(now.getTime() + input.setting.cadenceMinutes * 60_000).toISOString();
  await db.prepare(`UPDATE automation_direct_refresh_settings SET
      cursor_entity_id=?,next_check_at=?,last_checked_at=?,
      last_success_at=CASE WHEN ?='SUCCESS' THEN ? ELSE last_success_at END,
      last_error_at=CASE WHEN ?='SUCCESS' THEN last_error_at ELSE ? END,
      last_error_code=CASE WHEN ?='SUCCESS' THEN NULL ELSE ? END,
      updated_at=?
    WHERE category_slug=?`).bind(
      cursor,
      next,
      at,
      input.status,
      at,
      input.status,
      at,
      input.status,
      input.errorCode?.slice(0, 180) ?? null,
      at,
      input.setting.categorySlug,
    ).run();
}

export type AutomationDiscoveryExclusionContext = {
  categorySlug: AutomationProductCategorySlug | null;
  entityType: AutomationEntityType;
  directoryCategory: string | null;
  knownUrls: Set<string>;
  knownDomains: Set<string>;
  blockDomains: string[];
  exclusionCount: number;
};

export async function loadAutomationDiscoveryExclusions(input: {
  entityType: AutomationEntityType;
  directoryCategory?: unknown;
  directEntity: boolean;
}, databaseInput?: Database): Promise<AutomationDiscoveryExclusionContext> {
  const db = database(databaseInput);
  const categorySlug = automationProductCategoryForEntity(input.entityType, input.directoryCategory);
  const directoryCategory = input.entityType === "DIRECTORY" && typeof input.directoryCategory === "string"
    ? input.directoryCategory.trim().toLowerCase()
    : null;
  const knownUrls = new Set<string>();

  if (input.directEntity && input.entityType === "DIRECTORY" && directoryCategory) {
    const result = await db.prepare(`SELECT website_url FROM directory_profiles
      WHERE category=? AND website_url IS NOT NULL AND TRIM(website_url)<>''
      ORDER BY id DESC LIMIT 5000`).bind(directoryCategory).all<Record<string, unknown>>();
    result.results.forEach((row) => {
      const url = normalizedUrl(row.website_url);
      if (url) knownUrls.add(url);
    });
  } else if (input.directEntity && input.entityType === "ORGANIZATION") {
    const result = await db.prepare(`SELECT website_url,source_url FROM help_organizations
      WHERE (website_url IS NOT NULL AND TRIM(website_url)<>'')
         OR (source_url IS NOT NULL AND TRIM(source_url)<>'')
      ORDER BY id DESC LIMIT 5000`).all<Record<string, unknown>>();
    result.results.forEach((row) => {
      for (const value of [row.website_url, row.source_url]) {
        const url = normalizedUrl(value);
        if (url) knownUrls.add(url);
      }
    });
  } else {
    const sources = await db.prepare(`SELECT source_url FROM automation_sources
      WHERE entity_type=? AND source_url IS NOT NULL AND TRIM(source_url)<>''
      ORDER BY id DESC LIMIT 2000`).bind(input.entityType).all<Record<string, unknown>>();
    const candidates = await db.prepare(`SELECT canonical_url FROM automation_source_candidates
      WHERE entity_type=? AND review_status IN ('NEW','APPROVED','REJECTED')
      ORDER BY id DESC LIMIT 2000`).bind(input.entityType).all<Record<string, unknown>>();
    for (const row of [...sources.results, ...candidates.results]) {
      const url = normalizedUrl(row.source_url ?? row.canonical_url);
      if (url) knownUrls.add(url);
    }
  }

  const knownDomains = new Set([...knownUrls].map(host).filter(Boolean));
  return {
    categorySlug,
    entityType: input.entityType,
    directoryCategory,
    knownUrls,
    knownDomains,
    // A direct-entity domain can legitimately host several branches/profiles or
    // organizations. Exact URL filtering stays local/authoritative. Provider
    // domain blocking is reserved for FEED_SOURCE discovery, where the domain
    // itself is part of the recurring source identity.
    blockDomains: input.directEntity ? [] : boundedUnique([...knownDomains], 20),
    exclusionCount: knownUrls.size,
  };
}

export function automationDiscoveryCandidateExcluded(
  candidateUrl: string,
  exclusions: AutomationDiscoveryExclusionContext,
  directEntity: boolean,
) {
  const canonical = normalizedUrl(candidateUrl);
  if (!canonical) return true;
  if (exclusions.knownUrls.has(canonical)) return true;
  if (!directEntity) {
    const domain = host(canonical);
    if (domain && exclusions.knownDomains.has(domain)) return true;
  }
  return false;
}

async function canonicalLabelAndStatus(
  entityType: AutomationEntityType,
  id: number,
  db: Database,
) {
  const query = entityType === "EVENT"
    ? "SELECT title AS label,status,city FROM managed_events WHERE id=?"
    : entityType === "ORGANIZATION"
      ? "SELECT name AS label,status,city FROM help_organizations WHERE id=?"
      : entityType === "DIRECTORY"
        ? "SELECT name AS label,status,city FROM directory_profiles WHERE id=?"
        : entityType === "ADOPTION"
          ? "SELECT name AS label,status,city FROM adoption_dogs WHERE id=?"
          : entityType === "LOST_FOUND"
            ? "SELECT COALESCE(dog_name,city,'Stratené / nájdené') AS label,status,city FROM lost_found_dog_reports WHERE id=?"
            : "SELECT title AS label,status,city FROM help_cases WHERE id=?";
  const row = await db.prepare(query + " LIMIT 1").bind(id).first<Record<string, unknown>>();
  return row
    ? {
        label: String(row.label ?? ""),
        status: String(row.status ?? ""),
        secondary: String(row.city ?? "").trim() || null,
      }
    : null;
}

export async function listAutomationSourceCanonicalContent(
  sourceId: number,
  databaseInput?: Database,
  limit = 50,
): Promise<AutomationCanonicalContentLink[]> {
  const db = database(databaseInput);
  const result = await db.prepare(`SELECT DISTINCT p.entity_type,p.canonical_entity_id
    FROM automation_ingestion_receipts r
    JOIN canonical_external_provenance p
      ON p.entity_type=r.entity_type
     AND p.external_record_id=r.source_record_id
     AND p.external_source_url=COALESCE(r.source_url,'')
    WHERE r.source_id=?
    ORDER BY p.canonical_entity_id DESC LIMIT ?`).bind(
      sourceId,
      Math.max(1, Math.min(100, limit)),
    ).all<Record<string, unknown>>();
  const output: AutomationCanonicalContentLink[] = [];
  for (const row of result.results) {
    const entityType = row.entity_type as AutomationEntityType;
    const canonicalEntityId = Number(row.canonical_entity_id);
    const canonical = await canonicalLabelAndStatus(entityType, canonicalEntityId, db);
    const href = automationCanonicalAdminHref(entityType, canonicalEntityId);
    if (!canonical || !href) continue;
    output.push({ entityType, canonicalEntityId, ...canonical, href });
  }
  return output;
}

export async function listDirectEntityConcepts(
  categorySlug: Extract<AutomationProductCategorySlug, "veterinari" | "psie-sluzby" | "utulky-organizacie">,
  databaseInput?: Database,
  limit = 100,
): Promise<AutomationCanonicalContentLink[]> {
  const db = database(databaseInput);
  const provenance = await db.prepare(`SELECT entity_type,canonical_entity_id,MAX(updated_at) AS updated_at
    FROM canonical_external_provenance
    WHERE provenance_type IN ('DIRECT_ENTITY_DISCOVERY','DIRECT_ENTITY_REFRESH')
    GROUP BY entity_type,canonical_entity_id
    ORDER BY updated_at DESC LIMIT ?`).bind(Math.max(1, Math.min(200, limit * 3))).all<Record<string, unknown>>();
  const output: AutomationCanonicalContentLink[] = [];
  for (const row of provenance.results) {
    const entityType = row.entity_type as AutomationEntityType;
    const canonicalEntityId = Number(row.canonical_entity_id);
    const canonical = await canonicalLabelAndStatus(entityType, canonicalEntityId, db);
    const href = automationCanonicalAdminHref(entityType, canonicalEntityId);
    if (!canonical || !href || canonical.status.toLowerCase() !== "draft") continue;
    if (entityType === "DIRECTORY") {
      const profile = await db.prepare("SELECT category FROM directory_profiles WHERE id=? LIMIT 1")
        .bind(canonicalEntityId).first<{ category: string }>();
      const resolved = automationProductCategoryForEntity("DIRECTORY", profile?.category);
      if (resolved !== categorySlug) continue;
    } else if (automationProductCategoryForEntity(entityType) !== categorySlug) {
      continue;
    }
    output.push({ entityType, canonicalEntityId, ...canonical, href });
    if (output.length >= limit) break;
  }
  return output;
}

export async function listDirectEntityUpdateSuggestions(
  categorySlug: Extract<AutomationProductCategorySlug, "veterinari" | "psie-sluzby" | "utulky-organizacie">,
  databaseInput?: Database,
  limit = 100,
): Promise<AutomationUpdateSuggestionSummary[]> {
  const db = database(databaseInput);
  const result = await db.prepare(`SELECT id,entity_type,canonical_entity_id,suggestion_type,diff_json,
      external_source_url,last_detected_at
    FROM automation_update_suggestions
    WHERE category_slug=? AND status='OPEN'
    ORDER BY last_detected_at DESC,id DESC LIMIT ?`).bind(
      categorySlug,
      Math.max(1, Math.min(200, limit)),
    ).all<Record<string, unknown>>();
  const output: AutomationUpdateSuggestionSummary[] = [];
  for (const row of result.results) {
    const entityType = row.entity_type as AutomationEntityType;
    const canonicalEntityId = Number(row.canonical_entity_id);
    const canonical = await canonicalLabelAndStatus(entityType, canonicalEntityId, db);
    const href = automationCanonicalAdminHref(entityType, canonicalEntityId);
    if (!canonical || !href) continue;
    const diff = parseJson(row.diff_json);
    const field = Object.keys(diff)[0] ?? null;
    const change = field ? diff[field] : null;
    const after = change && typeof change === "object" && !Array.isArray(change)
      ? (change as Record<string, unknown>).after
      : null;
    const value = after === null || after === undefined
      ? null
      : typeof after === "string" || typeof after === "number" || typeof after === "boolean"
        ? String(after)
        : JSON.stringify(after).slice(0, 240);
    output.push({
      id: Number(row.id),
      entityType,
      canonicalEntityId,
      label: canonical.label,
      suggestionType: row.suggestion_type as AutomationUpdateSuggestionSummary["suggestionType"],
      field,
      value,
      href,
      sourceUrl: String(row.external_source_url ?? "") || null,
      lastDetectedAt: String(row.last_detected_at ?? ""),
      origin: "DIRECT_ENTITY",
    });
  }
  return output;
}

export async function listFeedUpdateSuggestions(
  sourceIds: number[],
  databaseInput?: Database,
  limit = 100,
): Promise<AutomationUpdateSuggestionSummary[]> {
  const db = database(databaseInput);
  const ids = [...new Set(sourceIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const result = await db.prepare(`SELECT id,entity_type,canonical_entity_id,finding_type,diff_json,source_url,last_detected_at
    FROM automation_findings
    WHERE source_id IN (${placeholders})
      AND canonical_entity_id IS NOT NULL
      AND finding_type IN ('POSSIBLE_UPDATE','POSSIBLE_INACTIVE','POSSIBLE_CANCELLED')
      AND review_status IN ('NEW','IN_REVIEW','SUPPRESSED')
    ORDER BY last_detected_at DESC,id DESC LIMIT ?`).bind(
      ...ids,
      Math.max(1, Math.min(200, limit)),
    ).all<Record<string, unknown>>();
  const output: AutomationUpdateSuggestionSummary[] = [];
  for (const row of result.results) {
    const entityType = row.entity_type as AutomationEntityType;
    const canonicalEntityId = Number(row.canonical_entity_id);
    const canonical = await canonicalLabelAndStatus(entityType, canonicalEntityId, db);
    const href = automationCanonicalAdminHref(entityType, canonicalEntityId);
    if (!canonical || !href) continue;
    const diff = parseJson(row.diff_json);
    const field = Object.keys(diff)[0] ?? null;
    const change = field ? diff[field] : null;
    const after = change && typeof change === "object" && !Array.isArray(change)
      ? (change as Record<string, unknown>).after
      : null;
    const value = after === null || after === undefined
      ? null
      : typeof after === "string" || typeof after === "number" || typeof after === "boolean"
        ? String(after)
        : JSON.stringify(after).slice(0, 240);
    output.push({
      id: Number(row.id),
      entityType,
      canonicalEntityId,
      label: canonical.label,
      suggestionType: row.finding_type as AutomationUpdateSuggestionSummary["suggestionType"],
      field,
      value,
      href,
      sourceUrl: row.source_url ? String(row.source_url) : null,
      lastDetectedAt: String(row.last_detected_at ?? ""),
      origin: "FEED_SOURCE",
    });
  }
  return output;
}
