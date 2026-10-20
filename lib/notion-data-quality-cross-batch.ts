import type { NotionAuditAgenda } from "./notion-data-quality-audit.ts";

/**
 * Offline-only, allocation-local diagnostics for HMAC-pseudonymized Audit 02
 * receipts. NO Notion/D1/network/FS access, side effects, or raw IDs.
 *
 * The adapter that produces tokens is deliberately out of scope: it must use
 * one secret HMAC-SHA256 key for the entire audit, including both passes.
 * Unsalted hashes of sequential Psipedia IDs are NOT anonymization.
 */
export type CrossBatchVerdict = "CONFLICT" | "REVIEW" | "UNKNOWN";

export type AnonymizedAuditBatch = {
  runKey: string;
  checkpointKey: string;
  agenda: NotionAuditAgenda;
  sourceKey: string;
  pass: 1 | 2;
  batchNumber: number;
  requestCursorKey: string | null;
  nextCursorKey: string | null;
  hasMore: boolean;
  records: Array<{ notionKey: string; psipediaKey: string | null }>;
};

export type CrossBatchCounters = {
  batches: number;
  examinedRecords: number;
  firstPassRecords: number;
  secondPassRecords: number;
  auditRuns: number;
  isolatedSources: number;
  distinctPageAppearancesWithinPasses: number;
  missingPsipediaIdentities: number;
  repeatedPageAcrossBatches: number;
  repeatedPsipediaIdAcrossBatches: number;
  repeatedPsipediaIdWithinBatch: number;
  expectedSecondPassReappearances: number;
  differingMappingsBetweenPasses: number;
  sourceChanges: number;
  checkpointChanges: number;
  cursorProblems: number;
  incompletePasses: number;
  completeCursorChains: number;
};

export type CrossBatchDiagnostics = {
  verdict: CrossBatchVerdict;
  evidence: CrossBatchCounters;
  reasonCounts: Record<string, number>;
  unknown: readonly string[];
  readOnly: true;
  identityEvidence: "ANONYMIZED_OBSERVATIONS_ONLY";
};

type Page = AnonymizedAuditBatch;
type Row = Page["records"][number];
const AGENDAS = new Set<NotionAuditAgenda>([
  "directory", "events", "organizations", "adoptions", "help-cases", "lost-found",
]);
const TOKEN = /^[a-f0-9]{64}$/;
const BATCH_FIELDS = new Set([
  "runKey", "checkpointKey", "agenda", "sourceKey", "pass", "batchNumber",
  "requestCursorKey", "nextCursorKey", "hasMore", "records",
]);
const ROW_FIELDS = new Set(["notionKey", "psipediaKey"]);
const UNKNOWN = Object.freeze([
  "IMMUTABLE_NOTION_SNAPSHOT_UNPROVEN",
  "GLOBAL_ORPHAN_MAPPINGS_UNPROVEN",
  "AUTHORITATIVE_D1_IDENTITY_UNVERIFIED",
  "HMAC_TOKEN_PROVENANCE_UNVERIFIED",
]);

function invalid(): never {
  // Never interpolate untrusted input, property content, tokens or exceptions.
  throw new Error("INVALID_ANONYMIZED_CROSS_BATCH_INPUT");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, allowed: Set<string>): void {
  if (Object.keys(value).some((key) => !allowed.has(key))) invalid();
  if ([...allowed].some((key) => !Object.hasOwn(value, key))) invalid();
}
function token(value: unknown): string {
  if (typeof value !== "string" || !TOKEN.test(value)) return invalid();
  return value;
}
function optionalToken(value: unknown): string | null {
  return value === null ? null : token(value);
}
function normalizeBatch(input: unknown): Page {
  const value = object(input);
  exactKeys(value, BATCH_FIELDS);
  if (!AGENDAS.has(value.agenda as NotionAuditAgenda)) invalid();
  if (value.pass !== 1 && value.pass !== 2) invalid();
  if (!Number.isSafeInteger(value.batchNumber) || (value.batchNumber as number) < 1
    || (value.batchNumber as number) > 10_000) invalid();
  if (typeof value.hasMore !== "boolean") invalid();
  if (!Array.isArray(value.records) || value.records.length > 100) invalid();
  const records: Row[] = value.records.map((entry: unknown) => {
    const row = object(entry);
    exactKeys(row, ROW_FIELDS);
    return {
      notionKey: token(row.notionKey),
      psipediaKey: row.psipediaKey === null ? null : token(row.psipediaKey),
    };
  });
  return {
    runKey: token(value.runKey),
    checkpointKey: token(value.checkpointKey),
    agenda: value.agenda as NotionAuditAgenda,
    sourceKey: token(value.sourceKey),
    pass: value.pass as 1 | 2,
    batchNumber: value.batchNumber as number,
    requestCursorKey: optionalToken(value.requestCursorKey),
    nextCursorKey: optionalToken(value.nextCursorKey),
    hasMore: value.hasMore as boolean,
    records,
  };
}

/**
 * Processes at most 500 sanitized batch receipts, each capped at 100 rows.
 * Repeated identities across pass 1 and pass 2 are expected observations,
 * NOT duplicates. Separate run, agenda and source never share identity maps.
 *
 * A repeated page across cursor pages is REVIEW (pagination instability may
 * explain it); distinct Notion pages claiming one Psipedia ID are CONFLICT
 * only while the run's source and checkpoint are stable.
 */
export function analyzeNotionCrossBatch(input: unknown): CrossBatchDiagnostics {
  if (!Array.isArray(input) || input.length > 500) invalid();
  const batches = input.map(normalizeBatch);
  const counters: CrossBatchCounters = {
    batches: batches.length, examinedRecords: 0, firstPassRecords: 0,
    secondPassRecords: 0, auditRuns: 0, isolatedSources: 0,
    distinctPageAppearancesWithinPasses: 0, missingPsipediaIdentities: 0,
    repeatedPageAcrossBatches: 0, repeatedPsipediaIdAcrossBatches: 0,
    repeatedPsipediaIdWithinBatch: 0, expectedSecondPassReappearances: 0,
    differingMappingsBetweenPasses: 0, sourceChanges: 0,
    checkpointChanges: 0, cursorProblems: 0, incompletePasses: 0,
    completeCursorChains: 0,
  };
  const reasonCounts: Record<string, number> = Object.create(null);
  let conflicting = false;
  let needsReview = false;
  const note = (reason: string, verdict: "CONFLICT" | "REVIEW" | "UNKNOWN"): void => {
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    if (verdict === "CONFLICT") conflicting = true;
    if (verdict === "REVIEW") needsReview = true;
  };

  const runs = new Map<string, Page[]>();
  const scopes = new Set<string>();
  for (const batch of batches) {
    counters.examinedRecords += batch.records.length;
    if (batch.pass === 1) counters.firstPassRecords += batch.records.length;
    else counters.secondPassRecords += batch.records.length;
    const run = batch.runKey + ":" + batch.agenda;
    const group = runs.get(run) ?? [];
    group.push(batch);
    runs.set(run, group);
    scopes.add(run + ":" + batch.sourceKey);
  }
  counters.auditRuns = runs.size;
  counters.isolatedSources = scopes.size;

  for (const runBatches of runs.values()) {
    const sources = new Set(runBatches.map((b) => b.sourceKey));
    const checkpoints = new Set(runBatches.map((b) => b.checkpointKey));
    const stable = sources.size === 1 && checkpoints.size === 1;
    if (sources.size > 1) {
      counters.sourceChanges += sources.size - 1;
      note("SOURCE_CHANGED_WITHIN_RUN", "REVIEW");
    }
    if (checkpoints.size > 1) {
      counters.checkpointChanges += checkpoints.size - 1;
      note("CHECKPOINT_CHANGED_WITHIN_RUN", "REVIEW");
    }

    const passMappings = new Map<number, Map<string, string | null>>();
    const passComplete = new Map<number, boolean>();
    for (const pass of [1, 2] as const) {
      const ordered = runBatches.filter((b) => b.pass === pass)
        .sort((a, b) => a.batchNumber - b.batchNumber);
      if (ordered.length === 0) {
        counters.incompletePasses += 1;
        note("PASS_NOT_PROVIDED", "UNKNOWN");
        passComplete.set(pass, false);
        continue;
      }
      let chainValid = true;
      for (let i = 0; i < ordered.length; i++) {
        const batch = ordered[i];
        const prev = ordered[i - 1];
        if (batch.batchNumber !== i + 1
          || (i === 0 && batch.requestCursorKey !== null)
          || (i > 0 && (!prev.hasMore || prev.nextCursorKey === null
            || batch.requestCursorKey !== prev.nextCursorKey))
          || (batch.hasMore && batch.nextCursorKey === null)
          || (!batch.hasMore && batch.nextCursorKey !== null)) {
          counters.cursorProblems += 1;
          note("CURSOR_CHAIN_INCOMPLETE_OR_CHANGED", "REVIEW");
          chainValid = false;
        }
      }
      if (ordered[ordered.length - 1].hasMore) chainValid = false;
      if (!chainValid) {
        counters.incompletePasses += 1;
        note("PASS_COVERAGE_UNKNOWN", "UNKNOWN");
      } else {
        counters.completeCursorChains += 1;
      }
      passComplete.set(pass, chainValid);

      // Source-specific maps avoid false matches across distinct Notion DBs.
      const pageByScope = new Map<string, { psipediaKey: string | null; batch: number }>();
      const psByScope = new Map<string, { notionKey: string; batch: number }>();
      const mapping = new Map<string, string | null>();
      for (const batch of ordered) {
        for (const row of batch.records) {
          const pageKey = batch.sourceKey + ":" + row.notionKey;
          const oldPage = pageByScope.get(pageKey);
          if (oldPage && oldPage.batch !== batch.batchNumber) {
            counters.repeatedPageAcrossBatches += 1;
            note("NOTION_PAGE_REAPPEARED_ACROSS_BATCHES", "REVIEW");
          }
          if (!oldPage) {
            pageByScope.set(pageKey, { psipediaKey: row.psipediaKey, batch: batch.batchNumber });
            counters.distinctPageAppearancesWithinPasses += 1;
          } else if (oldPage.psipediaKey !== row.psipediaKey) {
            note("INTRA_PASS_MAPPING_CHANGED", "REVIEW");
          }
          if (row.psipediaKey === null) {
            counters.missingPsipediaIdentities += 1;
          } else {
            const psKey = batch.sourceKey + ":" + row.psipediaKey;
            const oldPs = psByScope.get(psKey);
            if (oldPs && oldPs.notionKey !== row.notionKey) {
              if (oldPs.batch === batch.batchNumber) counters.repeatedPsipediaIdWithinBatch += 1;
              else counters.repeatedPsipediaIdAcrossBatches += 1;
              note("PSIPEDIA_ID_CLAIMED_BY_DISTINCT_PAGES", stable ? "CONFLICT" : "REVIEW");
            }
            if (!oldPs) psByScope.set(psKey, { notionKey: row.notionKey, batch: batch.batchNumber });
          }
          if (!mapping.has(pageKey)) mapping.set(pageKey, row.psipediaKey);
        }
      }
      passMappings.set(pass, mapping);
    }

    const first = passMappings.get(1);
    const second = passMappings.get(2);
    if (first && second) {
      for (const [page, firstPs] of first) {
        if (!second.has(page)) continue;
        counters.expectedSecondPassReappearances += 1;
        if (second.get(page) !== firstPs) {
          counters.differingMappingsBetweenPasses += 1;
          note("CROSS_PASS_MAPPING_CHANGED", "REVIEW");
        }
      }
      if (passComplete.get(1) && passComplete.get(2)
        && (first.size !== second.size
          || [...first.keys()].some((page) => !second.has(page)))) {
        note("CROSS_PASS_IDENTITY_SET_CHANGED", "REVIEW");
      }
    }
  }

  // A complete cursor traversal is not a Notion snapshot. D1 orphan status
  // cannot be proven from bounded page-only receipts; never return CLEAN.
  return {
    verdict: conflicting ? "CONFLICT" : needsReview ? "REVIEW" : "UNKNOWN",
    evidence: counters,
    reasonCounts: Object.fromEntries(Object.entries(reasonCounts).sort(([a], [b]) => a.localeCompare(b))),
    unknown: UNKNOWN,
    readOnly: true,
    identityEvidence: "ANONYMIZED_OBSERVATIONS_ONLY",
  };
}
