import {
  canonicalizeSourceUrl,
  type AutomationEntityType,
  type AutomationSourceConfig,
} from "./data-automation.ts";

export type AutomationCandidateSourceMatchInput = {
  entityType: AutomationEntityType;
  canonicalUrl: string;
  sourceUrl: string;
  metadata?: Record<string, unknown>;
};

export type AutomationExistingSourceMatchInput = {
  id: number;
  entityType: AutomationEntityType;
  sourceUrl: string | null;
  config?: AutomationSourceConfig;
};

function sourceHostname(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizedDirectoryCategory(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function candidateDirectoryCategory(candidate: AutomationCandidateSourceMatchInput) {
  if (candidate.entityType !== "DIRECTORY") return "";
  return normalizedDirectoryCategory(candidate.metadata?.directoryCategory ?? candidate.metadata?.category);
}

function sourceDirectoryCategory(source: AutomationExistingSourceMatchInput) {
  if (source.entityType !== "DIRECTORY") return "";
  return normalizedDirectoryCategory(source.config?.staticFields?.category);
}

function directoryCategoryCompatible(
  candidate: AutomationCandidateSourceMatchInput,
  source: AutomationExistingSourceMatchInput,
) {
  const candidateCategory = candidateDirectoryCategory(candidate);
  if (!candidateCategory) return true;
  return sourceDirectoryCategory(source) === candidateCategory;
}

export function selectRelevantExistingSourceForCandidate<T extends AutomationExistingSourceMatchInput>(
  candidate: AutomationCandidateSourceMatchInput,
  sources: T[],
): T | null {
  const candidateUrl = canonicalizeSourceUrl(candidate.canonicalUrl || candidate.sourceUrl);
  if (!candidateUrl) return null;

  const sameEntity = sources.filter((source) =>
    source.entityType === candidate.entityType
    && directoryCategoryCompatible(candidate, source)
  );
  const exact = sameEntity.find((source) => canonicalizeSourceUrl(source.sourceUrl) === candidateUrl);
  if (exact) return exact;

  const candidateHost = sourceHostname(candidateUrl);
  if (!candidateHost) return null;
  const sameHost = sameEntity.filter((source) => sourceHostname(source.sourceUrl) === candidateHost);

  // Hostname matching is deliberately conservative: homepage vs canonical
  // subpath is reusable only when there is exactly one compatible source for
  // this entity type. DIRECTORY candidates additionally require the same fixed
  // canonical category so one company/domain cannot cross-reuse vet/grooming/etc.
  // Multiple compatible sources on one host remain human/technical review.
  return sameHost.length === 1 ? sameHost[0] : null;
}
