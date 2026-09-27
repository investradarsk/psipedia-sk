import type { ControlledHtmlAdapter, AutomationFetch } from "./data-automation-connectors.ts";
import type { OrganizationRecordEnricher } from "./data-automation-organization-enrichment.ts";
import { AutomationConnectorError, fetchAutomationSourceRecords } from "./data-automation-connectors.ts";
import {
  automationFindingFingerprint,
  automationFindingPriority,
  buildAutomationDiff,
  classifyAutomationFinding,
  sha256Hex,
  type AutomationFindingType,
  type AutomationSource,
  type AutomationSourceRecord,
} from "./data-automation.ts";
import {
  beginAutomationRun,
  finishAutomationRun,
  getAutomationSource,
  listDueAutomationSources,
  matchAutomationCanonical,
  recordAutomationObservation,
  resolveAutomationSourceErrors,
  resolveOtherAutomationSourceErrors,
  upsertAutomationFinding,
  type AutomationD1Database,
} from "./data-automation-store.ts";
import { enqueueEditorialNotification } from "./editorial-notifications";
import { enqueueAutomationFindingAdminNotification } from "./admin-notifications";
import {
  linkAutomationFindingToCluster,
  resolveAutomationEntityCluster,
} from "./data-automation-clustering.ts";
import { isDirectoryFacilityObservation } from "./data-automation-directory-matching.ts";
import { applyAutomationFinding } from "./data-automation-apply.ts";
import { createAutomationIngestionReceipt, getAutomationIngestionReceipt } from "./data-automation-ingestion-receipts.ts";

export const DATA_AUTOMATION_MAX_SOURCES_PER_SWEEP = 8;
const AUTOMATION_DRAFT_ACTOR = "automation@psipedia.sk";

async function createCanonicalDraftForFinding(
  findingId: number,
  findingType: AutomationFindingType,
  database: D1Database,
  detectedAt: string,
) {
  if (findingType !== "NEW_ENTITY" && findingType !== "DUPLICATE_CANDIDATE") return null;
  return applyAutomationFinding({
    id: findingId,
    reviewerEmail: AUTOMATION_DRAFT_ACTOR,
    notes: findingType === "DUPLICATE_CANDIDATE"
      ? "Automaticky vytvorený koncept. ⚠️ Možná duplicita — skontrolovať pred publikovaním."
      : "Automaticky vytvorený koncept zo schváleného zdroja.",
    now: new Date(detectedAt),
  }, database);
}

export type DataAutomationSweepOptions = {
  database: D1Database;
  now?: Date;
  fetchImpl?: AutomationFetch;
  htmlAdapters?: Record<string, ControlledHtmlAdapter>;
  sleep?: (ms: number) => Promise<void>;
  organizationEnricher?: OrganizationRecordEnricher;
};

type SourceRunSummary = {
  sourceId: number;
  sourceKey: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  checked: number;
  newFindings: number;
  updatedFindings: number;
  newDataFindings: number;
  sourceErrors: number;
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
  if (type === "NEW_ENTITY") return "Zdrojový záznam nemá bezpečný canonical match. Automatizácia z neho vytvorí koncept na ďalšiu úpravu alebo publikovanie.";
  if (type === "POSSIBLE_UPDATE") return "Deterministický canonical match existuje, ale zdroj navrhuje zmenu polí. Canonical záznam nebol prepísaný.";
  if (type === "POSSIBLE_INACTIVE") return "Zdroj signalizuje možnú neaktivitu alebo ukončenie. Vyžaduje ručné potvrdenie.";
  if (type === "POSSIBLE_CANCELLED") return "Zdroj signalizuje možné zrušenie podujatia. Verejný canonical záznam zostal bez zmeny.";
  if (type === "DUPLICATE_CANDIDATE") {
    const ids = candidates.map((candidate) => candidate.key || String(candidate.id)).join(", ");
    return ids
      ? `Match nie je jednoznačný; kandidáti: ${ids}. Vytvorí sa samostatný koncept označený ako možná duplicita.`
      : "Match nie je dostatočne bezpečný. Vytvorí sa samostatný koncept označený ako možná duplicita.";
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
  if (!createdOrReopened) return;
  if (type === "NEW_ENTITY" || type === "DUPLICATE_CANDIDATE") return;
  try {
    await enqueueAutomationFindingAdminNotification(database, findingId, now);
  } catch (error) {
    console.error(JSON.stringify({ event: "data_automation_admin_push_enqueue", findingId, result: "failed", error: safeErrorCode(error) }));
  }
  if (automationFindingPriority(type) !== "HIGH") return;
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
  await resolveOtherAutomationSourceErrors(source.id, fingerprint, detectedAt, database);
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

async function safelyCreateSourceErrorFinding(
  source: AutomationSource,
  errorCode: string,
  detectedAt: string,
  database: D1Database,
) {
  try {
    return await createSourceErrorFinding(source, errorCode, detectedAt, database);
  } catch (error) {
    console.error(JSON.stringify({
      event: "data_automation_source_error_finding",
      sourceKey: source.sourceKey,
      result: "failed",
      error: safeErrorCode(error),
    }));
    return null;
  }
}

async function processRecord(
  source: AutomationSource,
  runId: number | null,
  record: AutomationSourceRecord,
  detectedAt: string,
  database: D1Database,
  findingProposal?: Record<string, unknown>,
) {
  requiredIdentity(source, record);
  const processedReceipt = await getAutomationIngestionReceipt({
    sourceId: source.id,
    entityType: source.entityType,
    sourceRecordId: record.sourceRecordId,
  }, database);
  if (processedReceipt) {
    return { finding: null, created: false, reopened: false, processed: true };
  }
  const proposedForFinding = findingProposal ?? record.proposed;
  const observationHash = await sha256Hex(record.rawRecord);
  const proposalHash = await sha256Hex(proposedForFinding);
  const observationId = await recordAutomationObservation({
    sourceId: source.id,
    runId,
    record,
    payloadHash: observationHash,
    detectedAt,
  }, database);

  const clusterResolution = await resolveAutomationEntityCluster({
    source,
    observationId,
    record,
    detectedAt,
  }, database);

  if (clusterResolution?.quality === "POSSIBLE") {
    const findingType = "DUPLICATE_CANDIDATE" as const;
    const fingerprint = automationFindingFingerprint({
      sourceKey: source.sourceKey,
      sourceRecordId: record.sourceRecordId,
      findingType,
      canonicalEntityId: null,
      payloadHash: proposalHash,
    });
    const result = await upsertAutomationFinding({
      source,
      observationId,
      sourceRecordId: record.sourceRecordId,
      sourceUrl: record.sourceUrl,
      sourceTimestamp: record.sourceTimestamp,
      findingType,
      canonicalEntityId: null,
      canonicalEntityKey: null,
      matchQuality: "UNCERTAIN",
      before: null,
      proposed: proposedForFinding,
      diff: buildAutomationDiff(null, proposedForFinding),
      payloadHash: proposalHash,
      fingerprint,
      reason: `Multi-source cluster match vyžaduje review; kandidátne clustre: ${clusterResolution.possibleCandidateIds.join(", ") || "bez jednoznačného kandidáta"}.`,
      detectedAt,
    }, database);
    await linkAutomationFindingToCluster(result.id, clusterResolution.clusterId, detectedAt, database);
    await maybeQueueHighPriorityNotification(
      result.id,
      findingType,
      result.created || result.reopened,
      database,
      new Date(detectedAt),
    );
    const draft = await createCanonicalDraftForFinding(result.id, findingType, database, detectedAt);
    return { finding: findingType, draft, ...result };
  }

  let match = source.entityType === "DIRECTORY" && !isDirectoryFacilityObservation(record)
    ? { entityType: source.entityType, entityId: null, entityKey: null, quality: "NONE" as const, before: null }
    : await matchAutomationCanonical(source, record, database);

  if (clusterResolution?.canonicalEntityId && !match.entityId) {
    match = {
      entityType: source.entityType,
      entityId: null,
      entityKey: null,
      quality: "UNCERTAIN",
      before: null,
      candidates: [{
        id: clusterResolution.canonicalEntityId,
        key: clusterResolution.canonicalEntityKey ?? `${source.entityType.toLowerCase()}:${clusterResolution.canonicalEntityId}`,
      }],
    };
  }

  if (match.entityId && match.quality !== "UNCERTAIN" && match.quality !== "NONE") {
    const receipt = await createAutomationIngestionReceipt({
      sourceId: source.id,
      entityType: source.entityType,
      sourceRecordId: record.sourceRecordId,
      sourceUrl: record.sourceUrl,
      payloadHash: proposalHash,
      result: "SKIPPED_DUPLICATE",
      firstProcessedAt: detectedAt,
    }, database);
    if (!receipt) throw new Error("automation_ingestion_receipt_missing");
    return { finding: null, created: false, reopened: false, processed: true, receipt };
  }

  const classified = classifyAutomationFinding({ match, proposed: proposedForFinding });
  if (!classified) return { finding: null, created: false, reopened: false };

  const duplicateCandidates = classified.findingType === "DUPLICATE_CANDIDATE"
    ? [
        ...(match.candidates ?? []),
        ...(match.entityId ? [{
          id: match.entityId,
          key: match.entityKey ?? `${source.entityType.toLowerCase()}:${match.entityId}`,
        }] : []),
      ].filter((candidate, index, all) => all.findIndex((item) => item.id === candidate.id) === index)
    : (match.candidates ?? []);
  const findingCanonicalEntityId = classified.findingType === "DUPLICATE_CANDIDATE" ? null : match.entityId;
  const findingCanonicalEntityKey = classified.findingType === "DUPLICATE_CANDIDATE" ? null : match.entityKey;

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
    canonicalEntityId: findingCanonicalEntityId,
    canonicalEntityKey: findingCanonicalEntityKey,
    matchQuality: match.quality,
    before: match.before,
    proposed: proposedForFinding,
    diff: classified.diff,
    payloadHash: proposalHash,
    fingerprint,
    reason: findingReason(classified.findingType, record, duplicateCandidates),
    detectedAt,
  }, database);
  if (clusterResolution) {
    await linkAutomationFindingToCluster(result.id, clusterResolution.clusterId, detectedAt, database);
  }

  await maybeQueueHighPriorityNotification(
    result.id,
    classified.findingType,
    result.created || result.reopened,
    database,
    new Date(detectedAt),
  );
  const draft = await createCanonicalDraftForFinding(result.id, classified.findingType, database, detectedAt);
  return { finding: classified.findingType, draft, ...result };
}

export async function processAutomationRecordForReview(input: {
  source: AutomationSource;
  record: AutomationSourceRecord;
  database: D1Database;
  now?: Date;
  organizationEnricher?: OrganizationRecordEnricher;
  findingProposal?: Record<string, unknown>;
}) {
  const detectedAt = (input.now ?? new Date()).toISOString();
  let record = input.record;
  if (input.source.entityType === "ORGANIZATION" && input.organizationEnricher) {
    record = await input.organizationEnricher(record, { detectedAt });
  }
  return processRecord(input.source, null, record, detectedAt, input.database, input.findingProposal);
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
  let newDataFindings = 0;
  let sourceErrors = 0;
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
        let candidateRecord = record;
        if (source.entityType === "ORGANIZATION" && options.organizationEnricher) {
          try {
            candidateRecord = await options.organizationEnricher(record, { detectedAt });
          } catch (error) {
            console.error(JSON.stringify({
              event: "data_automation_organization_enrichment",
              sourceKey: source.sourceKey,
              sourceRecordId: record.sourceRecordId,
              result: "failed_open",
              error: safeErrorCode(error),
            }));
          }
        }
        const result = await processRecord(source, runId, candidateRecord, detectedAt, options.database);
        if (result.finding) {
          if (result.created || result.reopened) {
            newFindings += 1;
            newDataFindings += 1;
          } else {
            updatedFindings += 1;
          }
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
      const sourceError = await safelyCreateSourceErrorFinding(source, errorSummary ?? "record_processing_failed", detectedAt, options.database);
      if (sourceError) {
        sourceErrors += 1;
        if (sourceError.created || sourceError.reopened) newFindings += 1;
        else updatedFindings += 1;
      }
    }
  } catch (error) {
    errors += 1;
    status = "FAILED";
    errorSummary = safeErrorCode(error);
    const sourceError = await safelyCreateSourceErrorFinding(source, errorSummary, detectedAt, options.database);
    if (sourceError) {
      sourceErrors += 1;
      if (sourceError.created || sourceError.reopened) newFindings += 1;
      else updatedFindings += 1;
    }
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
    newDataFindings,
    sourceErrors,
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
      return { sources: 0, success: 0, partial: 0, failed: 0, checked: 0, newFindings: 0, updatedFindings: 0, newDataFindings: 0, sourceErrors: 0, errors: 0, schemaReady: false, runs: [] as SourceRunSummary[] };
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
        newDataFindings: 0,
        sourceErrors: 1,
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
    newDataFindings: runs.reduce((sum, run) => sum + run.newDataFindings, 0),
    sourceErrors: runs.reduce((sum, run) => sum + run.sourceErrors, 0),
    errors: runs.reduce((sum, run) => sum + run.errors, 0),
    schemaReady: true,
    runs,
  };
}


export async function runAutomationSourceNow(
  sourceId: number,
  options: DataAutomationSweepOptions,
) {
  const source = await getAutomationSource(sourceId, options.database as AutomationD1Database);
  if (!source) throw new Error("automation_source_not_found");
  if (!source.enabled) throw new Error("automation_source_disabled");
  if (source.reviewStatus !== "APPROVED") throw new Error("automation_source_review_required");
  return runSource(source, options);
}
