import { evaluateDirectoryServiceAddress, type DirectoryAddressFormat } from "./directory-service-address";
import { normalizeAutomationDomain, normalizeAutomationEmail, normalizeAutomationExactText, normalizeAutomationPhone } from "./data-automation-identity";
import { resolveSlovakLocation } from "./slovakia-locations";

export const ADDRESS_ENRICHMENT_MAX_BATCH = 25;
export const ADDRESS_ENRICHMENT_DEFAULT_BATCH = 10;
export const ADDRESS_ENRICHMENT_MAX_SEARCH_CALLS = 3;
export const ADDRESS_ENRICHMENT_MAX_VERIFICATION_CALLS = 25;

export type AddressEnrichmentDecision = "AUTO_APPLY" | "REVIEW" | "NO_MATCH";
export type AddressSourceTier = 1 | 2 | 3 | 4;
export type AddressProviderVerification = "VERIFIED_EXACT" | "AMBIGUOUS" | "REJECTED" | "NOT_RUN";
export type EntityMatchConfidence = "HIGH" | "MEDIUM" | "LOW";

export type DirectoryEnrichmentTarget = {
  id: number;
  name: string;
  category: string;
  status: string;
  region: string;
  district: string;
  city: string;
  postalCode: string;
  street: string;
  houseNumber: string;
  addressFormat: DirectoryAddressFormat | "";
  serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION" | "LEGACY_UNCONFIRMED";
  online: boolean;
  legacyAddress: string;
  websiteUrl: string;
  phone?: string;
  email?: string;
  updatedAt: string;
};

export type AddressEvidence = {
  sourceId?: number | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  sourceRole?: string | null;
  authorityScore?: number | null;
  evidenceId?: number | null;
};

export type AddressCandidate = {
  targetType: "DIRECTORY_PROFILE";
  targetId: number;
  evidence: AddressEvidence;
  rawAddressText: string;
  region: string;
  district: string;
  city: string;
  postalCode: string;
  street: string;
  houseNumber: string;
  addressFormat: DirectoryAddressFormat | "";
  entityMatchConfidence: EntityMatchConfidence;
  entityMatchSignals: string[];
  addressExtractionConfidence: number;
  serviceLocationConfidence: number;
  providerVerification: AddressProviderVerification;
  multipleCompetingAddresses?: boolean;
  legalSeatOnly?: boolean;
  privacySensitive?: boolean;
  obsolete?: boolean;
};

export type AddressEnrichmentAssessment = {
  decision: AddressEnrichmentDecision;
  reason: string;
  sourceTier: AddressSourceTier;
  protectedCanonical: boolean;
  candidateComplete: boolean;
  localityValid: boolean;
};

export type DirectoryAddressInventory = {
  total: number;
  published: number;
  draft: number;
  archived: number;
  canonicalComplete: number;
  legacyUnconfirmed: number;
  missingOrIncompleteCanonical: number;
  onlineOnly: number;
  legacyFreeTextAddress: number;
  websiteAvailable: number;
};

export type AddressEnrichmentPreviewItem = {
  target: DirectoryEnrichmentTarget;
  assessment: AddressEnrichmentAssessment | null;
  candidate: AddressCandidate | null;
};

export type AddressEnrichmentPreview = {
  mode: "READ_ONLY_EXISTING_EVIDENCE";
  scanned: number;
  candidatesFound: number;
  autoApplyCandidates: number;
  reviewCandidates: number;
  noMatch: number;
  providerCalls: number;
  searchCalls: number;
  limits: {
    entitiesPerRun: number;
    searchCallsPerRun: number;
    verificationCallsPerRun: number;
  };
  items: AddressEnrichmentPreviewItem[];
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function sourceTier(evidence: AddressEvidence): AddressSourceTier {
  const role = clean(evidence.sourceRole).toUpperCase();
  const url = clean(evidence.sourceUrl).toLowerCase();
  const score = Number(evidence.authorityScore ?? 0);
  if (role === "OFFICIAL_ORGANIZER" || role === "OFFICIAL_CLUB_CALENDAR") return 1;
  if (role === "OFFICIAL_REGISTRY") return 2;
  if (role === "SECONDARY_DIRECTORY" && score >= 75) return 3;
  if (url && !["SEARCH_DISCOVERY", "SOCIAL_LISTING", "AGGREGATOR"].includes(role) && score >= 85) return 1;
  return 4;
}

export function isProtectedCanonical(target: DirectoryEnrichmentTarget) {
  const evaluation = evaluateDirectoryServiceAddress({
    region: target.region,
    district: target.district,
    city: target.city,
    postalCode: target.postalCode,
    street: target.street,
    houseNumber: target.houseNumber,
    addressFormat: target.addressFormat,
    serviceAddressConfirmation: target.serviceAddressConfirmation,
    online: target.online,
  });
  return target.serviceAddressConfirmation === "CONFIRMED_SERVICE_LOCATION" && evaluation.state === "COMPLETE";
}

function canonicalCandidateComplete(candidate: AddressCandidate) {
  if (!candidate.region || !candidate.district || !candidate.city || !candidate.postalCode || !candidate.houseNumber || !candidate.addressFormat) return false;
  if (candidate.addressFormat === "STREET" && !candidate.street) return false;
  if (candidate.addressFormat === "MUNICIPALITY_NUMBER" && candidate.street) return false;
  return true;
}

export function assessDirectoryAddressCandidate(
  target: DirectoryEnrichmentTarget,
  candidate: AddressCandidate,
): AddressEnrichmentAssessment {
  const protectedCanonical = isProtectedCanonical(target);
  const tier = sourceTier(candidate.evidence);
  const candidateComplete = canonicalCandidateComplete(candidate);
  const localityValid = Boolean(resolveSlovakLocation({
    region: candidate.region,
    district: candidate.district,
    city: candidate.city,
  }));

  if (candidate.obsolete) {
    return { decision: "NO_MATCH", reason: "obsolete_source", sourceTier: tier, protectedCanonical, candidateComplete, localityValid };
  }
  if (target.online && !target.legacyAddress && !target.street && !target.houseNumber) {
    return { decision: "NO_MATCH", reason: "online_only", sourceTier: tier, protectedCanonical, candidateComplete, localityValid };
  }
  if (candidate.entityMatchConfidence === "LOW") {
    return { decision: "NO_MATCH", reason: "entity_identity_insufficient", sourceTier: tier, protectedCanonical, candidateComplete, localityValid };
  }
  if (!candidateComplete || !localityValid) {
    return { decision: "NO_MATCH", reason: candidateComplete ? "invalid_locality" : "incomplete_canonical_parse", sourceTier: tier, protectedCanonical, candidateComplete, localityValid };
  }
  if (candidate.legalSeatOnly) {
    return { decision: "REVIEW", reason: "legal_seat_not_service_location", sourceTier: tier, protectedCanonical, candidateComplete, localityValid };
  }
  if (candidate.multipleCompetingAddresses) {
    return { decision: "REVIEW", reason: "multiple_competing_addresses", sourceTier: tier, protectedCanonical, candidateComplete, localityValid };
  }
  if (candidate.privacySensitive) {
    return { decision: "REVIEW", reason: "privacy_sensitive_location", sourceTier: tier, protectedCanonical, candidateComplete, localityValid };
  }
  if (protectedCanonical) {
    const same = normalizeAutomationExactText(target.city) === normalizeAutomationExactText(candidate.city)
      && normalizeAutomationExactText(target.street) === normalizeAutomationExactText(candidate.street)
      && normalizeAutomationExactText(target.houseNumber) === normalizeAutomationExactText(candidate.houseNumber)
      && normalizeAutomationExactText(target.postalCode) === normalizeAutomationExactText(candidate.postalCode);
    if (!same) {
      return { decision: "REVIEW", reason: "protected_canonical_conflict", sourceTier: tier, protectedCanonical, candidateComplete, localityValid };
    }
  }
  if (candidate.providerVerification === "AMBIGUOUS") {
    return { decision: "REVIEW", reason: "provider_ambiguous", sourceTier: tier, protectedCanonical, candidateComplete, localityValid };
  }
  if (candidate.providerVerification === "REJECTED") {
    return { decision: "NO_MATCH", reason: "provider_rejected", sourceTier: tier, protectedCanonical, candidateComplete, localityValid };
  }
  if (candidate.entityMatchConfidence !== "HIGH") {
    return { decision: "REVIEW", reason: "entity_match_requires_review", sourceTier: tier, protectedCanonical, candidateComplete, localityValid };
  }
  if (tier > 3) {
    return { decision: "REVIEW", reason: "source_not_authoritative_enough", sourceTier: tier, protectedCanonical, candidateComplete, localityValid };
  }
  if (candidate.serviceLocationConfidence < 0.95 || candidate.addressExtractionConfidence < 0.95) {
    return { decision: "REVIEW", reason: "service_or_extraction_confidence_below_auto_apply_threshold", sourceTier: tier, protectedCanonical, candidateComplete, localityValid };
  }
  if (candidate.providerVerification !== "VERIFIED_EXACT") {
    return { decision: "REVIEW", reason: "provider_verification_required", sourceTier: tier, protectedCanonical, candidateComplete, localityValid };
  }
  return { decision: "AUTO_APPLY", reason: "high_confidence_verified_service_location", sourceTier: tier, protectedCanonical, candidateComplete, localityValid };
}

export function normalizeDirectoryIdentityHints(input: {
  name: unknown;
  domain?: unknown;
  phone?: unknown;
  email?: unknown;
  city?: unknown;
}) {
  return {
    name: normalizeAutomationExactText(input.name),
    domain: normalizeAutomationDomain(input.domain),
    phone: normalizeAutomationPhone(input.phone),
    email: normalizeAutomationEmail(input.email),
    city: normalizeAutomationExactText(input.city),
  };
}

export function boundedBatchSize(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return ADDRESS_ENRICHMENT_DEFAULT_BATCH;
  return Math.min(ADDRESS_ENRICHMENT_MAX_BATCH, Math.max(1, Math.trunc(parsed)));
}

export function summarizeAddressEnrichmentPreview(items: AddressEnrichmentPreviewItem[], limit: number): AddressEnrichmentPreview {
  return {
    mode: "READ_ONLY_EXISTING_EVIDENCE",
    scanned: items.length,
    candidatesFound: items.filter((item) => Boolean(item.candidate)).length,
    autoApplyCandidates: items.filter((item) => item.assessment?.decision === "AUTO_APPLY").length,
    reviewCandidates: items.filter((item) => item.assessment?.decision === "REVIEW").length,
    noMatch: items.filter((item) => !item.candidate || item.assessment?.decision === "NO_MATCH").length,
    providerCalls: 0,
    searchCalls: 0,
    limits: {
      entitiesPerRun: limit,
      searchCallsPerRun: ADDRESS_ENRICHMENT_MAX_SEARCH_CALLS,
      verificationCallsPerRun: ADDRESS_ENRICHMENT_MAX_VERIFICATION_CALLS,
    },
    items,
  };
}
