import { AutomationConnectorError, fetchAutomationSourceRecords, type AutomationFetch } from "./data-automation-connectors.ts";
import { classifyAutomationFinding, type AutomationSource } from "./data-automation.ts";
import { matchAutomationCanonical, type AutomationD1Database } from "./data-automation-store.ts";
import { productionAutomationHtmlAdapters } from "./data-automation-real-sources.ts";
import { createProductionOrganizationEnricher } from "./data-automation-organization-enrichment.ts";
import { getGovernanceState } from "./data-automation-governance.ts";
import { buildSourceScopedExtractionContract } from "./data-automation-source-scoped-extraction.ts";
import { enrichAutomationRecordSchemaFirst } from "./data-automation-entity-enrichment.ts";
import { normalizeAutomationEventRecord } from "./data-automation-event-normalize.ts";
import { normalizeAutomationAdoptionRecord } from "./data-automation-adoption-normalize.ts";
import { validateDynamicAutomationIngestion } from "./data-automation-dynamic-identity.ts";
import {
  TavilyAutomationCrawlProvider,
  TavilyAutomationExtractProvider,
  type TavilySourceScopedRequestGate,
} from "./data-automation-tavily-source-scoped.ts";
import {
  finalizeAutomationSourceProviderRequest,
  reserveAutomationSourceProviderRequest,
} from "./data-automation-source-provider-usage.ts";

function safePreviewErrorDetail(code: string) {
  const details: Record<string, string> = {
    source_timeout: "Zdroj neodpovedal v nastavenom časovom limite.",
    source_redirect_blocked: "Zdroj presmeroval na URL, ktorá neprešla bezpečnostnou kontrolou.",
    source_redirect_invalid: "Zdroj vrátil neplatné presmerovanie.",
    source_redirect_loop: "Zdroj vytvoril redirect slučku.",
    source_redirect_too_many: "Zdroj prekročil povolený počet presmerovaní.",
    source_dns_failed: "Worker nedokázal preložiť názov hostiteľa.",
    source_tls_failed: "TLS spojenie so zdrojom zlyhalo.",
    source_connection_failed: "Sieťové spojenie so zdrojom zlyhalo.",
    source_request_failed: "Požiadavka zlyhala bez bezpečne rozpoznateľnej detailnej príčiny.",
    source_response_too_large: "Odpoveď prekročila bezpečný limit veľkosti.",
    source_invalid_content_type: "Zdroj vrátil neočakávaný typ obsahu.",
    adapter_parse_failed: "Parser zdroja zlyhal pri spracovaní odpovede.",
    adapter_no_records: "Parser nenašiel žiadne záznamy, hoci tento zdroj ich očakáva.",
    adapter_record_count_below_minimum: "Parser našiel podozrivo málo záznamov oproti bezpečnostnému minimu.",
    no_items_discovered: "Zdroj nemá dostatočne jednoznačnú štruktúru položiek.",
    source_scope_violation: "Zdroj sa pokúsil prejsť mimo schváleného rozsahu URL.",
    ambiguous_listing: "Štruktúra zoznamu položiek je nejednoznačná.",
    unsupported_structured_data: "Štruktúrované údaje zdroja sa nedajú bezpečne spracovať.",
    traversal_limit_reached: "Zdroj prekročil bezpečný limit prechádzania.",
    detail_fetch_failed: "Detail položiek sa nepodarilo bezpečne načítať.",
    unsafe_item_url: "Zdroj obsahuje položku s nepovolenou URL.",
    invalid_item_structure: "Položka nemá dostatočne jednoznačnú štruktúru.",
    generic_source_parse_failed: "Generický parser nedokázal zdroj bezpečne spracovať.",
  };
  if (/^source_http_\d{3}$/.test(code)) return `Zdroj vrátil HTTP ${code.slice(-3)}.`;
  return details[code] ?? "Zdroj sa nepodarilo bezpečne spracovať.";
}

export async function previewAutomationSource(input: {
  source: AutomationSource;
  database: AutomationD1Database;
  fetchImpl?: AutomationFetch;
  sleep?: (ms: number) => Promise<void>;
  tavilyApiKey?: string;
}) {
  let httpStatus: number | null = null;
  let contentType: string | null = null;
  let contentLength: number | null = null;
  let finalUrl: string | null = input.source.sourceUrl;
  let redirectCount = 0;
  const startedAt = Date.now();

  try {
    const governance = await getGovernanceState(
      { type: "AUTOMATION_SOURCE", id: input.source.id },
      input.database,
    );
    const scoped = buildSourceScopedExtractionContract(input.source, governance.state);
    const tavilyKey = input.tavilyApiKey?.trim() ?? "";
    const tavilyCrawlProvider = tavilyKey
      ? new TavilyAutomationCrawlProvider({
          apiKey: tavilyKey,
          fetchImpl: input.fetchImpl,
          sleep: input.sleep,
        })
      : undefined;
    const tavilyExtractProvider = tavilyKey
      ? new TavilyAutomationExtractProvider({
          apiKey: tavilyKey,
          fetchImpl: input.fetchImpl,
          sleep: input.sleep,
        })
      : undefined;
    let providerRequestSequence = 0;
    const tavilyRequestGate: TavilySourceScopedRequestGate | undefined = tavilyKey && scoped.ready
      ? {
          reserve: async (operation) => {
            providerRequestSequence += 1;
            if (providerRequestSequence > scoped.contract.limits.maxProviderRequests) return null;
            const operationKey = [
              "source",
              input.source.id,
              "preview",
              new Date().toISOString(),
              operation.toLowerCase(),
              providerRequestSequence,
            ].join(":");
            const reservation = await reserveAutomationSourceProviderRequest({
              database: input.database,
              operationKey,
              sourceId: input.source.id,
              runId: null,
              providerKey: "tavily",
              operation,
              maxRequestsPerDay: scoped.contract.limits.maxProviderRequestsPerDay,
              maxRequestsPerRun: scoped.contract.limits.maxProviderRequests,
            });
            return reservation.reserved ? { operationKey } : null;
          },
          finalize: async (usage) => {
            await finalizeAutomationSourceProviderRequest({
              database: input.database,
              operationKey: usage.operationKey,
              status: usage.status,
              resultCount: usage.resultCount,
              acceptedCount: usage.acceptedCount,
              scopeRejectedCount: usage.scopeRejectedCount,
            });
          },
        }
      : undefined;
    const records = await fetchAutomationSourceRecords(input.source, {
      fetchImpl: input.fetchImpl,
      sleep: input.sleep,
      htmlAdapters: productionAutomationHtmlAdapters,
      sourceScopedContract: scoped.ready ? scoped.contract : undefined,
      tavilyCrawlProvider,
      tavilyExtractProvider,
      tavilyRequestGate,
      onResponse(meta) {
        httpStatus = meta.status;
        contentType = meta.contentType;
        contentLength = meta.contentLength;
        finalUrl = meta.finalUrl;
        redirectCount = meta.redirectCount;
      },
    });

    const organizationEnricher = input.source.entityType === "ORGANIZATION"
      ? createProductionOrganizationEnricher({ fetchImpl: input.fetchImpl })
      : null;
    let normalized = 0;
    let possibleMatches = 0;
    let newCandidates = 0;
    let possibleUpdates = 0;
    let reviewOnly = 0;
    let insufficient = 0;
    const errors: string[] = [];

    for (const record of records) {
      try {
        let candidateRecord = organizationEnricher
          ? await organizationEnricher(record, { detectedAt: new Date().toISOString() })
          : record;
        candidateRecord = await enrichAutomationRecordSchemaFirst({
          entityType: input.source.entityType,
          record: candidateRecord,
        });
        if (input.source.entityType === "EVENT") {
          candidateRecord = normalizeAutomationEventRecord(candidateRecord);
        }
        if (input.source.entityType === "ADOPTION") {
          candidateRecord = normalizeAutomationAdoptionRecord(candidateRecord, { sourceConfig: input.source.config });
        }
        if (!candidateRecord.proposed || typeof candidateRecord.proposed !== "object" || Array.isArray(candidateRecord.proposed)) {
          throw new Error("normalized_payload_invalid");
        }
        normalized += 1;
        const match = await matchAutomationCanonical(input.source, candidateRecord, input.database);
        if (match.entityId || match.quality === "UNCERTAIN") possibleMatches += 1;
        const ingestionDecision = validateDynamicAutomationIngestion({
          source: input.source,
          record: candidateRecord,
          match,
        });
        const finding = classifyAutomationFinding({ match, proposed: candidateRecord.proposed });
        if (finding?.findingType === "NEW_ENTITY") {
          if (!ingestionDecision || ingestionDecision.canCreateDraft) newCandidates += 1;
          else {
            reviewOnly += 1;
            if (ingestionDecision.gate === "INSUFFICIENT") insufficient += 1;
          }
        }
        if (finding?.findingType === "DUPLICATE_CANDIDATE") reviewOnly += 1;
        if (
          finding
          && finding.findingType !== "NEW_ENTITY"
          && finding.findingType !== "DUPLICATE_CANDIDATE"
          && (!ingestionDecision || ingestionDecision.canSuggestUpdate)
        ) possibleUpdates += 1;
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
      finalUrl,
      redirectCount,
      timingMs: Math.max(0, Date.now() - startedAt),
      recordsFound: records.length,
      recordsNormalized: normalized,
      possibleMatches,
      newCandidates,
      possibleUpdates,
      reviewOnly,
      insufficient,
      errors: errors.slice(0, 20),
      parserErrors: errors.filter((code) => /^(adapter_|structured_json_|generic_|no_items_|source_scope_|ambiguous_listing|unsupported_structured_data|traversal_limit_|detail_fetch_|unsafe_item_|invalid_item_)/.test(code)).slice(0, 20),
      errorDetails: errors.slice(0, 20).map((code) => ({ code, detail: safePreviewErrorDetail(code) })),
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
      finalUrl,
      redirectCount,
      timingMs: Math.max(0, Date.now() - startedAt),
      recordsFound: 0,
      recordsNormalized: 0,
      possibleMatches: 0,
      newCandidates: 0,
      possibleUpdates: 0,
      reviewOnly: 0,
      insufficient: 0,
      errors: [code],
      parserErrors: /^(adapter_|structured_json_|generic_|no_items_|source_scope_|ambiguous_listing|unsupported_structured_data|traversal_limit_|detail_fetch_|unsafe_item_|invalid_item_)/.test(code) ? [code] : [],
      errorDetails: [{ code, detail: safePreviewErrorDetail(code) }],
      writes: { observations: 0, findings: 0, canonical: 0, publications: 0 },
    };
  }
}
