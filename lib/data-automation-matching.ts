import {
  canonicalizeSourceUrl,
  normalizeAutomationIdentity,
  type AutomationCanonicalMatch,
  type AutomationEntityType,
  type AutomationSourceRecord,
} from "./data-automation.ts";

export type AutomationMatchCandidate = {
  id: number;
  key: string;
  before: Record<string, unknown>;
  sourceId?: string | null;
  sourceUrl?: string | null;
  importKey?: string | null;
  slug?: string | null;
  name?: string | null;
  category?: string | null;
  date?: string | null;
  organizer?: string | null;
  city?: string | null;
  region?: string | null;
  registrationNumber?: string | null;
  type?: string | null;
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

function candidateMatch(
  entityType: AutomationEntityType,
  record: AutomationSourceRecord,
  candidate: AutomationMatchCandidate,
) {
  const proposed = record.proposed;
  const sourceId = clean(record.sourceRecordId);
  if (sourceId && clean(candidate.sourceId) === sourceId) return "EXACT_SOURCE_ID" as const;

  if (record.sourceUrl && sameUrl(record.sourceUrl, candidate.sourceUrl)) {
    return "EXACT_CANONICAL_KEY" as const;
  }

  const importKey = clean(proposed.importKey ?? proposed.import_key);
  if (importKey && clean(candidate.importKey) === importKey) return "EXACT_CANONICAL_KEY" as const;

  const slug = clean(proposed.slug);
  const category = clean(proposed.category);
  const type = clean(proposed.type);
  if (slug && clean(candidate.slug) === slug) {
    if (entityType === "DIRECTORY" && category && clean(candidate.category) !== category) return null;
    if (entityType === "LOST_FOUND" && type && clean(candidate.type) !== type) return null;
    return "EXACT_CANONICAL_KEY" as const;
  }

  if (entityType === "ORGANIZATION") {
    const registration = clean(proposed.registrationNumber ?? proposed.registration_number);
    if (registration && clean(candidate.registrationNumber) === registration) return "EXACT_CANONICAL_KEY" as const;
    if (
      sameIdentity(proposed.name, candidate.name)
      && sameIdentity(proposed.city, candidate.city)
      && sameIdentity(proposed.region, candidate.region)
    ) return "STRONG_IDENTITY" as const;
  }

  if (entityType === "EVENT") {
    const date = clean(proposed.startDate ?? proposed.start_date);
    if (
      sameIdentity(proposed.title, candidate.name)
      && date && date === clean(candidate.date)
      && sameIdentity(proposed.organizer, candidate.organizer)
    ) return "STRONG_IDENTITY" as const;
  }

  if (entityType === "DIRECTORY") {
    if (
      category && category === clean(candidate.category)
      && sameIdentity(proposed.name, candidate.name)
      && sameIdentity(proposed.city, candidate.city)
    ) return "STRONG_IDENTITY" as const;
  }

  if (entityType === "ADOPTION" || entityType === "FOSTER") {
    if (
      sameIdentity(proposed.name, candidate.name)
      && sameIdentity(proposed.organizationName ?? proposed.organization, candidate.organizer)
      && sameIdentity(proposed.city, candidate.city)
    ) return "STRONG_IDENTITY" as const;
  }

  return null;
}

export function selectSafeAutomationMatch(input: {
  entityType: AutomationEntityType;
  record: AutomationSourceRecord;
  candidates: AutomationMatchCandidate[];
}): AutomationCanonicalMatch {
  const ranked = input.candidates
    .map((candidate) => ({ candidate, quality: candidateMatch(input.entityType, input.record, candidate) }))
    .filter((entry): entry is { candidate: AutomationMatchCandidate; quality: NonNullable<ReturnType<typeof candidateMatch>> } => Boolean(entry.quality));

  const rank = { EXACT_SOURCE_ID: 0, EXACT_CANONICAL_KEY: 1, STRONG_IDENTITY: 2 } as const;
  ranked.sort((a, b) => rank[a.quality] - rank[b.quality] || a.candidate.id - b.candidate.id);
  if (!ranked.length) {
    return { entityType: input.entityType, entityId: null, entityKey: null, quality: "NONE", before: null };
  }

  const bestRank = rank[ranked[0].quality];
  const best = ranked.filter((entry) => rank[entry.quality] === bestRank);
  if (best.length !== 1) {
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
