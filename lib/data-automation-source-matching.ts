import {
  canonicalizeSourceUrl,
  type AutomationEntityType,
} from "./data-automation.ts";

export type AutomationCandidateSourceMatchInput = {
  entityType: AutomationEntityType;
  canonicalUrl: string;
  sourceUrl: string;
};

export type AutomationExistingSourceMatchInput = {
  id: number;
  entityType: AutomationEntityType;
  sourceUrl: string | null;
};

function sourceHostname(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function selectRelevantExistingSourceForCandidate<T extends AutomationExistingSourceMatchInput>(
  candidate: AutomationCandidateSourceMatchInput,
  sources: T[],
): T | null {
  const candidateUrl = canonicalizeSourceUrl(candidate.canonicalUrl || candidate.sourceUrl);
  if (!candidateUrl) return null;

  const sameEntity = sources.filter((source) => source.entityType === candidate.entityType);
  const exact = sameEntity.find((source) => canonicalizeSourceUrl(source.sourceUrl) === candidateUrl);
  if (exact) return exact;

  const candidateHost = sourceHostname(candidateUrl);
  if (!candidateHost) return null;
  const sameHost = sameEntity.filter((source) => sourceHostname(source.sourceUrl) === candidateHost);

  // Hostname matching is deliberately conservative: homepage vs canonical
  // subpath is reusable only when there is exactly one source for this entity
  // type. Multiple sources on one host remain human/technical review.
  return sameHost.length === 1 ? sameHost[0] : null;
}
