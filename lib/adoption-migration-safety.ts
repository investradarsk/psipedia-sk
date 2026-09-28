import {
  adoptionPublicationErrors,
  normalizeAdoptionInput,
  type AdoptionSex,
  type AdoptionSize,
  type ManagedAdoptionInput,
  type NormalizedAdoptionInput,
} from "./adoption.ts";

export const ADOPTION_HOLD_SLUGS = [
  "charlie-hlada-novy-domov",
  "kira-hlada-novy-domov",
  "aisha-hlada-novy-domov",
  "max-hlada-novy-domov",
] as const;

export const ADOPTION_ORGANIZATION_IDENTITIES = {
  "U.V.P. Košice": {
    importKey: "help-org:pomoc-unia-vzajomnej-pomoci-ludi-a-psov-u-v-p",
    slug: "pomoc-unia-vzajomnej-pomoci-ludi-a-psov-u-v-p",
    name: "Únia vzájomnej pomoci ľudí a psov (Ú.V.P.)",
    expectedCount: 16,
  },
  "OZ Dog Azyl": {
    importKey: "help-org:pomoc-dog-azyl-o-z",
    slug: "pomoc-dog-azyl-o-z",
    name: "DOG AZYL, o.z.",
    expectedCount: 9,
  },
  "Útulok Trnava": {
    importKey: "help-org:pomoc-zdruzenie-na-ochranu-zvierat-trnava",
    slug: "pomoc-zdruzenie-na-ochranu-zvierat-trnava",
    name: "Združenie na ochranu zvierat Trnava",
    expectedCount: 7,
  },
  "OZ Pes v núdzi": {
    importKey: "help-org:pomoc-oz-pes-v-nudzi",
    slug: "pomoc-oz-pes-v-nudzi",
    name: "OZ Pes v núdzi",
    expectedCount: 4,
  },
} as const;

type SourceRow = {
  title: string; slug: string; excerpt: string; description: string | null; organization: string; dogName: string;
  breed: string | null; ageNote: string | null; sex: string; size: string | null; city: string; district: string | null;
  region: string; actionUrl: string | null; contactNote: string | null; imageUrl: string | null; sourceUrl: string | null;
  verifiedAt: number | string;
};

export type AdoptionMigrationManifest = {
  sourceWorkbook: string; verificationDate: string; readyCount: number; holdCount: number; holdSlugs: string[]; ready: SourceRow[];
};

export type LegacyAdoptionRow = {
  category: string; slug: string; status: string; excerpt?: string | null; description?: string | null;
  dogName?: string | null; breed?: string | null; imageUrl?: string | null;
};

export type CanonicalOrganizationRow = { id: number; importKey: string; slug: string; name: string };

export type AdoptionMigrationCandidate = NormalizedAdoptionInput & {
  organizationImportKey: string;
};

export function excelSerialToIsoDate(value: number) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Neplatný Excel serial dátumu: ${value}`);
  return new Date(Date.UTC(1899, 11, 30 + value)).toISOString();
}

function verificationInstant(value: number | string) {
  if (typeof value === "number") return excelSerialToIsoDate(value);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Neplatný dátum overenia: ${value}`);
  return parsed.toISOString();
}

export function transformAdoptionAge(ageNote: string | null, verifiedAt: number | string) {
  const text = ageNote?.trim() ?? "";
  const exact = text.match(/(?:nar\.\s*)?(\d{1,2})\.(\d{1,2})\.(\d{4})/i);
  if (exact) {
    const [, day, month, year] = exact;
    return { birthDate: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`, approximateAgeMonths: null };
  }
  const monthYear = text.match(/(?:nar\.|cca)\s*(\d{1,2})\/(\d{4})/i);
  if (monthYear) {
    const verified = new Date(verificationInstant(verifiedAt));
    const month = Number(monthYear[1]);
    const year = Number(monthYear[2]);
    return { birthDate: null, approximateAgeMonths: Math.max(0, (verified.getUTCFullYear() - year) * 12 + verified.getUTCMonth() - month + 1) };
  }
  const months = text.match(/(\d+)\s*mesiac/i);
  if (months) return { birthDate: null, approximateAgeMonths: Number(months[1]) };
  const years = text.match(/(\d+)\s*rok/i);
  if (years) return { birthDate: null, approximateAgeMonths: Number(years[1]) * 12 };
  throw new Error(`Vek nemožno bezpečne transformovať: ${text || "(prázdny)"}`);
}

export function transformAdoptionSex(value: string): AdoptionSex {
  if (value.trim().toLocaleLowerCase("sk") === "samec") return "MALE";
  if (value.trim().toLocaleLowerCase("sk") === "samica") return "FEMALE";
  throw new Error(`Pohlavie nemožno bezpečne transformovať: ${value}`);
}

export function transformAdoptionSize(value: string | null): AdoptionSize {
  const text = value?.trim().toLocaleLowerCase("sk") ?? "";
  if (!text) return "UNKNOWN";
  if (text.startsWith("mal")) return "SMALL";
  if (text.startsWith("stred")) return "MEDIUM";
  if (text.startsWith("veľ") || text.startsWith("vel")) return "LARGE";
  if (text.startsWith("obrov") || text.startsWith("gigant")) return "GIANT";
  return "UNKNOWN";
}

export function transformCurrentWeight(value: string | null) {
  const text = value?.trim() ?? "";
  if (!text || /odhad\s+v\s+dospelosti/i.test(text)) return null;
  const match = text.match(/(\d+(?:[,.]\d+)?)\s*kg/i);
  return match ? Number(match[1].replace(",", ".")) : null;
}

export function parseSafeAdoptionContacts(value: string | null) {
  const text = value?.trim() ?? "";
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0].toLowerCase() ?? null;
  const phone = text.match(/(?:\+421\s?|0)\d{3}(?:\s?\d{3}){2}/)?.[0] ?? null;
  return { email, phone };
}

function resolveOrganizations(rows: CanonicalOrganizationRow[]) {
  const resolved = new Map<string, CanonicalOrganizationRow>();
  for (const identity of Object.values(ADOPTION_ORGANIZATION_IDENTITIES)) {
    const matches = rows.filter((row) => row.importKey === identity.importKey);
    if (matches.length !== 1) throw new Error(`Canonical lookup ${identity.importKey} vrátil ${matches.length} rows; očakávaný je presne jeden.`);
    const [row] = matches;
    if (row.slug !== identity.slug || row.name !== identity.name) throw new Error(`Canonical identity conflict pre ${identity.importKey}.`);
    resolved.set(identity.importKey, row);
  }
  return resolved;
}

export function buildAdoptionMigrationCandidates(
  manifest: AdoptionMigrationManifest,
  legacyRows: LegacyAdoptionRow[],
  organizationRows: CanonicalOrganizationRow[],
) {
  if (manifest.readyCount !== 36 || manifest.ready.length !== 36 || manifest.holdCount !== 4) throw new Error("Manifest musí obsahovať presne 36 READY a 4 HOLD.");
  if (new Set(manifest.ready.map((row) => row.slug)).size !== 36) throw new Error("READY slugy nie sú unikátne.");
  const denylist = new Set(ADOPTION_HOLD_SLUGS);
  if (manifest.ready.some((row) => denylist.has(row.slug as typeof ADOPTION_HOLD_SLUGS[number]))) throw new Error("HOLD kandidát sa nachádza medzi READY.");
  if (new Set(manifest.holdSlugs).size !== 4 || ADOPTION_HOLD_SLUGS.some((slug) => !manifest.holdSlugs.includes(slug))) throw new Error("HOLD denylist nezodpovedá finálnemu datasetu.");

  const organizations = resolveOrganizations(organizationRows);
  return manifest.ready.map((source): AdoptionMigrationCandidate => {
    const legacyMatches = legacyRows.filter((row) => row.category === "adopcia" && row.slug === source.slug);
    if (legacyMatches.length !== 1) throw new Error(`Legacy exact match ${source.slug} vrátil ${legacyMatches.length} rows.`);
    const legacy = legacyMatches[0];
    if (legacy.status !== "published") throw new Error(`Legacy adopcia ${source.slug} nie je published.`);
    const identity = ADOPTION_ORGANIZATION_IDENTITIES[source.organization as keyof typeof ADOPTION_ORGANIZATION_IDENTITIES];
    if (!identity) throw new Error(`Neznáma organizácia v READY datasete: ${source.organization}`);
    const organization = organizations.get(identity.importKey)!;
    const age = transformAdoptionAge(source.ageNote, source.verifiedAt);
    const contacts = parseSafeAdoptionContacts(source.contactNote);
    const payload: ManagedAdoptionInput = {
      name: source.dogName,
      slug: source.slug,
      status: "DRAFT",
      sex: transformAdoptionSex(source.sex),
      ...age,
      size: transformAdoptionSize(source.size),
      weight: transformCurrentWeight(source.size),
      breedId: null,
      breedName: source.breed ?? legacy.breed ?? "",
      breedMix: /krížen/i.test(source.breed ?? legacy.breed ?? ""),
      region: source.region,
      district: source.district ?? "",
      city: source.city,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      mainImage: legacy.imageUrl ?? source.imageUrl,
      gallery: [],
      shortDescription: source.excerpt || legacy.excerpt || "",
      description: source.description ?? legacy.description ?? "",
      externalSourceUrl: source.sourceUrl,
      contactEmail: contacts.email,
      contactPhone: contacts.phone,
      contactUrl: source.actionUrl,
      lastVerifiedAt: verificationInstant(source.verifiedAt),
    };
    return { ...normalizeAdoptionInput(payload), organizationImportKey: identity.importKey };
  });
}

export function preflightAdoptionMigration(
  manifest: AdoptionMigrationManifest,
  legacyRows: LegacyAdoptionRow[],
  organizationRows: CanonicalOrganizationRow[],
  targetSlugs: string[],
) {
  const candidates = buildAdoptionMigrationCandidates(manifest, legacyRows, organizationRows);
  const collisions = candidates.filter((row) => targetSlugs.includes(row.slug)).map((row) => row.slug);
  if (collisions.length) throw new Error(`Target adoption slug collision: ${collisions.join(", ")}`);
  const distribution = Object.fromEntries(Object.values(ADOPTION_ORGANIZATION_IDENTITIES).map((identity) => [
    identity.importKey,
    candidates.filter((row) => row.organizationImportKey === identity.importKey).length,
  ]));
  for (const identity of Object.values(ADOPTION_ORGANIZATION_IDENTITIES)) {
    if (distribution[identity.importKey] !== identity.expectedCount) throw new Error(`Neplatná distribúcia pre ${identity.importKey}.`);
  }
  const publicationBlockers = candidates.flatMap((row) => adoptionPublicationErrors(row).map((message) => ({ slug: row.slug, message })));
  return {
    ready: candidates.length,
    hold: manifest.holdCount,
    uniqueReadySlugs: new Set(candidates.map((row) => row.slug)).size,
    legacyExactMatches: candidates.length,
    canonicalMappings: candidates.length,
    organizationIdentities: new Set(candidates.map((row) => row.organizationImportKey)).size,
    distribution,
    holdCandidatesImported: candidates.filter((row) => (ADOPTION_HOLD_SLUGS as readonly string[]).includes(row.slug)).length,
    collisions,
    publishable: candidates.length - new Set(publicationBlockers.map((item) => item.slug)).size,
    publicationBlockers,
    candidates,
  };
}
