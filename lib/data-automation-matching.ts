import {
  canonicalizeSourceUrl,
  normalizeAutomationIdentity,
  type AutomationCanonicalMatch,
  type AutomationEntityType,
  type AutomationSourceRecord,
} from "./data-automation.ts";
import {
  isDynamicAutomationEntityType,
  matchDynamicAutomationCandidate,
} from "./data-automation-dynamic-identity.ts";
import {
  DIRECTORY_SEMANTIC_KIND,
  directoryCandidateKeys,
  directoryRecordFields,
  selectDirectoryClusterCandidate,
  type DirectoryClusterCandidate,
} from "./data-automation-directory-matching.ts";

export type AutomationMatchCandidate = {
  id: number;
  key: string;
  before: Record<string, unknown>;
  sourceId?: string | null;
  sourceUrl?: string | null;
  websiteUrl?: string | null;
  importKey?: string | null;
  slug?: string | null;
  name?: string | null;
  dogName?: string | null;
  category?: string | null;
  date?: string | null;
  organizer?: string | null;
  city?: string | null;
  region?: string | null;
  registrationNumber?: string | null;
  type?: string | null;
  startTime?: string | null;
  venue?: string | null;
  district?: string | null;
  locationDescription?: string | null;
  sex?: string | null;
  breed?: string | null;
  color?: string | null;
  size?: string | null;
  birthDate?: string | null;
  approximateAge?: string | number | null;
  exactSourceIdentity?: boolean;
  exactDetailUrl?: boolean;
  sameSourceRecordIds?: string[];
};

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function sameUrl(left: unknown, right: unknown) {
  const a = canonicalizeSourceUrl(left);
  const b = canonicalizeSourceUrl(right);
  return Boolean(a && b && a === b);
}

function sameIdentity(left: unknown, right: unknown) {
  const a = normalizeAutomationIdentity(left);
  const b = normalizeAutomationIdentity(right);
  return Boolean(a && b && a === b);
}

function normalizeOrganizationName(value: unknown) {
  const normalized = normalizeAutomationIdentity(value);
  if (!normalized) return "";
  return normalized
    .replace(/^(?:obcianske zdruzenie|oz|o z)\s+/, "")
    .replace(/\s+(?:o z|oz)$/, "")
    .replace(/^(?:neziskova organizacia|n o)\s+/, "")
    .replace(/\s+(?:n o)$/, "")
    .trim();
}

function sameOrganizationName(left: unknown, right: unknown) {
  const a = normalizeOrganizationName(left);
  const b = normalizeOrganizationName(right);
  return Boolean(a && b && a === b);
}

function normalizeRegistration(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 8 ? digits : null;
}

function organizationSemanticClass(value: unknown) {
  switch (clean(value)) {
    case "CIVIC_ASSOCIATION":
    case "NONPROFIT":
      return "LEGAL_ORGANIZATION";
    case "MUNICIPAL_ORGANIZATION":
      return "PUBLIC_ORGANIZATION";
    case "SHELTER":
    case "RESCUE_ORGANIZATION":
      return "RESCUE_GROUP";
    default:
      return null;
  }
}

function organizationSemanticsCompatible(proposedType: unknown, candidateType: unknown) {
  const left = organizationSemanticClass(proposedType);
  const right = organizationSemanticClass(candidateType);
  return !left || !right || left === right;
}

function candidateMatch(
  entityType: AutomationEntityType,
  record: AutomationSourceRecord,
  candidate: AutomationMatchCandidate,
) {
  const proposed = record.proposed;
  const sourceId = clean(record.sourceRecordId);
  const type = clean(proposed.type);

  // LOST and FOUND are separate source claims. Even a reused URL/source id
  // must never silently collapse a semantic type change.
  if (
    entityType === "LOST_FOUND"
    && type
    && clean(candidate.type)
    && type !== clean(candidate.type)
    && (
      candidate.exactSourceIdentity
      || candidate.exactDetailUrl
      || (record.sourceUrl && sameUrl(record.sourceUrl, candidate.sourceUrl))
      || (sourceId && clean(candidate.sourceId) === sourceId)
    )
  ) return "UNCERTAIN" as const;

  const directEntity = entityType === "DIRECTORY" || entityType === "ORGANIZATION";
  if (candidate.exactSourceIdentity) return "EXACT_SOURCE_ID" as const;
  if (!directEntity && sourceId && clean(candidate.sourceId) === sourceId) return "EXACT_SOURCE_ID" as const;
  if (!directEntity && candidate.exactDetailUrl) return "EXACT_CANONICAL_KEY" as const;

  if (!directEntity && record.sourceUrl && sameUrl(record.sourceUrl, candidate.sourceUrl)) {
    return "EXACT_CANONICAL_KEY" as const;
  }

  const importKey = clean(proposed.importKey ?? proposed.import_key);
  if (importKey && clean(candidate.importKey) === importKey) return "EXACT_CANONICAL_KEY" as const;

  const slug = clean(proposed.slug);
  const category = clean(proposed.category);
  if (
    slug
    && entityType !== "ORGANIZATION"
    && clean(candidate.slug) === slug
    && !isDynamicAutomationEntityType(entityType)
  ) {
    if (entityType === "DIRECTORY" && category && clean(candidate.category) !== category) return null;
    return "EXACT_CANONICAL_KEY" as const;
  }

  if (entityType === "ORGANIZATION") {
    const semanticsCompatible = organizationSemanticsCompatible(proposed.type, candidate.type);
    if (!semanticsCompatible) return null;

    if (proposed.websiteUrl && sameUrl(proposed.websiteUrl, candidate.websiteUrl)) {
      return "EXACT_CANONICAL_KEY" as const;
    }

    const registration = normalizeRegistration(proposed.registrationNumber ?? proposed.registration_number);
    if (registration && normalizeRegistration(candidate.registrationNumber) === registration) {
      return "EXACT_CANONICAL_KEY" as const;
    }

    if (
      sameOrganizationName(proposed.name, candidate.name)
      && sameIdentity(proposed.city, candidate.city)
      && sameIdentity(proposed.region, candidate.region)
    ) return "STRONG_IDENTITY" as const;
  }

  if (isDynamicAutomationEntityType(entityType)) {
    return matchDynamicAutomationCandidate(entityType, record, candidate);
  }

  if (entityType === "HELP_ITEM") {
    if (
      sameIdentity(proposed.title, candidate.name)
      && sameIdentity(proposed.organization, candidate.organizer)
      && sameIdentity(proposed.city, candidate.city)
    ) return "STRONG_IDENTITY" as const;
  }

  return null;
}

function directoryCanonicalRecord(
  record: AutomationSourceRecord,
  candidate: AutomationMatchCandidate,
): AutomationSourceRecord {
  const before = candidate.before ?? {};
  return {
    ...record,
    sourceRecordId: `canonical-directory:${candidate.id}`,
    sourceUrl: candidate.sourceUrl ?? record.sourceUrl,
    rawRecord: { canonicalEntityId: candidate.id },
    proposed: {
      name: candidate.name ?? before.name,
      category: candidate.category ?? before.category,
      semanticKind: DIRECTORY_SEMANTIC_KIND,
      city: candidate.city ?? before.city ?? before.municipality,
      street: before.street,
      houseNumber: before.houseNumber ?? before.house_number,
      postalCode: before.postalCode ?? before.postal_code,
      publicPhone: before.publicPhone ?? before.phone,
      publicEmail: before.publicEmail ?? before.email,
      websiteUrl: candidate.websiteUrl ?? before.websiteUrl ?? before.website_url,
      ico: before.ico ?? before.companyId ?? before.company_id,
      facilityRegistryId: before.facilityRegistryId ?? before.facility_registry_id ?? before.registryId ?? before.registry_id,
      facilityRegistryNamespace:
        before.facilityRegistryNamespace
        ?? before.facility_registry_namespace
        ?? before.registryNamespace
        ?? before.registry_namespace,
      canonicalEntityId: candidate.id,
    },
  };
}

function selectSafeDirectoryMatch(input: {
  record: AutomationSourceRecord;
  candidates: AutomationMatchCandidate[];
}): AutomationCanonicalMatch {
  const provenance = input.candidates.filter((candidate) => candidate.exactSourceIdentity);
  if (provenance.length === 1) {
    const candidate = provenance[0];
    return {
      entityType: "DIRECTORY",
      entityId: candidate.id,
      entityKey: candidate.key,
      quality: "EXACT_SOURCE_ID",
      before: candidate.before,
    };
  }
  if (provenance.length > 1) {
    return {
      entityType: "DIRECTORY",
      entityId: null,
      entityKey: null,
      quality: "UNCERTAIN",
      before: null,
      candidates: provenance.map((candidate) => ({ id: candidate.id, key: candidate.key })),
    };
  }

  const importKey = clean(input.record.proposed.importKey ?? input.record.proposed.import_key);
  if (importKey) {
    const exactImport = input.candidates.filter((candidate) => clean(candidate.importKey) === importKey);
    if (exactImport.length === 1) {
      const candidate = exactImport[0];
      return {
        entityType: "DIRECTORY",
        entityId: candidate.id,
        entityKey: candidate.key,
        quality: "EXACT_CANONICAL_KEY",
        before: candidate.before,
      };
    }
    if (exactImport.length > 1) {
      return {
        entityType: "DIRECTORY",
        entityId: null,
        entityKey: null,
        quality: "UNCERTAIN",
        before: null,
        candidates: exactImport.map((candidate) => ({ id: candidate.id, key: candidate.key })),
      };
    }
  }

  const clusterCandidates: DirectoryClusterCandidate[] = input.candidates.map((candidate) => {
    const canonicalRecord = directoryCanonicalRecord(input.record, candidate);
    return {
      id: candidate.id,
      semanticKind: DIRECTORY_SEMANTIC_KIND,
      canonicalEntityId: candidate.id,
      canonicalEntityKey: candidate.key,
      fields: directoryRecordFields(canonicalRecord),
      keys: directoryCandidateKeys(canonicalRecord),
    };
  });
  const decision = selectDirectoryClusterCandidate(input.record, clusterCandidates, { allowRegistryExact: true });

  if (decision.quality === "EXACT" || decision.quality === "STRONG") {
    const candidate = input.candidates.find((entry) => entry.id === decision.candidateId);
    if (!candidate) {
      return { entityType: "DIRECTORY", entityId: null, entityKey: null, quality: "NONE", before: null };
    }
    return {
      entityType: "DIRECTORY",
      entityId: candidate.id,
      entityKey: candidate.key,
      quality: decision.quality === "EXACT" ? "EXACT_CANONICAL_KEY" : "STRONG_IDENTITY",
      before: candidate.before,
    };
  }

  if (decision.quality === "POSSIBLE") {
    const ids = new Set(decision.possibleCandidateIds);
    const possible = input.candidates.filter((candidate) => ids.has(candidate.id));
    return {
      entityType: "DIRECTORY",
      entityId: null,
      entityKey: null,
      quality: "UNCERTAIN",
      before: null,
      candidates: possible.map((candidate) => ({ id: candidate.id, key: candidate.key })),
    };
  }

  return { entityType: "DIRECTORY", entityId: null, entityKey: null, quality: "NONE", before: null };
}

export function selectSafeAutomationMatch(input: {
  entityType: AutomationEntityType;
  record: AutomationSourceRecord;
  candidates: AutomationMatchCandidate[];
}): AutomationCanonicalMatch {
  if (input.entityType === "DIRECTORY") {
    return selectSafeDirectoryMatch({ record: input.record, candidates: input.candidates });
  }
  const ranked = input.candidates
    .map((candidate) => ({ candidate, quality: candidateMatch(input.entityType, input.record, candidate) }))
    .filter((entry): entry is { candidate: AutomationMatchCandidate; quality: NonNullable<ReturnType<typeof candidateMatch>> } => Boolean(entry.quality));

  const rank = { EXACT_SOURCE_ID: 0, EXACT_CANONICAL_KEY: 1, STRONG_IDENTITY: 2, UNCERTAIN: 3 } as const;
  ranked.sort((a, b) => rank[a.quality] - rank[b.quality] || a.candidate.id - b.candidate.id);
  if (!ranked.length) {
    return { entityType: input.entityType, entityId: null, entityKey: null, quality: "NONE", before: null };
  }

  const bestRank = rank[ranked[0].quality];
  const best = ranked.filter((entry) => rank[entry.quality] === bestRank);
  if (best.length !== 1 || best[0].quality === "UNCERTAIN") {
    return {
      entityType: input.entityType,
      entityId: null,
      entityKey: null,
      quality: "UNCERTAIN",
      before: null,
      candidates: best.map(({ candidate }) => ({ id: candidate.id, key: candidate.key })),
    };
  }

  const match = best[0];
  return {
    entityType: input.entityType,
    entityId: match.candidate.id,
    entityKey: match.candidate.key,
    quality: match.quality,
    before: match.candidate.before,
  };
}
