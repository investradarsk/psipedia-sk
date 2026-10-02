import { notionRequest, type NotionSyncBindings } from "./notion-sync-shared.ts";

export type NotionCanonicalTargetDefinition = {
  key: string;
  label: string;
  targetTitle: string;
  titleProperty: string;
  configuredId?: (bindings: NotionSyncBindings & Record<string, unknown>) => string;
  createIfMissing?: boolean;
  createSchema?: Record<string, unknown>;
};

export type NotionCanonicalTarget = {
  dataSourceId: string | null;
  databaseId: string | null;
  provisioned: boolean;
  targetMissing: boolean;
  duplicateDataSourceIds: string[];
};

type DataSourceProperty = { type?: string; [key: string]: unknown };
type DataSourceResponse = {
  id: string;
  created_time?: string;
  parent?: { database_id?: string };
  properties?: Record<string, DataSourceProperty>;
};
type SearchItem = {
  id: string;
  object?: string;
  title?: Array<{ plain_text?: string }>;
  properties?: { title?: { title?: Array<{ plain_text?: string }> } };
};
type SearchResponse = { results?: SearchItem[]; has_more?: boolean; next_cursor?: string | null };
type DatabaseResponse = { id: string };
type QueryResponse = {
  results?: Array<{ properties?: Record<string, unknown> }>;
  has_more?: boolean;
  next_cursor?: string | null;
};

type TargetMappingRow = {
  agenda: string;
  database_id: string | null;
  data_source_id: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function richTextPlainText(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => (
    item && typeof item === "object" && typeof (item as Record<string, unknown>).plain_text === "string"
      ? String((item as Record<string, unknown>).plain_text)
      : ""
  )).join("").trim();
}

function searchItemTitle(item: SearchItem) {
  const direct = richTextPlainText(item.title);
  if (direct) return direct;
  return richTextPlainText(item.properties?.title?.title);
}

function propertyType(property: DataSourceProperty | undefined) {
  if (!property) return "";
  const explicit = clean(property.type);
  if (explicit) return explicit;
  return Object.keys(property).find((key) => !["id", "name", "description"].includes(key)) ?? "";
}

function requiredProperties(definition: NotionCanonicalTargetDefinition) {
  return [definition.titleProperty, "Psipedia ID", "URL Psipedia"];
}

export function notionDataSourceMatchesCanonicalSchema(
  dataSource: Pick<DataSourceResponse, "properties">,
  definition: NotionCanonicalTargetDefinition,
) {
  const properties = dataSource.properties ?? {};
  if (propertyType(properties[definition.titleProperty]) !== "title") return false;
  return requiredProperties(definition).every((name) => Boolean(properties[name]));
}

async function tableReady(database: D1Database) {
  const row = await database.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='notion_agenda_targets' LIMIT 1",
  ).first<{ ok: number }>();
  return Boolean(row?.ok);
}

async function loadPersistedTarget(database: D1Database, agenda: string) {
  if (!await tableReady(database)) return null;
  return database.prepare(
    "SELECT agenda,database_id,data_source_id FROM notion_agenda_targets WHERE agenda=? LIMIT 1",
  ).bind(agenda).first<TargetMappingRow>();
}

async function savePersistedTarget(
  database: D1Database,
  definition: NotionCanonicalTargetDefinition,
  dataSource: DataSourceResponse,
) {
  if (!await tableReady(database)) return;
  const now = new Date().toISOString();
  await database.prepare(`
    INSERT INTO notion_agenda_targets (
      agenda,database_id,data_source_id,target_title,title_property,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(agenda) DO UPDATE SET
      database_id=excluded.database_id,
      data_source_id=excluded.data_source_id,
      target_title=excluded.target_title,
      title_property=excluded.title_property,
      updated_at=excluded.updated_at
  `).bind(
    definition.key,
    clean(dataSource.parent?.database_id) || null,
    dataSource.id,
    definition.targetTitle,
    definition.titleProperty,
    now,
    now,
  ).run();
}

async function searchExactAll(
  bindings: NotionSyncBindings,
  title: string,
  object: "data_source" | "page",
) {
  const matches: SearchItem[] = [];
  let cursor: string | null = null;
  do {
    const response = await notionRequest<SearchResponse>(bindings, "/search", {
      method: "POST",
      body: JSON.stringify({
        query: title,
        page_size: 100,
        filter: { property: "object", value: object },
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });
    matches.push(...(response.results ?? []).filter((item) => searchItemTitle(item) === title));
    cursor = response.has_more && response.next_cursor ? response.next_cursor : null;
  } while (cursor);
  return matches;
}

async function fetchDataSource(bindings: NotionSyncBindings, dataSourceId: string) {
  return notionRequest<DataSourceResponse>(
    bindings,
    `/data_sources/${encodeURIComponent(dataSourceId)}`,
  );
}

function notionPropertyText(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.title)) return richTextPlainText(record.title);
  if (Array.isArray(record.rich_text)) return richTextPlainText(record.rich_text);
  if (typeof record.url === "string") return record.url.trim();
  return "";
}

async function candidateScore(bindings: NotionSyncBindings, dataSourceId: string) {
  let cursor: string | null = null;
  let total = 0;
  let identityRows = 0;
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
    for (const page of response.results ?? []) {
      total += 1;
      const properties = page.properties ?? {};
      const id = notionPropertyText(properties["Psipedia ID"]);
      const url = notionPropertyText(properties["URL Psipedia"]);
      if (id && url) identityRows += 1;
    }
    cursor = response.has_more && response.next_cursor ? response.next_cursor : null;
  } while (cursor);
  return { total, identityRows };
}

async function chooseCanonicalCandidate(
  bindings: NotionSyncBindings,
  candidates: DataSourceResponse[],
  persistedId: string,
) {
  if (candidates.length === 0) return { canonical: null, duplicateIds: [] as string[] };
  if (candidates.length === 1) return { canonical: candidates[0], duplicateIds: [] as string[] };

  const persisted = candidates.find((candidate) => candidate.id === persistedId);
  if (persisted) {
    return {
      canonical: persisted,
      duplicateIds: candidates.filter((candidate) => candidate.id !== persisted.id).map((candidate) => candidate.id),
    };
  }

  const scored = await Promise.all(candidates.map(async (candidate) => ({
    candidate,
    ...(await candidateScore(bindings, candidate.id)),
  })));
  scored.sort((left, right) => (
    right.identityRows - left.identityRows
    || right.total - left.total
    || clean(left.candidate.created_time).localeCompare(clean(right.candidate.created_time))
    || left.candidate.id.localeCompare(right.candidate.id)
  ));
  return {
    canonical: scored[0].candidate,
    duplicateIds: scored.slice(1).map((item) => item.candidate.id),
  };
}

async function inspectExactCanonicalCandidates(
  bindings: NotionSyncBindings,
  definition: NotionCanonicalTargetDefinition,
) {
  const matches = await searchExactAll(bindings, definition.targetTitle, "data_source");
  const inspected = await Promise.all(matches.map(async (match) => {
    try {
      return await fetchDataSource(bindings, match.id);
    } catch {
      return null;
    }
  }));
  return inspected.filter((item): item is DataSourceResponse => (
    Boolean(item) && notionDataSourceMatchesCanonicalSchema(item!, definition)
  ));
}

async function findEditorialHub(bindings: NotionSyncBindings) {
  const matches = await searchExactAll(bindings, "Psipedia — Editorial Hub", "page");
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error("Notion obsahuje viac stránok „Psipedia — Editorial Hub“; provisioning je zastavený.");
  }
  return matches[0];
}

export async function resolveNotionCanonicalTarget(args: {
  database: D1Database;
  bindings: NotionSyncBindings & Record<string, unknown>;
  definition: NotionCanonicalTargetDefinition;
  allowCreate: boolean;
  persist?: boolean;
}): Promise<NotionCanonicalTarget> {
  const persist = args.persist !== false;
  const configuredId = args.definition.configuredId?.(args.bindings) ?? "";
  const persisted = await loadPersistedTarget(args.database, args.definition.key);
  const persistedId = clean(persisted?.data_source_id);

  if (configuredId) {
    const configured = await fetchDataSource(args.bindings, configuredId);
    if (!notionDataSourceMatchesCanonicalSchema(configured, args.definition)) {
      throw new Error(`${args.definition.label}: nakonfigurovaný Notion data source nemá canonical Psipedia schému.`);
    }
    if (persist) await savePersistedTarget(args.database, args.definition, configured);
    return {
      dataSourceId: configured.id,
      databaseId: clean(configured.parent?.database_id) || null,
      provisioned: false,
      targetMissing: false,
      duplicateDataSourceIds: [],
    };
  }

  if (persistedId) {
    try {
      const mapped = await fetchDataSource(args.bindings, persistedId);
      if (notionDataSourceMatchesCanonicalSchema(mapped, args.definition)) {
        const currentCandidates = await inspectExactCanonicalCandidates(args.bindings, args.definition);
        return {
          dataSourceId: mapped.id,
          databaseId: clean(mapped.parent?.database_id) || clean(persisted?.database_id) || null,
          provisioned: false,
          targetMissing: false,
          duplicateDataSourceIds: currentCandidates
            .filter((candidate) => candidate.id !== mapped.id)
            .map((candidate) => candidate.id),
        };
      }
    } catch {
      // Fall through to schema-based discovery. A stale persisted ID must not
      // cause creation until existing canonical candidates are inspected.
    }
  }

  const candidates = await inspectExactCanonicalCandidates(args.bindings, args.definition);
  const selected = await chooseCanonicalCandidate(args.bindings, candidates, persistedId);
  if (selected.canonical) {
    if (persist) await savePersistedTarget(args.database, args.definition, selected.canonical);
    return {
      dataSourceId: selected.canonical.id,
      databaseId: clean(selected.canonical.parent?.database_id) || null,
      provisioned: false,
      targetMissing: false,
      duplicateDataSourceIds: selected.duplicateIds,
    };
  }

  if (!args.definition.createIfMissing || !args.definition.createSchema || !args.allowCreate) {
    return {
      dataSourceId: null,
      databaseId: null,
      provisioned: false,
      targetMissing: true,
      duplicateDataSourceIds: [],
    };
  }

  const hub = await findEditorialHub(args.bindings);
  if (!hub) throw new Error("Notion stránka „Psipedia — Editorial Hub“ sa nenašla.");

  const database = await notionRequest<DatabaseResponse>(args.bindings, "/databases", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "page_id", page_id: hub.id },
      title: [{ type: "text", text: { content: args.definition.targetTitle } }],
    }),
  });
  if (!database.id) throw new Error(`${args.definition.label}: Notion nevytvoril databázu.`);

  const dataSource = await notionRequest<DataSourceResponse>(args.bindings, "/data_sources", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "database_id", database_id: database.id },
      title: [{ type: "text", text: { content: args.definition.targetTitle } }],
      properties: args.definition.createSchema,
    }),
  });
  if (!dataSource.id) throw new Error(`${args.definition.label}: vytvorený data source nemá ID.`);

  // Critical: keep using the ID returned by create. Do not re-discover through
  // Search here; Notion indexing is eventually consistent and that race caused
  // duplicate Lost/Found databases in #577.
  // A direct GET by the returned ID is safe during Notion indexing lag and
  // gives us the authoritative schema. Only full-text search is eventually
  // consistent here.
  const createdFetched = await fetchDataSource(args.bindings, dataSource.id);
  const created = {
    ...createdFetched,
    parent: createdFetched.parent ?? dataSource.parent ?? { database_id: database.id },
  };
  if (!notionDataSourceMatchesCanonicalSchema(created, args.definition)) {
    throw new Error(`${args.definition.label}: vytvorený data source nemá canonical Psipedia schému.`);
  }
  if (persist) await savePersistedTarget(args.database, args.definition, created);

  return {
    dataSourceId: created.id,
    databaseId: database.id,
    provisioned: true,
    targetMissing: false,
    duplicateDataSourceIds: [],
  };
}
