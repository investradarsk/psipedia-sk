import { isDirectoryCategory, type ManagedDirectoryProfile } from "@/lib/directory";
import {
  directoryAddressTextSemanticallyEqual,
  directoryCanonicalAddressSemanticallyEqual,
  evaluateDirectoryServiceAddress,
  normalizeSlovakPostalCode,
  type DirectoryAddressFormat,
  type DirectoryServiceAddressEvaluation,
} from "@/lib/directory-service-address";
import {
  getManagedDirectoryProfileByCategorySlug,
  getManagedDirectoryProfileById,
} from "@/lib/directory-store";

export const ADDRESS_RESEARCH_AUDIT_SCHEMA_VERSION = 1;
export const ADDRESS_RESEARCH_AUDIT_BATCH_SIZE = 100;

export type AddressResearchAuditCanonical = {
  region: string;
  district: string;
  city: string;
  postalCode: string;
  street: string;
  houseNumber: string;
  addressFormat: DirectoryAddressFormat | "";
};

export type AddressResearchAuditRecord = {
  profileId: number | null;
  psipediaUrl: string;
  category: string;
  slug: string;
  name: string;
  researchAction: string;
  researchConfidence: string;
  sourceUrl: string;
  researchedAddress: AddressResearchAuditCanonical;
};

export type AddressResearchAuditDecision =
  | "ALREADY_COMPLETE_SAME"
  | "NEEDS_CONFIRMATION_ONLY"
  | "NEEDS_FILL"
  | "CURRENT_DIFFERS"
  | "CURRENT_INVALID"
  | "ARCHIVED"
  | "ONLINE_ONLY"
  | "IDENTITY_MISMATCH"
  | "NOT_FOUND"
  | "INVALID_RESEARCH";

export type AddressResearchAuditItem = {
  index: number;
  profileId: number | null;
  resolvedProfileId: number | null;
  name: string;
  category: string;
  psipediaUrl: string;
  researchAction: string;
  researchConfidence: string;
  sourceUrl: string;
  currentAddress: AddressResearchAuditCanonical | null;
  currentServiceAddressConfirmation: string | null;
  currentAddressState: string | null;
  currentAddressReason: string | null;
  researchedAddress: AddressResearchAuditCanonical | null;
  decision: AddressResearchAuditDecision;
  differenceReason: string;
  updatedAt: string | null;
};

export type AddressResearchAuditSummary = Record<
  | "TOTAL"
  | "RESOLVED"
  | "ALREADY_COMPLETE_SAME"
  | "NEEDS_CONFIRMATION_ONLY"
  | "NEEDS_FILL"
  | "CURRENT_DIFFERS"
  | "CURRENT_INVALID"
  | "ARCHIVED"
  | "ONLINE_ONLY"
  | "IDENTITY_MISMATCH"
  | "NOT_FOUND"
  | "INVALID_RESEARCH"
  | "NEEDS_CANONICAL_ACTION",
  number
>;

type Dependencies = {
  getById: typeof getManagedDirectoryProfileById;
  getByCategorySlug: typeof getManagedDirectoryProfileByCategorySlug;
};

const defaultDependencies: Dependencies = {
  getById: getManagedDirectoryProfileById,
  getByCategorySlug: getManagedDirectoryProfileByCategorySlug,
};

function cleanString(value: unknown, max = 2048) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeIdentity(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("sk-SK");
}

function parseExactPsipediaUrl(value: string) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLocaleLowerCase();
    if (parsed.protocol !== "https:" || (hostname !== "psipedia.sk" && hostname !== "www.psipedia.sk")) return null;
    if (parsed.search || parsed.hash) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length !== 3 || parts[0] !== "adresar") return null;
    const category = decodeURIComponent(parts[1]);
    const slug = decodeURIComponent(parts[2]);
    if (!isDirectoryCategory(category) || !slug) return null;
    return { category, slug };
  } catch {
    return null;
  }
}

function parseAddress(value: unknown): AddressResearchAuditCanonical | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const addressFormat = cleanString(raw.addressFormat, 40);
  if (addressFormat !== "STREET" && addressFormat !== "MUNICIPALITY_NUMBER") return null;
  return {
    region: cleanString(raw.region, 120),
    district: cleanString(raw.district, 120),
    city: cleanString(raw.city, 120),
    postalCode: normalizeSlovakPostalCode(cleanString(raw.postalCode, 20)),
    street: cleanString(raw.street, 160),
    houseNumber: cleanString(raw.houseNumber, 40),
    addressFormat,
  };
}

function parseRecord(input: unknown): { record: AddressResearchAuditRecord | null; reason: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { record: null, reason: "Record musí byť object." };
  const raw = input as Record<string, unknown>;
  const profileId = raw.profileId === null || raw.profileId === undefined || raw.profileId === ""
    ? null
    : Number(raw.profileId);
  if (profileId !== null && (!Number.isSafeInteger(profileId) || profileId < 1)) {
    return { record: null, reason: "profileId musí byť null alebo safe integer > 0." };
  }
  const category = cleanString(raw.category, 100);
  const name = cleanString(raw.name, 240);
  const psipediaUrl = cleanString(raw.psipediaUrl, 2048);
  if (!isDirectoryCategory(category)) return { record: null, reason: "Nepodporovaná DIRECTORY category." };
  if (!name) return { record: null, reason: "name je povinné." };
  const urlIdentity = parseExactPsipediaUrl(psipediaUrl);
  if (!urlIdentity) return { record: null, reason: "psipediaUrl musí byť exact https://psipedia.sk/adresar/<category>/<slug>." };
  if (urlIdentity.category !== category) return { record: null, reason: "URL category nesedí s category v recorde." };

  const researchedAddress = parseAddress(raw.researchedAddress);
  if (!researchedAddress) return { record: null, reason: "researchedAddress má neplatný canonical formát." };
  const evaluation = evaluateDirectoryServiceAddress({
    ...researchedAddress,
    serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
  });
  if (evaluation.state !== "COMPLETE") {
    return { record: null, reason: `Research structured adresa nie je COMPLETE: ${evaluation.reason}.` };
  }

  return {
    record: {
      profileId,
      psipediaUrl,
      category,
      slug: urlIdentity.slug,
      name,
      researchAction: cleanString(raw.researchAction, 80),
      researchConfidence: cleanString(raw.researchConfidence, 80),
      sourceUrl: cleanString(raw.sourceUrl, 2048),
      researchedAddress,
    },
    reason: "",
  };
}

export function validateAddressResearchAuditDataset(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("JSON musí byť top-level object.");
  const raw = input as Record<string, unknown>;
  if (raw.schemaVersion !== ADDRESS_RESEARCH_AUDIT_SCHEMA_VERSION) throw new Error("Nepodporovaný schemaVersion. Očakáva sa schemaVersion 1.");
  if (!Array.isArray(raw.profiles)) throw new Error("profiles musí byť array.");
  if (raw.profiles.length > ADDRESS_RESEARCH_AUDIT_BATCH_SIZE) {
    throw new Error(`Audit batch môže obsahovať najviac ${ADDRESS_RESEARCH_AUDIT_BATCH_SIZE} records.`);
  }
  const dataset = raw.dataset && typeof raw.dataset === "object" && !Array.isArray(raw.dataset)
    ? raw.dataset as Record<string, unknown>
    : undefined;
  return {
    schemaVersion: 1 as const,
    dataset: dataset ? { label: cleanString(dataset.label, 200) || undefined } : undefined,
    profiles: raw.profiles,
  };
}

function canonical(profile: ManagedDirectoryProfile): AddressResearchAuditCanonical {
  return {
    region: profile.region ?? "",
    district: profile.district ?? "",
    city: profile.city ?? "",
    postalCode: normalizeSlovakPostalCode(profile.postalCode ?? ""),
    street: profile.street ?? "",
    houseNumber: profile.houseNumber ?? "",
    addressFormat: profile.addressFormat ?? "",
  };
}

function evaluateCurrent(profile: ManagedDirectoryProfile) {
  const address = canonical(profile);
  const actual = evaluateDirectoryServiceAddress({
    ...address,
    serviceAddressConfirmation: profile.serviceAddressConfirmation,
    online: profile.online,
  });
  const structural = evaluateDirectoryServiceAddress({
    ...address,
    serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
    online: profile.online,
  });
  return { address, actual, structural };
}

function differenceReason(current: AddressResearchAuditCanonical, researched: AddressResearchAuditCanonical) {
  const fields: string[] = [];
  if (!directoryAddressTextSemanticallyEqual(current.region, researched.region)) fields.push("region");
  if (!directoryAddressTextSemanticallyEqual(current.district, researched.district)) fields.push("district");
  if (!directoryAddressTextSemanticallyEqual(current.city, researched.city)) fields.push("city");
  if (normalizeSlovakPostalCode(current.postalCode) !== normalizeSlovakPostalCode(researched.postalCode)) fields.push("postalCode");
  if (!directoryAddressTextSemanticallyEqual(current.street, researched.street)) fields.push("street");
  if (!directoryAddressTextSemanticallyEqual(current.houseNumber, researched.houseNumber)) fields.push("houseNumber");
  if (current.addressFormat !== researched.addressFormat) fields.push("addressFormat");
  return fields.length ? `Líšia sa polia: ${fields.join(", ")}.` : "";
}

function baseItem(index: number, raw: unknown): AddressResearchAuditItem {
  const object = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const id = Number(object.profileId);
  return {
    index,
    profileId: Number.isSafeInteger(id) && id > 0 ? id : null,
    resolvedProfileId: null,
    name: cleanString(object.name, 240),
    category: cleanString(object.category, 100),
    psipediaUrl: cleanString(object.psipediaUrl, 2048),
    researchAction: cleanString(object.researchAction, 80),
    researchConfidence: cleanString(object.researchConfidence, 80),
    sourceUrl: cleanString(object.sourceUrl, 2048),
    currentAddress: null,
    currentServiceAddressConfirmation: null,
    currentAddressState: null,
    currentAddressReason: null,
    researchedAddress: parseAddress(object.researchedAddress),
    decision: "INVALID_RESEARCH",
    differenceReason: "",
    updatedAt: null,
  };
}

function identityMatches(profile: ManagedDirectoryProfile, record: AddressResearchAuditRecord) {
  return profile.category === record.category
    && profile.slug === record.slug
    && normalizeIdentity(profile.name) === normalizeIdentity(record.name);
}

async function auditOne(index: number, raw: unknown, deps: Dependencies): Promise<AddressResearchAuditItem> {
  const base = baseItem(index, raw);
  const parsed = parseRecord(raw);
  if (!parsed.record) return { ...base, decision: "INVALID_RESEARCH", differenceReason: parsed.reason };
  const record = parsed.record;
  const seeded = {
    ...base,
    profileId: record.profileId,
    name: record.name,
    category: record.category,
    psipediaUrl: record.psipediaUrl,
    researchAction: record.researchAction,
    researchConfidence: record.researchConfidence,
    sourceUrl: record.sourceUrl,
    researchedAddress: record.researchedAddress,
  };

  const profile = record.profileId !== null
    ? await deps.getById(record.profileId)
    : await deps.getByCategorySlug(record.category, record.slug);

  if (!profile) return { ...seeded, decision: "NOT_FOUND", differenceReason: record.profileId ? "profileId sa v DB nenašlo." : "Exact category+slug sa v DB nenašli." };
  const current = evaluateCurrent(profile);
  const populated: AddressResearchAuditItem = {
    ...seeded,
    resolvedProfileId: profile.id,
    currentAddress: current.address,
    currentServiceAddressConfirmation: profile.serviceAddressConfirmation,
    currentAddressState: current.actual.state,
    currentAddressReason: current.actual.reason,
    updatedAt: profile.updatedAt,
    differenceReason: differenceReason(current.address, record.researchedAddress),
  };

  if (!identityMatches(profile, record)) {
    return { ...populated, decision: "IDENTITY_MISMATCH", differenceReason: "ID/category/slug/name identity guard nesedí." };
  }
  if (profile.status === "archived") return { ...populated, decision: "ARCHIVED", differenceReason: "Profil je archivovaný." };
  if (current.actual.reason === "ONLINE_ONLY" || current.structural.reason === "ONLINE_ONLY") {
    return { ...populated, decision: "ONLINE_ONLY", differenceReason: "Profil je online-only bez fyzickej prevádzky." };
  }

  const same = directoryCanonicalAddressSemanticallyEqual(current.address, record.researchedAddress);
  if (same && current.actual.state === "COMPLETE" && profile.serviceAddressConfirmation === "CONFIRMED_SERVICE_LOCATION") {
    return { ...populated, decision: "ALREADY_COMPLETE_SAME", differenceReason: "" };
  }
  if (
    same
    && profile.serviceAddressConfirmation === "LEGACY_UNCONFIRMED"
    && current.structural.state === "COMPLETE"
  ) {
    return { ...populated, decision: "NEEDS_CONFIRMATION_ONLY", differenceReason: "Structured adresa je rovnaká, chýba CONFIRMED_SERVICE_LOCATION." };
  }
  if (current.structural.state === "MISSING" || current.structural.state === "INCOMPLETE") {
    return { ...populated, decision: "NEEDS_FILL", differenceReason: `Current canonical je ${current.structural.state}: ${current.structural.reason}.` };
  }
  if (current.structural.state === "NEEDS_REVIEW") {
    return { ...populated, decision: "CURRENT_INVALID", differenceReason: `Current canonical vyžaduje review: ${current.structural.reason}.` };
  }
  if (current.actual.state === "COMPLETE" && profile.serviceAddressConfirmation === "CONFIRMED_SERVICE_LOCATION" && !same) {
    return { ...populated, decision: "CURRENT_DIFFERS", differenceReason: differenceReason(current.address, record.researchedAddress) || "Canonical adresy sa líšia." };
  }
  if (current.actual.reason === "LEGACY_UNCONFIRMED") {
    return { ...populated, decision: "CURRENT_INVALID", differenceReason: populated.differenceReason || "LEGACY_UNCONFIRMED adresa sa zároveň nezhoduje s research adresou." };
  }
  return { ...populated, decision: "CURRENT_INVALID", differenceReason: `Neočakávaný current address state: ${current.actual.state}/${current.actual.reason}.` };
}

export function summarizeAddressResearchAudit(items: AddressResearchAuditItem[]): AddressResearchAuditSummary {
  const summary: AddressResearchAuditSummary = {
    TOTAL: items.length,
    RESOLVED: 0,
    ALREADY_COMPLETE_SAME: 0,
    NEEDS_CONFIRMATION_ONLY: 0,
    NEEDS_FILL: 0,
    CURRENT_DIFFERS: 0,
    CURRENT_INVALID: 0,
    ARCHIVED: 0,
    ONLINE_ONLY: 0,
    IDENTITY_MISMATCH: 0,
    NOT_FOUND: 0,
    INVALID_RESEARCH: 0,
    NEEDS_CANONICAL_ACTION: 0,
  };
  for (const item of items) {
    summary[item.decision] += 1;
    if (item.resolvedProfileId !== null) summary.RESOLVED += 1;
  }
  summary.NEEDS_CANONICAL_ACTION = summary.NEEDS_CONFIRMATION_ONLY + summary.NEEDS_FILL + summary.CURRENT_INVALID;
  return summary;
}

export async function auditAddressResearchBatch(input: unknown, dependencies: Partial<Dependencies> = {}) {
  const dataset = validateAddressResearchAuditDataset(input);
  const deps = { ...defaultDependencies, ...dependencies };
  const items: AddressResearchAuditItem[] = [];
  for (let index = 0; index < dataset.profiles.length; index += 1) {
    items.push(await auditOne(index, dataset.profiles[index], deps));
  }
  return {
    schemaVersion: 1 as const,
    dataset: dataset.dataset,
    summary: summarizeAddressResearchAudit(items),
    items,
  };
}
