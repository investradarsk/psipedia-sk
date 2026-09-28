import { createCanonicalDraft, CanonicalDraftValidationError } from "./canonical-draft-service.ts";
import { upsertCanonicalPossibleDuplicateFlag } from "./canonical-draft-flags.ts";
import { ensureResourceForDirectoryProfile, ensureResourceForHelpOrganization } from "./canonical-resource.ts";
import { AutomationConnectorError, fetchAutomationSourceRecords, type AutomationFetch } from "./data-automation-connectors.ts";
import { mapAutomationRecordToDraftInput } from "./data-automation-draft-mapper.ts";
import { directoryActionableProposal } from "./data-automation-directory-diff.ts";
import { organizationActionableProposal } from "./data-automation-organization-diff.ts";
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
import { reconcileGeoAfterSourceMutation } from "./geo-store.ts";

const DIRECT_AUTOMATION_ACTOR = "automation@psipedia.sk";

type DirectCategorySlug = Extract<
  AutomationProductCategorySlug,
  "veterinari" | "psie-sluzby" | "utulky-organizacie"
>;

export type DirectEntityIngestionResult = {
  fetchedRecords: number;
  canonicalDuplicates: number;
  newEntities: number;
  updateSuggestions: number;
  possibleDuplicates: number;
  canonicalEntityIds: number[];
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

function searchResultFallbackName(label: string, sourceUrl: string) {
  const host = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
  const clean = label.replace(/\s+/g, " ").trim();
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
  label: string;
  directoryCategory?: string | null;
}): AutomationSourceRecord | null {
  const sourceUrl = canonicalizeSourceUrl(input.sourceUrl);
  if (!sourceUrl) return null;
  const name = searchResultFallbackName(input.label, sourceUrl);
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
    },
    proposed,
  };
}

async function fetchDirectEntityRecords(
  source: AutomationSource,
  input: {
    entityType: "DIRECTORY" | "ORGANIZATION";
    sourceUrl: string;
    label: string;
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
  directoryCategory?: string | null;
  database: D1Database;
  fetchImpl?: AutomationFetch;
  now?: Date;
  provenanceType?: CanonicalExternalProvenanceType;
  expectedCanonicalEntityId?: number | null;
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

  const records = await fetchDirectEntityRecords(source, {
    entityType: input.entityType,
    sourceUrl: input.sourceUrl,
    label: input.label,
    directoryCategory: input.directoryCategory,
    fetchImpl,
  });

  const result: DirectEntityIngestionResult = {
    fetchedRecords: records.length,
    canonicalDuplicates: 0,
    newEntities: 0,
    updateSuggestions: 0,
    possibleDuplicates: 0,
    canonicalEntityIds: [],
  };

  for (const record of records) {
    const match = await matchAutomationCanonical(source, record, input.database);
    if (input.expectedCanonicalEntityId && match.entityId !== input.expectedCanonicalEntityId) {
      continue;
    }

    const proposedForComparison = input.entityType === "DIRECTORY"
      ? directoryActionableProposal(record.proposed, match.before)
      : organizationActionableProposal(record.proposed, match.before);
    const classified = classifyAutomationFinding({ match, proposed: proposedForComparison });
    const provenanceType = input.provenanceType ?? "DIRECT_ENTITY_DISCOVERY";

    if (match.entityId && match.quality !== "UNCERTAIN" && match.quality !== "NONE") {
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
      }
      continue;
    }

    if (input.expectedCanonicalEntityId) continue;
    if (!classified || (classified.findingType !== "NEW_ENTITY" && classified.findingType !== "DUPLICATE_CANDIDATE")) {
      continue;
    }

    let created;
    try {
      created = await createCanonicalDraft(
        mapAutomationRecordToDraftInput({
          entityType: input.entityType,
          proposed: record.proposed,
          sourceUrl: record.sourceUrl,
          findingType: classified.findingType,
          createdAt: detectedAt,
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

    await upsertCanonicalExternalProvenance({
      entityType: input.entityType,
      canonicalEntityId: created.canonicalEntityId,
      externalSourceUrl: record.sourceUrl,
      externalRecordId: record.sourceRecordId,
      provenanceType,
      detectedAt,
    }, input.database);
    await ensureCanonicalSidecars(input.entityType, created.canonicalEntityId, input.database, now);
    result.newEntities += 1;
    result.canonicalEntityIds.push(created.canonicalEntityId);
  }

  return result;
}
