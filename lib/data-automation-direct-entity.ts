import { createCanonicalDraft, CanonicalDraftValidationError } from "./canonical-draft-service.ts";
import { enqueueAutomationDraftCreatedAdminNotification } from "./admin-notifications.ts";
import { getAutomationRecordSuppression } from "./automation-record-suppressions.ts";
import { upsertCanonicalPossibleDuplicateFlag } from "./canonical-draft-flags.ts";
import { ensureResourceForDirectoryProfile, ensureResourceForHelpOrganization } from "./canonical-resource.ts";
import { AutomationConnectorError, fetchAutomationSourceRecords, type AutomationFetch } from "./data-automation-connectors.ts";
import { mapAutomationRecordToDraftInput } from "./data-automation-draft-mapper.ts";
import { directoryActionableProposal } from "./data-automation-directory-diff.ts";
import {
  enrichDirectoryProposalWithExactAddress,
  type DirectoryAddressReviewProposal,
  type DirectoryAddressSearch,
} from "./data-automation-directory-address-enrichment.ts";
import type { VerifiedDirectoryAddress } from "./directory-address-provider.ts";
import {
  supersedeOpenAutomationAddressReviews,
  upsertAutomationAddressReviewCase,
} from "./data-automation-address-review-store.ts";
import type { GeocoderProvider } from "./geo-provider.ts";
import { organizationActionableProposal } from "./data-automation-organization-diff.ts";
import { createProductionOrganizationEnricher, type OrganizationRecordEnricher } from "./data-automation-organization-enrichment.ts";
import { enrichAutomationRecordSchemaFirst, type EntityEnrichmentSearch } from "./data-automation-entity-enrichment.ts";
import {
  classifyAutomationFinding,
  canonicalizeSourceUrl,
  normalizeAutomationIdentity,
  type AutomationEntityType,
  type AutomationSource,
  type AutomationSourceRecord,
} from "./data-automation.ts";
import { productionAutomationHtmlAdapters } from "./data-automation-real-sources.ts";
import { candidateProvisioningConfigFor } from "./data-automation-source-provisioning.ts";
import { matchAutomationCanonical } from "./data-automation-store.ts";
import {
  evaluateDirectEntityIdentity,
  markExistingCanonicalProvenance,
  sanitizeDirectEntityUpdateProposal,
} from "./data-automation-direct-identity.ts";
import { automationMatchExplanation, type AutomationMatchExplanationCode } from "./data-automation-operations-model.ts";
import { probeAutomationSourceAccess, probeAutomationSourceRobots } from "./data-automation-source-activation.ts";
import {
  upsertCanonicalExternalProvenance,
  upsertDirectEntityUpdateSuggestion,
  type CanonicalExternalProvenanceType,
} from "./data-automation-product-store.ts";
import {
  automationProductCategoryForEntity,
  type AutomationProductCategorySlug,
} from "./data-automation-product-model.ts";
import {
  applyGeocoderResolution,
  getGeoPointForTarget,
  reconcileGeoAfterSourceMutation,
  setGeoVisibility,
} from "./geo-store.ts";

const DIRECT_AUTOMATION_ACTOR = "automation@psipedia.sk";

type DirectCategorySlug = Extract<
  AutomationProductCategorySlug,
  "veterinari" | "psie-sluzby" | "utulky-organizacie"
>;

export type DirectEntityOperationalOutcome = {
  outcomeType: "NEW_DRAFT" | "EXISTING_CANONICAL" | "POSSIBLE_DUPLICATE" | "UPDATE_SUGGESTION";
  canonicalEntityId: number | null;
  label: string;
  sourceUrl: string | null;
  matchReasonCode: AutomationMatchExplanationCode;
};

export type DirectEntityIngestionResult = {
  fetchedRecords: number;
  canonicalDuplicates: number;
  existingCanonicalMatches: number;
  newEntities: number;
  updateSuggestions: number;
  possibleDuplicates: number;
  addressVerifiedExact: number;
  addressNoExact: number;
  canonicalEntityIds: number[];
  outcomes: DirectEntityOperationalOutcome[];
};

function ephemeralSource(input: {
  entityType: AutomationEntityType;
  sourceUrl: string;
  label: string;
  directoryCategory?: string | null;
}): AutomationSource {
  const metadata = input.directoryCategory ? { directoryCategory: input.directoryCategory } : {};
  const config = candidateProvisioningConfigFor({
    entityType: input.entityType,
    canonicalUrl: input.sourceUrl,
    metadata,
  });
  return {
    id: 0,
    sourceKey: `direct-entity:${input.entityType.toLowerCase()}`,
    label: input.label,
    entityType: input.entityType,
    connectorType: "CONTROLLED_HTML",
    sourceUrl: input.sourceUrl,
    config,
    enabled: false,
    cadenceMinutes: 10_080,
    throttleMs: 500,
    timeoutMs: 8_000,
    retryMaxAttempts: 1,
    retryBackoffMs: 500,
    maxRecordsPerRun: 5,
    nextCheckAt: null,
    reviewStatus: "APPROVED",
  };
}

function searchResultFallbackName(searchCandidateTitle: string, sourceUrl: string) {
  const host = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
  const clean = searchCandidateTitle.replace(/\s+/g, " ").trim();
  if (!clean || clean.length < 2 || clean.length > 160) return null;
  const parts = clean.split(/\s(?:\||–|—|-)\s/).map((part) => part.trim()).filter(Boolean);
  const candidate = parts.find((part) => part.length >= 2 && part.length <= 160) ?? clean;
  const normalized = normalizeAutomationIdentity(candidate);
  if (!normalized || normalized === normalizeAutomationIdentity(host)) return null;
  if (/^(domov|home|uvod|vitajte|welcome|kontakt|contact)$/i.test(normalized)) return null;
  return candidate;
}

function searchResultFallbackRecord(input: {
  entityType: "DIRECTORY" | "ORGANIZATION";
  sourceUrl: string;
  searchCandidateTitle?: string | null;
  searchSnippet?: string | null;
  directoryCategory?: string | null;
}): AutomationSourceRecord | null {
  const sourceUrl = canonicalizeSourceUrl(input.sourceUrl);
  const searchCandidateTitle = String(input.searchCandidateTitle ?? "").trim();
  if (!sourceUrl || !searchCandidateTitle) return null;
  const name = searchResultFallbackName(searchCandidateTitle, sourceUrl);
  if (!name) return null;
  const proposed = input.entityType === "DIRECTORY"
    ? {
        name,
        category: input.directoryCategory,
        semanticKind: "FACILITY_OR_SERVICE_PROFILE",
        websiteUrl: sourceUrl,
      }
    : {
        name,
        websiteUrl: sourceUrl,
        sourceUrl,
      };
  if (input.entityType === "DIRECTORY" && !input.directoryCategory) return null;
  return {
    sourceRecordId: ("search-url:" + sourceUrl).slice(0, 240),
    sourceUrl,
    sourceTimestamp: null,
    rawRecord: {
      sourceUrl,
      extractedName: name,
      identitySource: "SEARCH_RESULT_TITLE_FALLBACK",
      searchSnippet: String(input.searchSnippet ?? "").trim() || null,
      directEvidence: {
        fieldOrigins: {
          name: "SEARCH_PROVIDER",
          websiteUrl: "SEARCH_PROVIDER",
          ...(input.entityType === "DIRECTORY" ? { category: "DERIVED" } : {}),
        },
      },
    },
    proposed,
  };
}

function splitDescriptionStreetAddress(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  const match = clean.match(/^(.+?\D)\s+(\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)?)$/u);
  if (!match) return null;
  const street = match[1].trim();
  const houseNumber = match[2].trim();
  if (street.length < 2 || street.length > 120 || houseNumber.length > 40) return null;
  const streetWords = street.split(/\s+/).filter(Boolean);
  if (streetWords.length > 3) return null;
  return { street, houseNumber };
}

function directoryProposalHasAddress(proposed: Record<string, unknown>) {
  return ["address", "street", "houseNumber", "house_number", "postalCode", "postal_code", "city"]
    .some((key) => typeof proposed[key] === "string" && proposed[key].trim().length > 0);
}

const AMBIGUOUS_DIRECTORY_ADDRESS_FIELDS = new Set([
  "region",
  "district",
  "city",
  "address",
  "postalCode",
  "postal_code",
  "street",
  "houseNumber",
  "house_number",
  "addressFormat",
  "address_format",
  "serviceAddressConfirmation",
  "service_address_confirmation",
]);

function withoutAmbiguousDirectoryAddress(
  proposed: Record<string, unknown>,
  review: DirectoryAddressReviewProposal | null,
) {
  if (!review) return proposed;
  return Object.fromEntries(
    Object.entries(proposed).filter(([key]) => !AMBIGUOUS_DIRECTORY_ADDRESS_FIELDS.has(key)),
  );
}

export function enrichDirectoryProposalAddress(proposed: Record<string, unknown>) {
  if (directoryProposalHasAddress(proposed)) return proposed;
  const description = typeof proposed.description === "string"
    ? proposed.description.replace(/\s+/g, " ").trim()
    : "";
  if (!description) return proposed;

  const candidates: Array<{
    address: string;
    postalCode: string;
    city: string;
    street: string;
    houseNumber: string;
    addressFormat: "STREET";
  }> = [];

  for (const postalMatch of description.matchAll(/\b(\d{3}\s?\d{2})\b/gu)) {
    if (postalMatch.index === undefined) continue;
    const beforeStart = Math.max(0, postalMatch.index - 140);
    const rawBefore = description.slice(beforeStart, postalMatch.index).replace(/[,\s]+$/, "");
    const lastSeparator = Math.max(
      rawBefore.lastIndexOf(","),
      rawBefore.lastIndexOf(";"),
      rawBefore.lastIndexOf("."),
      rawBefore.lastIndexOf(":"),
    );
    let streetAddress = (lastSeparator >= 0 ? rawBefore.slice(lastSeparator + 1) : rawBefore).trim();
    streetAddress = streetAddress
      .replace(/^(?:adresa|sídlo|sidlo|prevádzka|prevadzka|nájdete nás|najdete nas)\s*:?\s*/i, "")
      .trim();
    const street = splitDescriptionStreetAddress(streetAddress);
    if (!street) continue;

    const after = description.slice(postalMatch.index + postalMatch[0].length, postalMatch.index + postalMatch[0].length + 100).trimStart();
    const cityMatch = after.match(/^([\p{L}][\p{L} .'-]{1,80}?)(?=$|[.;|,])/u);
    const city = cityMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    if (city.length < 2 || city.length > 80) continue;

    const postalCode = postalMatch[1];
    candidates.push({
      address: `${streetAddress}, ${postalCode} ${city}`,
      postalCode,
      city,
      street: street.street,
      houseNumber: street.houseNumber,
      addressFormat: "STREET",
    });
  }

  const unique = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    const key = `${normalizeAutomationIdentity(candidate.address)}|${normalizeAutomationIdentity(candidate.city)}`;
    if (key && !unique.has(key)) unique.set(key, candidate);
  }
  if (unique.size !== 1) return proposed;
  return { ...proposed, ...[...unique.values()][0] };
}

async function fetchDirectEntityRecords(
  source: AutomationSource,
  input: {
    entityType: "DIRECTORY" | "ORGANIZATION";
    sourceUrl: string;
    searchCandidateTitle?: string | null;
    searchSnippet?: string | null;
    directoryCategory?: string | null;
    fetchImpl: AutomationFetch;
  },
) {
  try {
    return await fetchAutomationSourceRecords(source, {
      fetchImpl: input.fetchImpl,
      htmlAdapters: productionAutomationHtmlAdapters,
    });
  } catch (error) {
    if (!(error instanceof AutomationConnectorError) || error.code !== "adapter_no_records") throw error;
    const fallback = searchResultFallbackRecord(input);
    return fallback ? [fallback] : [];
  }
}

async function applyVerifiedDirectoryGeo(
  canonicalEntityId: number,
  verified: VerifiedDirectoryAddress,
  database: D1Database,
) {
  let point = await getGeoPointForTarget("DIRECTORY_PROFILE", canonicalEntityId, database);
  if (!point || point.manualOverride) return;
  if (point.publicVisibility !== "EXACT_PUBLIC" || point.publicPrecision !== "EXACT") {
    point = await setGeoVisibility({
      targetType: "DIRECTORY_PROFILE",
      targetId: canonicalEntityId,
      visibility: "EXACT_PUBLIC",
      precision: "EXACT",
      actorRef: DIRECT_AUTOMATION_ACTOR,
      actorType: "SYSTEM",
      reason: "AUTOMATION_GEOAPIFY_VERIFIED_ADDRESS",
    }, database);
  }
  if (point.manualOverride) return;
  await applyGeocoderResolution({
    targetType: "DIRECTORY_PROFILE",
    targetId: canonicalEntityId,
    result: verified.providerResult,
    method: "GEOCODER",
  }, database);
}

async function ensureCanonicalSidecars(
  entityType: AutomationEntityType,
  canonicalEntityId: number,
  database: D1Database,
  now: Date,
) {
  if (entityType === "DIRECTORY") {
    await ensureResourceForDirectoryProfile(canonicalEntityId, database, now);
    await reconcileGeoAfterSourceMutation({
      targetType: "DIRECTORY_PROFILE",
      targetId: canonicalEntityId,
      actorRef: DIRECT_AUTOMATION_ACTOR,
      actorType: "ADMIN",
    }, database);
  } else if (entityType === "ORGANIZATION") {
    await ensureResourceForHelpOrganization(canonicalEntityId, database, now);
  }
}

export async function ingestDirectEntityUrl(input: {
  entityType: "DIRECTORY" | "ORGANIZATION";
  sourceUrl: string;
  label: string;
  searchCandidateTitle?: string | null;
  searchSnippet?: string | null;
  directoryCategory?: string | null;
  database: D1Database;
  fetchImpl?: AutomationFetch;
  now?: Date;
  provenanceType?: CanonicalExternalProvenanceType;
  expectedCanonicalEntityId?: number | null;
  addressSearch?: DirectoryAddressSearch;
  enrichmentSearch?: EntityEnrichmentSearch;
  organizationEnricher?: OrganizationRecordEnricher;
  addressEvidenceText?: string | null;
  geocoder?: GeocoderProvider;
}): Promise<DirectEntityIngestionResult> {
  const now = input.now ?? new Date();
  const detectedAt = now.toISOString();
  const categorySlug = automationProductCategoryForEntity(input.entityType, input.directoryCategory);
  if (!categorySlug || !["veterinari", "psie-sluzby", "utulky-organizacie"].includes(categorySlug)) {
    throw new Error("automation_direct_entity_category_not_supported");
  }

  const source = ephemeralSource(input);
  if (!source.config.htmlAdapterKey) throw new Error("automation_direct_entity_adapter_missing");

  const fetchImpl = input.fetchImpl ?? fetch;
  const [access, robots] = await Promise.all([
    probeAutomationSourceAccess(source, fetchImpl),
    probeAutomationSourceRobots(source, fetchImpl),
  ]);
  const robotsAllowed = robots.status === "ALLOWED" || robots.status === "NOT_APPLICABLE";
  if (access.status !== "ALLOWED" || !robotsAllowed) {
    throw new Error("automation_direct_entity_technical_governance_blocked");
  }

  const fetchedRecords = await fetchDirectEntityRecords(source, {
    entityType: input.entityType,
    sourceUrl: input.sourceUrl,
    searchCandidateTitle: input.searchCandidateTitle,
    searchSnippet: input.searchSnippet,
    directoryCategory: input.directoryCategory,
    fetchImpl,
  });

  let addressSearchUsed = false;
  const boundedAddressSearch = input.addressSearch
    ? async (query: string) => {
        if (addressSearchUsed) return [];
        addressSearchUsed = true;
        return input.addressSearch!(query);
      }
    : undefined;
  const records: Array<{
    record: AutomationSourceRecord;
    verifiedDirectoryAddress: VerifiedDirectoryAddress | null;
    addressReview: DirectoryAddressReviewProposal | null;
    addressAttempted: boolean;
  }> = [];
  const organizationEnricher = input.entityType === "ORGANIZATION"
    ? input.organizationEnricher ?? createProductionOrganizationEnricher({ fetchImpl })
    : null;
  for (const fetchedRecord of fetchedRecords) {
    const firstPartyRecord = organizationEnricher
      ? await organizationEnricher(fetchedRecord, { detectedAt })
      : fetchedRecord;
    const enrichedRecord = await enrichAutomationRecordSchemaFirst({
      entityType: input.entityType,
      record: firstPartyRecord,
      targetedSearch: input.enrichmentSearch,
      maxTargetedSearches: 2,
    });
    if (input.entityType !== "DIRECTORY") {
      records.push({ record: enrichedRecord, verifiedDirectoryAddress: null, addressReview: null, addressAttempted: false });
      continue;
    }
    const proposed = enrichDirectoryProposalAddress(enrichedRecord.proposed);
    const exact = await enrichDirectoryProposalWithExactAddress({
      proposed,
      name: typeof proposed.name === "string" && proposed.name.trim()
        ? proposed.name
        : String(input.searchCandidateTitle ?? "").trim(),
      sourceUrl: enrichedRecord.sourceUrl || input.sourceUrl,
      extraEvidenceText: input.addressEvidenceText,
      addressSearch: boundedAddressSearch,
      geocoder: input.geocoder,
    });
    records.push({
      record: { ...enrichedRecord, proposed: exact.proposed },
      verifiedDirectoryAddress: exact.verified,
      addressReview: exact.review,
      addressAttempted: exact.attempted,
    });
  }

  const result: DirectEntityIngestionResult = {
    fetchedRecords: records.length,
    canonicalDuplicates: 0,
    existingCanonicalMatches: 0,
    newEntities: 0,
    updateSuggestions: 0,
    possibleDuplicates: 0,
    addressVerifiedExact: 0,
    addressNoExact: 0,
    canonicalEntityIds: [],
    outcomes: [],
  };

  for (const prepared of records) {
    const record = prepared.record;
    const verifiedDirectoryAddress = prepared.verifiedDirectoryAddress;
    const addressReview = prepared.addressReview;
    if (input.entityType === "DIRECTORY" && prepared.addressAttempted) {
      if (verifiedDirectoryAddress) result.addressVerifiedExact += 1;
      else result.addressNoExact += 1;
    }
    let identityDecision = evaluateDirectEntityIdentity({
      entityType: input.entityType,
      record,
      verifiedDirectoryAddress: Boolean(verifiedDirectoryAddress),
    });
    const match = await matchAutomationCanonical(source, record, input.database);
    const acceptedProvenanceMatch = Boolean(match.entityId && match.quality === "EXACT_SOURCE_ID");
    if (acceptedProvenanceMatch) {
      identityDecision = markExistingCanonicalProvenance(identityDecision);
    }

    console.info(JSON.stringify({
      event: "data_automation_direct_entity_gate",
      entityType: input.entityType,
      gate: identityDecision.gate,
      reasons: identityDecision.reasons,
      evidenceClasses: identityDecision.evidenceClasses,
      identitySource: identityDecision.identitySource,
      sourceUrl: record.sourceUrl,
      acceptedProvenanceMatch,
    }));

    if (!identityDecision.canUseNonProvenanceMatch && !acceptedProvenanceMatch) {
      continue;
    }

    const explanation = automationMatchExplanation({ record, match });
    const outcomeLabel = String(record.proposed.name ?? record.proposed.title ?? input.label).trim().slice(0, 240) || input.label;
    if (input.expectedCanonicalEntityId && match.entityId !== input.expectedCanonicalEntityId) {
      continue;
    }

    let proposedForComparison = input.entityType === "DIRECTORY"
      ? directoryActionableProposal(withoutAmbiguousDirectoryAddress(record.proposed, addressReview), match.before)
      : organizationActionableProposal(record.proposed, match.before);
    proposedForComparison = acceptedProvenanceMatch && !identityDecision.canUseNonProvenanceMatch
      ? {}
      : sanitizeDirectEntityUpdateProposal({
          record,
          proposed: proposedForComparison,
          verifiedDirectoryAddress: Boolean(verifiedDirectoryAddress),
        });
    if (
      input.entityType === "DIRECTORY"
      && verifiedDirectoryAddress
      && String(match.before?.serviceAddressConfirmation ?? "") !== "CONFIRMED_SERVICE_LOCATION"
    ) {
      proposedForComparison.serviceAddressConfirmation = "CONFIRMED_SERVICE_LOCATION";
    }
    const classified = classifyAutomationFinding({ match, proposed: proposedForComparison });
    const provenanceType = input.provenanceType ?? "DIRECT_ENTITY_DISCOVERY";

    if (match.entityId && match.quality !== "UNCERTAIN" && match.quality !== "NONE") {
      result.existingCanonicalMatches += 1;
      if (input.entityType === "DIRECTORY" && verifiedDirectoryAddress) {
        await supersedeOpenAutomationAddressReviews({
          canonicalEntityId: match.entityId,
          externalSourceUrl: record.sourceUrl,
          externalRecordId: record.sourceRecordId,
          detectedAt,
        }, input.database);
      }
      if (input.entityType === "DIRECTORY" && addressReview && (categorySlug === "veterinari" || categorySlug === "psie-sluzby")) {
        await upsertAutomationAddressReviewCase({
          canonicalEntityId: match.entityId,
          categorySlug,
          externalSourceUrl: record.sourceUrl,
          externalRecordId: record.sourceRecordId,
          reason: addressReview.reason,
          evidence: addressReview.evidence,
          candidates: addressReview.candidates,
          detectedAt,
        }, input.database);
      }
      await upsertCanonicalExternalProvenance({
        entityType: input.entityType,
        canonicalEntityId: match.entityId,
        externalSourceUrl: record.sourceUrl,
        externalRecordId: record.sourceRecordId,
        provenanceType,
        detectedAt,
      }, input.database);
      result.canonicalEntityIds.push(match.entityId);
      if (!classified) {
        result.canonicalDuplicates += 1;
        result.outcomes.push({
          outcomeType: "EXISTING_CANONICAL",
          canonicalEntityId: match.entityId,
          label: outcomeLabel,
          sourceUrl: record.sourceUrl,
          matchReasonCode: explanation.code,
        });
        continue;
      }
      if (
        classified.findingType === "POSSIBLE_UPDATE"
        || classified.findingType === "POSSIBLE_INACTIVE"
        || classified.findingType === "POSSIBLE_CANCELLED"
      ) {
        await upsertDirectEntityUpdateSuggestion({
          entityType: input.entityType,
          canonicalEntityId: match.entityId,
          categorySlug: categorySlug as DirectCategorySlug,
          externalSourceUrl: record.sourceUrl,
          externalRecordId: record.sourceRecordId,
          suggestionType: classified.findingType,
          before: match.before ?? {},
          proposed: proposedForComparison,
          diff: classified.diff,
          detectedAt,
        }, input.database);
        result.updateSuggestions += 1;
        result.outcomes.push({
          outcomeType: "UPDATE_SUGGESTION",
          canonicalEntityId: match.entityId,
          label: outcomeLabel,
          sourceUrl: record.sourceUrl,
          matchReasonCode: explanation.code,
        });
      }
      continue;
    }

    if (input.expectedCanonicalEntityId) continue;
    if (!identityDecision.canCreateDraft) continue;
    if (!classified || (classified.findingType !== "NEW_ENTITY" && classified.findingType !== "DUPLICATE_CANDIDATE")) {
      continue;
    }

    const suppressed = await getAutomationRecordSuppression({
      entityType: input.entityType,
      externalSourceUrl: record.sourceUrl,
      externalRecordId: record.sourceRecordId,
    }, input.database);
    if (suppressed) continue;

    let created;
    try {
      created = await createCanonicalDraft(
        mapAutomationRecordToDraftInput({
          entityType: input.entityType,
          proposed: record.proposed,
          sourceUrl: record.sourceUrl,
          findingType: classified.findingType,
          createdAt: detectedAt,
          verifiedDirectoryAddress,
        }),
        { actor: DIRECT_AUTOMATION_ACTOR, createdAt: detectedAt },
        input.database,
      );
    } catch (error) {
      if (error instanceof CanonicalDraftValidationError) continue;
      throw error;
    }

    if (classified.findingType === "DUPLICATE_CANDIDATE") {
      const candidateIds = (match.candidates ?? [])
        .map((candidate) => candidate.id)
        .filter((id) => Number.isSafeInteger(id) && id > 0);
      await upsertCanonicalPossibleDuplicateFlag({
        entityType: input.entityType,
        canonicalEntityId: created.canonicalEntityId,
        candidateIds,
        sourceUrl: record.sourceUrl,
        createdAt: detectedAt,
      }, input.database);
      result.possibleDuplicates += 1;
    }

    result.outcomes.push({
      outcomeType: classified.findingType === "DUPLICATE_CANDIDATE" ? "POSSIBLE_DUPLICATE" : "NEW_DRAFT",
      canonicalEntityId: created.canonicalEntityId,
      label: outcomeLabel,
      sourceUrl: record.sourceUrl,
      matchReasonCode: explanation.code,
    });

    await upsertCanonicalExternalProvenance({
      entityType: input.entityType,
      canonicalEntityId: created.canonicalEntityId,
      externalSourceUrl: record.sourceUrl,
      externalRecordId: record.sourceRecordId,
      provenanceType,
      detectedAt,
    }, input.database);
    if (input.entityType === "DIRECTORY" && addressReview && (categorySlug === "veterinari" || categorySlug === "psie-sluzby")) {
      await upsertAutomationAddressReviewCase({
        canonicalEntityId: created.canonicalEntityId,
        categorySlug,
        externalSourceUrl: record.sourceUrl,
        externalRecordId: record.sourceRecordId,
        reason: addressReview.reason,
        evidence: addressReview.evidence,
        candidates: addressReview.candidates,
        detectedAt,
      }, input.database);
    }
    try {
      await enqueueAutomationDraftCreatedAdminNotification(input.database, {
        entityType: input.entityType,
        canonicalEntityId: created.canonicalEntityId,
      }, detectedAt);
    } catch (error) {
      console.error(JSON.stringify({
        event: "automation_draft_notification_event",
        canonicalEntityId: created.canonicalEntityId,
        result: "failed",
        error: error instanceof Error ? error.name : "unknown_error",
      }));
    }
    await ensureCanonicalSidecars(input.entityType, created.canonicalEntityId, input.database, now);
    if (input.entityType === "DIRECTORY" && verifiedDirectoryAddress) {
      try {
        await applyVerifiedDirectoryGeo(created.canonicalEntityId, verifiedDirectoryAddress, input.database);
      } catch (error) {
        console.error(JSON.stringify({
          event: "automation_directory_verified_geo_apply",
          canonicalEntityId: created.canonicalEntityId,
          result: "deferred",
          error: error instanceof Error ? error.name : "unknown_error",
        }));
      }
    }
    result.newEntities += 1;
    result.canonicalEntityIds.push(created.canonicalEntityId);
  }

  return result;
}
