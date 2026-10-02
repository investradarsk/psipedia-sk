export type ReconciliationOwnership = "system" | "fill-missing";
export type ReconciliationValue = string | number | boolean | null;

export type CanonicalSourceRecord = {
  id: string;
  title: string;
  url: string;
  properties: Record<string, ReconciliationValue>;
  ownership?: Record<string, ReconciliationOwnership>;
};

export type ExistingNotionRecord = {
  pageId: string;
  title: string;
  psipediaId: string;
  url: string;
  properties: Record<string, ReconciliationValue>;
};

export type ReconciliationActionKind =
  | "CREATE"
  | "UPDATE"
  | "UNCHANGED"
  | "CONFLICT"
  | "DUPLICATE";

export type ReconciliationAction = {
  kind: ReconciliationActionKind;
  source: CanonicalSourceRecord;
  pageId?: string;
  changes?: Record<string, ReconciliationValue>;
  conflictFields?: string[];
  notionPageIds?: string[];
  reason?: string;
};

export type ReconciliationPlan = {
  sourceTotal: number;
  notionTotal: number;
  matched: number;
  create: number;
  update: number;
  unchanged: number;
  conflict: number;
  duplicate: number;
  actions: ReconciliationAction[];
};

function normalizedScalar(value: ReconciliationValue) {
  if (value === null) return "";
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ");
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function normalizeCanonicalUrl(value: string) {
  const clean = value.trim();
  if (!clean) return "";
  try {
    const url = new URL(clean);
    url.hash = "";
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return clean.replace(/\/+$/, "").toLowerCase();
  }
}

function valuesEqual(left: ReconciliationValue, right: ReconciliationValue) {
  return normalizedScalar(left) === normalizedScalar(right);
}

function valueMissing(value: ReconciliationValue | undefined) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function appendIndex(map: Map<string, ExistingNotionRecord[]>, key: string, page: ExistingNotionRecord) {
  if (!key) return;
  const current = map.get(key) ?? [];
  current.push(page);
  map.set(key, current);
}

function compareMatchedRecord(
  source: CanonicalSourceRecord,
  page: ExistingNotionRecord,
): ReconciliationAction {
  const changes: Record<string, ReconciliationValue> = {};
  const conflictFields: string[] = [];
  const sourceProperties = {
    ...source.properties,
    "Psipedia ID": source.id,
    "URL Psipedia": source.url,
  };

  for (const [property, desired] of Object.entries(sourceProperties)) {
    const current = page.properties[property];
    if (valuesEqual(current ?? null, desired)) continue;

    const ownership = property === "Psipedia ID" || property === "URL Psipedia"
      ? "system"
      : source.ownership?.[property] ?? "fill-missing";

    if (ownership === "system" || valueMissing(current)) {
      changes[property] = desired;
      continue;
    }
    conflictFields.push(property);
  }

  if (conflictFields.length) {
    return {
      kind: "CONFLICT",
      source,
      pageId: page.pageId,
      conflictFields,
      reason: "NON_EMPTY_NOTION_VALUE_DIFFERS",
    };
  }
  if (Object.keys(changes).length) {
    return { kind: "UPDATE", source, pageId: page.pageId, changes };
  }
  return { kind: "UNCHANGED", source, pageId: page.pageId };
}

export function planNotionReconciliation(
  sourceRecords: CanonicalSourceRecord[],
  notionRecords: ExistingNotionRecord[],
): ReconciliationPlan {
  const byId = new Map<string, ExistingNotionRecord[]>();
  const byUrl = new Map<string, ExistingNotionRecord[]>();
  for (const page of notionRecords) {
    appendIndex(byId, page.psipediaId.trim(), page);
    appendIndex(byUrl, normalizeCanonicalUrl(page.url), page);
  }

  const sourceIdCounts = new Map<string, number>();
  const sourceUrlCounts = new Map<string, number>();
  for (const source of sourceRecords) {
    const id = source.id.trim();
    const url = normalizeCanonicalUrl(source.url);
    if (id) sourceIdCounts.set(id, (sourceIdCounts.get(id) ?? 0) + 1);
    if (url) sourceUrlCounts.set(url, (sourceUrlCounts.get(url) ?? 0) + 1);
  }

  const actions: ReconciliationAction[] = [];
  let matched = 0;

  for (const source of sourceRecords) {
    const sourceId = source.id.trim();
    const sourceUrl = normalizeCanonicalUrl(source.url);

    if ((sourceIdCounts.get(sourceId) ?? 0) > 1 || (sourceUrl && (sourceUrlCounts.get(sourceUrl) ?? 0) > 1)) {
      actions.push({
        kind: "CONFLICT",
        source,
        conflictFields: [(sourceIdCounts.get(sourceId) ?? 0) > 1 ? "Psipedia ID" : "URL Psipedia"],
        reason: "SOURCE_CANONICAL_IDENTITY_CONFLICT",
      });
      continue;
    }

    const idMatches = byId.get(sourceId) ?? [];
    const urlMatches = sourceUrl ? (byUrl.get(sourceUrl) ?? []) : [];
    const candidates = new Map<string, ExistingNotionRecord>();
    for (const page of [...idMatches, ...urlMatches]) candidates.set(page.pageId, page);

    if (idMatches.length > 1 || urlMatches.length > 1 || candidates.size > 1) {
      matched += 1;
      actions.push({
        kind: "DUPLICATE",
        source,
        notionPageIds: [...candidates.keys()],
        reason: "DUPLICATE_CONFLICT:CANONICAL_IDENTITY",
      });
      continue;
    }

    const match = candidates.values().next().value as ExistingNotionRecord | undefined;
    if (!match) {
      actions.push({ kind: "CREATE", source });
      continue;
    }

    matched += 1;
    if (match.psipediaId.trim() && match.psipediaId.trim() !== sourceId) {
      actions.push({
        kind: "CONFLICT",
        source,
        pageId: match.pageId,
        conflictFields: ["Psipedia ID"],
        reason: "URL_MATCH_WITH_DIFFERENT_PSIPEDIA_ID",
      });
      continue;
    }

    actions.push(compareMatchedRecord(source, match));
  }

  const count = (kind: ReconciliationActionKind) => actions.filter((action) => action.kind === kind).length;
  return {
    sourceTotal: sourceRecords.length,
    notionTotal: notionRecords.length,
    matched,
    create: count("CREATE"),
    update: count("UPDATE"),
    unchanged: count("UNCHANGED"),
    conflict: count("CONFLICT"),
    duplicate: count("DUPLICATE"),
    actions,
  };
}

export function chunkItems<T>(items: T[], size = 100) {
  const safeSize = Math.max(1, Math.min(100, Math.trunc(size) || 100));
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += safeSize) chunks.push(items.slice(index, index + safeSize));
  return chunks;
}

export type ReconciliationExecutionSummary = {
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  conflict: number;
  duplicate: number;
  skipped: number;
  error: number;
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
  errors: Array<{ sourceId: string; message: string }>;
};

export async function executeReconciliationPlan(
  plan: ReconciliationPlan,
  options: {
    dryRun: boolean;
    batchSize?: number;
    maxWrites?: number;
    writeDelayMs?: number;
    create: (source: CanonicalSourceRecord) => Promise<void>;
    update: (pageId: string, changes: Record<string, ReconciliationValue>, source: CanonicalSourceRecord) => Promise<void>;
  },
): Promise<ReconciliationExecutionSummary> {
  const summary: ReconciliationExecutionSummary = {
    processed: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    conflict: 0,
    duplicate: 0,
    skipped: 0,
    error: 0,
    batches: [],
    errors: [],
  };

  const batches = chunkItems(plan.actions, options.batchSize ?? 100);
  const maxWrites = Math.max(0, Math.trunc(options.maxWrites ?? Number.MAX_SAFE_INTEGER));
  const writeDelayMs = Math.max(0, Math.trunc(options.writeDelayMs ?? 0));
  let writeAttempts = 0;

  for (let index = 0; index < batches.length; index += 1) {
    const batchSummary = {
      index: index + 1,
      processed: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      conflict: 0,
      duplicate: 0,
      skipped: 0,
      error: 0,
    };

    for (const action of batches[index]) {
      summary.processed += 1;
      batchSummary.processed += 1;
      if (action.kind === "UNCHANGED") {
        summary.unchanged += 1;
        batchSummary.unchanged += 1;
        continue;
      }
      if (action.kind === "CONFLICT") {
        summary.conflict += 1;
        batchSummary.conflict += 1;
        continue;
      }
      if (action.kind === "DUPLICATE") {
        summary.duplicate += 1;
        batchSummary.duplicate += 1;
        continue;
      }
      if (options.dryRun) {
        summary.skipped += 1;
        batchSummary.skipped += 1;
        continue;
      }
      if (writeAttempts >= maxWrites) {
        summary.skipped += 1;
        batchSummary.skipped += 1;
        continue;
      }

      if (writeDelayMs > 0 && writeAttempts > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, writeDelayMs));
      }
      writeAttempts += 1;

      try {
        if (action.kind === "CREATE") {
          await options.create(action.source);
          summary.created += 1;
          batchSummary.created += 1;
        } else if (action.kind === "UPDATE" && action.pageId && action.changes) {
          await options.update(action.pageId, action.changes, action.source);
          summary.updated += 1;
          batchSummary.updated += 1;
        }
      } catch (error) {
        summary.error += 1;
        batchSummary.error += 1;
        summary.errors.push({
          sourceId: action.source.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    summary.batches.push(batchSummary);
  }
  return summary;
}

export function validateNotionSchema(
  availableProperties: Iterable<string>,
  requiredProperties: string[],
  optionalProperties: string[] = [],
) {
  const available = new Set(availableProperties);
  return {
    missingRequired: requiredProperties.filter((property) => !available.has(property)),
    missingOptional: optionalProperties.filter((property) => !available.has(property)),
  };
}
