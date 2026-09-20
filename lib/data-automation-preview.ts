import { AutomationConnectorError, fetchAutomationSourceRecords, type AutomationFetch } from "./data-automation-connectors.ts";
import { classifyAutomationFinding, type AutomationSource } from "./data-automation.ts";
import { matchAutomationCanonical, type AutomationD1Database } from "./data-automation-store.ts";
import { productionAutomationHtmlAdapters } from "./data-automation-real-sources.ts";

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
  };
  if (/^source_http_\d{3}$/.test(code)) return `Zdroj vrátil HTTP ${code.slice(-3)}.`;
  return details[code] ?? "Zdroj sa nepodarilo bezpečne spracovať.";
}

export async function previewAutomationSource(input: {
  source: AutomationSource;
  database: AutomationD1Database;
  fetchImpl?: AutomationFetch;
  sleep?: (ms: number) => Promise<void>;
}) {
  let httpStatus: number | null = null;
  let contentType: string | null = null;
  let contentLength: number | null = null;
  let finalUrl: string | null = input.source.sourceUrl;
  let redirectCount = 0;
  const startedAt = Date.now();

  try {
    const records = await fetchAutomationSourceRecords(input.source, {
      fetchImpl: input.fetchImpl,
      sleep: input.sleep,
      htmlAdapters: productionAutomationHtmlAdapters,
      onResponse(meta) {
        httpStatus = meta.status;
        contentType = meta.contentType;
        contentLength = meta.contentLength;
        finalUrl = meta.finalUrl;
        redirectCount = meta.redirectCount;
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
      finalUrl,
      redirectCount,
      timingMs: Math.max(0, Date.now() - startedAt),
      recordsFound: records.length,
      recordsNormalized: normalized,
      possibleMatches,
      newCandidates,
      possibleUpdates,
      errors: errors.slice(0, 20),
      parserErrors: errors.filter((code) => /^(adapter_|structured_json_)/.test(code)).slice(0, 20),
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
      errors: [code],
      parserErrors: /^(adapter_|structured_json_)/.test(code) ? [code] : [],
      errorDetails: [{ code, detail: safePreviewErrorDetail(code) }],
      writes: { observations: 0, findings: 0, canonical: 0, publications: 0 },
    };
  }
}
