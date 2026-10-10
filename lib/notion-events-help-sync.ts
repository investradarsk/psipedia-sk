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
  createCanonicalFromNotion,
  readyForCreate,
  type BidirectionalAgendaKey,
} from "./notion-events-help-adapters.ts";
import {
  resolveNotionCanonicalTarget,
  type NotionCanonicalTargetDefinition,
} from "./notion-canonical-target.ts";
import { notionGeoMirrorChanges, notionGeoMirrorFields } from "./notion-geo-mirror.ts";
import {
  appendNotionReview,
  canClearResolvedNotionConflict,
  emptyNotionReviewQueue,
  type NotionReviewQueue,
} from "./notion-data-quality-recovery.ts";
import {
  notionSeoSchemaExtensionFields,
  notionSeoSchemaExtensionIsDefault,
} from "./notion-seo-contract.ts";
import {
  notionRequest,
  sha256Text,
  type NotionPage,
  type NotionSyncBindings,
} from "./notion-sync-shared.ts";

export type NotionEventsHelpSyncBindings = NotionSyncBindings & {
  NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED?: string;
  NOTION_EVENTS_DATA_SOURCE_ID?: string;
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
  /** Number of obsolete conflict flags safely cleared after identical snapshots. */
  resolvedConflictFlags: number;
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
}) {
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
}

function sourceId(source: CanonicalSourceRecord) {
  const id = Number.parseInt(source.id, 10);
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
}) {
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
    resolvedConflictFlags: 0,
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
  const identities = pages.map(identityPage);
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  let mappings = await loadMappings(input.database, input.definition.key);
  const mappingByEntity = new Map(mappings.map((mapping) => [Number(mapping.entity_id), mapping]));
  const mappingByPage = new Map(mappings.map((mapping) => [mapping.notion_page_id, mapping]));
  let sourcesById = sourceById(sources);

  for (const source of sources) {
    const entityId = sourceId(source);
    if (entityId === null) continue;
    let mapping = mappingByEntity.get(entityId) ?? null;
    const sourceSnapshot = editableSnapshot(input.definition.key, source.properties, schema);
    const canonicalHash = await snapshotHash(input.definition.key, sourceSnapshot);

    if (!mapping) {
      const identity = matchCanonicalIdentity(source.id, source.url, identities);
      if (identity.kind === "CONFLICT") {
        summary.conflicts += 1;
        if (input.mode === "sync") {
          for (const pageId of identity.pageIds) {
            await markConflict({
              bindings: input.bindings,
              pageId,
              schema,
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
          if (input.mode === "sync") {
            await markConflict({
              bindings: input.bindings,
              pageId: identity.page.id,
              schema,
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
      continue;
    }

    try {
      const pageIdentity = identityPage(page);
      if (pageIdentity.psipediaId && pageIdentity.psipediaId !== source.id) {
        summary.conflicts += 1;
        if (input.mode === "sync") {
          await markConflict({
            bindings: input.bindings,
            pageId: page.id,
            schema,
            message: "Namapovaná stránka má iné Psipedia ID.",
          });
        }
        continue;
      }
      if (pageIdentity.url && pageIdentity.url !== source.url) {
        summary.conflicts += 1;
        if (input.mode === "sync") {
          await markConflict({
            bindings: input.bindings,
            pageId: page.id,
            schema,
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
          if (input.mode === "sync") {
            await markConflict({
              bindings: input.bindings,
              pageId: page.id,
              schema,
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
            message: conflictMessage.slice("CONFLICT: ".length),
          });
        }
        continue;
      }

      if (decision.decision === "UNCHANGED") {
        summary.unchanged += 1;
        // A prior conflict must not remain sticky once BOTH current editorial
        // snapshots are equal. Never clear another kind of validation failure.
        if (canClearResolvedNotionConflict({
          canonicalHash, notionHash,
          syncStatus: clean(pageProperty(page, "Sync stav")),
          syncError: clean(pageProperty(page, "Sync chyba")),
        })) {
          summary.resolvedConflictFlags += 1;
          if (input.mode !== "dry-run") {
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
        const syncedAt = new Date().toISOString();
        const updatedAt = await canonicalUpdatedAt(input.definition.key, entityId, input.database);
        await saveMapping({
          database: input.database,
          agenda: input.definition.key,
          pageId: page.id,
          entityId,
          hash: updatedHash,
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

  for (const page of pages) {
    if (mappedPageIds.has(page.id)) continue;
    const psipediaId = clean(pageProperty(page, "Psipedia ID"));
    if (psipediaId) continue;
    const values = pageSnapshot(input.definition.key, page, schema);
    if (!readyForCreate(input.definition.key, values)) {
      summary.unchanged += 1;
      continue;
    }

    const duplicate = sourceDuplicateCandidate(page, input.definition, sources);
    if (duplicate) {
      summary.conflicts += 1;
      if (input.mode === "sync") {
        await markConflict({
          bindings: input.bindings,
          pageId: page.id,
          schema,
          message: `Canonical záznam už existuje pre slug/URL (Psipedia ID: ${duplicate}).`,
        }).catch(() => undefined);
      }
      continue;
    }

    if (input.mode !== "sync") {
      summary.createdFromNotion += 1;
      continue;
    }

    try {
      const created = await createCanonicalFromNotion(input.definition.key, values, input.database) as { id?: number } | null;
      const entityId = Number(created?.id ?? 0);
      if (!Number.isSafeInteger(entityId) || entityId <= 0) {
        throw new Error("Canonical create nevrátil platné ID.");
      }
      sources = await input.definition.load(input.database);
      sourcesById = sourceById(sources);
      const source = sourcesById.get(entityId);
      if (!source) throw new Error("Nový canonical záznam sa po create nenašiel.");
      const hash = await snapshotHash(input.definition.key, editableSnapshot(input.definition.key, source.properties, schema));
      const written = await writeSourceToNotion({
        bindings: input.bindings,
        dataSourceId: target.dataSourceId,
        source,
        schema,
        pageId: page.id,
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
      summary.createdFromNotion += 1;
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
    }
  }

  // Canonical GEO is a read-only Notion mirror, deliberately excluded from
  // bidirectional editableSnapshot/content_hash so a new Google match cannot
  // manufacture a Notion-vs-Psipedia conflict. Mapped rows are matched by
  // canonical Psipedia ID, never title or slug.
  if (input.definition.key === "events" || input.definition.key === "organizations") {
    const liveMappings = input.mode === "sync" ? await loadMappings(input.database, input.definition.key) : mappings;
    for (const mapping of liveMappings) {
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
    reviewRequired: 0,
  });
}

export async function runNotionEventsHelpSyncSweep(input: {
  database: D1Database;
  bindings: NotionEventsHelpSyncBindings;
  mode?: NotionEventsHelpMode;
  force?: boolean;
  agendas?: BidirectionalAgendaKey[];
}): Promise<NotionEventsHelpSyncSummary> {
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
  const pages=await listAllPages(input.bindings,target.dataSourceId);
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
