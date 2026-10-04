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

  const sameEntityType = sources.filter((source) => source.entityType === candidate.entityType);
  const exactSameEntity = sameEntityType.find((source) => canonicalizeSourceUrl(source.sourceUrl) === candidateUrl);
  if (exactSameEntity) {
    return directoryCategoryCompatible(candidate, exactSameEntity) ? exactSameEntity : null;
  }

  // Source identity is agenda + canonical source root (and, at runtime,
  // approved path scope), never hostname alone. One domain may expose multiple
  // independent feeds for the same agenda, so a different path must not reuse
  // an existing source merely because it shares the host.
  return null;
}
