import {
  canonicalizeSourceUrl,
  type AutomationSourceRecord,
} from "./data-automation.ts";

export type DirectEntityEvidenceClass =
  | "FIRST_PARTY_STRUCTURED"
  | "FIRST_PARTY_PROFILE"
  | "TRUSTED_REGISTRY"
  | "VERIFIED_SERVICE_ADDRESS"
  | "REGISTRATION_ID"
  | "OFFICIAL_CONTACT"
  | "OFFICIAL_WEBSITE"
  | "EXISTING_CANONICAL_PROVENANCE"
  | "SEARCH_RESULT_FALLBACK"
  | "SEARCH_SNIPPET"
  | "WEAK_DERIVED_IDENTITY";

export type DirectEntityIdentityGate =
  | "VALID_FOR_DRAFT"
  | "VALID_FOR_EXISTING_MATCH"
  | "UNCERTAIN"
  | "INSUFFICIENT";

export type DirectEntityIdentityDecision = {
  gate: DirectEntityIdentityGate;
  evidenceClasses: DirectEntityEvidenceClass[];
  reasons: string[];
  weakIdentity: boolean;
  identitySource: string | null;
  canCreateDraft: boolean;
  canUseNonProvenanceMatch: boolean;
};

const DIRECTORY_IDENTITY_CRITICAL_FIELDS = new Set([
  "name",
  "legalName",
  "category",
  "address",
  "city",
  "municipality",
  "district",
  "region",
  "postalCode",
  "postal_code",
  "street",
  "houseNumber",
  "house_number",
  "registrationNumber",
  "registration_number",
  "type",
]);

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || null;
}

function normalizedRegistration(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 8 ? digits : null;
}

function rawPrimary(record: AutomationSourceRecord) {
  const raw = object(record.rawRecord);
  return object(raw?.primary) ?? raw;
}

function rawEnrichment(record: AutomationSourceRecord) {
  return object(object(record.rawRecord)?.enrichment);
}

export function directEntityIdentitySource(record: AutomationSourceRecord) {
  const primary = rawPrimary(record);
  return text(primary?.identitySource);
}

export function isSearchResultFallbackRecord(record: AutomationSourceRecord) {
  return directEntityIdentitySource(record) === "SEARCH_RESULT_TITLE_FALLBACK"
    || record.sourceRecordId.startsWith("search-url:");
}

function firstPartyStructured(record: AutomationSourceRecord) {
  const primary = rawPrimary(record);
  return Array.isArray(primary?.schemaType) && primary.schemaType.length > 0;
}

function officialFields(record: AutomationSourceRecord) {
  const enrichment = rawEnrichment(record);
  return Array.isArray(enrichment?.officialFields)
    ? enrichment.officialFields.filter((value): value is string => typeof value === "string")
    : [];
}

function trustedRegistry(record: AutomationSourceRecord) {
  const proposed = record.proposed;
  const enrichment = rawEnrichment(record);
  return Boolean(
    enrichment?.trustedDirectoryMatched === true
    || record.sourceRecordId.startsWith("psiadusa:")
    || text(proposed.sourceApprovalNumber)
    || text(proposed.facilityRegistryId ?? proposed.facility_registry_id)
    || /^svps:/i.test(text(proposed.importKey ?? proposed.import_key) ?? ""),
  );
}

function firstPartyProfile(record: AutomationSourceRecord) {
  const source = directEntityIdentitySource(record);
  return source === "page_metadata"
    || firstPartyStructured(record)
    || explicitFieldOrigin(record, "name") === "FIRST_PARTY";
}

function explicitFieldOrigin(record: AutomationSourceRecord, field: string) {
  const raw = object(record.rawRecord);
  const primary = rawPrimary(record);
  const direct = object(raw?.directEvidence) ?? object(primary?.directEvidence);
  const fieldOrigins =
    object(direct?.fieldOrigins)
    ?? object(raw?.evidenceOrigins)
    ?? object(primary?.evidenceOrigins);
  return text(fieldOrigins?.[field]);
}

function authoritativeFieldOrigin(record: AutomationSourceRecord, field: string) {
  const origin = explicitFieldOrigin(record, field);
  return origin === "FIRST_PARTY"
    || origin === "TRUSTED_REGISTRY"
    || origin === "VERIFIED_ADDRESS"
    || origin === "CANONICAL_EXISTING";
}

function publicContactCount(record: AutomationSourceRecord) {
  const p = record.proposed;
  return [
    text(p.publicPhone ?? p.phone),
    text(p.publicEmail ?? p.email),
    text(p.websiteUrl ?? p.website_url ?? p.website),
  ].filter(Boolean).length;
}

function authoritativeContactCount(record: AutomationSourceRecord) {
  if (!isSearchResultFallbackRecord(record) && (firstPartyProfile(record) || trustedRegistry(record))) {
    return publicContactCount(record);
  }
  const fields = ["publicPhone", "phone", "publicEmail", "email", "websiteUrl", "website_url", "website"];
  const originBacked = fields.filter(
    (field) => text(record.proposed[field]) && authoritativeFieldOrigin(record, field),
  ).length;
  const official = new Set(officialFields(record));
  const officialContacts = [
    official.has("publicPhone") && text(record.proposed.publicPhone),
    official.has("publicEmail") && text(record.proposed.publicEmail),
  ].filter(Boolean).length;
  return Math.max(originBacked, officialContacts);
}

function stablePublicUrl(record: AutomationSourceRecord) {
  return canonicalizeSourceUrl(
    record.proposed.websiteUrl
      ?? record.proposed.website_url
      ?? record.proposed.website
      ?? record.sourceUrl,
  );
}

function directoryExactAddress(record: AutomationSourceRecord) {
  const p = record.proposed;
  return Boolean(
    text(p.city ?? p.municipality)
      && text(p.street)
      && text(p.houseNumber ?? p.house_number),
  );
}

function directoryDecision(
  record: AutomationSourceRecord,
  verifiedDirectoryAddress: boolean,
  evidenceClasses: Set<DirectEntityEvidenceClass>,
  reasons: string[],
) {
  const p = record.proposed;
  const weak = isSearchResultFallbackRecord(record);
  const name = text(p.name);
  const category = text(p.category);
  const semanticKind = text(p.semanticKind ?? p.semantic_kind);
  const municipality = text(p.city ?? p.municipality);
  const publicUrl = stablePublicUrl(record);

  if (!name) reasons.push("directory_name_missing");
  if (!category) reasons.push("directory_category_missing");
  if (semanticKind !== "FACILITY_OR_SERVICE_PROFILE") reasons.push("directory_semantic_kind_not_facility");
  if (!publicUrl) reasons.push("directory_public_entity_url_missing");
  if (reasons.length) return "INSUFFICIENT" as const;

  const firstParty = firstPartyStructured(record) || firstPartyProfile(record);
  const trusted = trustedRegistry(record);
  const contacts = authoritativeContactCount(record);
  const exactAddress = verifiedDirectoryAddress || directoryExactAddress(record);

  if (firstPartyStructured(record)) evidenceClasses.add("FIRST_PARTY_STRUCTURED");
  else if (firstParty) evidenceClasses.add("FIRST_PARTY_PROFILE");
  if (trusted) evidenceClasses.add("TRUSTED_REGISTRY");
  if (verifiedDirectoryAddress) evidenceClasses.add("VERIFIED_SERVICE_ADDRESS");
  if (contacts > 0) evidenceClasses.add("OFFICIAL_CONTACT");
  if (publicUrl && (firstParty || trusted || authoritativeFieldOrigin(record, "websiteUrl"))) {
    evidenceClasses.add("OFFICIAL_WEBSITE");
  }

  if (weak) {
    if (verifiedDirectoryAddress && contacts >= 1) return "VALID_FOR_DRAFT" as const;
    reasons.push("search_fallback_requires_independent_directory_corroboration");
    return "INSUFFICIENT" as const;
  }

  if (firstPartyStructured(record) && municipality) return "VALID_FOR_DRAFT" as const;
  if ((firstParty || trusted) && exactAddress) return "VALID_FOR_DRAFT" as const;
  if ((firstParty || trusted) && municipality && contacts >= 2) return "VALID_FOR_DRAFT" as const;
  if (trusted && municipality) return "VALID_FOR_DRAFT" as const;

  const importKey = text(p.importKey ?? p.import_key);
  if (importKey && (firstParty || trusted)) {
    reasons.push("stable_import_key_only_existing_match");
    return "VALID_FOR_EXISTING_MATCH" as const;
  }

  reasons.push("directory_independent_corroboration_missing");
  return "INSUFFICIENT" as const;
}

function organizationDecision(
  record: AutomationSourceRecord,
  evidenceClasses: Set<DirectEntityEvidenceClass>,
  reasons: string[],
) {
  const p = record.proposed;
  const weak = isSearchResultFallbackRecord(record);
  const name = text(p.name);
  const website = stablePublicUrl(record);
  const city = text(p.city ?? p.municipality);
  const type = text(p.type);
  const registration = normalizedRegistration(p.registrationNumber ?? p.registration_number);
  const firstParty = firstPartyProfile(record);
  const trusted = trustedRegistry(record);
  const contacts = authoritativeContactCount(record);
  const addedOfficialFields = officialFields(record);

  if (!name) {
    reasons.push("organization_name_missing");
    return "INSUFFICIENT" as const;
  }

  if (firstParty) evidenceClasses.add("FIRST_PARTY_PROFILE");
  if (trusted) evidenceClasses.add("TRUSTED_REGISTRY");
  if (registration) evidenceClasses.add("REGISTRATION_ID");
  if (contacts > 0) evidenceClasses.add("OFFICIAL_CONTACT");
  if (website && (firstParty || trusted || authoritativeFieldOrigin(record, "websiteUrl"))) {
    evidenceClasses.add("OFFICIAL_WEBSITE");
  }

  const corroboratedOrgSignal = Boolean(
    registration
      || city
      || type
      || contacts > 0
      || text(p.legalName)
      || addedOfficialFields.some((field) =>
        ["publicPhone", "publicEmail", "registrationNumber"].includes(field)
      ),
  );

  if (registration && (type || firstParty || trusted)) return "VALID_FOR_DRAFT" as const;
  if (trusted && (city || website)) return "VALID_FOR_DRAFT" as const;
  if (firstParty && website && corroboratedOrgSignal) return "VALID_FOR_DRAFT" as const;

  const importKey = text(p.importKey ?? p.import_key);
  if (!weak && importKey) {
    reasons.push("stable_import_key_only_existing_match");
    return "VALID_FOR_EXISTING_MATCH" as const;
  }

  reasons.push(
    weak
      ? "search_fallback_requires_independent_organization_corroboration"
      : "organization_independent_corroboration_missing",
  );
  return "INSUFFICIENT" as const;
}

export function evaluateDirectEntityIdentity(input: {
  entityType: "DIRECTORY" | "ORGANIZATION";
  record: AutomationSourceRecord;
  verifiedDirectoryAddress?: boolean;
}): DirectEntityIdentityDecision {
  const evidenceClasses = new Set<DirectEntityEvidenceClass>();
  const reasons: string[] = [];
  const weakIdentity = isSearchResultFallbackRecord(input.record);
  const identitySource = directEntityIdentitySource(input.record);

  if (weakIdentity) {
    evidenceClasses.add("SEARCH_RESULT_FALLBACK");
    evidenceClasses.add("WEAK_DERIVED_IDENTITY");
  }

  const raw = object(input.record.rawRecord);
  if (text(raw?.searchSnippet) || text(rawPrimary(input.record)?.searchSnippet)) {
    evidenceClasses.add("SEARCH_SNIPPET");
  }

  const gate = input.entityType === "DIRECTORY"
    ? directoryDecision(
        input.record,
        Boolean(input.verifiedDirectoryAddress),
        evidenceClasses,
        reasons,
      )
    : organizationDecision(input.record, evidenceClasses, reasons);

  return {
    gate,
    evidenceClasses: [...evidenceClasses],
    reasons,
    weakIdentity,
    identitySource,
    canCreateDraft: gate === "VALID_FOR_DRAFT",
    canUseNonProvenanceMatch: gate === "VALID_FOR_DRAFT" || gate === "VALID_FOR_EXISTING_MATCH",
  };
}

export function markExistingCanonicalProvenance(
  decision: DirectEntityIdentityDecision,
): DirectEntityIdentityDecision {
  return {
    ...decision,
    evidenceClasses: [...new Set([...decision.evidenceClasses, "EXISTING_CANONICAL_PROVENANCE" as const])],
  };
}

export function sanitizeDirectEntityUpdateProposal(input: {
  record: AutomationSourceRecord;
  proposed: Record<string, unknown>;
  verifiedDirectoryAddress?: boolean;
}) {
  if (!isSearchResultFallbackRecord(input.record)) return input.proposed;

  const enrichment = rawEnrichment(input.record);
  const trusted = trustedRegistry(input.record);
  const authoritativeRegistration = trusted
    || officialFields(input.record).includes("registrationNumber")
    || authoritativeFieldOrigin(input.record, "registrationNumber");
  const authoritativeType = trusted || authoritativeFieldOrigin(input.record, "type");

  const result = { ...input.proposed };
  delete result.name;
  delete result.category;

  if (!authoritativeRegistration) {
    delete result.registrationNumber;
    delete result.registration_number;
  }
  if (!authoritativeType) delete result.type;

  const keepAddress = Boolean(input.verifiedDirectoryAddress);
  if (!keepAddress) {
    for (const field of DIRECTORY_IDENTITY_CRITICAL_FIELDS) {
      if (["name", "category", "registrationNumber", "registration_number", "type"].includes(field)) continue;
      delete result[field];
    }
  }

  if (!trusted && !officialFields(input.record).includes("legalName")) delete result.legalName;
  if (enrichment?.trustedDirectoryMatched !== true && !authoritativeFieldOrigin(input.record, "legalName")) {
    delete result.legal_name;
  }
  return result;
}
