import { acquireGeminiNotionLock } from "./gemini-notion-review-lock.ts";
import { notionPageBelongsToDataSource } from "./notion-sync-page-ownership.ts";
import { geminiImportAgenda } from "./gemini-notion-provenance.ts";
import { resolveGeminiPublicSlug, type GeminiSlugAgenda } from "./gemini-public-slug.ts";
import { notionCategoryValue } from "../scripts/gemini-notion-category.mjs";
import {
  loadNotionBulkEvents,
  loadNotionBulkOrganizations,
  loadNotionBulkAdoptions,
  loadNotionBulkHelpCases,
  loadNotionBulkLostFound,
} from "./notion-bulk-sources.ts";
import type {
  CanonicalSourceRecord,
  ReconciliationValue,
} from "./notion-bulk-reconciliation.ts";
import {
  decideBidirectionalChange,
  differingAgendaSnapshotFields,
  matchCanonicalIdentity,
  stableAgendaSnapshotJson,
  type IdentityPage,
} from "./notion-bidirectional-reconciliation.ts";
import {
  agendaEditableFields,
  applyNotionToCanonical,
  canonicalUpdatedAt,
  hasCurrentGooglePlace,
  hasCurrentOrganizationGooglePlace,
  createCanonicalFromNotion,
  GEMINI_HELP_REVIEW_PROPERTY,
  helpCaseMayEnterCanonicalSync,
  readyForCreate,
  trustedGeminiSourceIsPrivateDraft,
  type BidirectionalAgendaKey,
} from "./notion-events-help-adapters.ts";
import {
  resolveNotionCanonicalTarget,
  type NotionCanonicalTargetDefinition,
} from "./notion-canonical-target.ts";
import { notionGeoMirrorChanges, notionGeoMirrorFields } from "./notion-geo-mirror.ts";
import { auditHelpSyncMappings, isHelpSyncCategoryOutOfDomain, type HelpSyncDomainReason } from "./notion-help-domain-boundary.ts";
import { mergeNotionEventPriority, notionEventPriorityAEnabled } from "./notion-event-priority.ts";
import { gemini22PriorityEnabled, mergeGeminiHelpPriority } from "./notion-gemini-22-priority.ts";
import { readProfileFieldBaseline, recordProfileFieldBaseline } from "./notion-profile-field-baseline.ts";
import { reconcileProfileFields, trustedProfileBaselineFromHashes } from "./notion-profile-field-reconciliation.ts";
import {
  appendNotionReview,
  canClearResolvedNotionConflict,
  emptyNotionReviewQueue,
  notionConflictMetadataNeedsWrite,
  type NotionReviewQueue,
} from "./notion-data-quality-recovery.ts";
import {
  notionSeoSchemaExtensionFields,
  notionSeoSchemaExtensionIsDefault,
} from "./notion-seo-contract.ts";
import { requireNotionWritebackEvidence } from "./notion-sync-writeback-evidence.ts";
import {
  notionRequest,
  sha256Text,
  type NotionPage,
  type NotionSyncBindings,
} from "./notion-sync-shared.ts";

export type NotionEventsHelpSyncBindings = NotionSyncBindings & {
  NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED?: string;
  NOTION_EVENTS_DATA_SOURCE_ID?: string;
  NOTION_EVENTS_NOTION_PRIORITY_A_ENABLED?: string;
  NOTION_GEMINI_22_PRIORITY_A_ENABLED?: string;
};

export type NotionEventsHelpMode = "dry-run" | "bootstrap" | "sync";

type DataSourceProperty = { type?: string; [key: string]: unknown };
type DataSourceResponse = { id: string; properties?: Record<string, DataSourceProperty> };
type QueryResponse = { results?: NotionPage[]; has_more?: boolean; next_cursor?: string | null };

type MappingRow = {
  notion_page_id: string;
  entity_id: number;
  content_hash: string;
  notion_last_edited_time: string | null;
  psipedia_updated_at: string | null;
  last_synced_at: string;
};

type AgendaDefinition = {
  key: BidirectionalAgendaKey;
  label: string;
  targetTitle: string;
  titleProperty: string;
  load: (database: D1Database) => Promise<CanonicalSourceRecord[]>;
  configuredId?: (bindings: NotionEventsHelpSyncBindings) => string;
};

export type NotionAgendaSyncSummary = {
  agenda: BidirectionalAgendaKey;
  label: string;
  enabled: boolean;
  schemaReady: boolean;
  targetMissing: boolean;
  dataSourceId: string | null;
  duplicateTargetDataSourceIds: string[];
  scanned: number;
  bootstrapped: number;
  createdFromNotion: number;
  createdInNotion: number;
  pulledFromNotion: number;
  pushedToNotion: number;
  geoMirrorUpdates: number;
  unchanged: number;
  conflicts: number;
  failed: number;
  errors: Array<{
    entityId: number | null;
    notionPageId: string | null;
    operation: string;
    message: string;
  }>;
  conflictDetails: Array<{
    entityId: number | null;
    notionPageId: string | null;
    reason: string;
    fields: string[];
  }>;
  /** Value-free list of the first 100 conflicts for human review; no automatic winner. */
  reviewQueue: NotionReviewQueue;
  /** Read-only canonical boundary diagnostics. Never deletes or remaps legacy pages. */
  domainBoundary: {
    outOfDomain: number;
    missingCanonical: number;
    unmappedOutOfDomain: number;
    mappedNotionOutOfDomain: number;
    samples: Array<{ entityId: number; reason: HelpSyncDomainReason }>;
  };
  /** Number of obsolete conflict flags safely cleared after identical snapshots. */
  resolvedConflictFlags: number;
  staleConflictCandidates: number;
};

export type NotionEventsHelpSyncSummary = {
  enabled: boolean;
  mode: NotionEventsHelpMode;
  schemaReady: boolean;
  agendas: NotionAgendaSyncSummary[];
  totals: {
    scanned: number;
    bootstrapped: number;
    createdFromNotion: number;
    createdInNotion: number;
    pulledFromNotion: number;
    pushedToNotion: number;
    geoMirrorUpdates: number;
    unchanged: number;
    conflicts: number;
    failed: number;
    resolvedConflictFlags: number;
    staleConflictCandidates: number;
    reviewRequired: number;
  };
};

const definitions: AgendaDefinition[] = [
  {
    key: "events",
    label: "Podujatia",
    targetTitle: "Podujatia",
    titleProperty: "Názov",
    configuredId: (bindings) => clean(bindings.NOTION_EVENTS_DATA_SOURCE_ID),
    load: loadNotionBulkEvents,
  },
  {
    key: "organizations",
    label: "Organizácie",
    targetTitle: "Organizácie",
    titleProperty: "Názov",
    load: loadNotionBulkOrganizations,
  },
  {
    key: "adoptions",
    label: "Adopcie",
    targetTitle: "Adopcie",
    titleProperty: "Meno",
    load: loadNotionBulkAdoptions,
  },
  {
    key: "help-cases",
    label: "Pomoc psom — prípady",
    targetTitle: "Pomoc psom",
    titleProperty: "Názov",
    load: loadNotionBulkHelpCases,
  },
  {
    key: "lost-found",
    label: "Stratené / nájdené",
    targetTitle: "Stratené a nájdené",
    titleProperty: "Názov",
    load: loadNotionBulkLostFound,
  },
];

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function enabled(bindings: NotionEventsHelpSyncBindings) {
  const value = clean(bindings.NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED).toLowerCase();
  return (value === "1" || value === "true") && Boolean(clean(bindings.NOTION_API_TOKEN));
}

function plainText(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => (
    item && typeof item === "object" && typeof (item as Record<string, unknown>).plain_text === "string"
      ? String((item as Record<string, unknown>).plain_text)
      : ""
  )).join("").trim();
}

function pageProperty(page: NotionPage, name: string): ReconciliationValue {
  const property = page.properties?.[name];
  if (!property || typeof property !== "object") return "";
  const record = property as Record<string, unknown>;
  if (Array.isArray(record.title)) return plainText(record.title);
  if (Array.isArray(record.rich_text)) return plainText(record.rich_text);
  if (typeof record.url === "string") return record.url;
  if (typeof record.email === "string") return record.email;
  if (typeof record.phone_number === "string") return record.phone_number;
  if (typeof record.checkbox === "boolean") return record.checkbox;
  if (typeof record.number === "number") return record.number;
  if (record.select && typeof record.select === "object") return clean((record.select as Record<string, unknown>).name);
  if (record.status && typeof record.status === "object") return clean((record.status as Record<string, unknown>).name);
  if (record.date && typeof record.date === "object") return clean((record.date as Record<string, unknown>).start);
  return "";
}

function propertyType(schema: DataSourceProperty) {
  const explicit = clean(schema.type);
  if (explicit) return explicit;
  return Object.keys(schema).find((key) => !["id", "name", "description"].includes(key)) ?? "";
}

function chunks(value: string) {
  if (!value) return [];
  const result: Array<{ type: "text"; text: { content: string } }> = [];
  for (let index = 0; index < value.length; index += 1800) {
    result.push({ type: "text", text: { content: value.slice(index, index + 1800) } });
  }
  return result;
}

function encodeProperty(value: ReconciliationValue, schema: DataSourceProperty) {
  const type = propertyType(schema);
  if (type === "title") return { title: chunks(clean(value) || "Bez názvu") };
  if (type === "rich_text") return { rich_text: chunks(clean(value)) };
  if (type === "url") return { url: clean(value) || null };
  if (type === "email") return { email: clean(value) || null };
  if (type === "phone_number") return { phone_number: clean(value) || null };
  if (type === "checkbox") return { checkbox: Boolean(value) };
  if (type === "number") return { number: typeof value === "number" && Number.isFinite(value) ? value : null };
  if (type === "date") return { date: clean(value) ? { start: clean(value) } : null };
  if (type === "select") return { select: clean(value) ? { name: clean(value).slice(0, 100) } : null };
  return null;
}

function encodeProperties(
  values: Record<string, ReconciliationValue>,
  schema: Record<string, DataSourceProperty>,
) {
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(values)) {
    const propertySchema = schema[name];
    if (!propertySchema) continue;
    const encoded = encodeProperty(value, propertySchema);
    if (encoded) result[name] = encoded;
  }
  return result;
}

async function listAllPages(bindings: NotionEventsHelpSyncBindings, dataSourceId: string) {
  const pages: NotionPage[] = [];
  let cursor: string | null = null;
  do {
    const response = await notionRequest<QueryResponse>(
      bindings,
      `/data_sources/${encodeURIComponent(dataSourceId)}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      },
    );
    pages.push(...(response.results ?? []));
    cursor = response.has_more && response.next_cursor ? response.next_cursor : null;
  } while (cursor);
  return pages;
}

async function fetchDataSource(bindings: NotionEventsHelpSyncBindings, dataSourceId: string) {
  return notionRequest<DataSourceResponse>(
    bindings,
    `/data_sources/${encodeURIComponent(dataSourceId)}`,
  );
}

async function createPage(
  bindings: NotionEventsHelpSyncBindings,
  dataSourceId: string,
  properties: Record<string, unknown>,
) {
  return notionRequest<NotionPage>(bindings, "/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: dataSourceId },
      properties,
    }),
  });
}

async function patchPage(
  bindings: NotionEventsHelpSyncBindings,
  pageId: string,
  properties: Record<string, unknown>,
) {
  return notionRequest<NotionPage>(bindings, `/pages/${encodeURIComponent(pageId)}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
}

function editableSnapshot(
  agenda: BidirectionalAgendaKey,
  values: Record<string, ReconciliationValue>,
  schema: Record<string, DataSourceProperty>,
) {
  return Object.fromEntries(
    agendaEditableFields[agenda]
      .filter((name) => Boolean(schema[name]))
      .map((name) => [name, values[name] ?? null]),
  ) as Record<string, ReconciliationValue>;
}

function pageSnapshot(
  agenda: BidirectionalAgendaKey,
  page: NotionPage,
  schema: Record<string, DataSourceProperty>,
) {
  return Object.fromEntries(
    agendaEditableFields[agenda]
      .filter((name) => Boolean(schema[name]))
      .map((name) => [name, pageProperty(page, name)]),
  ) as Record<string, ReconciliationValue>;
}

async function requireVerifiedMappedNotionWriteback(input: {
  written: NotionPage;
  expectedPageId: string;
  agenda: BidirectionalAgendaKey;
  schema: Record<string, DataSourceProperty>;
  expectedHash: string;
}) {
  await requireNotionWritebackEvidence(
    input.written, input.expectedPageId, input.expectedHash,
    (page) => snapshotHash(input.agenda, pageSnapshot(input.agenda, page, input.schema)),
  );
}

async function snapshotHash(
  agenda: BidirectionalAgendaKey,
  values: Record<string, ReconciliationValue>,
) {
  return sha256Text(stableAgendaSnapshotJson(agenda, values));
}

function identityPage(page: NotionPage): IdentityPage {
  return {
    id: page.id,
    psipediaId: clean(pageProperty(page, "Psipedia ID")),
    url: clean(pageProperty(page, "URL Psipedia")),
  };
}

function canonicalTargetDefinition(
  definition: AgendaDefinition,
): NotionCanonicalTargetDefinition {
  return {
    key: definition.key,
    label: definition.label,
    targetTitle: definition.targetTitle,
    titleProperty: definition.titleProperty,
    configuredId: definition.configuredId
      ? (bindings) => definition.configuredId!(bindings as NotionEventsHelpSyncBindings)
      : undefined,
  };
}

async function schemaReady(database: D1Database) {
  const required = ["event_notion_sync", "notion_agenda_sync", "notion_agenda_targets"];
  const result = await database.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${required.map(() => "?").join(",")})`,
  ).bind(...required).all<{ name: string }>();
  if ((result.results ?? []).length !== required.length) return false;
  const eventColumns = await database.prepare("PRAGMA table_info(event_notion_sync)").all<{ name: string }>();
  return (eventColumns.results ?? []).some((row) => row.name === "psipedia_updated_at");
}

async function loadMappings(database: D1Database, agenda: BidirectionalAgendaKey) {
  if (agenda === "events") {
    const result = await database.prepare(`
      SELECT notion_page_id,event_id AS entity_id,content_hash,notion_last_edited_time,
        psipedia_updated_at,last_synced_at
      FROM event_notion_sync
    `).all<MappingRow>();
    return result.results ?? [];
  }
  const result = await database.prepare(`
    SELECT notion_page_id,entity_id,content_hash,notion_last_edited_time,
      psipedia_updated_at,last_synced_at
    FROM notion_agenda_sync WHERE agenda=?
  `).bind(agenda).all<MappingRow>();
  return result.results ?? [];
}

async function saveMapping(input: {
  database: D1Database;
  agenda: BidirectionalAgendaKey;
  pageId: string;
  entityId: number;
  hash: string;
  notionLastEditedTime: string | null;
  psipediaUpdatedAt: string | null;
  syncedAt: string;
  snapshot?: Record<string, ReconciliationValue>;
}) {
  // Never assert a common baseline if its hash does not match the snapshot.
  if (input.snapshot && await snapshotHash(input.agenda, input.snapshot) !== input.hash) {
    throw new Error("BASELINE_HASH_MISMATCH");
  }
  if (input.agenda === "events") {
    await input.database.prepare(`
      INSERT INTO event_notion_sync (
        notion_page_id,event_id,content_hash,notion_last_edited_time,
        psipedia_updated_at,last_synced_at,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(event_id) DO UPDATE SET
        notion_page_id=excluded.notion_page_id,
        content_hash=excluded.content_hash,
        notion_last_edited_time=excluded.notion_last_edited_time,
        psipedia_updated_at=excluded.psipedia_updated_at,
        last_synced_at=excluded.last_synced_at,
        updated_at=excluded.updated_at
    `).bind(
      input.pageId,
      input.entityId,
      input.hash,
      input.notionLastEditedTime,
      input.psipediaUpdatedAt,
      input.syncedAt,
      input.syncedAt,
      input.syncedAt,
    ).run();
    if (input.snapshot) await recordProfileFieldBaseline({
      database: input.database, agenda: input.agenda, entityId: input.entityId,
      pageId: input.pageId, hash: input.hash, snapshot: input.snapshot, syncedAt: input.syncedAt,
    });
    return;
  }
  await input.database.prepare(`
    INSERT INTO notion_agenda_sync (
      agenda,notion_page_id,entity_id,content_hash,notion_last_edited_time,
      psipedia_updated_at,last_synced_at,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(agenda,entity_id) DO UPDATE SET
      notion_page_id=excluded.notion_page_id,
      content_hash=excluded.content_hash,
      notion_last_edited_time=excluded.notion_last_edited_time,
      psipedia_updated_at=excluded.psipedia_updated_at,
      last_synced_at=excluded.last_synced_at,
      updated_at=excluded.updated_at
  `).bind(
    input.agenda,
    input.pageId,
    input.entityId,
    input.hash,
    input.notionLastEditedTime,
    input.psipediaUpdatedAt,
    input.syncedAt,
    input.syncedAt,
    input.syncedAt,
  ).run();
  if (input.snapshot) await recordProfileFieldBaseline({
    database: input.database, agenda: input.agenda, entityId: input.entityId,
    pageId: input.pageId, hash: input.hash, snapshot: input.snapshot, syncedAt: input.syncedAt,
  });
}

function sourceId(source: CanonicalSourceRecord) {
  // parseInt("123-unrelated") would silently alias canonical profile #123.
  if (!/^[1-9]\d*$/.test(source.id)) return null;
  const id = Number(source.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function sourceById(sources: CanonicalSourceRecord[]) {
  return new Map(
    sources.flatMap((source) => {
      const id = sourceId(source);
      return id === null ? [] : [[id, source] as const];
    }),
  );
}

function sourceDuplicateCandidate(
  page: NotionPage,
  definition: AgendaDefinition,
  sources: CanonicalSourceRecord[],
) {
  const slug = clean(pageProperty(page, "Slug"));
  const url = clean(pageProperty(page, "URL Psipedia"));
  const candidates = sources.filter((source) => {
    const sourceSlug = clean(source.properties["Slug"]);
    return (slug && sourceSlug === slug) || (url && source.url === url);
  });
  if (candidates.length === 0) return null;
  return candidates.map((source) => source.id).join(",");
}

function systemProperties(
  source: CanonicalSourceRecord,
  syncedAt: string,
  error = "",
) {
  return {
    "Psipedia ID": source.id,
    "URL Psipedia": source.url,
    "Sync stav": error ? "Chyba" : "Synchronizované",
    "Sync chyba": error,
    "Posledný sync": syncedAt,
  } satisfies Record<string, ReconciliationValue>;
}

async function writeSourceToNotion(input: {
  bindings: NotionEventsHelpSyncBindings;
  dataSourceId: string;
  source: CanonicalSourceRecord;
  schema: Record<string, DataSourceProperty>;
  pageId?: string | null;
}) {
  const syncedAt = new Date().toISOString();
  const properties = encodeProperties(
    {
      ...input.source.properties,
      ...systemProperties(input.source, syncedAt),
    },
    input.schema,
  );
  return input.pageId
    ? patchPage(input.bindings, input.pageId, properties)
    : createPage(input.bindings, input.dataSourceId, properties);
}

async function markConflict(input: {
  bindings: NotionEventsHelpSyncBindings;
  pageId: string;
  schema: Record<string, DataSourceProperty>;
  message: string;
  page?: NotionPage;
}) {
  if (input.page?.id === input.pageId && !notionConflictMetadataNeedsWrite({
    syncStatus: clean(pageProperty(input.page, "Sync stav")),
    syncError: clean(pageProperty(input.page, "Sync chyba")),
    message: input.message,
  })) return;
  const properties = encodeProperties({
    "Sync stav": "Chyba",
    "Sync chyba": `CONFLICT: ${input.message}`.slice(0, 1800),
    "Posledný sync": new Date().toISOString(),
  }, input.schema);
  if (Object.keys(properties).length) {
    await patchPage(input.bindings, input.pageId, properties);
  }
}

function emptyAgenda(definition: AgendaDefinition, isEnabled: boolean, ready: boolean): NotionAgendaSyncSummary {
  return {
    agenda: definition.key,
    label: definition.label,
    enabled: isEnabled,
    schemaReady: ready,
    targetMissing: false,
    dataSourceId: null,
    duplicateTargetDataSourceIds: [],
    scanned: 0,
    bootstrapped: 0,
    createdFromNotion: 0,
    createdInNotion: 0,
    pulledFromNotion: 0,
    pushedToNotion: 0,
    geoMirrorUpdates: 0,
    unchanged: 0,
    conflicts: 0,
    failed: 0,
    errors: [],
    conflictDetails: [],
    reviewQueue: emptyNotionReviewQueue(),
    domainBoundary: { outOfDomain: 0, missingCanonical: 0, unmappedOutOfDomain: 0, mappedNotionOutOfDomain: 0, samples: [] },
    resolvedConflictFlags: 0,
    staleConflictCandidates: 0,
  };
}

function logFailure(
  summary: NotionAgendaSyncSummary,
  input: {
    entityId?: number | null;
    notionPageId?: string | null;
    operation: string;
    error: unknown;
  },
) {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  summary.failed += 1;
  summary.errors.push({
    entityId: input.entityId ?? null,
    notionPageId: input.notionPageId ?? null,
    operation: input.operation,
    message,
  });
  console.error(JSON.stringify({
    event: "notion_events_help_sync_error",
    agenda: summary.agenda,
    psipediaId: input.entityId ?? null,
    notionPageId: input.notionPageId ?? null,
    operation: input.operation,
    error: message,
  }));
}

async function syncAgenda(input: {
  database: D1Database;
  bindings: NotionEventsHelpSyncBindings;
  definition: AgendaDefinition;
  mode: NotionEventsHelpMode;
  isEnabled: boolean;
  ready: boolean;
  targetPageId?: string;
  expectedNotionRevision?: string;
  reviewedLegacy?: boolean;
}) {
  const summary = emptyAgenda(input.definition, input.isEnabled, input.ready);
  if (!input.isEnabled || !input.ready) return summary;

  const target = await resolveNotionCanonicalTarget({
    database: input.database,
    bindings: input.bindings as NotionEventsHelpSyncBindings & Record<string, unknown>,
    definition: canonicalTargetDefinition(input.definition),
    allowCreate: false,
    persist: input.mode !== "dry-run",
  });
  summary.dataSourceId = target.dataSourceId;
  summary.targetMissing = target.targetMissing;
  summary.duplicateTargetDataSourceIds = target.duplicateDataSourceIds;
  if (!target.dataSourceId) return summary;

  const dataSource = await fetchDataSource(input.bindings, target.dataSourceId);
  const schema = dataSource.properties ?? {};
  const required = [input.definition.titleProperty, "Psipedia ID", "URL Psipedia"];
  const missing = required.filter((name) => !schema[name]);
  if (missing.length) {
    logFailure(summary, {
      operation: "schema",
      error: new Error(`Chýbajú required properties: ${missing.join(", ")}`),
    });
    return summary;
  }

  let sources = await input.definition.load(input.database);
  const pages = await listAllPages(input.bindings, target.dataSourceId);
  summary.scanned = pages.length;
  // Never infer authority from a Notion query result alone. Cross-check the
  // actual parent and trash/archive metadata before identity matching,
  // canonical imports, or ANY PATCH (including Sync chyba metadata).
  const writablePages = pages.filter((page) =>
    notionPageBelongsToDataSource(page, target.dataSourceId!));
  for (const page of pages) {
    if (notionPageBelongsToDataSource(page, target.dataSourceId)) continue;
    summary.conflicts += 1;
    appendNotionReview(summary.reviewQueue, {
      entityId: null, notionPageId: page.id, reason: "IDENTITY_CONFLICT",
      fields: ["Notion data source"], baselineAvailable: false,
      notionChanged: null, psipediaChanged: null,
    });
  }
  const identities = writablePages.map(identityPage);
  const pagesById = new Map(writablePages.map((page) => [page.id, page]));
  // Targeted admin save still reads full source for identity conflicts, but
  // must never mutate a different Notion page or canonical profile.
  if (input.targetPageId && !pagesById.has(input.targetPageId))
    throw new Error("GEMINI_TARGETED_NOTION_PAGE_MISSING");
  if (input.targetPageId && input.expectedNotionRevision &&
      pagesById.get(input.targetPageId)?.last_edited_time !== input.expectedNotionRevision)
    throw new Error("GEMINI_SAVED_REVISION_CHANGED");
  let mappings = await loadMappings(input.database, input.definition.key);
  if (input.definition.key === "help-cases") {
    // All historical mappings remain reserved, including excluded categories
    // and orphan IDs. The loader now returns only domain-valid canonical rows,
    // so an orphan/dedicated mapping is NEVER pulled, patched, or recreated.
    const audit = await auditHelpSyncMappings(input.database);
    summary.domainBoundary.outOfDomain = audit.outOfDomain;
    summary.domainBoundary.missingCanonical = audit.missingCanonical;
    summary.domainBoundary.samples = audit.issues.slice(0, 25).map(
      ({ entityId, reason }) => ({ entityId, reason }),
    );
    summary.conflicts += audit.missingCanonical;
    for (const issue of audit.issues) {
      if (issue.reason !== "MISSING_CANONICAL") continue;
      appendNotionReview(summary.reviewQueue, {
        entityId: issue.entityId,
        notionPageId: issue.notionPageId,
        reason: "MISSING_CANONICAL",
        fields: ["Psipedia ID"],
        baselineAvailable: false,
        notionChanged: null,
        psipediaChanged: null,
      });
    }
  }
  const mappingByEntity = new Map(mappings.map((mapping) => [Number(mapping.entity_id), mapping]));
  const mappingByPage = new Map(mappings.map((mapping) => [mapping.notion_page_id, mapping]));
  let sourcesById = sourceById(sources);

  for (const source of sources) {
    const entityId = sourceId(source);
    if (entityId === null) continue;
    let mapping = mappingByEntity.get(entityId) ?? null;
    if (input.targetPageId && mapping?.notion_page_id !== input.targetPageId) continue;
    const sourceSnapshot = editableSnapshot(input.definition.key, source.properties, schema);
    const canonicalHash = await snapshotHash(input.definition.key, sourceSnapshot);

    if (!mapping) {
      const identity = matchCanonicalIdentity(source.id, source.url, identities);
      if (identity.kind === "CONFLICT") {
        summary.conflicts += 1;
        appendNotionReview(summary.reviewQueue, {
          entityId, notionPageId: identity.pageIds[0] ?? null, reason: "IDENTITY_CONFLICT",
          fields: ["Psipedia ID", "URL Psipedia"], baselineAvailable: false,
          notionChanged: null, psipediaChanged: null,
        });
        if (input.mode === "sync") {
          for (const pageId of identity.pageIds) {
            await markConflict({
              bindings: input.bindings,
              pageId,
              schema,
              page: pagesById.get(pageId),
              message: identity.reason,
            }).catch(() => undefined);
          }
        }
        continue;
      }

      if (identity.kind === "MATCH") {
        const existingPageMapping = mappingByPage.get(identity.page.id);
        if (existingPageMapping && Number(existingPageMapping.entity_id) !== entityId) {
          summary.conflicts += 1;
          appendNotionReview(summary.reviewQueue, {
            entityId, notionPageId: identity.page.id, reason: "MAPPING_CONFLICT",
            fields: ["Psipedia ID"], baselineAvailable: false,
            notionChanged: null, psipediaChanged: null,
          });
          if (input.mode === "sync") {
            await markConflict({
              bindings: input.bindings,
              pageId: identity.page.id,
              schema,
              page: pagesById.get(identity.page.id),
              message: "Notion stránka je už namapovaná na iný Psipedia záznam.",
            }).catch(() => undefined);
          }
          continue;
        }

        const page = pagesById.get(identity.page.id);
        if (!page) continue;
        const notionSnapshot = pageSnapshot(input.definition.key, page, schema);
        const notionHash = await snapshotHash(input.definition.key, notionSnapshot);
        if (notionHash !== canonicalHash) {
          const fields = differingAgendaSnapshotFields(
            input.definition.key,
            sourceSnapshot,
            notionSnapshot,
          );
          summary.conflicts += 1;
          if (summary.conflictDetails.length < 100) {
            summary.conflictDetails.push({
              entityId,
              notionPageId: page.id,
              reason: "BACKFILL_BASELINE_MISMATCH",
              fields,
            });
          }
          appendNotionReview(summary.reviewQueue, {
            entityId, notionPageId: page.id, reason: "BACKFILL_BASELINE_MISMATCH",
            fields, baselineAvailable: false, notionChanged: null, psipediaChanged: null,
          });
          if (input.mode === "sync") {
            await markConflict({
              bindings: input.bindings,
              pageId: page.id,
              schema,
              page,
              message: `Existujúci backfill záznam sa obsahovo líši od canonical Psipedia a nemá bezpečný baseline. Rozdielne polia: ${fields.join(", ") || "neznáme"}.`,
            }).catch(() => undefined);
          }
          continue;
        }

        summary.bootstrapped += 1;
        if (input.mode !== "dry-run") {
          const syncedAt = new Date().toISOString();
          const updatedAt = await canonicalUpdatedAt(input.definition.key, entityId, input.database);
          await saveMapping({
            database: input.database,
            agenda: input.definition.key,
            pageId: page.id,
            entityId,
            hash: canonicalHash,
            notionLastEditedTime: page.last_edited_time ?? null,
            psipediaUpdatedAt: updatedAt,
            syncedAt,
          });
          mapping = {
            notion_page_id: page.id,
            entity_id: entityId,
            content_hash: canonicalHash,
            notion_last_edited_time: page.last_edited_time ?? null,
            psipedia_updated_at: updatedAt,
            last_synced_at: syncedAt,
          };
          mappingByEntity.set(entityId, mapping);
          mappingByPage.set(page.id, mapping);
        }
        continue;
      }

      if (input.mode === "sync") {
        try {
          const page = await writeSourceToNotion({
            bindings: input.bindings,
            dataSourceId: target.dataSourceId,
            source,
            schema,
          });
          const syncedAt = new Date().toISOString();
          const updatedAt = await canonicalUpdatedAt(input.definition.key, entityId, input.database);
          await saveMapping({
            database: input.database,
            agenda: input.definition.key,
            pageId: page.id,
            entityId,
            hash: canonicalHash,
            notionLastEditedTime: page.last_edited_time ?? syncedAt,
            psipediaUpdatedAt: updatedAt,
            syncedAt,
          });
          summary.createdInNotion += 1;
        } catch (error) {
          logFailure(summary, { entityId, operation: "create_in_notion", error });
        }
      } else {
        summary.createdInNotion += 1;
      }
      continue;
    }

    const page = pagesById.get(mapping.notion_page_id);
    if (!page) {
      summary.conflicts += 1;
      appendNotionReview(summary.reviewQueue, {
        entityId, notionPageId: mapping.notion_page_id, reason: "MAPPING_CONFLICT",
        fields: [], baselineAvailable: false, notionChanged: null, psipediaChanged: null,
      });
      continue;
    }

    if (input.definition.key === "help-cases"
      && isHelpSyncCategoryOutOfDomain(clean(pageProperty(page, "Kategória")))) {
      // Canonical is still generic, but the mapped Notion page changed to a
      // dedicated category. Never pull that reassignment or PATCH the page.
      summary.domainBoundary.mappedNotionOutOfDomain += 1;
      summary.conflicts += 1;
      appendNotionReview(summary.reviewQueue, {
        entityId, notionPageId: page.id, reason: "OUT_OF_DOMAIN",
        fields: ["Kategória"], baselineAvailable: false,
        notionChanged: null, psipediaChanged: null,
      });
      continue;
    }

    try {
      const pageIdentity = identityPage(page);
      if (pageIdentity.psipediaId && pageIdentity.psipediaId !== source.id) {
        summary.conflicts += 1;
        appendNotionReview(summary.reviewQueue, {
          entityId, notionPageId: page.id, reason: "IDENTITY_CONFLICT",
          fields: ["Psipedia ID"], baselineAvailable: false, notionChanged: null, psipediaChanged: null,
        });
        if (input.mode === "sync") {
          await markConflict({
            bindings: input.bindings,
            pageId: page.id,
            schema,
            page,
            message: "Namapovaná stránka má iné Psipedia ID.",
          });
        }
        continue;
      }
      if (pageIdentity.url && pageIdentity.url !== source.url) {
        summary.conflicts += 1;
        appendNotionReview(summary.reviewQueue, {
          entityId, notionPageId: page.id, reason: "IDENTITY_CONFLICT",
          fields: ["URL Psipedia"], baselineAvailable: false, notionChanged: null, psipediaChanged: null,
        });
        if (input.mode === "sync") {
          await markConflict({
            bindings: input.bindings,
            pageId: page.id,
            schema,
            page,
            message: "Namapovaná stránka má inú URL Psipedia.",
          });
        }
        continue;
      }

      const notionSnapshot = pageSnapshot(input.definition.key, page, schema);
      const notionHash = await snapshotHash(input.definition.key, notionSnapshot);
      const extensionFields = notionSeoSchemaExtensionFields(input.definition.key);

      if (
        extensionFields.length
        && notionHash !== canonicalHash
        && notionSeoSchemaExtensionIsDefault(input.definition.key, notionSnapshot)
      ) {
        const extensionFieldSet = new Set<string>(extensionFields);
        const legacySourceSnapshot = Object.fromEntries(
          Object.entries(sourceSnapshot).filter(([name]) => !extensionFieldSet.has(name)),
        ) as Record<string, ReconciliationValue>;
        const legacyNotionSnapshot = Object.fromEntries(
          Object.entries(notionSnapshot).filter(([name]) => !extensionFieldSet.has(name)),
        ) as Record<string, ReconciliationValue>;
        const legacyCanonicalHash = await snapshotHash(input.definition.key, legacySourceSnapshot);
        const legacyNotionHash = await snapshotHash(input.definition.key, legacyNotionSnapshot);

        if (
          mapping.content_hash === legacyCanonicalHash
          && mapping.content_hash === legacyNotionHash
        ) {
          if (input.mode !== "sync") {
            summary.pushedToNotion += 1;
            continue;
          }
          const written = await writeSourceToNotion({
            bindings: input.bindings,
            dataSourceId: target.dataSourceId,
            source,
            schema,
            pageId: page.id,
          });
await requireVerifiedMappedNotionWriteback({
  written, expectedPageId: page.id, agenda: input.definition.key,
  schema, expectedHash: canonicalHash,
});
          const syncedAt = new Date().toISOString();
          const updatedAt = await canonicalUpdatedAt(input.definition.key, entityId, input.database);
          await saveMapping({
            database: input.database,
            agenda: input.definition.key,
            pageId: page.id,
            entityId,
            hash: canonicalHash,
            notionLastEditedTime: written.last_edited_time ?? syncedAt,
            psipediaUpdatedAt: updatedAt,
            syncedAt,
          });
          summary.pushedToNotion += 1;
          continue;
        }
      }

      // Legacy event mappings predate psipedia_updated_at and are not a safe
      // bidirectional baseline. Adopt them only when both snapshots agree.
      if (!mapping.psipedia_updated_at) {
        if (notionHash !== canonicalHash) {
          summary.conflicts += 1;
          appendNotionReview(summary.reviewQueue, {
            entityId, notionPageId: page.id, reason: "LEGACY_BASELINE_MISMATCH",
            fields: differingAgendaSnapshotFields(input.definition.key, sourceSnapshot, notionSnapshot),
            baselineAvailable: false, notionChanged: null, psipediaChanged: null,
          });
          if (input.mode === "sync") {
            await markConflict({
              bindings: input.bindings,
              pageId: page.id,
              schema,
              page,
              message: "Legacy mapping nemá bidirectional baseline a obe strany sa obsahovo líšia.",
            });
          }
          continue;
        }
        summary.bootstrapped += 1;
        if (input.mode !== "dry-run") {
          const syncedAt = new Date().toISOString();
          const updatedAt = await canonicalUpdatedAt(input.definition.key, entityId, input.database);
          await saveMapping({
            database: input.database,
            agenda: input.definition.key,
            pageId: page.id,
            entityId,
            hash: canonicalHash,
            notionLastEditedTime: page.last_edited_time ?? null,
            psipediaUpdatedAt: updatedAt,
            syncedAt,
          });
        }
        continue;
      }

      const decision = decideBidirectionalChange({
        baselineHash: mapping.content_hash,
        notionHash,
        psipediaHash: canonicalHash,
      });

      // Fail-closed three-way reconciliation. Legacy hashes have no per-field
      // provenance; with no verified baseline we refuse even one-sided edits.
      // Keep the existing separately owner-approved priority modes usable;
      // the default path uses fail-closed per-field reconciliation instead.
      const legacyPriorityEnabled = input.definition.key === "events"
        ? notionEventPriorityAEnabled(input.bindings.NOTION_EVENTS_NOTION_PRIORITY_A_ENABLED)
        : gemini22PriorityEnabled(input.bindings.NOTION_GEMINI_22_PRIORITY_A_ENABLED);
      if (decision.decision !== "UNCHANGED" && !legacyPriorityEnabled) {
        const agenda = input.definition.key;
        const storedBaseline = await readProfileFieldBaseline({
          database: input.database, agenda, entityId, pageId: page.id,
          expectedHash: mapping.content_hash,
        });
        // An unchanged canonical or Notion snapshot authenticates the
        // last common field values, even before the optional baseline D1
        // schema exists. Two divergent sides with no persisted proof
        // remain an explicit review conflict.
        const baseline = trustedProfileBaselineFromHashes({
          recorded: storedBaseline, notion: notionSnapshot, psipedia: sourceSnapshot,
          mappingHash: mapping.content_hash, notionHash, psipediaHash: canonicalHash,
        });
        const protectedFields = new Set([
          "Slug", "Stav", "Psipedia stav", "Kategória", "Typ",
          "Typ podujatia", "Organizácia", "Vyriešené", "Urgentné",
          "Latitude", "Longitude", "Presnosť lokality", "Verejný kontakt",
          "Zdroj", "Zdroj URL", "Zdroj dát",
          // Publication-adjacent moderator decisions and contact notes are
          // edited via the canonical Admin flow, not inferred from Notion.
          "Zrušené", "Kontakt",
        ]);
        if (agenda === "lost-found") {
          protectedFields.add("Miesto");
          protectedFields.add("Naposledy videný");
        }
        const currentGooglePlace = agenda === "events"
          ? await hasCurrentGooglePlace(input.database, "MANAGED_EVENT", entityId)
          : agenda === "organizations"
            ? await hasCurrentOrganizationGooglePlace(input.database, entityId)
            : false;
        if (currentGooglePlace) {
          for (const field of ["Adresa", "Miesto", "Mesto", "Okres", "Kraj"]) protectedFields.add(field);
        }
        const resolution = reconcileProfileFields({
          baseline, notion: notionSnapshot, psipedia: sourceSnapshot, protectedFields,
          // Existing Events/Help hash comparison already trims strings and
          // normalizes timezone-aware lost/found instants. Apply the same
          // semantics to field-level change detection, not just record hashes.
          equalField: (path, left, right) =>
            stableAgendaSnapshotJson(agenda, { [path]: left })
            === stableAgendaSnapshotJson(agenda, { [path]: right }),
        });
        if (resolution.kind === "CONFLICT") {
          summary.conflicts += 1;
          appendNotionReview(summary.reviewQueue, {
            entityId, notionPageId: page.id, reason: "BIDIRECTIONAL_CONFLICT",
            fields: resolution.conflicts.map((c) => c.field),
            baselineAvailable: Boolean(baseline),
            notionChanged: decision.notionChanged, psipediaChanged: decision.psipediaChanged,
          });
          if (input.mode === "sync") {
            await markConflict({
              bindings: input.bindings, pageId: page.id, schema, page,
              message: "LOSSLESS_FIELD_REVIEW_REQUIRED: " +
                resolution.conflicts.map((c) => c.field + ":" + c.reason).join(", ").slice(0, 1300),
            });
          }
          continue;
        }
        const merged = resolution.merged as Record<string, ReconciliationValue>;
        const changed = differingAgendaSnapshotFields(agenda, sourceSnapshot, merged);
        if (input.mode !== "sync") {
          if (changed.length) summary.pulledFromNotion += 1;
          else summary.pushedToNotion += 1;
          continue;
        }
        let resolvedSource = source;
        if (changed.length) {
          await applyNotionToCanonical(agenda, entityId, merged, input.database);
          sources = await input.definition.load(input.database);
          sourcesById = sourceById(sources);
          const reloaded = sourcesById.get(entityId);
          if (!reloaded) throw new Error("CANONICAL_MISSING_AFTER_FIELD_RECONCILIATION");
          resolvedSource = reloaded;
        }
        const verifiedSnapshot = editableSnapshot(agenda, resolvedSource.properties, schema);
        const verifiedHash = await snapshotHash(agenda, verifiedSnapshot);
        const written = await writeSourceToNotion({
          bindings: input.bindings, dataSourceId: target.dataSourceId,
          source: resolvedSource, schema, pageId: page.id,
        });
        // A returned Notion page may be stale or partial. Never advance the
        // common mapping hash unless its editorial payload matches canonical.
        // Otherwise the next run could mistake an unacknowledged write for
        // a successful synchronization.
        if (written.id !== page.id) throw new Error("NOTION_EDITORIAL_WRITEBACK_ECHO_MISMATCH");
        if (!written.properties ||
            await snapshotHash(agenda, pageSnapshot(agenda, written, schema)) !== verifiedHash) {
          throw new Error("NOTION_EDITORIAL_WRITEBACK_ECHO_MISMATCH");
        }
        const syncedAt = new Date().toISOString();
        await saveMapping({
          database: input.database, agenda, pageId: page.id, entityId,
          hash: verifiedHash,
          snapshot: verifiedSnapshot,
          notionLastEditedTime: written.last_edited_time ?? syncedAt,
          psipediaUpdatedAt: await canonicalUpdatedAt(agenda, entityId, input.database),
          syncedAt,
        });
        if (changed.length) summary.pulledFromNotion += 1;
        else summary.pushedToNotion += 1;
        continue;
      }

      // Approved Events-only precedence (NOT applied to Help/Organizations).
      // This reconciles actual two-sided changes and also prevents a later
      // canonical-only edit from silently overwriting filled Notion editorial data.
      // Retain identity/publication authority and the current Google Places lock.
      if (input.definition.key === "events"
        && decision.decision !== "UNCHANGED"
        && notionEventPriorityAEnabled(input.bindings.NOTION_EVENTS_NOTION_PRIORITY_A_ENABLED)) {
        const confirmedGooglePlace = await hasCurrentGooglePlace(
          input.database, "MANAGED_EVENT", entityId,
        );
        const desired = mergeNotionEventPriority({
          canonical: sourceSnapshot,
          notion: notionSnapshot,
          confirmedGooglePlace,
        });
        const changedFields = differingAgendaSnapshotFields(
          "events", sourceSnapshot, desired,
        );

        if (input.mode !== "sync") {
          // Dry-run is strictly non-mutating. Preserve visible conflict
          // diagnostics instead of incorrectly reporting an applied repair.
          if (decision.decision === "CONFLICT") {
            summary.conflicts += 1;
            appendNotionReview(summary.reviewQueue, {
              entityId, notionPageId: page.id, reason: "BIDIRECTIONAL_CONFLICT",
              fields: differingAgendaSnapshotFields("events", sourceSnapshot, notionSnapshot),
              baselineAvailable: true, notionChanged: decision.notionChanged,
              psipediaChanged: decision.psipediaChanged,
            });
          }
          if (changedFields.length) summary.pulledFromNotion += 1;
          else summary.pushedToNotion += 1;
          continue;
        }

        let resolvedSource = source;
        if (changedFields.length) {
          await applyNotionToCanonical("events", entityId, desired, input.database);
          sources = await input.definition.load(input.database);
          sourcesById = sourceById(sources);
          const reloaded = sourcesById.get(entityId);
          if (!reloaded) throw new Error("Canonical event missing after approved Notion merge.");
          resolvedSource = reloaded;
        }

        // Export the actual canonical snapshot back to Notion, including
        // preserved values and protected Google coordinates/Place identity.
        // Refresh the baseline only AFTER this PATCH succeeds.
        const written = await writeSourceToNotion({
          bindings: input.bindings,
          dataSourceId: target.dataSourceId,
          source: resolvedSource,
          schema,
          pageId: page.id,
        });
await requireVerifiedMappedNotionWriteback({
  written, expectedPageId: page.id, agenda: "events",
  schema, expectedHash: await snapshotHash("events", editableSnapshot("events", resolvedSource.properties, schema)),
});
        const syncedAt = new Date().toISOString();
        await saveMapping({
          database: input.database,
          agenda: "events",
          pageId: page.id,
          entityId,
          hash: await snapshotHash("events", editableSnapshot("events", resolvedSource.properties, schema)),
          notionLastEditedTime: written.last_edited_time ?? syncedAt,
          psipediaUpdatedAt: await canonicalUpdatedAt("events", entityId, input.database),
          syncedAt,
        });
        if (changedFields.length) summary.pulledFromNotion += 1;
        else summary.pushedToNotion += 1;
        continue;
      }

      // 10 Directory categories use the separate Directory synchronizer.
      // Four Help adapters cover all six Gemini Help category routes.
      if (input.definition.key !== "events"
        && decision.decision !== "UNCHANGED"
        && gemini22PriorityEnabled(input.bindings.NOTION_GEMINI_22_PRIORITY_A_ENABLED)) {
        const agenda = input.definition.key;
        const confirmedGooglePlace = agenda === "organizations"
          ? await hasCurrentOrganizationGooglePlace(input.database, entityId)
          : false;
        const desired = mergeGeminiHelpPriority({
          agenda,
          canonical: sourceSnapshot,
          notion: notionSnapshot,
          confirmedGooglePlace,
        });
        const changedFields = differingAgendaSnapshotFields(agenda, sourceSnapshot, desired);

        if (input.mode !== "sync") {
          if (decision.decision === "CONFLICT") {
            summary.conflicts += 1;
            appendNotionReview(summary.reviewQueue, {
              entityId, notionPageId: page.id, reason: "BIDIRECTIONAL_CONFLICT",
              fields: differingAgendaSnapshotFields(agenda, sourceSnapshot, notionSnapshot),
              baselineAvailable: true, notionChanged: decision.notionChanged,
              psipediaChanged: decision.psipediaChanged,
            });
          }
          if (changedFields.length) summary.pulledFromNotion += 1;
          else summary.pushedToNotion += 1;
          continue;
        }

        let resolvedSource = source;
        if (changedFields.length) {
          // Existing canonical adapters enforce review, private contacts,
          // publication and moderation lifecycle independently.
          await applyNotionToCanonical(agenda, entityId, desired, input.database);
          sources = await input.definition.load(input.database);
          sourcesById = sourceById(sources);
          const reloaded = sourcesById.get(entityId);
          if (!reloaded) throw new Error("Canonical Help item missing after Notion priority merge.");
          resolvedSource = reloaded;
        }
        const written = await writeSourceToNotion({
          bindings: input.bindings,
          dataSourceId: target.dataSourceId,
          source: resolvedSource,
          schema,
          pageId: page.id,
        });
await requireVerifiedMappedNotionWriteback({
  written, expectedPageId: page.id, agenda: agenda,
  schema, expectedHash: await snapshotHash(agenda, editableSnapshot(agenda, resolvedSource.properties, schema)),
});
        const syncedAt = new Date().toISOString();
        await saveMapping({
          database: input.database,
          agenda,
          pageId: page.id,
          entityId,
          hash: await snapshotHash(agenda, editableSnapshot(agenda, resolvedSource.properties, schema)),
          notionLastEditedTime: written.last_edited_time ?? syncedAt,
          psipediaUpdatedAt: await canonicalUpdatedAt(agenda, entityId, input.database),
          syncedAt,
        });
        if (changedFields.length) summary.pulledFromNotion += 1;
        else summary.pushedToNotion += 1;
        continue;
      }

      if (decision.decision === "CONFLICT") {
        summary.conflicts += 1;
        const fields = differingAgendaSnapshotFields(
          input.definition.key, sourceSnapshot, notionSnapshot,
        );
        appendNotionReview(summary.reviewQueue, {
          entityId, notionPageId: page.id, reason: "BIDIRECTIONAL_CONFLICT",
          fields, baselineAvailable: true,
          notionChanged: decision.notionChanged, psipediaChanged: decision.psipediaChanged,
        });
        const conflictMessage = "CONFLICT: Od posledného úspešného syncu sa zmenil Notion aj canonical Psipedia.";
        if (input.mode === "sync" && (
          clean(pageProperty(page, "Sync chyba")) !== conflictMessage
          || clean(pageProperty(page, "Sync stav")) !== "Chyba"
        )) {
          await markConflict({
            bindings: input.bindings,
            pageId: page.id,
            schema,
            page,
            message: conflictMessage.slice("CONFLICT: ".length),
          });
        }
        continue;
      }

      if (decision.decision === "UNCHANGED") {
        summary.unchanged += 1;
        // Equal snapshots prove their common field values, including for
        // legacy mappings; never adopt when the sides differ.
        if (notionHash === canonicalHash && input.mode === "sync"
          && mapping.content_hash === canonicalHash) {
          await recordProfileFieldBaseline({
            database: input.database, agenda: input.definition.key,
            entityId, pageId: page.id, hash: canonicalHash,
            snapshot: sourceSnapshot,
            syncedAt: new Date().toISOString(),
          });
        }
        // A prior conflict must not remain sticky once BOTH current editorial
        // snapshots are equal. Never clear another kind of validation failure.
        if (canClearResolvedNotionConflict({
          canonicalHash, notionHash,
          syncStatus: clean(pageProperty(page, "Sync stav")),
          syncError: clean(pageProperty(page, "Sync chyba")),
        })) {
          summary.staleConflictCandidates += 1;
          if (input.mode === "sync") {
            const syncedAt = new Date().toISOString();
            const written = await patchPage(input.bindings, page.id, encodeProperties({
              "Sync stav": "Synchronizované",
              "Sync chyba": "",
              "Posledný sync": syncedAt,
            }, schema));
            await saveMapping({
              database: input.database,
              agenda: input.definition.key,
              pageId: page.id,
              entityId,
              hash: canonicalHash,
              notionLastEditedTime: written.last_edited_time ?? syncedAt,
              psipediaUpdatedAt: await canonicalUpdatedAt(input.definition.key, entityId, input.database),
              syncedAt,
            });
            summary.resolvedConflictFlags += 1;
          }
          continue;
        }
        if (input.mode !== "dry-run" && pageIdentity.psipediaId !== source.id) {
          const written = await writeSourceToNotion({
            bindings: input.bindings,
            dataSourceId: target.dataSourceId,
            source,
            schema,
            pageId: page.id,
          });
await requireVerifiedMappedNotionWriteback({
  written, expectedPageId: page.id, agenda: input.definition.key,
  schema, expectedHash: canonicalHash,
});
          const syncedAt = new Date().toISOString();
          const updatedAt = await canonicalUpdatedAt(input.definition.key, entityId, input.database);
          await saveMapping({
            database: input.database,
            agenda: input.definition.key,
            pageId: page.id,
            entityId,
            hash: canonicalHash,
            notionLastEditedTime: written.last_edited_time ?? syncedAt,
            psipediaUpdatedAt: updatedAt,
            syncedAt,
          });
        } else if (input.mode !== "dry-run" && mapping.content_hash !== canonicalHash) {
          // Schema-only expansion can change both snapshot hashes while leaving
          // both canonical sides equal. Adopt that equal state as the new
          // baseline instead of manufacturing a conflict.
          const syncedAt = new Date().toISOString();
          const updatedAt = await canonicalUpdatedAt(input.definition.key, entityId, input.database);
          await saveMapping({
            database: input.database,
            agenda: input.definition.key,
            pageId: page.id,
            entityId,
            hash: canonicalHash,
            notionLastEditedTime: page.last_edited_time ?? syncedAt,
            psipediaUpdatedAt: updatedAt,
            syncedAt,
          });
        }
        continue;
      }

      if (input.mode !== "sync") {
        if (decision.decision === "PULL_NOTION") summary.pulledFromNotion += 1;
        else summary.pushedToNotion += 1;
        continue;
      }

      if (decision.decision === "PULL_NOTION") {
        await applyNotionToCanonical(
          input.definition.key,
          entityId,
          pageSnapshot(input.definition.key, page, schema),
          input.database,
        );
        sources = await input.definition.load(input.database);
        sourcesById = sourceById(sources);
        const updatedSource = sourcesById.get(entityId);
        if (!updatedSource) throw new Error("Canonical záznam po Notion update zmizol.");
        const updatedHash = await snapshotHash(input.definition.key, editableSnapshot(input.definition.key, updatedSource.properties, schema));
        const written = await writeSourceToNotion({
          bindings: input.bindings,
          dataSourceId: target.dataSourceId,
          source: updatedSource,
          schema,
          pageId: page.id,
        });
await requireVerifiedMappedNotionWriteback({
  written, expectedPageId: page.id, agenda: input.definition.key,
  schema, expectedHash: updatedHash,
});
        const syncedAt = new Date().toISOString();
        const updatedAt = await canonicalUpdatedAt(input.definition.key, entityId, input.database);
        await saveMapping({
          database: input.database,
          agenda: input.definition.key,
          pageId: page.id,
          entityId,
          hash: updatedHash,
          snapshot: editableSnapshot(input.definition.key, updatedSource.properties, schema),
          notionLastEditedTime: written.last_edited_time ?? syncedAt,
          psipediaUpdatedAt: updatedAt,
          syncedAt,
        });
        summary.pulledFromNotion += 1;
        continue;
      }

      const written = await writeSourceToNotion({
        bindings: input.bindings,
        dataSourceId: target.dataSourceId,
        source,
        schema,
        pageId: page.id,
      });
await requireVerifiedMappedNotionWriteback({
  written, expectedPageId: page.id, agenda: input.definition.key,
  schema, expectedHash: canonicalHash,
});
      const syncedAt = new Date().toISOString();
      const updatedAt = await canonicalUpdatedAt(input.definition.key, entityId, input.database);
      await saveMapping({
        database: input.database,
        agenda: input.definition.key,
        pageId: page.id,
        entityId,
        hash: canonicalHash,
        notionLastEditedTime: written.last_edited_time ?? syncedAt,
        psipediaUpdatedAt: updatedAt,
        syncedAt,
      });
      summary.pushedToNotion += 1;
    } catch (error) {
      logFailure(summary, {
        entityId,
        notionPageId: mapping.notion_page_id,
        operation: "sync_mapped",
        error,
      });
    }
  }

  // Import new Notion rows after all existing canonical identities have been
  // adopted. Title is never used as identity.
  mappings = input.mode === "dry-run" ? mappings : await loadMappings(input.database, input.definition.key);
  const mappedPageIds = new Set(mappings.map((mapping) => mapping.notion_page_id));

  for (const page of writablePages) {
    if (input.targetPageId && page.id !== input.targetPageId) continue;
    if (mappedPageIds.has(page.id)) continue;
    // The generic Help editor does not own these categories, even when an
    // unlinked Notion page is Ready or has trusted Gemini provenance.
    if (input.definition.key === "help-cases"
      && isHelpSyncCategoryOutOfDomain(clean(pageProperty(page, "Kategória")))) {
      summary.domainBoundary.unmappedOutOfDomain += 1;
      continue;
    }
    const psipediaId = clean(pageProperty(page, "Psipedia ID"));
    if (psipediaId) continue;
    const values = pageSnapshot(input.definition.key, page, schema);
    // Immutable signed-worker provenance, never a user-editable description tag.
    const provenance = await input.database.prepare(
      "SELECT stable_key,import_agenda,notion_data_source_id,canonical_entity_id " +
      "FROM gemini_notion_created_pages WHERE notion_page_id=?"
    ).bind(page.id).first<{
      stable_key: string; import_agenda: string; notion_data_source_id: string;
      canonical_entity_id: number | null;
    }>();
    if (provenance && (
      provenance.import_agenda !== input.definition.key ||
      provenance.notion_data_source_id.replaceAll("-", "").toLowerCase() !==
        target.dataSourceId.replaceAll("-", "").toLowerCase() ||
      geminiImportAgenda(provenance.stable_key) !== input.definition.key ||
      provenance.canonical_entity_id !== null
    )) {
      summary.conflicts += 1;
      appendNotionReview(summary.reviewQueue, {
        entityId: null, notionPageId: page.id, reason: "GEMINI_PROVENANCE_MISMATCH",
        fields: ["Psipedia ID"], baselineAvailable: false,
        notionChanged: null, psipediaChanged: null,
      });
      continue;
    }
    const trustedGemini = Boolean(provenance);
    if (trustedGemini && !trustedGeminiSourceIsPrivateDraft(input.definition.key, values)) {
      summary.conflicts += 1;
      appendNotionReview(summary.reviewQueue, {
        entityId: null, notionPageId: page.id, reason: "GEMINI_PRIVATE_DRAFT_REQUIRED",
        fields: ["Stav", "Psipedia stav"], baselineAvailable: false,
        notionChanged: null, psipediaChanged: null,
      });
      continue;
    }
    if (!trustedGemini && !input.reviewedLegacy &&
        clean(pageProperty(page, "Vytvoril")) === "Gemini automatizácia") {
      // A Notion text property does not establish signed worker provenance.
      summary.unchanged += 1;
      continue;
    }
    if (trustedGemini) {
      const [section, subcategory] = provenance!.stable_key.split(".");
      const expected = notionCategoryValue(section, subcategory);
      const actual = input.definition.key === "events" ? clean(values["Typ podujatia"])
        : input.definition.key === "help-cases" ? clean(values["Kategória"])
        : input.definition.key === "organizations" ? clean(values["Typ"]) : "";
      const categoryInvalid = (
        (input.definition.key === "events" || input.definition.key === "help-cases") &&
          (!expected || actual !== expected)
      ) || (input.definition.key === "organizations" && actual !== "SHELTER");
      if (categoryInvalid) {
        summary.conflicts += 1;
        appendNotionReview(summary.reviewQueue, {
          entityId: null, notionPageId: page.id, reason: "GEMINI_CATEGORY_MISMATCH",
          fields: ["Typ podujatia", "Kategória", "Typ"],
          baselineAvailable: false, notionChanged: null, psipediaChanged: null,
        });
        continue;
      }
    }
    if ((trustedGemini || input.reviewedLegacy) && input.definition.key === "lost-found" && (
      values["Latitude"] != null && values["Latitude"] !== "" ||
      values["Longitude"] != null && values["Longitude"] !== "" ||
      clean(values["Verejný kontakt"]) ||
      clean(values["Miesto"]) !== clean(values["Mesto"])
    )) {
      // Never discard protected Notion evidence by overwriting it from a
      // sanitized public canonical snapshot. Require explicit private review.
      summary.conflicts += 1;
      appendNotionReview(summary.reviewQueue, {
        entityId: null, notionPageId: page.id,
        reason: "GEMINI_LOST_FOUND_PRIVACY_REVIEW_REQUIRED",
        fields: ["Latitude", "Longitude", "Miesto", "Verejný kontakt"],
        baselineAvailable: false, notionChanged: null, psipediaChanged: null,
      });
      continue;
    }
    // Internal Gemini moderation is separate from public draft/published.
    // Never auto-import an unapproved/rejected source-evidenced Help concept.
    // Keep unmarked, pre-existing manual Notion imports compatible.
    if (!trustedGemini && input.definition.key === "help-cases" &&
        !helpCaseMayEnterCanonicalSync(
          pageProperty(page, GEMINI_HELP_REVIEW_PROPERTY), values["Popis"])) {
      summary.unchanged += 1;
      continue;
    }
    if (!trustedGemini && !readyForCreate(input.definition.key, values)) {
      summary.unchanged += 1;
      continue;
    }

    const duplicate = sourceDuplicateCandidate(page, input.definition, sources);
    if (duplicate) {
      summary.conflicts += 1;
      appendNotionReview(summary.reviewQueue, {
        entityId: null, notionPageId: page.id, reason: "DUPLICATE_CONFLICT",
        fields: ["Slug", "URL Psipedia"], baselineAvailable: false,
        notionChanged: null, psipediaChanged: null,
      });
      if (input.mode === "sync") {
        await markConflict({
          bindings: input.bindings,
          pageId: page.id,
          schema,
          page,
          message: `Canonical záznam už existuje pre slug/URL (Psipedia ID: ${duplicate}).`,
        }).catch(() => undefined);
      }
      continue;
    }

    if (input.mode !== "sync") {
      summary.createdFromNotion += 1;
      continue;
    }

    let releaseImport: (() => Promise<void>) | null = null;
    let releasePage: (() => Promise<void>) | null = null;
    let importWriteStarted = false;
    try {
      if (trustedGemini || input.reviewedLegacy) {
        releaseImport = await acquireGeminiNotionLock(input.database, "gemini-canonical-import-" + input.definition.key);
        if (!releaseImport) {
          summary.conflicts += 1;
          continue;
        }
        releasePage = await acquireGeminiNotionLock(input.database, page.id);
        if (!releasePage) {
          summary.conflicts += 1;
          continue;
        }
        // The sweep snapshot predates the lock. A preceding worker may have
        // imported this page or another page for the same profile meanwhile.
        const liveMappings = await loadMappings(input.database, input.definition.key);
        if (liveMappings.some(mapping => mapping.notion_page_id === page.id)) {
          summary.unchanged += 1;
          continue;
        }
        const latest = await notionRequest<NotionPage>(input.bindings, "/pages/" + encodeURIComponent(page.id));
        if (latest.last_edited_time !== page.last_edited_time)
          throw new Error("GEMINI_SAVED_REVISION_CHANGED");
        const liveSources = await input.definition.load(input.database);
        if (sourceDuplicateCandidate(latest, input.definition, liveSources)) {
          summary.conflicts += 1;
          continue;
        }
      }
      const draftValues = trustedGemini
        ? { ...values, "Slug": await resolveGeminiPublicSlug(input.database, input.definition.key as GeminiSlugAgenda, {
          requestedSlug: clean(values["Slug"]),
          name: clean(values[input.definition.key === "adoptions" ? "Meno" : "Názov"]),
          city: clean(values["Mesto"]), notionPageId: page.id,
        }) } : values;
      importWriteStarted = true;
      const created = await createCanonicalFromNotion(input.definition.key, draftValues, input.database, trustedGemini) as { id?: number } | null;
      const entityId = Number(created?.id ?? 0);
      if (!Number.isSafeInteger(entityId) || entityId <= 0) {
        throw new Error("Canonical create nevrátil platné ID.");
      }
      sources = await input.definition.load(input.database);
      sourcesById = sourceById(sources);
      const source = sourcesById.get(entityId);
      if (!source) throw new Error("Nový canonical záznam sa po create nenašiel.");
      const hash = await snapshotHash(input.definition.key, editableSnapshot(input.definition.key, source.properties, schema));
      // Persist the canonical one-to-one mapping BEFORE uncertain remote Notion
      // PATCH. A timeout after canonical INSERT must not create a second profile
      // on the next sweep, even when the provider never returned a response.
      const preWriteAt = new Date().toISOString();
      await saveMapping({
        database: input.database,
        agenda: input.definition.key,
        pageId: page.id,
        entityId,
        hash,
        notionLastEditedTime: page.last_edited_time ?? null,
        psipediaUpdatedAt: await canonicalUpdatedAt(input.definition.key, entityId, input.database),
        syncedAt: preWriteAt,
      });
      const written = await writeSourceToNotion({
        bindings: input.bindings,
        dataSourceId: target.dataSourceId,
        source,
        schema,
        pageId: page.id,
      });
await requireVerifiedMappedNotionWriteback({
  written, expectedPageId: page.id, agenda: input.definition.key,
  schema, expectedHash: hash,
});
      const syncedAt = new Date().toISOString();
      const updatedAt = await canonicalUpdatedAt(input.definition.key, entityId, input.database);
      await saveMapping({
        database: input.database,
        agenda: input.definition.key,
        pageId: page.id,
        entityId,
        hash,
        notionLastEditedTime: written.last_edited_time ?? syncedAt,
        psipediaUpdatedAt: updatedAt,
        syncedAt,
      });
      if (trustedGemini) {
        const marked = await input.database.prepare(
          "UPDATE gemini_notion_created_pages SET canonical_entity_id=?,imported_at=? " +
          "WHERE notion_page_id=? AND import_agenda=? AND canonical_entity_id IS NULL"
        ).bind(entityId, syncedAt, page.id, input.definition.key).run();
        if (marked.meta.changes !== 1) throw Error("GEMINI_PROVENANCE_IMPORT_CONFLICT");
      }
      summary.createdFromNotion += 1;
      importWriteStarted = false;
    } catch (error) {
      logFailure(summary, {
        notionPageId: page.id,
        operation: "create_from_notion",
        error,
      });
      await patchPage(input.bindings, page.id, encodeProperties({
        "Sync stav": "Chyba",
        "Sync chyba": error instanceof Error ? error.message.slice(0, 1800) : String(error).slice(0, 1800),
        "Posledný sync": new Date().toISOString(),
      }, schema)).catch(() => undefined);
    } finally {
      // Preserve the lock after an uncertain canonical insert/mapping/writeback.
      // Retrying must not create a second identity after a lost acknowledgement.
      if (!importWriteStarted) {
        if (releasePage) await releasePage();
        if (releaseImport) await releaseImport();
      }
    }
  }

  // Canonical GEO is a read-only Notion mirror, deliberately excluded from
  // bidirectional editableSnapshot/content_hash so a new Google match cannot
  // manufacture a Notion-vs-Psipedia conflict. Mapped rows are matched by
  // canonical Psipedia ID, never title or slug.
  if (input.definition.key === "events" || input.definition.key === "organizations") {
    const liveMappings = input.mode === "sync" ? await loadMappings(input.database, input.definition.key) : mappings;
    for (const mapping of liveMappings) {
      if (input.targetPageId && mapping.notion_page_id !== input.targetPageId) continue;
      const source = sourcesById.get(Number(mapping.entity_id));
      const page = pagesById.get(mapping.notion_page_id);
      if (!source || !page) continue;
      const fields = [
        ...notionGeoMirrorFields,
        ...(input.definition.key === "organizations" ? ["Adresa"] : []),
      ].filter((name) => Boolean(schema[name]) && Object.hasOwn(source.properties, name));
      if (!fields.length) continue;
      const desired = Object.fromEntries(fields.map((name) => [name, source.properties[name]])) as Record<string, ReconciliationValue>;
      const current = Object.fromEntries(fields.map((name) => [name, pageProperty(page, name)])) as Record<string, ReconciliationValue>;
      const changes = notionGeoMirrorChanges(desired, current, input.definition.key);
      if (!Object.keys(changes).length) continue;
      summary.geoMirrorUpdates += 1;
      if (input.mode !== "sync") continue;
      try {
        await patchPage(input.bindings, mapping.notion_page_id, encodeProperties(changes, schema));
      } catch (error) {
        logFailure(summary, {
          entityId: Number(mapping.entity_id),
          notionPageId: mapping.notion_page_id,
          operation: "geo_mirror",
          error,
        });
      }
    }
  }

  if (input.definition.key === "help-cases" && (
    summary.domainBoundary.outOfDomain
    || summary.domainBoundary.missingCanonical
    || summary.domainBoundary.unmappedOutOfDomain
    || summary.domainBoundary.mappedNotionOutOfDomain
  )) {
    // One value-free aggregate per sweep, instead of one error per legacy row.
    // MISSING_CANONICAL remains visible as a review conflict; OUT_OF_DOMAIN
    // is expected legacy data, not a missing record or provider failure.
    console.info(JSON.stringify({
      event: "notion_help_domain_boundary",
      agenda: "help-cases",
      outOfDomain: summary.domainBoundary.outOfDomain,
      missingCanonical: summary.domainBoundary.missingCanonical,
      unmappedOutOfDomain: summary.domainBoundary.unmappedOutOfDomain,
      mappedNotionOutOfDomain: summary.domainBoundary.mappedNotionOutOfDomain,
    }));
  }
  return summary;
}

function totals(agendas: NotionAgendaSyncSummary[]) {
  return agendas.reduce((acc, agenda) => {
    acc.scanned += agenda.scanned;
    acc.bootstrapped += agenda.bootstrapped;
    acc.createdFromNotion += agenda.createdFromNotion;
    acc.createdInNotion += agenda.createdInNotion;
    acc.pulledFromNotion += agenda.pulledFromNotion;
    acc.pushedToNotion += agenda.pushedToNotion;
    acc.geoMirrorUpdates += agenda.geoMirrorUpdates;
    acc.unchanged += agenda.unchanged;
    acc.conflicts += agenda.conflicts;
    acc.failed += agenda.failed;
    acc.resolvedConflictFlags += agenda.resolvedConflictFlags;
    acc.staleConflictCandidates += agenda.staleConflictCandidates;
    acc.reviewRequired += agenda.reviewQueue.total;
    return acc;
  }, {
    scanned: 0,
    bootstrapped: 0,
    createdFromNotion: 0,
    createdInNotion: 0,
    pulledFromNotion: 0,
    pushedToNotion: 0,
    geoMirrorUpdates: 0,
    unchanged: 0,
    conflicts: 0,
    failed: 0,
    resolvedConflictFlags: 0,
    staleConflictCandidates: 0,
    reviewRequired: 0,
  });
}

export async function runNotionEventsHelpSyncSweep(input: {
  database: D1Database;
  bindings: NotionEventsHelpSyncBindings;
  mode?: NotionEventsHelpMode;
  force?: boolean;
  agendas?: BidirectionalAgendaKey[];
  targetPageId?: string;
  expectedNotionRevision?: string;
  reviewedLegacy?: boolean;
}): Promise<NotionEventsHelpSyncSummary> {
  if (input.targetPageId !== undefined && (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.targetPageId) ||
    input.agendas?.length !== 1
  )) throw new Error("GEMINI_TARGETED_NOTION_SCOPE_INVALID");
  // Legacy review is limited to one explicit admin-confirmed Notion revision;
  // never an unattended full sweep or an unapproved source page.
  if (input.reviewedLegacy && (!input.targetPageId || !input.expectedNotionRevision ||
      input.agendas?.length !== 1 || input.mode !== "sync"))
    throw new Error("GEMINI_LEGACY_REVIEW_SCOPE_INVALID");
  const mode = input.mode ?? "sync";
  const isEnabled = input.force === true || enabled(input.bindings);
  const ready = await schemaReady(input.database);
  const selected = new Set(input.agendas ?? definitions.map((definition) => definition.key));
  const agendas: NotionAgendaSyncSummary[] = [];

  for (const definition of definitions) {
    if (!selected.has(definition.key)) continue;
    try {
      agendas.push(await syncAgenda({
        database: input.database,
        bindings: input.bindings,
        definition,
        mode,
        isEnabled,
        ready,
        targetPageId: input.targetPageId,
        expectedNotionRevision: input.expectedNotionRevision,
        reviewedLegacy: input.reviewedLegacy,
      }));
    } catch (error) {
      const summary = emptyAgenda(definition, isEnabled, ready);
      logFailure(summary, { operation: "agenda", error });
      agendas.push(summary);
    }
  }

  return {
    enabled: isEnabled,
    mode,
    schemaReady: ready,
    agendas,
    totals: totals(agendas),
  };
}

export async function runNotionEventsHelpBootstrapSweep(input: {
  database: D1Database;
  bindings: NotionEventsHelpSyncBindings;
  force?: boolean;
  agendas?: BidirectionalAgendaKey[];
}) {
  return runNotionEventsHelpSyncSweep({
    ...input,
    mode: "bootstrap",
  });
}

/** Targeted Gemini Event ensure. Reuses the same Event source serialization, target,
 * schema, Notion transport, reconciliation hash and event_notion_sync mapping as the sweep.
 * On uncertain POST recovery allowCreate=false NEVER sends a second create request.
 */
export async function ensureManagedEventInNotion(input: {
  database:D1Database;bindings:NotionEventsHelpSyncBindings;eventId:number;allowCreate:boolean;
}):Promise<{notionPageId:string}> {
  if(!Number.isSafeInteger(input.eventId) || input.eventId<1) throw new Error("GEMINI_EVENT_INVALID_ID");
  const definition=definitions.find(d=>d.key==="events")!;
  const sources=await loadNotionBulkEvents(input.database);
  const source=sources.find(s=>Number(s.id)===input.eventId);
  if(!source) throw new Error("GEMINI_EVENT_CANONICAL_MISSING");
  const target=await resolveNotionCanonicalTarget({
    database:input.database,bindings:input.bindings as NotionEventsHelpSyncBindings & Record<string,unknown>,
    definition:canonicalTargetDefinition(definition),allowCreate:false,persist:true,
  });
  if(!target.dataSourceId)throw new Error("GEMINI_EVENT_NOTION_TARGET_MISSING");
  const dataSource=await fetchDataSource(input.bindings,target.dataSourceId);
  const schema=dataSource.properties ?? {};
  if(!["Názov","Psipedia ID","URL Psipedia"].every(name=>Boolean(schema[name])))
    throw new Error("GEMINI_EVENT_NOTION_SCHEMA_INVALID");
  const pages=(await listAllPages(input.bindings,target.dataSourceId))
    .filter(page => notionPageBelongsToDataSource(page,target.dataSourceId!));
  const mappings=await loadMappings(input.database,"events");
  const existing=mappings.find(m=>Number(m.entity_id)===input.eventId);
  const canonicalHash=await snapshotHash("events",editableSnapshot("events",source.properties,schema));
  let page:NotionPage|undefined;
  if(existing) {
    page=pages.find(p=>p.id===existing.notion_page_id);
    if(!page)throw new Error("GEMINI_EVENT_NOTION_MAPPING_STALE");
  } else {
    const matches=pages.filter(p=> {
      const identity=identityPage(p);
      return identity.psipediaId===source.id || identity.url===source.url;
    });
    if(matches.length>1)throw new Error("GEMINI_EVENT_NOTION_AMBIGUOUS");
    page=matches[0];
    if(page) {
      const owner=mappings.find(m=>m.notion_page_id===page!.id);
      if(owner && Number(owner.entity_id)!==input.eventId)
        throw new Error("GEMINI_EVENT_NOTION_OWNERSHIP_CONFLICT");
      const remoteHash=await snapshotHash("events",pageSnapshot("events",page,schema));
      if(remoteHash!==canonicalHash)throw new Error("GEMINI_EVENT_NOTION_BASELINE_CONFLICT");
    }
  }
  if(!page) {
    if(!input.allowCreate)throw new Error("GEMINI_EVENT_NOTION_UNCERTAIN_NOT_RECOVERED");
    page=await writeSourceToNotion({bindings:input.bindings,dataSourceId:target.dataSourceId,
      source,schema});
  }
  const now=new Date().toISOString();
  await saveMapping({database:input.database,agenda:"events",pageId:page.id,
    entityId:input.eventId,hash:canonicalHash,notionLastEditedTime:page.last_edited_time??now,
    psipediaUpdatedAt:await canonicalUpdatedAt("events",input.eventId,input.database),syncedAt:now});
  return {notionPageId:page.id};
}
