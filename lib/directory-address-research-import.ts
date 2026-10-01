import { isDirectoryCategory, type ManagedDirectoryProfile } from "@/lib/directory";
export { ADDRESS_RESEARCH_IMPORT_PREVIEW_BATCH_SIZE } from "@/lib/address-research-preview-batches";
import {
  directoryCanonicalAddressSemanticallyEqual,
  directoryAddressTextSemanticallyEqual,
  evaluateDirectoryServiceAddress,
  normalizeSlovakPostalCode,
  type DirectoryAddressFormat,
  type DirectoryServiceAddressConfirmation,
} from "@/lib/directory-service-address";
import { verifyDirectoryCanonicalAddress, type VerifiedDirectoryAddress } from "@/lib/directory-address-provider";
import {
  applyVerifiedDirectoryAddressGeo,
  requireDirectoryAddressProviderSchema,
  withVerifiedDirectoryAddress,
} from "@/lib/directory-address-save";
import {
  getManagedDirectoryProfileByCategorySlug,
  getManagedDirectoryProfileById,
  updateManagedDirectoryProfile,
  type ManagedDirectoryProfileInput,
} from "@/lib/directory-store";

export const ADDRESS_RESEARCH_IMPORT_CONFIRMATION = "ADDRESS-RESEARCH-IMPORT";
export const ADDRESS_RESEARCH_IMPORT_SCHEMA_VERSION = 1;
export const ADDRESS_RESEARCH_IMPORT_APPLY_BATCH_SIZE = 20;
export const ADDRESS_RESEARCH_IMPORT_PROVIDER_CONCURRENCY = 4;

export const addressResearchActions = [
  "KEEP", "FILL_MISSING", "UPDATE", "REVIEW", "NOT_FOUND", "NO_PUBLIC_SERVICE_ADDRESS",
] as const;
export type AddressResearchAction = (typeof addressResearchActions)[number];

export const addressResearchConfidences = ["HIGH", "MEDIUM", "LOW"] as const;
export type AddressResearchConfidence = (typeof addressResearchConfidences)[number];

export type AddressResearchCanonical = {
  region: string;
  district: string;
  city: string;
  postalCode: string;
  street: string;
  houseNumber: string;
  addressFormat: DirectoryAddressFormat | "";
  serviceAddressConfirmation?: DirectoryServiceAddressConfirmation;
};

export type AddressResearchRecord = {
  profileId?: number;
  psipediaUrl?: string;
  category: string;
  name: string;
  action: AddressResearchAction;
  confidence: AddressResearchConfidence;
  sourceUrl: string;
  sourceType: string;
  sourceEvidence: string;
  note: string;
  expectedCurrent?: AddressResearchCanonical;
  proposedAddress?: Omit<AddressResearchCanonical, "serviceAddressConfirmation">;
};

export type AddressResearchDataset = {
  schemaVersion: 1;
  dataset?: { label?: string; createdAt?: string };
  profiles: unknown[];
};

export type AddressResearchDecision =
  | "READY_UPDATE"
  | "READY_FILL_MISSING"
  | "KEEP"
  | "NO_CHANGE"
  | "REVIEW"
  | "NOT_FOUND"
  | "NO_PUBLIC_SERVICE_ADDRESS"
  | "SKIPPED_CONFIDENCE"
  | "STALE_DATASET"
  | "IDENTITY_MISMATCH"
  | "ACTION_CONFLICT"
  | "INVALID"
  | "ARCHIVED"
  | "PROVIDER_REJECTED"
  | "PROVIDER_AMBIGUOUS"
  | "PROVIDER_ERROR";

export type AddressResearchPreviewItem = {
  index: number;
  profileId: number | null;
  name: string;
  category: string;
  action: string;
  confidence: string;
  sourceUrl: string;
  currentAddress: AddressResearchCanonical | null;
  proposedAddress: AddressResearchCanonical | null;
  verifiedAddress: AddressResearchCanonical | null;
  decision: AddressResearchDecision;
  reason: string;
  previewFingerprint: string | null;
  record: AddressResearchRecord | null;
};

type Dependencies = {
  getProfile: typeof getManagedDirectoryProfileById;
  getProfileByCategorySlug: typeof getManagedDirectoryProfileByCategorySlug;
  verifyAddress: typeof verifyDirectoryCanonicalAddress;
  updateProfile: typeof updateManagedDirectoryProfile;
  applyGeo: typeof applyVerifiedDirectoryAddressGeo;
  requireProviderSchema: typeof requireDirectoryAddressProviderSchema;
};

const defaultDependencies: Dependencies = {
  getProfile: getManagedDirectoryProfileById,
  getProfileByCategorySlug: getManagedDirectoryProfileByCategorySlug,
  verifyAddress: verifyDirectoryCanonicalAddress,
  updateProfile: updateManagedDirectoryProfile,
  applyGeo: applyVerifiedDirectoryAddressGeo,
  requireProviderSchema: requireDirectoryAddressProviderSchema,
};

function cleanString(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeIdentity(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("sk-SK");
}

function validHttpUrl(value: string) {
  if (!value || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseExactPsipediaDirectoryUrl(value: string) {
  if (!value || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:"
      || parsed.hostname !== "psipedia.sk"
      || parsed.port
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
    ) return null;
    const match = parsed.pathname.match(/^\/adresar\/([^/]+)\/([^/]+)$/);
    if (!match) return null;
    const category = decodeURIComponent(match[1]);
    const slug = decodeURIComponent(match[2]);
    if (!isDirectoryCategory(category)) return null;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
    return { category, slug };
  } catch {
    return null;
  }
}

function parseCanonical(value: unknown, includeConfirmation: boolean): AddressResearchCanonical | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const addressFormat = cleanString(item.addressFormat, 40);
  if (addressFormat && addressFormat !== "STREET" && addressFormat !== "MUNICIPALITY_NUMBER") return null;
  const confirmation = cleanString(item.serviceAddressConfirmation, 60);
  if (includeConfirmation && confirmation && confirmation !== "CONFIRMED_SERVICE_LOCATION" && confirmation !== "LEGACY_UNCONFIRMED") return null;
  return {
    region: cleanString(item.region, 120),
    district: cleanString(item.district, 120),
    city: cleanString(item.city, 120),
    postalCode: normalizeSlovakPostalCode(cleanString(item.postalCode, 20)),
    street: cleanString(item.street, 160),
    houseNumber: cleanString(item.houseNumber, 40),
    addressFormat: addressFormat as DirectoryAddressFormat | "",
    ...(includeConfirmation && confirmation ? { serviceAddressConfirmation: confirmation as DirectoryServiceAddressConfirmation } : {}),
  };
}

export function validateAddressResearchDataset(input: unknown): AddressResearchDataset {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("JSON musí byť top-level object.");
  const raw = input as Record<string, unknown>;
  if (raw.schemaVersion !== ADDRESS_RESEARCH_IMPORT_SCHEMA_VERSION) throw new Error("Nepodporovaný schemaVersion. Očakáva sa schemaVersion 1.");
  if (!Array.isArray(raw.profiles)) throw new Error("profiles musí byť array.");
  const seenIds = new Set<number>();
  const seenUrls = new Set<string>();
  for (const item of raw.profiles) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = record.profileId;
    if (Number.isSafeInteger(id) && Number(id) > 0) {
      if (seenIds.has(Number(id))) throw new Error(`Duplicitný profileId v datasete: ${id}`);
      seenIds.add(Number(id));
    }
    const psipediaUrl = cleanString(record.psipediaUrl, 2048);
    if (psipediaUrl) {
      const exact = parseExactPsipediaDirectoryUrl(psipediaUrl);
      if (!exact) throw new Error(`Neplatný psipediaUrl v datasete: ${psipediaUrl}`);
      const normalizedUrl = `https://psipedia.sk/adresar/${exact.category}/${exact.slug}`;
      if (seenUrls.has(normalizedUrl)) throw new Error(`Duplicitný psipediaUrl v datasete: ${normalizedUrl}`);
      seenUrls.add(normalizedUrl);
    }
  }
  raw.profiles.forEach((item, index) => {
    const parsed = parseAddressResearchRecord(item);
    if (!parsed.record) throw new Error(`Neplatný record na indexe ${index}: ${parsed.reason}`);
  });

  const dataset = raw.dataset && typeof raw.dataset === "object" && !Array.isArray(raw.dataset)
    ? raw.dataset as Record<string, unknown>
    : undefined;
  return {
    schemaVersion: 1,
    dataset: dataset ? {
      label: cleanString(dataset.label, 200) || undefined,
      createdAt: cleanString(dataset.createdAt, 80) || undefined,
    } : undefined,
    profiles: raw.profiles,
  };
}

export function parseAddressResearchRecord(input: unknown): { record: AddressResearchRecord | null; reason: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { record: null, reason: "Record musí byť object." };
  const raw = input as Record<string, unknown>;
  const rawProfileId = raw.profileId;
  const hasProfileId = rawProfileId !== undefined && rawProfileId !== null && rawProfileId !== "";
  const profileId = hasProfileId ? Number(rawProfileId) : undefined;
  if (hasProfileId && (!Number.isSafeInteger(profileId) || Number(profileId) < 1)) return { record: null, reason: "profileId musí byť safe integer > 0." };
  const psipediaUrl = cleanString(raw.psipediaUrl, 2048);
  const parsedPsipediaUrl = psipediaUrl ? parseExactPsipediaDirectoryUrl(psipediaUrl) : null;
  if (!profileId && !psipediaUrl) return { record: null, reason: "Chýba profileId aj psipediaUrl." };
  if (psipediaUrl && !parsedPsipediaUrl) return { record: null, reason: "psipediaUrl musí byť exact https://psipedia.sk/adresar/<category>/<slug>." };
  const category = cleanString(raw.category, 100);
  const name = cleanString(raw.name, 240);
  const action = cleanString(raw.action, 60);
  const confidence = cleanString(raw.confidence, 30);
  const sourceUrl = cleanString(raw.sourceUrl, 2048);
  if (!isDirectoryCategory(category)) return { record: null, reason: "Nepodporovaná DIRECTORY category." };
  if (!name) return { record: null, reason: "name je povinné." };
  if (!(addressResearchActions as readonly string[]).includes(action)) return { record: null, reason: "Neznáma action." };
  if (!(addressResearchConfidences as readonly string[]).includes(confidence)) return { record: null, reason: "Neznáma confidence." };

  const requiresProposed = action === "UPDATE" || action === "FILL_MISSING";
  const proposedAddress = raw.proposedAddress === undefined || raw.proposedAddress === null
    ? null
    : parseCanonical(raw.proposedAddress, false);
  if (requiresProposed && !proposedAddress) return { record: null, reason: "proposedAddress je povinný a musí mať platný addressFormat." };
  if (proposedAddress) {
    const evaluation = evaluateDirectoryServiceAddress({
      ...proposedAddress,
      serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
    });
    if (evaluation.state !== "COMPLETE") return { record: null, reason: `Neplatná structured adresa: ${evaluation.reason}.` };
  }
  if (confidence === "HIGH" && requiresProposed && !validHttpUrl(sourceUrl)) {
    return { record: null, reason: "HIGH UPDATE/FILL_MISSING vyžaduje validnú http/https sourceUrl." };
  }

  let expectedCurrent: AddressResearchCanonical | undefined;
  if (raw.expectedCurrent !== undefined && raw.expectedCurrent !== null) {
    const parsed = parseCanonical(raw.expectedCurrent, true);
    if (!parsed) return { record: null, reason: "expectedCurrent má neplatný canonical formát." };
    expectedCurrent = parsed;
  }

  return {
    record: {
      ...(profileId ? { profileId } : {}),
      ...(psipediaUrl ? { psipediaUrl } : {}),
      category,
      name,
      action: action as AddressResearchAction,
      confidence: confidence as AddressResearchConfidence,
      sourceUrl,
      sourceType: cleanString(raw.sourceType, 120),
      sourceEvidence: cleanString(raw.sourceEvidence, 4000),
      note: cleanString(raw.note, 2000),
      ...(expectedCurrent ? { expectedCurrent } : {}),
      ...(proposedAddress ? { proposedAddress } : {}),
    },
    reason: "",
  };
}

export function currentCanonicalAddress(profile: ManagedDirectoryProfile): AddressResearchCanonical {
  return {
    region: profile.region ?? "",
    district: profile.district ?? "",
    city: profile.city ?? "",
    postalCode: normalizeSlovakPostalCode(profile.postalCode ?? ""),
    street: profile.street ?? "",
    houseNumber: profile.houseNumber ?? "",
    addressFormat: profile.addressFormat ?? "",
    serviceAddressConfirmation: profile.serviceAddressConfirmation,
  };
}

function canonicalSemanticallyEqual(left: AddressResearchCanonical, right: AddressResearchCanonical, compareConfirmation = false) {
  const addressEqual = directoryCanonicalAddressSemanticallyEqual(left, right);
  if (!addressEqual) return false;
  return !compareConfirmation || !right.serviceAddressConfirmation
    || left.serviceAddressConfirmation === right.serviceAddressConfirmation;
}

function expectedCurrentMatches(profile: ManagedDirectoryProfile, expected?: AddressResearchCanonical) {
  if (!expected) return true;
  return canonicalSemanticallyEqual(currentCanonicalAddress(profile), expected, true);
}

function identityMatches(profile: ManagedDirectoryProfile, record: AddressResearchRecord) {
  return profile.category === record.category && normalizeIdentity(profile.name) === normalizeIdentity(record.name);
}

function proposedCanonical(record: AddressResearchRecord): AddressResearchCanonical | null {
  return record.proposedAddress ? {
    ...record.proposedAddress,
    serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
  } : null;
}

function isCompleteConfirmed(profile: ManagedDirectoryProfile) {
  return evaluateDirectoryServiceAddress({
    ...currentCanonicalAddress(profile),
    serviceAddressConfirmation: profile.serviceAddressConfirmation,
  }).state === "COMPLETE" && profile.serviceAddressConfirmation === "CONFIRMED_SERVICE_LOCATION";
}

function classifyProviderError(error: unknown): Pick<AddressResearchPreviewItem, "decision" | "reason"> {
  const message = error instanceof Error ? error.message : "Provider verification zlyhala.";
  const lower = message.toLocaleLowerCase("sk-SK");
  if (lower.includes("nejednozna") || lower.includes("ambiguous")) return { decision: "PROVIDER_AMBIGUOUS", reason: message };
  if (
    lower.includes("nepodarilo") || lower.includes("neplat") || lower.includes("skontroluj")
    || lower.includes("vyber") || lower.includes("číslo domu") || lower.includes("adresu")
  ) return { decision: "PROVIDER_REJECTED", reason: message };
  return { decision: "PROVIDER_ERROR", reason: message };
}

function readOnlyDecision(record: AddressResearchRecord): AddressResearchDecision | null {
  if (record.action === "KEEP") return "KEEP";
  if (record.action === "REVIEW") return "REVIEW";
  if (record.action === "NOT_FOUND") return "NOT_FOUND";
  if (record.action === "NO_PUBLIC_SERVICE_ADDRESS") return "NO_PUBLIC_SERVICE_ADDRESS";
  if (record.confidence !== "HIGH") return "SKIPPED_CONFIDENCE";
  return null;
}

function fingerprintPayload(profile: ManagedDirectoryProfile, record: AddressResearchRecord) {
  return JSON.stringify({
    profileId: profile.id,
    updatedAt: profile.updatedAt,
    category: profile.category,
    name: normalizeIdentity(profile.name),
    current: currentCanonicalAddress(profile),
    proposed: proposedCanonical(record),
    action: record.action,
    confidence: record.confidence,
    sourceUrl: record.sourceUrl,
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function basePreview(index: number, raw: unknown): AddressResearchPreviewItem {
  const item = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const id = Number(item.profileId);
  return {
    index,
    profileId: Number.isSafeInteger(id) && id > 0 ? id : null,
    name: cleanString(item.name, 240),
    category: cleanString(item.category, 100),
    action: cleanString(item.action, 60),
    confidence: cleanString(item.confidence, 30),
    sourceUrl: cleanString(item.sourceUrl, 2048),
    currentAddress: null,
    proposedAddress: null,
    verifiedAddress: null,
    decision: "INVALID",
    reason: "",
    previewFingerprint: null,
    record: null,
  };
}

async function previewOne(index: number, raw: unknown, dependencies: Dependencies): Promise<AddressResearchPreviewItem> {
  const base = basePreview(index, raw);
  const parsed = parseAddressResearchRecord(raw);
  if (!parsed.record) return { ...base, decision: "INVALID", reason: parsed.reason };
  const inputRecord = parsed.record;
  const parsedUrl = inputRecord.psipediaUrl ? parseExactPsipediaDirectoryUrl(inputRecord.psipediaUrl) : null;

  const byId = inputRecord.profileId ? await dependencies.getProfile(inputRecord.profileId) : null;
  const byUrl = parsedUrl ? await dependencies.getProfileByCategorySlug(parsedUrl.category, parsedUrl.slug) : null;

  if (inputRecord.profileId && !byId) {
    return { ...base, profileId: inputRecord.profileId, name: inputRecord.name, category: inputRecord.category, action: inputRecord.action, confidence: inputRecord.confidence, sourceUrl: inputRecord.sourceUrl, decision: "IDENTITY_MISMATCH", reason: "Profil s profileId neexistuje." };
  }
  if (!inputRecord.profileId && !byUrl) {
    return { ...base, name: inputRecord.name, category: inputRecord.category, action: inputRecord.action, confidence: inputRecord.confidence, sourceUrl: inputRecord.sourceUrl, decision: "IDENTITY_MISMATCH", reason: "Exact psipediaUrl sa nepodarilo resolve-nuť." };
  }
  if (inputRecord.profileId && inputRecord.psipediaUrl && (!byUrl || byId?.id !== byUrl.id)) {
    return { ...base, profileId: inputRecord.profileId, name: inputRecord.name, category: inputRecord.category, action: inputRecord.action, confidence: inputRecord.confidence, sourceUrl: inputRecord.sourceUrl, decision: "IDENTITY_MISMATCH", reason: "profileId a psipediaUrl ukazujú na rozdielne profily." };
  }

  const profile = byId ?? byUrl;
  if (!profile) return { ...base, decision: "IDENTITY_MISMATCH", reason: "Profil sa nepodarilo resolve-nuť." };
  if (parsedUrl && (parsedUrl.category !== inputRecord.category || profile.category !== parsedUrl.category || profile.slug !== parsedUrl.slug)) {
    return { ...base, profileId: profile.id, name: inputRecord.name, category: inputRecord.category, action: inputRecord.action, confidence: inputRecord.confidence, sourceUrl: inputRecord.sourceUrl, decision: "IDENTITY_MISMATCH", reason: "URL category/slug nesedí s import recordom alebo resolved profilom." };
  }

  const record: AddressResearchRecord = { ...inputRecord, profileId: profile.id };
  const proposed = proposedCanonical(record);
  const populated = { ...base, profileId: profile.id, name: record.name, category: record.category, action: record.action, confidence: record.confidence, sourceUrl: record.sourceUrl, proposedAddress: proposed, record };
  const current = currentCanonicalAddress(profile);
  const matched = { ...populated, currentAddress: current };
  if (profile.status === "archived") return { ...matched, decision: "ARCHIVED", reason: "Archivovaný profil sa automaticky neupravuje." };
  if (!identityMatches(profile, record)) return { ...matched, decision: "IDENTITY_MISMATCH", reason: "category alebo name nesedia s aktuálnym profilom." };

  const readOnly = readOnlyDecision(record);
  if (readOnly) return { ...matched, decision: readOnly, reason: readOnly === "SKIPPED_CONFIDENCE" ? "Auto-apply povoľuje iba HIGH confidence." : "Action je read-only/skipped." };
  if (!proposed) return { ...matched, decision: "INVALID", reason: "Chýba proposedAddress." };
  if (canonicalSemanticallyEqual(current, proposed)) return { ...matched, decision: "NO_CHANGE", reason: "Proposed canonical adresa je už uložená." };
  if (!expectedCurrentMatches(profile, record.expectedCurrent)) return { ...matched, decision: "STALE_DATASET", reason: "expectedCurrent sa nezhoduje s aktuálnou canonical adresou." };
  if (record.action === "FILL_MISSING" && isCompleteConfirmed(profile)) {
    return { ...matched, decision: "ACTION_CONFLICT", reason: "FILL_MISSING nesmie prepísať inú COMPLETE + CONFIRMED_SERVICE_LOCATION adresu." };
  }

  try {
    const verified = await dependencies.verifyAddress({
      region: proposed.region,
      district: proposed.district,
      city: proposed.city,
      street: proposed.street,
      houseNumber: proposed.houseNumber,
      addressFormat: proposed.addressFormat as DirectoryAddressFormat,
    });
    const verifiedCanonical: AddressResearchCanonical = {
      region: verified.region,
      district: verified.district,
      city: verified.city,
      postalCode: verified.postalCode,
      street: verified.street,
      houseNumber: verified.houseNumber,
      addressFormat: verified.addressFormat,
      serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
    };
    return {
      ...matched,
      verifiedAddress: verifiedCanonical,
      decision: record.action === "UPDATE" ? "READY_UPDATE" : "READY_FILL_MISSING",
      reason: "Provider exact verification prešla.",
      previewFingerprint: await sha256(fingerprintPayload(profile, record)),
    };
  } catch (error) {
    return { ...matched, ...classifyProviderError(error) };
  }
}

async function boundedMap<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>) {
  const output = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      output[index] = await mapper(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, () => worker()));
  return output;
}

export async function previewAddressResearchDataset(
  input: unknown,
  dependencies: Partial<Dependencies> = {},
  options: { baseIndex?: number } = {},
) {
  const dataset = validateAddressResearchDataset(input);
  const deps = { ...defaultDependencies, ...dependencies };
  const baseIndex = Number.isSafeInteger(options.baseIndex) && Number(options.baseIndex) >= 0 ? Number(options.baseIndex) : 0;
  const items = await boundedMap(dataset.profiles, ADDRESS_RESEARCH_IMPORT_PROVIDER_CONCURRENCY, (record, index) => previewOne(baseIndex + index, record, deps));
  const counters: Record<string, number> = { TOTAL: items.length, MATCHED: 0 };
  for (const item of items) {
    counters[item.decision] = (counters[item.decision] ?? 0) + 1;
    if (item.currentAddress) counters.MATCHED += 1;
  }
  return { schemaVersion: 1 as const, dataset: dataset.dataset, counters, items };
}

function managedProfilePayload(profile: ManagedDirectoryProfile): ManagedDirectoryProfileInput {
  return {
    slug: profile.slug,
    name: profile.name,
    category: profile.category,
    status: profile.status,
    excerpt: profile.excerpt,
    description: profile.description,
    services: profile.services,
    qualifications: profile.qualifications,
    city: profile.city,
    district: profile.district,
    region: profile.region,
    address: profile.address,
    postalCode: profile.postalCode,
    street: profile.street,
    houseNumber: profile.houseNumber,
    addressFormat: profile.addressFormat,
    priceNote: profile.priceNote,
    websiteUrl: profile.websiteUrl,
    internalEmail: profile.internalEmail,
    imageUrl: profile.imageUrl,
    imageKey: profile.imageKey,
    verified: profile.verified,
    featured: profile.featured,
    seo: profile.seo,
  };
}

export type AddressResearchApplyRequestItem = {
  record: AddressResearchRecord;
  previewFingerprint: string;
};

export async function applyAddressResearchBatch(input: {
  records: AddressResearchApplyRequestItem[];
  confirmationToken: string;
  actorRef: string;
}, dependencies: Partial<Dependencies> = {}) {
  if (input.confirmationToken !== ADDRESS_RESEARCH_IMPORT_CONFIRMATION) throw new Error("Neplatný confirmation token.");
  if (!Array.isArray(input.records) || input.records.length < 1 || input.records.length > ADDRESS_RESEARCH_IMPORT_APPLY_BATCH_SIZE) {
    throw new Error(`Apply batch musí obsahovať 1 až ${ADDRESS_RESEARCH_IMPORT_APPLY_BATCH_SIZE} records.`);
  }
  const deps = { ...defaultDependencies, ...dependencies };
  await deps.requireProviderSchema();
  const results = [];
  for (const item of input.records) {
    const parsed = parseAddressResearchRecord(item.record);
    if (!parsed.record) {
      const unsafe = item.record as Partial<AddressResearchRecord> | null | undefined;
      results.push({
        profileId: Number.isSafeInteger(Number(unsafe?.profileId)) ? Number(unsafe?.profileId) : 0,
        name: typeof unsafe?.name === "string" ? unsafe.name : "",
        result: "SKIPPED",
        reason: `INVALID: ${parsed.reason}`,
        verifiedAddress: null,
        geo: null,
      });
      continue;
    }
    const record = parsed.record;
    if (!record.profileId) {
      results.push({ profileId: 0, name: record.name, result: "IDENTITY_MISMATCH", reason: "Apply vyžaduje resolved numeric profileId.", verifiedAddress: null, geo: null });
      continue;
    }
    let profile = await deps.getProfile(record.profileId);
    if (!profile) {
      results.push({ profileId: record.profileId, name: record.name, result: "IDENTITY_MISMATCH", reason: "Profil neexistuje.", verifiedAddress: null, geo: null });
      continue;
    }
    if (profile.status === "archived") {
      results.push({ profileId: record.profileId, name: record.name, result: "SKIPPED", reason: "ARCHIVED", verifiedAddress: null, geo: null });
      continue;
    }
    if (!identityMatches(profile, record)) {
      results.push({ profileId: record.profileId, name: record.name, result: "IDENTITY_MISMATCH", reason: "category/name mismatch.", verifiedAddress: null, geo: null });
      continue;
    }
    const proposed = proposedCanonical(record);
    if (!proposed || record.confidence !== "HIGH" || (record.action !== "UPDATE" && record.action !== "FILL_MISSING")) {
      results.push({ profileId: record.profileId, name: record.name, result: "SKIPPED", reason: "Record už nie je apply-eligible.", verifiedAddress: null, geo: null });
      continue;
    }
    if (canonicalSemanticallyEqual(currentCanonicalAddress(profile), proposed)) {
      results.push({ profileId: record.profileId, name: record.name, result: "NO_CHANGE", reason: "Canonical adresa je už rovnaká.", verifiedAddress: proposed, geo: null });
      continue;
    }
    if (!expectedCurrentMatches(profile, record.expectedCurrent)) {
      results.push({ profileId: record.profileId, name: record.name, result: "STALE_PREVIEW", reason: "expectedCurrent už nesedí.", verifiedAddress: null, geo: null });
      continue;
    }
    if (record.action === "FILL_MISSING" && isCompleteConfirmed(profile)) {
      results.push({ profileId: record.profileId, name: record.name, result: "SKIPPED", reason: "ACTION_CONFLICT", verifiedAddress: null, geo: null });
      continue;
    }
    const currentFingerprint = await sha256(fingerprintPayload(profile, record));
    if (!item.previewFingerprint || currentFingerprint !== item.previewFingerprint) {
      results.push({ profileId: record.profileId, name: record.name, result: "STALE_PREVIEW", reason: "Profil alebo import record sa od preview zmenil.", verifiedAddress: null, geo: null });
      continue;
    }

    let verified: VerifiedDirectoryAddress;
    try {
      verified = await deps.verifyAddress({
        region: proposed.region,
        district: proposed.district,
        city: proposed.city,
        street: proposed.street,
        houseNumber: proposed.houseNumber,
        addressFormat: proposed.addressFormat as DirectoryAddressFormat,
      });
    } catch (error) {
      const classified = classifyProviderError(error);
      results.push({ profileId: record.profileId, name: record.name, result: classified.decision, reason: classified.reason, verifiedAddress: null, geo: null });
      continue;
    }

    const verifiedCanonical: AddressResearchCanonical = {
      region: verified.region,
      district: verified.district,
      city: verified.city,
      postalCode: verified.postalCode,
      street: verified.street,
      houseNumber: verified.houseNumber,
      addressFormat: verified.addressFormat,
      serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
    };
    profile = await deps.getProfile(record.profileId);
    if (!profile || !identityMatches(profile, record) || await sha256(fingerprintPayload(profile, record)) !== item.previewFingerprint) {
      results.push({ profileId: record.profileId, name: record.name, result: "STALE_PREVIEW", reason: "Profil sa zmenil počas provider verification.", verifiedAddress: verifiedCanonical, geo: null });
      continue;
    }
    if (canonicalSemanticallyEqual(currentCanonicalAddress(profile), verifiedCanonical)) {
      results.push({ profileId: record.profileId, name: record.name, result: "NO_CHANGE", reason: "Verified canonical adresa je už uložená.", verifiedAddress: verifiedCanonical, geo: null });
      continue;
    }

    try {
      const payload = withVerifiedDirectoryAddress(managedProfilePayload(profile), verified);
      const updated = await deps.updateProfile(profile.id, payload, input.actorRef, profile);
      if (!updated) throw new Error("Profil sa počas apply nenašiel.");
      let geo: unknown = null;
      try {
        const point = await deps.applyGeo({ profileId: profile.id, verified, actorRef: input.actorRef });
        geo = point ? {
          status: "APPLIED",
          geocodeStatus: (point as { geocodeStatus?: unknown }).geocodeStatus ?? null,
          manualOverride: (point as { manualOverride?: unknown }).manualOverride ?? null,
        } : { status: "NO_POINT" };
      } catch (error) {
        geo = { status: "ERROR", error: error instanceof Error ? error.message : "GEO lifecycle zlyhal." };
      }
      results.push({ profileId: record.profileId, name: record.name, result: "UPDATED", reason: "Canonical address updated.", verifiedAddress: verifiedCanonical, geo });
    } catch (error) {
      results.push({ profileId: record.profileId, name: record.name, result: "ERROR", reason: error instanceof Error ? error.message : "Apply zlyhal.", verifiedAddress: verifiedCanonical, geo: null });
    }
  }
  return {
    requested: input.records.length,
    eligible: input.records.length,
    processed: results.length,
    written: results.filter((item) => item.result === "UPDATED").length,
    noChange: results.filter((item) => item.result === "NO_CHANGE").length,
    skipped: results.filter((item) => item.result === "SKIPPED").length,
    stale: results.filter((item) => item.result === "STALE_PREVIEW").length,
    providerRejected: results.filter((item) => item.result === "PROVIDER_REJECTED" || item.result === "PROVIDER_AMBIGUOUS").length,
    errors: results.filter((item) => item.result === "ERROR" || item.result === "PROVIDER_ERROR").length,
    results,
  };
}
