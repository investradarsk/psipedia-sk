import { AutomationConnectorError, fetchAutomationSourceRecords, type AutomationFetch } from "./data-automation-connectors.ts";
import { classifyAutomationFinding, type AutomationSource } from "./data-automation.ts";
import { matchAutomationCanonical, type AutomationD1Database } from "./data-automation-store.ts";
import { productionAutomationHtmlAdapters } from "./data-automation-real-sources.ts";

export async function previewAutomationSource(input: {
  source: AutomationSource;
  database: AutomationD1Database;
  fetchImpl?: AutomationFetch;
  sleep?: (ms: number) => Promise<void>;
}) {
  let httpStatus: number | null = null;
  let contentType: string | null = null;
  let contentLength: number | null = null;

  try {
    const records = await fetchAutomationSourceRecords(input.source, {
      fetchImpl: input.fetchImpl,
      sleep: input.sleep,
      htmlAdapters: productionAutomationHtmlAdapters,
      onResponse(meta) {
        httpStatus = meta.status;
        contentType = meta.contentType;
        contentLength = meta.contentLength;
      },
    });

    let normalized = 0;
    let possibleMatches = 0;
    let newCandidates = 0;
    let possibleUpdates = 0;
    const errors: string[] = [];

    for (const record of records) {
      try {
        if (!record.proposed || typeof record.proposed !== "object" || Array.isArray(record.proposed)) {
          throw new Error("normalized_payload_invalid");
        }
        normalized += 1;
        const match = await matchAutomationCanonical(input.source, record, input.database);
        if (match.entityId || match.quality === "UNCERTAIN") possibleMatches += 1;
        const finding = classifyAutomationFinding({ match, proposed: record.proposed });
        if (finding?.findingType === "NEW_ENTITY") newCandidates += 1;
        if (finding && finding.findingType !== "NEW_ENTITY" && finding.findingType !== "DUPLICATE_CANDIDATE") possibleUpdates += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "preview_record_error");
      }
    }

    return {
      ok: errors.length === 0,
      sourceStatus: "reachable",
      httpStatus,
      contentType,
      contentLength,
      recordsFound: records.length,
      recordsNormalized: normalized,
      possibleMatches,
      newCandidates,
      possibleUpdates,
      errors: errors.slice(0, 20),
      writes: { observations: 0, findings: 0, canonical: 0, publications: 0 },
    };
  } catch (error) {
    const code = error instanceof AutomationConnectorError
      ? error.code
      : error instanceof Error ? error.message : "preview_failed";
    return {
      ok: false,
      sourceStatus: "failed",
      httpStatus,
      contentType,
      contentLength,
      recordsFound: 0,
      recordsNormalized: 0,
      possibleMatches: 0,
      newCandidates: 0,
      possibleUpdates: 0,
      errors: [code],
      writes: { observations: 0, findings: 0, canonical: 0, publications: 0 },
    };
  }
}
