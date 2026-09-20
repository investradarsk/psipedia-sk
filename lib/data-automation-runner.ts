import type { ControlledHtmlAdapter, AutomationFetch } from "./data-automation-connectors";
import { AutomationConnectorError, fetchAutomationSourceRecords } from "./data-automation-connectors";
import {
  automationFindingFingerprint,
  automationFindingPriority,
  buildAutomationDiff,
  classifyAutomationFinding,
  sha256Hex,
  type AutomationFindingType,
  type AutomationSource,
  type AutomationSourceRecord,
} from "./data-automation";
import {
  beginAutomationRun,
  finishAutomationRun,
  listDueAutomationSources,
  matchAutomationCanonical,
  recordAutomationObservation,
  resolveAutomationSourceErrors,
  upsertAutomationFinding,
  type AutomationD1Database,
} from "./data-automation-store";
import { enqueueEditorialNotification } from "./editorial-notifications";

export const DATA_AUTOMATION_MAX_SOURCES_PER_SWEEP = 8;

export type DataAutomationSweepOptions = {
  database: D1Database;
  now?: Date;
  fetchImpl?: AutomationFetch;
  htmlAdapters?: Record<string, ControlledHtmlAdapter>;
  sleep?: (ms: number) => Promise<void>;
};

type SourceRunSummary = {
  sourceId: number;
  sourceKey: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  checked: number;
  newFindings: number;
  updatedFindings: number;
  errors: number;
  nextCheckAt: string | null;
};

function safeErrorCode(error: unknown) {
  if (error instanceof AutomationConnectorError) return error.code;
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 180) || "automation_unknown_error";
}

function requiredIdentity(source: AutomationSource, record: AutomationSourceRecord) {
  const p = record.proposed;
  if (!record.sourceRecordId.trim()) throw new Error("source_record_id_missing");
  if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error("normalized_payload_invalid");
  if (source.entityType === "EVENT" && (!String(p.title ?? "").trim() || !String(p.startDate ?? p.start_date ?? "").trim())) {
    throw new Error("event_identity_missing");
  }
  if (source.entityType === "ORGANIZATION" && !String(p.name ?? "").trim()) throw new Error("organization_identity_missing");
  if (source.entityType === "DIRECTORY" && (!String(p.name ?? "").trim() || !String(p.category ?? "").trim())) {
    throw new Error("directory_identity_missing");
  }
  if ((source.entityType === "ADOPTION" || source.entityType === "FOSTER") && !String(p.name ?? p.title ?? "").trim()) {
    throw new Error("dog_identity_missing");
  }
  if (source.entityType === "LOST_FOUND" && !String(p.type ?? "").trim()) throw new Error("lost_found_type_missing");
  if (source.entityType === "HELP_ITEM" && (!String(p.title ?? "").trim() || !String(p.category ?? "").trim())) {
    throw new Error("help_identity_missing");
  }
}

function findingReason(type: AutomationFindingType, record: AutomationSourceRecord, candidates: Array<{ id: number; key: string }> = []) {
  if (type === "NEW_ENTITY") return "Zdrojový záznam nemá bezpečný canonical match. Vytvoriť možno až po ručnom overení.";
  if (type === "POSSIBLE_UPDATE") return "Deterministický canonical match existuje, ale zdroj navrhuje zmenu polí. Canonical záznam nebol prepísaný.";
  if (type === "POSSIBLE_INACTIVE") return "Zdroj signalizuje možnú neaktivitu alebo ukončenie. Vyžaduje ručné potvrdenie.";
  if (type === "POSSIBLE_CANCELLED") return "Zdroj signalizuje možné zrušenie podujatia. Verejný canonical záznam zostal bez zmeny.";
  if (type === "DUPLICATE_CANDIDATE") {
    const ids = candidates.map((candidate) => candidate.key || String(candidate.id)).join(", ");
    return ids
      ? `Match nie je jednoznačný; kandidáti: ${ids}. Automatický update je blokovaný.`
      : "Match nie je dostatočne bezpečný. Automatický update je blokovaný.";
  }
  return `Zdroj sa nepodarilo spracovať bezpečne (${record.sourceRecordId}).`;
}

async function maybeQueueHighPriorityNotification(
  findingId: number,
  type: AutomationFindingType,
  createdOrReopened: boolean,
  database: D1Database,
  now: Date,
) {
  if (!createdOrReopened || automationFindingPriority(type) !== "HIGH") return;
  try {
    await enqueueEditorialNotification("automation_finding", findingId, { database, now });
  } catch (error) {
    console.error(JSON.stringify({
      event: "data_automation_notification_enqueue",
      findingId,
      result: "failed",
      error: safeErrorCode(error),
    }));
  }
}

async function createSourceErrorFinding(
  source: AutomationSource,
  errorCode: string,
  detectedAt: string,
  database: D1Database,
) {
  const payloadHash = await sha256Hex({ errorCode });
  const fingerprint = automationFindingFingerprint({
    sourceKey: source.sourceKey,
    sourceRecordId: "__source__",
    findingType: "SOURCE_ERROR",
    canonicalEntityId: null,
    payloadHash,
  });
  const result = await upsertAutomationFinding({
    source,
    observationId: null,
    sourceRecordId: "__source__",
    sourceUrl: source.sourceUrl,
    sourceTimestamp: null,
    findingType: "SOURCE_ERROR",
    canonicalEntityId: null,
    canonicalEntityKey: null,
    matchQuality: "NONE",
    before: null,
    proposed: { errorCode },
    diff: buildAutomationDiff(null, { errorCode }),
    payloadHash,
    fingerprint,
    reason: `Kontrola zdroja zlyhala: ${errorCode}.`,
    detectedAt,
  }, database);
  await maybeQueueHighPriorityNotification(
    result.id,
    "SOURCE_ERROR",
    result.created || result.reopened,
    database,
    new Date(detectedAt),
  );
  return result;
}

async function processRecord(
  source: AutomationSource,
  runId: number,
  record: AutomationSourceRecord,
  detectedAt: string,
  database: D1Database,
) {
  requiredIdentity(source, record);
  const observationHash = await sha256Hex(record.rawRecord);
  const proposalHash = await sha256Hex(record.proposed);
  const observationId = await recordAutomationObservation({
    sourceId: source.id,
    runId,
    record,
    payloadHash: observationHash,
    detectedAt,
  }, database);

  const match = await matchAutomationCanonical(source, record, database);
  const classified = classifyAutomationFinding({ match, proposed: record.proposed });
  if (!classified) return { finding: null, created: false, reopened: false };

  const fingerprint = automationFindingFingerprint({
    sourceKey: source.sourceKey,
    sourceRecordId: record.sourceRecordId,
    findingType: classified.findingType,
    canonicalEntityId: match.entityId,
    payloadHash: proposalHash,
  });
  const result = await upsertAutomationFinding({
    source,
    observationId,
    sourceRecordId: record.sourceRecordId,
    sourceUrl: record.sourceUrl,
    sourceTimestamp: record.sourceTimestamp,
    findingType: classified.findingType,
    canonicalEntityId: match.entityId,
    canonicalEntityKey: match.entityKey,
    matchQuality: match.quality,
    before: match.before,
    proposed: record.proposed,
    diff: classified.diff,
    payloadHash: proposalHash,
    fingerprint,
    reason: findingReason(classified.findingType, record, match.candidates ?? []),
    detectedAt,
  }, database);

  await maybeQueueHighPriorityNotification(
    result.id,
    classified.findingType,
    result.created || result.reopened,
    database,
    new Date(detectedAt),
  );
  return { finding: classified.findingType, ...result };
}

async function runSource(
  source: AutomationSource,
  options: DataAutomationSweepOptions,
): Promise<SourceRunSummary> {
  const startedAt = options.now ? new Date(options.now) : new Date();
  const detectedAt = startedAt.toISOString();
  const runId = await beginAutomationRun(source.id, detectedAt, options.database);
  let checked = 0;
  let newFindings = 0;
  let updatedFindings = 0;
  let errors = 0;
  let status: SourceRunSummary["status"] = "SUCCESS";
  let errorSummary: string | null = null;

  try {
    const records = await fetchAutomationSourceRecords(source, {
      fetchImpl: options.fetchImpl,
      htmlAdapters: options.htmlAdapters,
      sleep: options.sleep,
    });

    for (const record of records) {
      checked += 1;
      try {
        const result = await processRecord(source, runId, record, detectedAt, options.database);
        if (result.finding) {
          if (result.created || result.reopened) newFindings += 1;
          else updatedFindings += 1;
        }
      } catch (error) {
        errors += 1;
        status = "PARTIAL";
        errorSummary ??= safeErrorCode(error);
        console.error(JSON.stringify({
          event: "data_automation_record",
          sourceKey: source.sourceKey,
          sourceRecordId: record.sourceRecordId,
          result: "failed",
          error: safeErrorCode(error),
        }));
      }
    }

    if (errors === 0) {
      await resolveAutomationSourceErrors(source.id, detectedAt, options.database);
    } else {
      const sourceError = await createSourceErrorFinding(source, errorSummary ?? "record_processing_failed", detectedAt, options.database);
      if (sourceError.created || sourceError.reopened) newFindings += 1;
      else updatedFindings += 1;
    }
  } catch (error) {
    errors += 1;
    status = "FAILED";
    errorSummary = safeErrorCode(error);
    const sourceError = await createSourceErrorFinding(source, errorSummary, detectedAt, options.database);
    if (sourceError.created || sourceError.reopened) newFindings += 1;
    else updatedFindings += 1;
  }

  const completedAt = options.now ? new Date(options.now) : new Date();
  const health = await finishAutomationRun({
    runId,
    source,
    status,
    checkedCount: checked,
    newFindingCount: newFindings,
    updatedFindingCount: updatedFindings,
    errorCount: errors,
    errorSummary,
    startedAt,
    completedAt,
  }, options.database);

  const summary = {
    sourceId: source.id,
    sourceKey: source.sourceKey,
    status,
    checked,
    newFindings,
    updatedFindings,
    errors,
    nextCheckAt: health.nextCheckAt,
  };
  console.info(JSON.stringify({ event: "data_automation_source_run", ...summary }));
  return summary;
}

function missingAutomationSchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table:\s*automation_sources/i.test(message);
}

export async function runDataAutomationSweep(options: DataAutomationSweepOptions) {
  let sources: AutomationSource[];
  try {
    sources = await listDueAutomationSources(
      options.database as AutomationD1Database,
      options.now ?? new Date(),
      DATA_AUTOMATION_MAX_SOURCES_PER_SWEEP,
    );
  } catch (error) {
    if (missingAutomationSchema(error)) {
      return { sources: 0, success: 0, partial: 0, failed: 0, checked: 0, newFindings: 0, updatedFindings: 0, errors: 0, schemaReady: false, runs: [] as SourceRunSummary[] };
    }
    throw error;
  }

  const runs: SourceRunSummary[] = [];
  for (const source of sources) {
    try {
      runs.push(await runSource(source, options));
    } catch (error) {
      console.error(JSON.stringify({
        event: "data_automation_source_run",
        sourceKey: source.sourceKey,
        result: "isolated_failure",
        error: safeErrorCode(error),
      }));
      runs.push({
        sourceId: source.id,
        sourceKey: source.sourceKey,
        status: "FAILED",
        checked: 0,
        newFindings: 0,
        updatedFindings: 0,
        errors: 1,
        nextCheckAt: source.nextCheckAt,
      });
    }
  }

  return {
    sources: runs.length,
    success: runs.filter((run) => run.status === "SUCCESS").length,
    partial: runs.filter((run) => run.status === "PARTIAL").length,
    failed: runs.filter((run) => run.status === "FAILED").length,
    checked: runs.reduce((sum, run) => sum + run.checked, 0),
    newFindings: runs.reduce((sum, run) => sum + run.newFindings, 0),
    updatedFindings: runs.reduce((sum, run) => sum + run.updatedFindings, 0),
    errors: runs.reduce((sum, run) => sum + run.errors, 0),
    schemaReady: true,
    runs,
  };
}
