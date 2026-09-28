export type SitemapParityCandidate = {
  slug?: string | null;
  url?: string | null;
  indexable: boolean;
  validStatus: boolean;
  exclusionReason?: string | null;
};

export type SitemapParityReport = {
  entityType: string;
  sourceCount: number;
  indexableCanonicalCount: number;
  sitemapUrlCount: number;
  duplicateUrlCount: number;
  missingSlugCount: number;
  invalidStatusCount: number;
  unexplainedExclusionCount: number;
  missingUrls: string[];
  extraUrls: string[];
};

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

export function inspectSitemapEntityParity(
  entityType: string,
  candidates: SitemapParityCandidate[],
  sitemapUrls: string[],
): SitemapParityReport {
  const missingSlugCount = candidates.filter(
    (candidate) => candidate.indexable && candidate.validStatus && !candidate.slug?.trim(),
  ).length;
  const invalidStatusCount = candidates.filter(
    (candidate) => candidate.indexable && !candidate.validStatus,
  ).length;
  const unexplainedExclusionCount = candidates.filter(
    (candidate) => !candidate.indexable && !candidate.exclusionReason?.trim(),
  ).length;

  const expectedUrls = candidates.flatMap((candidate) => {
    if (!candidate.indexable || !candidate.validStatus || !candidate.slug?.trim()) return [];
    const url = candidate.url?.trim();
    return url ? [url] : [];
  });
  const actualUrls = sitemapUrls.map((url) => url.trim()).filter(Boolean);
  const expectedSet = new Set(expectedUrls);
  const actualSet = new Set(actualUrls);

  return {
    entityType,
    sourceCount: candidates.length,
    indexableCanonicalCount: expectedUrls.length,
    sitemapUrlCount: actualUrls.length,
    duplicateUrlCount: duplicateValues(actualUrls).length + duplicateValues(expectedUrls).length,
    missingSlugCount,
    invalidStatusCount,
    unexplainedExclusionCount,
    missingUrls: [...expectedSet].filter((url) => !actualSet.has(url)).sort(),
    extraUrls: [...actualSet].filter((url) => !expectedSet.has(url)).sort(),
  };
}

export function assertSitemapEntityParity(
  entityType: string,
  candidates: SitemapParityCandidate[],
  sitemapUrls: string[],
) {
  const report = inspectSitemapEntityParity(entityType, candidates, sitemapUrls);
  const invalid =
    report.duplicateUrlCount > 0 ||
    report.missingSlugCount > 0 ||
    report.invalidStatusCount > 0 ||
    report.unexplainedExclusionCount > 0 ||
    report.missingUrls.length > 0 ||
    report.extraUrls.length > 0 ||
    report.indexableCanonicalCount !== report.sitemapUrlCount;

  if (invalid) {
    throw new Error(`sitemap-parity:${entityType}:${JSON.stringify(report)}`);
  }

  return report;
}
