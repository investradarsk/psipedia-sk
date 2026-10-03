import {
  executeReconciliationPlan,
  planNotionReconciliation,
  validateNotionSchema,
  type ExistingNotionRecord,
  type ReconciliationValue,
} from "./notion-bulk-reconciliation.ts";
import {
  loadNotionBulkAdoptions,
  loadNotionBulkEvents,
  loadNotionBulkHelpCases,
  loadNotionBulkLostFound,
  loadNotionBulkOrganizations,
  loadNotionBulkRelatedHelpCounts,
  loadNotionBulkServices,
} from "./notion-bulk-sources.ts";
import { notionRequest, type NotionPage, type NotionSyncBindings } from "./notion-sync-shared.ts";
import { notionSeoPropertySchema } from "./notion-seo-contract.ts";
import {
  resolveNotionCanonicalTarget,
  type NotionCanonicalTargetDefinition,
} from "./notion-canonical-target.ts";

export type NotionBulkMode = "dry-run" | "execute";
export type NotionBulkScope =
  | "all" | "services" | "events" | "help"
  | "organizations" | "adoptions" | "help-cases" | "lost-found";
export type NotionBulkAgendaKey =
  | "services" | "events" | "organizations" | "adoptions" | "help-cases" | "lost-found";

export type NotionBulkBindings = NotionSyncBindings & {
  NOTION_DIRECTORY_DATA_SOURCE_ID?: string;
  NOTION_EVENTS_DATA_SOURCE_ID?: string;
};

type DataSourceProperty = { type?: string; [key: string]: unknown };
type DataSourceResponse = { id: string; properties?: Record<string, DataSourceProperty> };
type QueryResponse = { results?: NotionPage[]; has_more?: boolean; next_cursor?: string | null };
type AgendaDefinition = {
  key: NotionBulkAgendaKey;
  label: string;
  targetTitle: string;
  titleProperty: string;
  configuredId?: (bindings: NotionBulkBindings) => string;
  createIfMissing?: boolean;
  createSchema?: Record<string, unknown>;
  extendSchema?: Record<string, DataSourceProperty>;
  load: (database: D1Database) => Promise<import("./notion-bulk-reconciliation.ts").CanonicalSourceRecord[]>;
};

export type NotionBulkAgendaResult = {
  agenda: NotionBulkAgendaKey;
  label: string;
  dataSourceId: string | null;
  provisioned: boolean;
  targetMissing: boolean;
  duplicateTargetDataSourceIds: string[];
  sourceTotal: number;
  notionTotal: number;
  matched: number;
  create: number;
  update: number;
  unchanged: number;
  conflict: number;
  duplicate: number;
  skipped: number;
  error: number;
  missingRequiredProperties: string[];
  missingOptionalProperties: string[];
  duplicateConflicts: Array<{
    psipediaId: string;
    title: string;
    url: string;
    notionPageIds: string[];
    database: string;
    reason: string;
  }>;
  conflicts: Array<{
    psipediaId: string;
    title: string;
    url: string;
    notionPageId?: string;
    fields: string[];
    reason: string;
  }>;
  batches: Array<{
    index: number;
    processed: number;
    created: number;
    updated: number;
    unchanged: number;
    conflict: number;
    duplicate: number;
    skipped: number;
    error: number;
  }>;
  diagnostics?: {
    updateFieldCounts: Record<string, number>;
    updateSamples: Array<{
      psipediaId: string;
      title: string;
      notionPageId: string;
      field: string;
      propertyType: string;
      sourceValue: ReconciliationValue;
      notionValue: ReconciliationValue;
    }>;
  };
  errors: Array<{ sourceId: string; message: string }>;
};

export type NotionBulkBackfillResult = {
  mode: NotionBulkMode;
  scope: NotionBulkScope;
  startedAt: string;
  finishedAt: string;
  agendas: NotionBulkAgendaResult[];
  relatedSourceTotals: {
    organizationLocations: number;
    organizationFundraisingMethods: number;
  };
  total: {
    sourceTotal: number;
    notionTotal: number;
    matched: number;
    create: number;
    update: number;
    unchanged: number;
    conflict: number;
    duplicate: number;
    skipped: number;
    error: number;
  };
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function richTextSchema() { return { rich_text: {} }; }
function titleSchema() { return { title: {} }; }
function urlSchema() { return { url: {} }; }
function dateSchema() { return { date: {} }; }
function numberSchema() { return { number: {} }; }
function checkboxSchema() { return { checkbox: {} }; }

const syncSchema = {
  "Psipedia ID": richTextSchema(),
  "URL Psipedia": urlSchema(),
  "Sync stav": { select: { options: [
    { name: "Synchronizované", color: "green" },
    { name: "Chyba", color: "red" },
  ] } },
  "Sync chyba": richTextSchema(),
  "Posledný sync": dateSchema(),
};

const helpCasesSchema = {
  "Názov": titleSchema(),
  ...syncSchema,
  "Slug": richTextSchema(),
  "Kategória": richTextSchema(),
  "Psipedia stav": richTextSchema(),
  "Perex": richTextSchema(),
  "Popis": richTextSchema(),
  "Organizácia": richTextSchema(),
  "Pes": richTextSchema(),
  "Plemeno": richTextSchema(),
  "Vek": richTextSchema(),
  "Mesto": richTextSchema(),
  "Kraj": richTextSchema(),
  "Miesto": richTextSchema(),
  "Dátum hlásenia": dateSchema(),
  "Deadline": dateSchema(),
  "CTA text": richTextSchema(),
  "CTA URL": urlSchema(),
  "Kontakt": richTextSchema(),
  "Cieľ": numberSchema(),
  "Vyzbierané": numberSchema(),
  "Obrázok": urlSchema(),
  "Urgentné": checkboxSchema(),
  "Vyriešené": checkboxSchema(),
  ...notionSeoPropertySchema("help-cases"),
  "Vytvorené": dateSchema(),
  "Aktualizované": dateSchema(),
  "Publikované": dateSchema(),
};

const lostFoundSchema = {
  "Názov": titleSchema(),
  ...syncSchema,
  "Slug": richTextSchema(),
  "Typ": richTextSchema(),
  "Psipedia stav": richTextSchema(),
  "Meno psa": richTextSchema(),
  "Pohlavie": richTextSchema(),
  "Plemeno": richTextSchema(),
  "Farba": richTextSchema(),
  "Vek": richTextSchema(),
  "Veľkosť": richTextSchema(),
  "Popis": richTextSchema(),
  "Rozlišovacie znaky": richTextSchema(),
  "Obojok": richTextSchema(),
  "Čip": richTextSchema(),
  "Hlavný obrázok": urlSchema(),
  "Dátum udalosti": dateSchema(),
  "Naposledy videný": dateSchema(),
  "Kraj": richTextSchema(),
  "Okres": richTextSchema(),
  "Mesto": richTextSchema(),
  "Miesto": richTextSchema(),
  "Latitude": numberSchema(),
  "Longitude": numberSchema(),
  "Presnosť lokality": richTextSchema(),
  "Verejný kontakt": richTextSchema(),
  "Zdroj": richTextSchema(),
  "Zdroj URL": urlSchema(),
  "Aktualizované": dateSchema(),
  "Publikované": dateSchema(),
  "Expirácia": dateSchema(),
  "Vyriešené": dateSchema(),
  "Duplicate of": numberSchema(),
  "Duplicate dôvod": richTextSchema(),
};

const definitions: AgendaDefinition[] = [
  {
    key: "services",
    label: "Služby pre psov",
    targetTitle: "Adresár",
    titleProperty: "Názov",
    configuredId: (bindings) => clean(bindings.NOTION_DIRECTORY_DATA_SOURCE_ID),
    load: loadNotionBulkServices,
  },
  {
    key: "events",
    label: "Podujatia",
    targetTitle: "Podujatia",
    titleProperty: "Názov",
    configuredId: (bindings) => clean(bindings.NOTION_EVENTS_DATA_SOURCE_ID),
    extendSchema: notionSeoPropertySchema("events"),
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
    createIfMissing: true,
    createSchema: helpCasesSchema,
    extendSchema: notionSeoPropertySchema("help-cases"),
    load: loadNotionBulkHelpCases,
  },
  {
    key: "lost-found",
    label: "Stratené / nájdené",
    targetTitle: "Stratené a nájdené",
    titleProperty: "Názov",
    createIfMissing: true,
    createSchema: lostFoundSchema,
    load: loadNotionBulkLostFound,
  },
];

export function notionBulkAgendaKeysForScope(scope: NotionBulkScope) {
  if (scope === "all") return definitions.map((item) => item.key);
  if (scope === "help") return ["organizations", "adoptions", "help-cases", "lost-found"] satisfies NotionBulkAgendaKey[];
  return [scope as NotionBulkAgendaKey];
}

function scopeKeys(scope: NotionBulkScope) {
  return new Set<NotionBulkAgendaKey>(notionBulkAgendaKeysForScope(scope));
}

function plainText(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => (
    item && typeof item === "object" && typeof (item as Record<string, unknown>).plain_text === "string"
      ? String((item as Record<string, unknown>).plain_text)
      : ""
  )).join("").trim();
}

function canonicalTargetDefinition(definition: AgendaDefinition): NotionCanonicalTargetDefinition {
  return {
    key: definition.key,
    label: definition.label,
    targetTitle: definition.targetTitle,
    titleProperty: definition.titleProperty,
    configuredId: definition.configuredId
      ? (bindings) => definition.configuredId!(bindings as NotionBulkBindings)
      : undefined,
    createIfMissing: definition.createIfMissing,
    createSchema: definition.createSchema,
  };
}

async function listAllPages(bindings: NotionBulkBindings, dataSourceId: string) {
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

function pageRecord(
  page: NotionPage,
  titleProperty: string,
  schema: Record<string, DataSourceProperty>,
): ExistingNotionRecord {
  return {
    pageId: page.id,
    title: clean(pageProperty(page, titleProperty)),
    psipediaId: clean(pageProperty(page, "Psipedia ID")),
    url: clean(pageProperty(page, "URL Psipedia")),
    properties: Object.fromEntries(Object.keys(schema).map((name) => [name, pageProperty(page, name)])),
    propertyTypes: Object.fromEntries(
      Object.entries(schema).map(([name, propertySchema]) => [name, propertyType(propertySchema)]),
    ),
  };
}

export function buildNotionUpdateDiagnostics(
  plan: ReturnType<typeof planNotionReconciliation>,
  notionRecords: ExistingNotionRecord[],
  sampleLimit = 50,
): NonNullable<NotionBulkAgendaResult["diagnostics"]> {
  const byPageId = new Map(notionRecords.map((page) => [page.pageId, page]));
  const updateFieldCounts: Record<string, number> = {};
  const samplesPerField = new Map<string, number>();
  const updateSamples: NonNullable<NotionBulkAgendaResult["diagnostics"]>["updateSamples"] = [];

  for (const action of plan.actions) {
    if (action.kind !== "UPDATE" || !action.pageId || !action.changes) continue;
    const page = byPageId.get(action.pageId);
    for (const [field, sourceValue] of Object.entries(action.changes)) {
      updateFieldCounts[field] = (updateFieldCounts[field] ?? 0) + 1;
      const fieldSamples = samplesPerField.get(field) ?? 0;
      if (fieldSamples >= 3 || updateSamples.length >= sampleLimit) continue;
      updateSamples.push({
        psipediaId: action.source.id,
        title: action.source.title,
        notionPageId: action.pageId,
        field,
        propertyType: page?.propertyTypes?.[field] ?? "",
        sourceValue,
        notionValue: page?.properties[field] ?? null,
      });
      samplesPerField.set(field, fieldSamples + 1);
    }
  }

  const sortedCounts = Object.fromEntries(
    Object.entries(updateFieldCounts)
      .sort(([leftField, leftCount], [rightField, rightCount]) => (
        rightCount - leftCount || leftField.localeCompare(rightField)
      )),
  );

  return { updateFieldCounts: sortedCounts, updateSamples };
}

function chunks(value: string) {
  if (!value) return [];
  const result = [];
  for (let index = 0; index < value.length; index += 1800) {
    result.push({ type: "text", text: { content: value.slice(index, index + 1800) } });
  }
  return result;
}

function propertyType(schema: DataSourceProperty) {
  const explicit = clean(schema.type);
  if (explicit) return explicit;
  return Object.keys(schema).find((key) => !["id", "name", "description"].includes(key)) ?? "";
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

function emptyAgenda(
  definition: AgendaDefinition,
  sourceTotal: number,
  overrides: Partial<NotionBulkAgendaResult> = {},
): NotionBulkAgendaResult {
  return {
    agenda: definition.key,
    label: definition.label,
    dataSourceId: null,
    provisioned: false,
    targetMissing: false,
    duplicateTargetDataSourceIds: [],
    sourceTotal,
    notionTotal: 0,
    matched: 0,
    create: 0,
    update: 0,
    unchanged: 0,
    conflict: 0,
    duplicate: 0,
    skipped: 0,
    error: 0,
    missingRequiredProperties: [],
    missingOptionalProperties: [],
    duplicateConflicts: [],
    conflicts: [],
    batches: [],
    errors: [],
    ...overrides,
  };
}

async function reconcileAgenda(
  database: D1Database,
  bindings: NotionBulkBindings,
  definition: AgendaDefinition,
  mode: NotionBulkMode,
  writeBudget: { remaining: number },
): Promise<NotionBulkAgendaResult> {
  const source = await definition.load(database);
  const target = await resolveNotionCanonicalTarget({
    database,
    bindings: bindings as NotionBulkBindings & Record<string, unknown>,
    definition: canonicalTargetDefinition(definition),
    allowCreate: mode === "execute",
    persist: mode === "execute",
  });

  if (!target.dataSourceId) {
    if (definition.createIfMissing && mode === "dry-run") {
      return emptyAgenda(definition, source.length, {
        targetMissing: true,
        create: source.length,
      });
    }
    return emptyAgenda(definition, source.length, {
      targetMissing: true,
      skipped: source.length,
      error: 1,
      errors: [{ sourceId: "TARGET", message: `Notion databáza „${definition.targetTitle}“ sa nenašla.` }],
    });
  }

  let dataSource = await notionRequest<DataSourceResponse>(
    bindings,
    `/data_sources/${encodeURIComponent(target.dataSourceId)}`,
  );
  let schema = dataSource.properties ?? {};
  const schemaExtension = definition.extendSchema ?? {};
  const missingExtensionProperties = Object.keys(schemaExtension).filter((name) => !schema[name]);
  const addedSchemaProperties = new Set<string>();

  if (mode === "execute" && missingExtensionProperties.length) {
    const properties = Object.fromEntries(
      missingExtensionProperties.map((name) => [name, schemaExtension[name]]),
    ) as Record<string, DataSourceProperty>;
    dataSource = await notionRequest<DataSourceResponse>(
      bindings,
      `/data_sources/${encodeURIComponent(target.dataSourceId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ properties }),
      },
    );
    missingExtensionProperties.forEach((name) => addedSchemaProperties.add(name));
    schema = dataSource.properties ?? { ...schema, ...properties };
  }
  const required = [definition.titleProperty, "Psipedia ID", "URL Psipedia"];
  const sourceProperties = [...new Set(source.flatMap((record) => Object.keys(record.properties)))];
  const optional = sourceProperties.filter((name) => !required.includes(name));
  const schemaCheck = validateNotionSchema(Object.keys(schema), required, optional);

  if (schemaCheck.missingRequired.length) {
    return emptyAgenda(definition, source.length, {
      dataSourceId: target.dataSourceId,
      provisioned: target.provisioned,
      duplicateTargetDataSourceIds: target.duplicateDataSourceIds,
      skipped: source.length,
      error: 1,
      missingRequiredProperties: schemaCheck.missingRequired,
      missingOptionalProperties: schemaCheck.missingOptional,
      errors: [{
        sourceId: "SCHEMA",
        message: `Chýbajú povinné Notion properties: ${schemaCheck.missingRequired.join(", ")}`,
      }],
    });
  }

  const allowed = new Set(Object.keys(schema));
  const filteredSource = source.map((record) => ({
    ...record,
    properties: Object.fromEntries(Object.entries(record.properties).filter(([name]) => allowed.has(name))),
    ownership: {
      ...Object.fromEntries(Object.entries(record.ownership ?? {}).filter(([name]) => allowed.has(name))),
      ...Object.fromEntries(
        [...addedSchemaProperties]
          .filter((name) => allowed.has(name))
          .map((name) => [name, "system" as const]),
      ),
    },
  }));

  const pages = await listAllPages(bindings, target.dataSourceId);
  const notion = pages.map((page) => pageRecord(page, definition.titleProperty, schema));
  const plan = planNotionReconciliation(filteredSource, notion);
  const diagnostics = mode === "dry-run"
    ? buildNotionUpdateDiagnostics(plan, notion)
    : undefined;

  const duplicateConflicts = plan.actions
    .filter((action) => action.kind === "DUPLICATE")
    .map((action) => ({
      psipediaId: action.source.id,
      title: action.source.title,
      url: action.source.url,
      notionPageIds: action.notionPageIds ?? [],
      database: definition.label,
      reason: action.reason ?? "DUPLICATE_CONFLICT",
    }));

  const conflicts = plan.actions
    .filter((action) => action.kind === "CONFLICT")
    .map((action) => ({
      psipediaId: action.source.id,
      title: action.source.title,
      url: action.source.url,
      notionPageId: action.pageId,
      fields: action.conflictFields ?? [],
      reason: action.reason ?? "CONFLICT",
    }));

  let execution = {
    batches: [] as NotionBulkAgendaResult["batches"],
    errors: [] as NotionBulkAgendaResult["errors"],
    error: 0,
    skipped: 0,
  };

  if (mode === "execute") {
    const result = await executeReconciliationPlan(plan, {
      dryRun: false,
      batchSize: 100,
      maxWrites: writeBudget.remaining,
      writeDelayMs: 350,
      create: async (record) => {
        const values: Record<string, ReconciliationValue> = {
          ...record.properties,
          [definition.titleProperty]: record.properties[definition.titleProperty] ?? record.title,
          "Psipedia ID": record.id,
          "URL Psipedia": record.url,
          "Sync stav": "Synchronizované",
          "Sync chyba": "",
          "Posledný sync": new Date().toISOString(),
        };
        await notionRequest(bindings, "/pages", {
          method: "POST",
          body: JSON.stringify({
            parent: { type: "data_source_id", data_source_id: target.dataSourceId },
            properties: encodeProperties(values, schema),
          }),
        });
      },
      update: async (pageId, changes) => {
        const values: Record<string, ReconciliationValue> = {
          ...changes,
          "Sync stav": "Synchronizované",
          "Sync chyba": "",
          "Posledný sync": new Date().toISOString(),
        };
        await notionRequest(bindings, `/pages/${encodeURIComponent(pageId)}`, {
          method: "PATCH",
          body: JSON.stringify({ properties: encodeProperties(values, schema) }),
        });
      },
    });
    const writeAttempts = result.created + result.updated + result.error;
    writeBudget.remaining = Math.max(0, writeBudget.remaining - writeAttempts);
    execution = {
      batches: result.batches,
      errors: result.errors,
      error: result.error,
      skipped: result.skipped,
    };
  }

  return {
    agenda: definition.key,
    label: definition.label,
    dataSourceId: target.dataSourceId,
    provisioned: target.provisioned,
    targetMissing: false,
    duplicateTargetDataSourceIds: target.duplicateDataSourceIds,
    sourceTotal: plan.sourceTotal,
    notionTotal: plan.notionTotal,
    matched: plan.matched,
    create: plan.create,
    update: plan.update,
    unchanged: plan.unchanged,
    conflict: plan.conflict,
    duplicate: plan.duplicate,
    skipped: execution.skipped,
    error: execution.error,
    missingRequiredProperties: schemaCheck.missingRequired,
    missingOptionalProperties: schemaCheck.missingOptional,
    duplicateConflicts,
    conflicts,
    ...(diagnostics ? { diagnostics } : {}),
    batches: execution.batches,
    errors: execution.errors,
  };
}

export function isNotionBulkMode(value: unknown): value is NotionBulkMode {
  return value === "dry-run" || value === "execute";
}

export function isNotionBulkScope(value: unknown): value is NotionBulkScope {
  return [
    "all", "services", "events", "help",
    "organizations", "adoptions", "help-cases", "lost-found",
  ].includes(String(value));
}

export async function runNotionBulkBackfill(args: {
  database: D1Database;
  bindings: NotionBulkBindings;
  mode: NotionBulkMode;
  scope: NotionBulkScope;
}): Promise<NotionBulkBackfillResult> {
  const startedAt = new Date().toISOString();
  const selected = scopeKeys(args.scope);
  const agendas: NotionBulkAgendaResult[] = [];
  const writeBudget = { remaining: args.mode === "execute" ? 100 : 0 };

  for (const definition of definitions) {
    if (!selected.has(definition.key)) continue;
    try {
      agendas.push(await reconcileAgenda(args.database, args.bindings, definition, args.mode, writeBudget));
    } catch (error) {
      agendas.push(emptyAgenda(definition, 0, {
        error: 1,
        errors: [{
          sourceId: "AGENDA",
          message: error instanceof Error ? error.message : String(error),
        }],
      }));
    }
  }

  const relatedSourceTotals = (args.scope === "all" || args.scope === "help")
    ? await loadNotionBulkRelatedHelpCounts(args.database).catch(() => ({
        organizationLocations: 0,
        organizationFundraisingMethods: 0,
      }))
    : { organizationLocations: 0, organizationFundraisingMethods: 0 };

  const total = agendas.reduce((sum, agenda) => ({
    sourceTotal: sum.sourceTotal + agenda.sourceTotal,
    notionTotal: sum.notionTotal + agenda.notionTotal,
    matched: sum.matched + agenda.matched,
    create: sum.create + agenda.create,
    update: sum.update + agenda.update,
    unchanged: sum.unchanged + agenda.unchanged,
    conflict: sum.conflict + agenda.conflict,
    duplicate: sum.duplicate + agenda.duplicate,
    skipped: sum.skipped + agenda.skipped,
    error: sum.error + agenda.error,
  }), {
    sourceTotal: 0, notionTotal: 0, matched: 0, create: 0, update: 0,
    unchanged: 0, conflict: 0, duplicate: 0, skipped: 0, error: 0,
  });

  return {
    mode: args.mode,
    scope: args.scope,
    startedAt,
    finishedAt: new Date().toISOString(),
    agendas,
    relatedSourceTotals,
    total,
  };
}
