import {
  automationCoverageCanInferAbsence,
} from "./data-automation-source-scoped-extraction.ts";
import { automationEventNormalizationMetadata } from "./data-automation-event-normalize.ts";
import { automationAdoptionNormalizationMetadata } from "./data-automation-adoption-normalize.ts";
import { automationFosterNormalizationMetadata } from "./data-automation-foster-normalize.ts";
import { automationLostFoundNormalizationMetadata } from "./data-automation-lost-found-normalize.ts";
import {
  canonicalizeSourceUrl,
  normalizeAutomationIdentity,
  type AutomationCanonicalMatch,
  type AutomationEntityType,
  type AutomationSource,
  type AutomationSourceRecord,
} from "./data-automation.ts";

export const dynamicAutomationEntityTypes = ["EVENT", "ADOPTION", "FOSTER", "LOST_FOUND"] as const;
export type DynamicAutomationEntityType = (typeof dynamicAutomationEntityTypes)[number];

export const automationIngestionGateStates = [
  "VALID_FOR_DRAFT",
  "VALID_FOR_UPDATE_ONLY",
  "UNCERTAIN",
  "INSUFFICIENT",
] as const;
export type AutomationIngestionGateState = (typeof automationIngestionGateStates)[number];

export const automationIdentityConfidenceStates = [
  "EXACT",
  "STRONG",
  "UNCERTAIN",
  "INSUFFICIENT",
] as const;
export type AutomationIdentityConfidenceState = (typeof automationIdentityConfidenceStates)[number];

export const automationEvidenceClasses = [
  "EXPLICIT_EXTERNAL_ID",
  "CANONICAL_DETAIL_URL",
  "STABLE_SOURCE_RECORD_ID",
  "STRUCTURED_DETAIL",
  "STRUCTURED_LISTING",
  "DETAIL_PAGE",
  "DEDICATED_OR_STRUCTURED_SOURCE",
  "WEAK_DERIVED_IDENTITY",
] as const;
export type AutomationEvidenceClass = (typeof automationEvidenceClasses)[number];

export type DynamicAutomationCandidateIdentity = {
  id: number;
  sourceId?: string | null;
  sourceUrl?: string | null;
  exactSourceIdentity?: boolean;
  exactDetailUrl?: boolean;
  sameSourceRecordIds?: string[];
  name?: string | null;
  dogName?: string | null;
  date?: string | null;
  startTime?: string | null;
  organizer?: string | null;
  venue?: string | null;
  city?: string | null;
  district?: string | null;
  region?: string | null;
  locationDescription?: string | null;
  type?: string | null;
  sex?: string | null;
  breed?: string | null;
  color?: string | null;
  size?: string | null;
  birthDate?: string | null;
  approximateAge?: string | number | null;
};

export type AutomationSourceItemIdentity = {
  sourceId: number;
  sourceRecordId: string;
};

export type AutomationCanonicalEntityIdentity = {
  entityType: AutomationEntityType;
  canonicalEntityId: number;
};

export type AutomationProvenanceIdentity = {
  entityType: AutomationEntityType;
  externalSourceUrl: string | null;
  externalRecordId: string;
};

export function automationSourceItemIdentity(
  source: Pick<AutomationSource, "id">,
  record: Pick<AutomationSourceRecord, "sourceRecordId">,
): AutomationSourceItemIdentity | null {
  const sourceRecordId = clean(record.sourceRecordId);
  return sourceRecordId ? { sourceId: source.id, sourceRecordId } : null;
}

export function automationCanonicalEntityIdentity(
  match: Pick<AutomationCanonicalMatch, "entityType" | "entityId">,
): AutomationCanonicalEntityIdentity | null {
  return match.entityId
    ? { entityType: match.entityType, canonicalEntityId: match.entityId }
    : null;
}

export function automationProvenanceIdentity(
  entityType: AutomationEntityType,
  record: Pick<AutomationSourceRecord, "sourceRecordId" | "sourceUrl">,
): AutomationProvenanceIdentity | null {
  const externalRecordId = clean(record.sourceRecordId);
  if (!externalRecordId) return null;
  return {
    entityType,
    externalSourceUrl: canonicalizeSourceUrl(record.sourceUrl),
    externalRecordId,
  };
}

export type DynamicAutomationIngestionDecision = {
  entityType: DynamicAutomationEntityType;
  matchConfidence: AutomationIdentityConfidenceState;
  gate: AutomationIngestionGateState;
  canCreateDraft: boolean;
  canSuggestUpdate: boolean;
  canAttachLifecycleSuggestion: boolean;
  canUseCoverageForAbsence: boolean;
  stableIdentity: "EXTERNAL_ID" | "DETAIL_URL" | "SOURCE_RECORD_ID" | "WEAK" | "NONE";
  evidenceClasses: AutomationEvidenceClass[];
  reasons: string[];
};

function clean(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || null;
}

function sameText(left: unknown, right: unknown) {
  const a = normalizeAutomationIdentity(left);
  const b = normalizeAutomationIdentity(right);
  return Boolean(a && b && a === b);
}

function sameExact(left: unknown, right: unknown) {
  const a = clean(left);
  const b = clean(right);
  return Boolean(a && b && a === b);
}

function sameUrl(left: unknown, right: unknown) {
  const a = canonicalizeSourceUrl(left);
  const b = canonicalizeSourceUrl(right);
  return Boolean(a && b && a === b);
}

function meaningful(value: unknown, ignored: string[] = []) {
  const normalized = normalizeAutomationIdentity(value);
  return Boolean(normalized && !ignored.includes(normalized));
}

function extractionMethod(record: AutomationSourceRecord) {
  return clean(record.extraction?.evidenceMetadata?.discoveryMethod)?.toUpperCase() ?? "";
}

export function isDynamicAutomationEntityType(value: AutomationEntityType): value is DynamicAutomationEntityType {
  return (dynamicAutomationEntityTypes as readonly string[]).includes(value);
}

export function automationRecordEvidenceClasses(record: AutomationSourceRecord): AutomationEvidenceClass[] {
  const output = new Set<AutomationEvidenceClass>();
  const extraction = record.extraction;
  const method = extractionMethod(record);

  if (clean(extraction?.externalId)) output.add("EXPLICIT_EXTERNAL_ID");
  const providerEvidenceType = clean(extraction?.evidenceMetadata?.providerEvidenceType)?.toUpperCase() ?? "";
  const sourceListRow = providerEvidenceType === "CRAWL_LIST_ROW";
  if (!sourceListRow && (canonicalizeSourceUrl(extraction?.itemUrl) || canonicalizeSourceUrl(record.sourceUrl))) {
    output.add("CANONICAL_DETAIL_URL");
  }

  const sourceRecordId = clean(record.sourceRecordId);
  const genericFingerprintOnly = extraction?.strategy === "GENERIC_FIRST_PARTY"
    && Boolean(sourceRecordId?.startsWith("fp:"))
    && !clean(extraction.externalId)
    && !canonicalizeSourceUrl(extraction.itemUrl)
    && !canonicalizeSourceUrl(record.sourceUrl);

  if (sourceRecordId && !genericFingerprintOnly) output.add("STABLE_SOURCE_RECORD_ID");
  if (genericFingerprintOnly) output.add("WEAK_DERIVED_IDENTITY");

  if (/JSON_LD_DETAIL|DETAIL_JSON_LD/.test(method)) output.add("STRUCTURED_DETAIL");
  else if (/JSON_LD_ITEM_LIST|JSON_LD_COLLECTION/.test(method)) output.add("STRUCTURED_LISTING");
  else if (/DETAIL_HTML_CANONICAL/.test(method) || extraction?.evidenceMetadata?.detailFetched === true) {
    output.add("DETAIL_PAGE");
  }

  if (!extraction && sourceRecordId) output.add("DEDICATED_OR_STRUCTURED_SOURCE");
  return [...output];
}

export function automationStableSourceIdentity(record: AutomationSourceRecord) {
  if (clean(record.extraction?.externalId)) return "EXTERNAL_ID" as const;
  const providerEvidenceType = clean(record.extraction?.evidenceMetadata?.providerEvidenceType)?.toUpperCase() ?? "";
  if (
    providerEvidenceType !== "CRAWL_LIST_ROW"
    && (canonicalizeSourceUrl(record.extraction?.itemUrl) || canonicalizeSourceUrl(record.sourceUrl))
  ) {
    return "DETAIL_URL" as const;
  }
  const id = clean(record.sourceRecordId);
  if (!id) return "NONE" as const;
  if (record.extraction?.strategy === "GENERIC_FIRST_PARTY" && id.startsWith("fp:")) {
    return "WEAK" as const;
  }
  return "SOURCE_RECORD_ID" as const;
}

function matchConfidence(match?: AutomationCanonicalMatch | null): AutomationIdentityConfidenceState {
  if (!match || match.quality === "NONE") return "INSUFFICIENT";
  if (match.quality === "UNCERTAIN") return "UNCERTAIN";
  if (match.quality === "STRONG_IDENTITY") return "STRONG";
  return "EXACT";
}

function eventDraftEvidence(record: AutomationSourceRecord) {
  const p = record.proposed;
  const reasons: string[] = [];
  if (!clean(p.title ?? p.name)) reasons.push("event_title_missing");
  if (!clean(p.startDate ?? p.start_date)) reasons.push("event_start_date_missing");
  const stable = automationStableSourceIdentity(record);
  if (stable === "NONE" || stable === "WEAK") reasons.push("event_stable_identity_missing");
  const organizer = clean(p.organizer ?? p.organization ?? p.organizationName);
  const location = clean(p.venue ?? p.location ?? p.address ?? p.city ?? p.locationDescription);
  if (!organizer && !location) reasons.push("event_context_missing");
  const normalized = automationEventNormalizationMetadata(record);
  if (normalized?.archiveOnly === true) reasons.push("event_past_archive_only");
  if (p.cancelled === true || normalized?.explicitCancellation === true) {
    reasons.push("event_cancelled_new_draft_blocked");
  }
  return reasons;
}

function adoptionDraftEvidence(record: AutomationSourceRecord) {
  const p = record.proposed;
  const reasons: string[] = [];
  if (!clean(p.name ?? p.dogName)) reasons.push("adoption_dog_name_missing");
  const stable = automationStableSourceIdentity(record);
  if (stable === "NONE" || stable === "WEAK") reasons.push("adoption_stable_identity_missing");
  if (!clean(p.organizationName ?? p.organization)) reasons.push("adoption_organization_identity_missing");

  const normalized = automationAdoptionNormalizationMetadata(record);
  if (
    normalized
    && record.extraction
    && ["GENERIC_FIRST_PARTY", "TAVILY_CRAWL", "TAVILY_EXTRACT"].includes(record.extraction.strategy)
    && normalized.profileEvidence !== true
  ) {
    reasons.push("adoption_profile_evidence_missing");
  }
  const adopted = normalized?.explicitAdopted === true
    || record.lifecycleSignals?.some((signal) => signal.signalType === "ADOPTION_ADOPTED");
  const reserved = normalized?.explicitReserved === true
    || record.lifecycleSignals?.some((signal) => signal.signalType === "ADOPTION_RESERVED");
  if (adopted) reasons.push("adoption_adopted_new_draft_blocked");
  else if (reserved) reasons.push("adoption_reserved_new_draft_blocked");
  return reasons;
}

function genericFosterTitle(value: unknown) {
  const normalized = normalizeAutomationIdentity(value);
  if (!normalized) return true;
  return /^(?:urgentne\s+)?(?:hladame|potrebujeme)\s+(?:docasku|docasnu\s+opateru|docasne\s+umiestnenie)(?:\s+pre\s+psa)?$/.test(normalized)
    || /^(?:docasna\s+opatera|hladame\s+docasku|potrebujeme\s+docasku)$/.test(normalized);
}

function fosterDraftEvidence(record: AutomationSourceRecord) {
  const p = record.proposed;
  const reasons: string[] = [];
  const dog = clean(p.dogName ?? p.name);
  const title = clean(p.title);
  if (!dog && (!title || genericFosterTitle(title))) reasons.push("foster_concrete_case_identity_missing");
  const stable = automationStableSourceIdentity(record);
  if (stable === "NONE" || stable === "WEAK") reasons.push("foster_stable_identity_missing");
  if (!clean(p.organizationName ?? p.organization)) reasons.push("foster_organization_identity_missing");

  const normalized = automationFosterNormalizationMetadata(record);
  if (
    normalized
    && record.extraction
    && ["GENERIC_FIRST_PARTY", "TAVILY_CRAWL", "TAVILY_EXTRACT"].includes(record.extraction.strategy)
    && normalized.fosterProfileEvidence !== true
  ) {
    reasons.push("foster_profile_evidence_missing");
  }
  const resolved = normalized?.explicitResolved === true
    || record.lifecycleSignals?.some((signal) => signal.signalType === "FOSTER_RESOLVED");
  if (resolved) reasons.push("foster_resolved_new_draft_blocked");
  return reasons;
}

function lostFoundDraftEvidence(
  record: AutomationSourceRecord,
  sourceShape?: AutomationSource["config"]["sourceShape"],
) {
  const p = record.proposed;
  const reasons: string[] = [];
  const type = clean(p.type)?.toUpperCase();
  if (type !== "LOST" && type !== "FOUND") reasons.push("lost_found_type_missing");
  if (!clean(p.eventDate ?? p.event_date)) {
    reasons.push("lost_found_incident_date_missing");
  }
  if (!clean(p.city ?? p.district ?? p.region ?? p.locationDescription ?? p.location_description)) {
    reasons.push("lost_found_locality_missing");
  }
  const stable = automationStableSourceIdentity(record);
  if (stable === "NONE" || stable === "WEAK") reasons.push("lost_found_stable_identity_missing");

  const normalized = automationLostFoundNormalizationMetadata(record);
  if (normalized?.typeConflict === true) reasons.push("lost_found_type_conflict");
  if (normalized?.incidentDateConflict === true) reasons.push("lost_found_incident_date_conflict");
  if (
    normalized
    && record.extraction
    && ["GENERIC_FIRST_PARTY", "TAVILY_CRAWL", "TAVILY_EXTRACT"].includes(record.extraction.strategy)
    && normalized.dogProfileEvidence !== true
  ) {
    reasons.push("lost_found_dog_profile_evidence_missing");
  }
  if (
    sourceShape === "MULTI_ITEM_LIST"
    && record.extraction?.strategy === "TAVILY_CRAWL"
    && record.extraction.itemUrl
    && record.extraction.discoveredFromRoot
    && canonicalizeSourceUrl(record.extraction.itemUrl) === canonicalizeSourceUrl(record.extraction.discoveredFromRoot)
  ) {
    reasons.push("lost_found_concrete_detail_required");
  }
  const resolved = normalized?.explicitResolved === true
    || record.lifecycleSignals?.some((signal) => signal.signalType === "LOST_FOUND_RESOLVED");
  if (resolved) reasons.push("lost_found_resolved_new_draft_blocked");
  return reasons;
}

export function validateDynamicAutomationIngestion(input: {
  source: Pick<AutomationSource, "entityType" | "sourceKey" | "sourceUrl"> & Partial<Pick<AutomationSource, "config">>;
  record: AutomationSourceRecord;
  match?: AutomationCanonicalMatch | null;
}): DynamicAutomationIngestionDecision | null {
  if (!isDynamicAutomationEntityType(input.source.entityType)) return null;
  const entityType = input.source.entityType;
  const confidence = matchConfidence(input.match);
  const stableIdentity = automationStableSourceIdentity(input.record);
  const evidenceClasses = automationRecordEvidenceClasses(input.record);
  const coverage = input.record.extraction?.coverage;
  const canUseCoverageForAbsence = Boolean(
    coverage
    && automationCoverageCanInferAbsence(coverage)
    && stableIdentity !== "NONE"
    && stableIdentity !== "WEAK"
  );

  if (confidence === "UNCERTAIN") {
    return {
      entityType,
      matchConfidence: confidence,
      gate: "UNCERTAIN",
      canCreateDraft: false,
      canSuggestUpdate: false,
      canAttachLifecycleSuggestion: false,
      canUseCoverageForAbsence,
      stableIdentity,
      evidenceClasses,
      reasons: ["canonical_match_uncertain"],
    };
  }

  if (confidence === "EXACT" || confidence === "STRONG") {
    return {
      entityType,
      matchConfidence: confidence,
      gate: "VALID_FOR_UPDATE_ONLY",
      canCreateDraft: false,
      canSuggestUpdate: true,
      canAttachLifecycleSuggestion: true,
      canUseCoverageForAbsence,
      stableIdentity,
      evidenceClasses,
      reasons: [],
    };
  }

  const reasons = entityType === "EVENT"
    ? eventDraftEvidence(input.record)
    : entityType === "ADOPTION"
      ? adoptionDraftEvidence(input.record)
      : entityType === "FOSTER"
        ? fosterDraftEvidence(input.record)
        : lostFoundDraftEvidence(input.record, input.source.config?.sourceShape);

  return {
    entityType,
    matchConfidence: "INSUFFICIENT",
    gate: reasons.length ? "INSUFFICIENT" : "VALID_FOR_DRAFT",
    canCreateDraft: reasons.length === 0,
    canSuggestUpdate: false,
    canAttachLifecycleSuggestion: false,
    canUseCoverageForAbsence,
    stableIdentity,
    evidenceClasses,
    reasons,
  };
}

function matchingSignals(pairs: Array<[unknown, unknown]>, ignored: string[] = []) {
  let equal = 0;
  let conflict = 0;
  for (const [left, right] of pairs) {
    if (!meaningful(left, ignored) || !meaningful(right, ignored)) continue;
    if (sameText(left, right)) equal += 1;
    else conflict += 1;
  }
  return { equal, conflict };
}

function sameSourceIdConflict(record: AutomationSourceRecord, candidate: DynamicAutomationCandidateIdentity) {
  const ids = (candidate.sameSourceRecordIds ?? []).map((value) => clean(value)).filter(Boolean) as string[];
  if (!ids.length) return false;
  const current = clean(record.sourceRecordId);
  return Boolean(current && !ids.includes(current));
}

export function matchDynamicAutomationCandidate(
  entityType: DynamicAutomationEntityType,
  record: AutomationSourceRecord,
  candidate: DynamicAutomationCandidateIdentity,
): "STRONG_IDENTITY" | "UNCERTAIN" | null {
  const p = record.proposed;

  if (entityType === "EVENT") {
    const titleSame = sameText(p.title ?? p.name, candidate.name);
    const dateSame = sameExact(p.startDate ?? p.start_date, candidate.date);
    if (!titleSame || !dateSame) return null;
    const organizerSame = sameText(p.organizer ?? p.organization ?? p.organizationName, candidate.organizer);
    const venueSame = sameText(p.venue ?? p.location ?? p.address ?? p.city, candidate.venue ?? candidate.city);
    if (organizerSame || venueSame) return "STRONG_IDENTITY";
    return "UNCERTAIN";
  }

  if (entityType === "ADOPTION") {
    if (!sameText(p.name ?? p.dogName, candidate.name ?? candidate.dogName)) return null;
    const organizationSame = sameText(p.organizationName ?? p.organization, candidate.organizer);
    if (!organizationSame) return null;
    if (sameSourceIdConflict(record, candidate)) return "UNCERTAIN";
    const secondary = matchingSignals([
      [p.sex, candidate.sex],
      [p.breedName ?? p.breed, candidate.breed],
      [p.birthDate ?? p.birth_date, candidate.birthDate],
      [p.approximateAgeMonths ?? p.approximateAge, candidate.approximateAge],
      [p.city, candidate.city],
    ], ["unknown"]);
    if (secondary.conflict > 0) return "UNCERTAIN";
    if (secondary.equal >= 2) return "STRONG_IDENTITY";
    return "UNCERTAIN";
  }

  if (entityType === "FOSTER") {
    const proposedDog = p.dogName ?? p.name;
    const proposedTitle = p.title;
    const concreteSame = sameText(proposedDog, candidate.dogName ?? candidate.name)
      || (!genericFosterTitle(proposedTitle) && sameText(proposedTitle, candidate.name));
    if (!concreteSame) return null;
    if (!sameText(p.organizationName ?? p.organization, candidate.organizer)) return null;
    if (sameSourceIdConflict(record, candidate)) return "UNCERTAIN";
    return "STRONG_IDENTITY";
  }

  const proposedType = clean(p.type)?.toUpperCase();
  const candidateType = clean(candidate.type)?.toUpperCase();
  const sameRecordUrl = sameUrl(record.sourceUrl, candidate.sourceUrl);
  if (proposedType && candidateType && proposedType !== candidateType) {
    return sameRecordUrl ? "UNCERTAIN" : null;
  }
  if (!sameExact(p.eventDate ?? p.event_date ?? p.reportedDate ?? p.reported_date, candidate.date)) return null;
  const localitySame = sameText(p.city, candidate.city)
    || sameText(p.district, candidate.district)
    || sameText(p.region, candidate.region)
    || sameText(p.locationDescription ?? p.location_description, candidate.locationDescription);
  if (!localitySame) return null;

  const dogSignals = matchingSignals([
    [p.dogName ?? p.name, candidate.dogName ?? candidate.name],
    [p.sex, candidate.sex],
    [p.breed, candidate.breed],
    [p.color, candidate.color],
    [p.size, candidate.size],
  ], ["unknown"]);
  if (dogSignals.conflict > 0) return "UNCERTAIN";
  return dogSignals.equal >= 2 ? "STRONG_IDENTITY" : "UNCERTAIN";
}
