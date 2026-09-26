import type { AutomationSourceRecord } from "./data-automation.ts";
import {
  normalizeAutomationAddressComponents,
  normalizeAutomationCandidateKey,
  normalizeAutomationDomain,
  normalizeAutomationEmail,
  normalizeAutomationExactText,
  normalizeAutomationPhone,
  type AutomationCandidateKey,
  type AutomationSemanticKind,
} from "./data-automation-identity.ts";

export const DIRECTORY_SEMANTIC_KIND = "FACILITY_OR_SERVICE_PROFILE" as const;

export type DirectoryClusterCandidate = {
  id: number;
  semanticKind: AutomationSemanticKind;
  canonicalEntityId: number | null;
  canonicalEntityKey: string | null;
  fields: Record<string, string>;
  keys: AutomationCandidateKey[];
};

export type DirectoryClusterDecision = {
  quality: "EXACT" | "STRONG" | "POSSIBLE" | "NONE";
  candidateId: number | null;
  possibleCandidateIds: number[];
  reason: string;
  candidateCount: number;
  decisiveSignals: string[];
  conflicts: string[];
  ambiguity: boolean;
  semanticCompatible: boolean;
};

function value(record: AutomationSourceRecord, field: string) {
  const p = record.proposed;
  if (field === "municipality") return p.municipality ?? p.city;
  if (field === "houseNumber") return p.houseNumber ?? p.house_number;
  if (field === "postalCode") return p.postalCode ?? p.postal_code;
  if (field === "domain") return p.domain ?? p.websiteDomain ?? p.website_domain ?? p.website ?? p.websiteUrl ?? p.website_url;
  if (field === "ico") return p.ico ?? p.companyId ?? p.company_id;
  if (field === "registryId") return p.facilityRegistryId ?? p.facility_registry_id ?? p.registryId ?? p.registry_id;
  if (field === "registryNamespace") {
    return p.facilityRegistryNamespace ?? p.facility_registry_namespace ?? p.registryNamespace ?? p.registry_namespace;
  }
  return p[field];
}

export function directoryObservationSemanticKind(record: AutomationSourceRecord): AutomationSemanticKind {
  const raw = normalizeAutomationExactText(record.proposed.semanticKind ?? record.proposed.semantic_kind).toUpperCase();
  if (raw === DIRECTORY_SEMANTIC_KIND) return DIRECTORY_SEMANTIC_KIND;
  if (raw === "PERSON") return "PERSON";
  if (raw === "LEGAL_ENTITY") return "LEGAL_ENTITY";
  return "UNKNOWN";
}

export function isDirectoryFacilityObservation(record: AutomationSourceRecord) {
  return directoryObservationSemanticKind(record) === DIRECTORY_SEMANTIC_KIND;
}

export function normalizeDirectoryEvidenceField(field: string, rawValue: unknown) {
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;
  if (field === "phone") return normalizeAutomationPhone(rawValue);
  if (field === "email") return normalizeAutomationEmail(rawValue);
  if (field === "domain") return normalizeAutomationDomain(rawValue);
  if (field === "postalCode") return normalizeAutomationAddressComponents({ postalCode: rawValue }).postalCode;
  if (field === "active") {
    if (rawValue === true || rawValue === 1 || rawValue === "1") return "true";
    if (rawValue === false || rawValue === 0 || rawValue === "0") return "false";
    return null;
  }
  return normalizeAutomationExactText(rawValue) || null;
}

export function directoryRecordFields(record: AutomationSourceRecord) {
  const p = record.proposed;
  const address = normalizeAutomationAddressComponents({
    municipality: p.municipality ?? p.city,
    street: p.street,
    houseNumber: p.houseNumber ?? p.house_number,
    postalCode: p.postalCode ?? p.postal_code,
  });
  const fields: Record<string, string> = {};
  const name = normalizeAutomationExactText(p.name);
  const category = normalizeAutomationExactText(p.category);
  if (name) fields.name = name;
  if (category) fields.category = category;
  if (address.municipality) fields.municipality = address.municipality;
  if (address.street) fields.street = address.street;
  if (address.houseNumber) fields.houseNumber = address.houseNumber;
  if (address.postalCode) fields.postalCode = address.postalCode;
  for (const field of ["phone", "email", "domain", "ico", "registryId", "registryNamespace", "active", "status"] as const) {
    const normalized = normalizeDirectoryEvidenceField(field, value(record, field));
    if (normalized) fields[field] = normalized;
  }
  const canonicalEntityId = Number(p.canonicalEntityId ?? p.canonical_entity_id);
  if (Number.isSafeInteger(canonicalEntityId) && canonicalEntityId > 0) fields.canonicalEntityId = String(canonicalEntityId);
  return fields;
}

export function directoryCandidateKeys(record: AutomationSourceRecord): AutomationCandidateKey[] {
  const p = record.proposed;
  const registryId = p.facilityRegistryId ?? p.facility_registry_id ?? p.registryId ?? p.registry_id;
  const registryNamespace =
    p.facilityRegistryNamespace ?? p.facility_registry_namespace ?? p.registryNamespace ?? p.registry_namespace;
  const inputs = [
    normalizeAutomationCandidateKey({ keyType: "REGISTRY_ID", namespace: registryNamespace, value: registryId }),
    normalizeAutomationCandidateKey({ keyType: "ICO", value: p.ico ?? p.companyId ?? p.company_id }),
    normalizeAutomationCandidateKey({ keyType: "NAME", value: p.name }),
    normalizeAutomationCandidateKey({ keyType: "MUNICIPALITY", value: p.municipality ?? p.city }),
    normalizeAutomationCandidateKey({
      keyType: "DOMAIN",
      value: p.domain ?? p.websiteDomain ?? p.website_domain ?? p.website ?? p.websiteUrl ?? p.website_url,
    }),
    normalizeAutomationCandidateKey({ keyType: "PHONE", value: p.phone }),
    normalizeAutomationCandidateKey({ keyType: "EMAIL", value: p.email }),
  ].filter((key): key is AutomationCandidateKey => Boolean(key));
  return [...new Map(inputs.map((key) => [
    [key.keyType, key.namespace, key.normalizedValue].join("\u0000"),
    key,
  ])).values()];
}

function exactAddress(fields: Record<string, string>) {
  return Boolean(fields.municipality && fields.street && fields.houseNumber);
}

function sameAddress(left: Record<string, string>, right: Record<string, string>) {
  return exactAddress(left)
    && exactAddress(right)
    && left.municipality === right.municipality
    && left.street === right.street
    && left.houseNumber === right.houseNumber;
}

function sharesKey(
  left: AutomationCandidateKey[],
  right: AutomationCandidateKey[],
  keyType: AutomationCandidateKey["keyType"],
) {
  const values = new Set(
    left.filter((key) => key.keyType === keyType).map((key) => `${key.namespace}\u0000${key.normalizedValue}`),
  );
  return right.some((key) => key.keyType === keyType && values.has(`${key.namespace}\u0000${key.normalizedValue}`));
}

function candidateQuality(
  recordFields: Record<string, string>,
  recordKeys: AutomationCandidateKey[],
  candidate: DirectoryClusterCandidate,
  allowRegistryExact: boolean,
) {
  if (candidate.semanticKind !== DIRECTORY_SEMANTIC_KIND) {
    return { quality: "NONE" as const, reason: "semantic_kind_incompatible", signals: [] as string[], conflicts: ["semantic_kind"] };
  }

  const c = candidate.fields;
  const sameCategory = Boolean(recordFields.category && c.category && recordFields.category === c.category);
  const categoryConflict = Boolean(recordFields.category && c.category && recordFields.category !== c.category);
  const sameName = Boolean(recordFields.name && c.name && recordFields.name === c.name);
  const sameMunicipality = Boolean(
    recordFields.municipality && c.municipality && recordFields.municipality === c.municipality,
  );
  const exactServiceAddress = sameAddress(recordFields, c);
  const sameRegistry = sharesKey(recordKeys, candidate.keys, "REGISTRY_ID");
  const sameIco = sharesKey(recordKeys, candidate.keys, "ICO");
  const samePhone = Boolean(recordFields.phone && c.phone && recordFields.phone === c.phone);
  const sameEmail = Boolean(recordFields.email && c.email && recordFields.email === c.email);
  const sameDomain = Boolean(recordFields.domain && c.domain && recordFields.domain === c.domain);
  const contactCount = [samePhone, sameEmail, sameDomain].filter(Boolean).length;
  const canonicalLink = Boolean(
    recordFields.canonicalEntityId
      && candidate.canonicalEntityId
      && recordFields.canonicalEntityId === String(candidate.canonicalEntityId),
  );

  if (categoryConflict) {
    const identitySignal =
      sameRegistry || sameIco || sameName || exactServiceAddress || samePhone || sameEmail || sameDomain;
    return identitySignal
      ? {
          quality: "POSSIBLE" as const,
          reason: "directory_category_conflict_requires_review",
          signals: [] as string[],
          conflicts: ["category"],
        }
      : {
          quality: "NONE" as const,
          reason: "directory_category_incompatible",
          signals: [] as string[],
          conflicts: ["category"],
        };
  }
  if (!sameCategory) {
    return {
      quality: "NONE" as const,
      reason: "directory_category_missing_or_incompatible",
      signals: [] as string[],
      conflicts: [] as string[],
    };
  }

  if (canonicalLink) {
    return {
      quality: "EXACT" as const,
      reason: "verified_canonical_linkage",
      signals: ["canonical_linkage"],
      conflicts: [] as string[],
    };
  }
  if (allowRegistryExact && sameRegistry) {
    return {
      quality: "EXACT" as const,
      reason: "official_namespaced_facility_registry_id",
      signals: ["registry_id"],
      conflicts: [] as string[],
    };
  }
  if (sameName && exactServiceAddress) {
    return {
      quality: "STRONG" as const,
      reason: "exact_name_service_address_category",
      signals: ["name", "service_address", "category"],
      conflicts: [] as string[],
    };
  }
  if (sameName && sameMunicipality && contactCount >= 2) {
    const contacts = [
      samePhone ? "phone" : null,
      sameEmail ? "email" : null,
      sameDomain ? "domain" : null,
    ].filter((entry): entry is string => Boolean(entry));
    return {
      quality: "STRONG" as const,
      reason: "exact_name_municipality_two_contacts_category",
      signals: ["name", "municipality", "category", ...contacts],
      conflicts: [] as string[],
    };
  }
  if (sameRegistry && (sameName || sameMunicipality)) {
    return {
      quality: "STRONG" as const,
      reason: "namespaced_registry_with_supporting_directory_evidence",
      signals: ["registry_id", sameName ? "name" : "municipality", "category"],
      conflicts: [] as string[],
    };
  }

  const addressConflict = Boolean(
    sameName
      && sameMunicipality
      && recordFields.houseNumber
      && c.houseNumber
      && recordFields.houseNumber !== c.houseNumber,
  );
  if (sameName && sameMunicipality) {
    return {
      quality: "POSSIBLE" as const,
      reason: addressConflict
        ? "same_name_municipality_conflicting_service_address"
        : "name_municipality_incomplete_identity_requires_review",
      signals: ["name", "municipality"],
      conflicts: addressConflict ? ["service_address"] : [],
    };
  }
  if (sameDomain && !sameMunicipality) {
    return {
      quality: "POSSIBLE" as const,
      reason: "shared_domain_weak_location_requires_review",
      signals: ["domain"],
      conflicts: [] as string[],
    };
  }
  if (samePhone && !sameName) {
    return {
      quality: "POSSIBLE" as const,
      reason: "shared_phone_conflicting_or_missing_name_requires_review",
      signals: ["phone"],
      conflicts: recordFields.name && c.name ? ["name"] : [],
    };
  }
  if (sameIco) {
    return {
      quality: "POSSIBLE" as const,
      reason: "shared_ico_requires_branch_identity_review",
      signals: ["ico"],
      conflicts: [] as string[],
    };
  }
  if (sameRegistry || sameEmail || sameDomain) {
    return {
      quality: "POSSIBLE" as const,
      reason: "partial_directory_identity_requires_review",
      signals: [sameRegistry ? "registry_id" : sameEmail ? "email" : "domain"],
      conflicts: [] as string[],
    };
  }
  return {
    quality: "NONE" as const,
    reason: "insufficient_directory_identity",
    signals: [] as string[],
    conflicts: [] as string[],
  };
}

export function selectDirectoryClusterCandidate(
  record: AutomationSourceRecord,
  candidates: DirectoryClusterCandidate[],
  options: { allowRegistryExact?: boolean } = {},
): DirectoryClusterDecision {
  const semanticKind = directoryObservationSemanticKind(record);
  if (semanticKind !== DIRECTORY_SEMANTIC_KIND) {
    return {
      quality: "NONE",
      candidateId: null,
      possibleCandidateIds: [],
      reason: "directory_semantic_gate_blocked",
      candidateCount: candidates.length,
      decisiveSignals: [],
      conflicts: ["semantic_kind"],
      ambiguity: false,
      semanticCompatible: false,
    };
  }

  const fields = directoryRecordFields(record);
  const keys = directoryCandidateKeys(record);
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      ...candidateQuality(fields, keys, candidate, Boolean(options.allowRegistryExact)),
    }))
    .filter((entry) => entry.quality !== "NONE");

  const exact = ranked.filter((entry) => entry.quality === "EXACT");
  if (exact.length === 1) {
    return {
      quality: "EXACT",
      candidateId: exact[0].candidate.id,
      possibleCandidateIds: [],
      reason: exact[0].reason,
      candidateCount: candidates.length,
      decisiveSignals: exact[0].signals,
      conflicts: exact[0].conflicts,
      ambiguity: false,
      semanticCompatible: true,
    };
  }
  if (exact.length > 1) {
    return {
      quality: "POSSIBLE",
      candidateId: null,
      possibleCandidateIds: exact.map((entry) => entry.candidate.id),
      reason: "multiple_exact_directory_candidates_require_review",
      candidateCount: candidates.length,
      decisiveSignals: [...new Set(exact.flatMap((entry) => entry.signals))],
      conflicts: [...new Set(exact.flatMap((entry) => entry.conflicts))],
      ambiguity: true,
      semanticCompatible: true,
    };
  }

  const strong = ranked.filter((entry) => entry.quality === "STRONG");
  if (strong.length === 1) {
    return {
      quality: "STRONG",
      candidateId: strong[0].candidate.id,
      possibleCandidateIds: [],
      reason: strong[0].reason,
      candidateCount: candidates.length,
      decisiveSignals: strong[0].signals,
      conflicts: strong[0].conflicts,
      ambiguity: false,
      semanticCompatible: true,
    };
  }
  if (strong.length > 1) {
    return {
      quality: "POSSIBLE",
      candidateId: null,
      possibleCandidateIds: strong.map((entry) => entry.candidate.id),
      reason: "multiple_strong_directory_candidates_require_review",
      candidateCount: candidates.length,
      decisiveSignals: [...new Set(strong.flatMap((entry) => entry.signals))],
      conflicts: [...new Set(strong.flatMap((entry) => entry.conflicts))],
      ambiguity: true,
      semanticCompatible: true,
    };
  }

  const possible = ranked.filter((entry) => entry.quality === "POSSIBLE");
  if (possible.length) {
    return {
      quality: "POSSIBLE",
      candidateId: null,
      possibleCandidateIds: [...new Set(possible.map((entry) => entry.candidate.id))],
      reason: possible[0].reason,
      candidateCount: candidates.length,
      decisiveSignals: [...new Set(possible.flatMap((entry) => entry.signals))],
      conflicts: [...new Set(possible.flatMap((entry) => entry.conflicts))],
      ambiguity: possible.length > 1,
      semanticCompatible: true,
    };
  }

  return {
    quality: "NONE",
    candidateId: null,
    possibleCandidateIds: [],
    reason: "new_directory_facility_profile",
    candidateCount: candidates.length,
    decisiveSignals: [],
    conflicts: [],
    ambiguity: false,
    semanticCompatible: true,
  };
}
