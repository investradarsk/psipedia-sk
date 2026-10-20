import type { AuditItem, AuditReason } from "./notion-data-quality-audit-v2.ts";
import type { NotionAuditAgenda } from "./notion-data-quality-audit.ts";

/**
 * A presentation-only projection of the EXISTING Audit 02 evidence.
 * Historical Notion error text is never proof of a live conflict.
 * There is no network, database, filesystem, mutation or publication path.
 */
export type QualityVerdict = "CONFIRMED" | "STALE_OR_RESOLVED" | "NEEDS_REVIEW" | "UNKNOWN";
export type QualityIssue = "IDENTITY" | "SYNC_CONFLICT" | "PROTECTION" | "CONTENT" | "RUNTIME" | "SYNC_ERROR";
export type QualityBasis = "CURRENT_IDENTITY_ONLY" | "COMPARABLE_SNAPSHOTS" | "HISTORICAL_NOTION_FLAG" | "INSUFFICIENT_EVIDENCE";
type QualityItem = {
  notionPageId: string;
  psipediaId: string;
  verdict: QualityVerdict;
  issue: QualityIssue;
  basis: QualityBasis;
  reason: AuditReason | null;
  historicKind: string | null;
  editorHref: string | null;
  fieldNames: string[] | null;
};
type Evidence = { evidence: "VERIFIED_IDS_ONLY" | "UNKNOWN"; items: AuditItem[] };
const AGENDAS = new Set<NotionAuditAgenda>(["directory", "events", "organizations", "adoptions", "help-cases", "lost-found"]);
const UUID = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const ID = /^[1-9]\d{0,12}$/;
const HISTORIC_KINDS = new Set([
  "BIDIRECTIONAL_CONFLICT", "CONFIRMED_SITE_REVIEW_REQUIRED", "MISSING_HOUSE_NUMBER",
  "INVALID_LOCALITY", "ILLEGAL_INVOCATION", "INVALID_PHONE", "INVALID_EMAIL",
  "INVALID_WEBSITE", "REMOTE_IMAGE_HTTP_403", "REMOTE_IMAGE_HTTP_522",
  "INVALID_IMAGE_FORMAT", "REMOTE_IMAGE_BLOCKED", "DUPLICATE_IDENTITY",
  "GOOGLE_PLACE_MISMATCH", "PRIVACY_REVIEW_REQUIRED", "LEGACY_BASELINE_MISMATCH", "OTHER",
]);
const IDENTITY = new Set<AuditReason>([
  "DUPLICATE_IDENTITY", "MAPPING_CONFLICT", "MISSING_MAPPING",
  "ORPHAN_MAPPING", "MISSING_CANONICAL", "NO_PSID",
]);
const PROTECTION = new Set<string>([
  "CONFIRMED_SITE_REVIEW_REQUIRED", "PRIVACY_REVIEW_REQUIRED", "GOOGLE_PLACE_MISMATCH", "NOT_REQUIRED",
]);
const RUNTIME = new Set(["ILLEGAL_INVOCATION", "REMOTE_IMAGE_HTTP_403", "REMOTE_IMAGE_HTTP_522", "REMOTE_IMAGE_BLOCKED", "INVALID_IMAGE_FORMAT"]);
const CONTENT = new Set(["MISSING_HOUSE_NUMBER", "INVALID_LOCALITY", "INVALID_PHONE", "INVALID_EMAIL", "INVALID_WEBSITE"]);
const SAFE_FIELD_NAMES = new Set([
  "Názov", "Meno", "Popis", "Miesto", "Mesto", "Kraj", "Okres", "Adresa", "Kategória", "Dátum začiatku", "Dátum konca",
]);

function invalid(): never {
  // No untrusted value, raw identifier or exception details leave this helper.
  throw new Error("INVALID_NOTION_QUALITY_EVIDENCE");
}
function issueFor(reason: AuditReason | null, historic: string | null): QualityIssue {
  if (reason && IDENTITY.has(reason)) return "IDENTITY";
  if ((reason && PROTECTION.has(reason)) || (historic && PROTECTION.has(historic))) return "PROTECTION";
  if (reason === "BIDIRECTIONAL_CONFLICT" || historic === "BIDIRECTIONAL_CONFLICT") return "SYNC_CONFLICT";
  if (historic && RUNTIME.has(historic)) return "RUNTIME";
  if (historic && CONTENT.has(historic)) return "CONTENT";
  return "SYNC_ERROR";
}

/**
 * Each result is an observation within ONE <=100-record page, never a global
 * or deduplicated production count. Cross-batch proof belongs to PR #911.
 * A CONFIRMED identity collision is NOT a confirmed editorial content conflict.
 */
export function triageNotionQuality(
  agenda: NotionAuditAgenda,
  flagged: readonly { notionPageId: string; kind: string }[],
  independent: Evidence,
): { readOnly: true; scope: "ONE_AUDIT_BATCH"; counts: Record<QualityVerdict, number>; items: QualityItem[]; unknown: string[] } {
  if (!AGENDAS.has(agenda) || !Array.isArray(flagged) || flagged.length > 100
      || !independent || !Array.isArray(independent.items) || independent.items.length > 100
      || (independent.evidence !== "VERIFIED_IDS_ONLY" && independent.evidence !== "UNKNOWN")) invalid();

  const byPage = new Map<string, string>();
  for (const row of flagged) {
    if (!row || typeof row.notionPageId !== "string" || !UUID.test(row.notionPageId)
        || !HISTORIC_KINDS.has(row.kind) || byPage.has(row.notionPageId)) invalid();
    byPage.set(row.notionPageId, row.kind);
  }

  const counts: Record<QualityVerdict, number> = {
    CONFIRMED: 0, STALE_OR_RESOLVED: 0, NEEDS_REVIEW: 0, UNKNOWN: 0,
  };
  const items: QualityItem[] = [];
  for (const row of independent.items) {
    if (!row || typeof row.notionPageId !== "string" || !UUID.test(row.notionPageId)
        || typeof row.psipediaId !== "string") invalid();
    const historicKind = byPage.get(row.notionPageId) ?? null;
    const meaningful = row.reason !== null && row.reason !== "UNKNOWN_SNAPSHOT";
    if (!historicKind && !meaningful) continue;

    let verdict: QualityVerdict;
    let basis: QualityBasis;
    if (independent.evidence === "UNKNOWN" || row.reason === "UNKNOWN_SOURCE") {
      verdict = "UNKNOWN";
      basis = "INSUFFICIENT_EVIDENCE";
    } else if (row.decision === "CONFLICT"
        && (row.reason === "DUPLICATE_IDENTITY" || row.reason === "MAPPING_CONFLICT")) {
      verdict = "CONFIRMED";
      basis = "CURRENT_IDENTITY_ONLY";
    } else if (row.decision === "CONFLICT" && row.reason === "BIDIRECTIONAL_CONFLICT") {
      // Only Audit 02's independent three-comparable-hash contract can emit this.
      verdict = "CONFIRMED";
      basis = "COMPARABLE_SNAPSHOTS";
    } else if (row.decision === "UNCHANGED" && historicKind
        && row.mapping === "MATCH" && row.canonical === "EXISTS") {
      // No automatic clearing: the owner of the sync flag is unchanged here.
      verdict = "STALE_OR_RESOLVED";
      basis = "COMPARABLE_SNAPSHOTS";
    } else {
      verdict = "NEEDS_REVIEW";
      basis = historicKind ? "HISTORICAL_NOTION_FLAG" : "CURRENT_IDENTITY_ONLY";
    }

    const numericId = ID.test(row.psipediaId) ? Number(row.psipediaId) : null;
    const safePsipediaId = numericId !== null && Number.isSafeInteger(numericId) ? String(numericId) : "";
    const safelyMapped = numericId !== null && Number.isSafeInteger(numericId)
      && row.mapping === "MATCH" && row.canonical === "EXISTS"
      && independent.evidence === "VERIFIED_IDS_ONLY";
    // Other agendas have distinct editors/identity contracts. Do not guess URLs.
    const editorHref = safelyMapped && agenda === "directory" ? `/admin/adresar/${numericId}`
      : safelyMapped && agenda === "events" ? `/admin/podujatia/${numericId}` : null;

    const fieldNames = basis === "COMPARABLE_SNAPSHOTS" && row.fieldNames
      ? [...new Set(row.fieldNames.filter((name) => SAFE_FIELD_NAMES.has(name)))].sort()
      : null;
    items.push({
      notionPageId: row.notionPageId, psipediaId: safePsipediaId,
      verdict, issue: issueFor(row.reason, historicKind), basis,
      reason: row.reason, historicKind, editorHref, fieldNames,
    });
    counts[verdict]++;
  }
  // Do not allow extraneous historic pages to silently disappear from the receipt.
  const inspected = new Set(independent.items.map((row) => row.notionPageId));
  if ([...byPage.keys()].some((id) => !inspected.has(id))) invalid();
  return {
    readOnly: true, scope: "ONE_AUDIT_BATCH", counts, items,
    unknown: [
      "CURRENT_NOTION_CONTENT_SNAPSHOT_UNAVAILABLE_IN_LIVE_AUDIT",
      "CURRENT_D1_CONTENT_SNAPSHOT_UNAVAILABLE_IN_LIVE_AUDIT",
      "CROSS_BATCH_DEDUPLICATION_REQUIRES_SEPARATE_HMAC_DIAGNOSTIC",
      "GLOBAL_D1_ORPHAN_COVERAGE_UNPROVEN",
      "LAST_AUTHORITATIVE_EDITOR_UNPROVEN",
    ],
  };
}
