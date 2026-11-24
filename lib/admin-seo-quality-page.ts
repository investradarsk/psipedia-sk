import { isSeoMetadataIssue, isSeoProfileAgenda, type AdminSeoIssueCode, type AdminSeoQualityItem } from "./admin-seo-quality-rules";

type FindingFilter = { scope: "all" | "quality" | "custom" | "metadata"; issue: string };
type AuditLinkState = { agenda: string; scope: string; issue: string; query: string };

export function auditHref(current: AuditLinkState, patch: Partial<AuditLinkState & { page: number }> = {}) {
  const next = { ...current, ...patch };
  const params = new URLSearchParams({ agenda: next.agenda, scope: next.scope, issue: next.issue });
  if (next.query) params.set("q", next.query);
  if (patch.page && patch.page > 1) params.set("page", String(patch.page));
  return `/admin/kvalita/seo?${params.toString()}`;
}

export function isSeoIssueInScope(code: AdminSeoIssueCode, scope: FindingFilter["scope"]) {
  const custom = code === "custom-title-missing" || code === "custom-description-missing";
  if (scope === "custom") return custom;
  if (scope === "quality") return !custom;
  if (scope === "metadata") return isSeoMetadataIssue(code);
  return true;
}

export function selectAdminSeoQualityPage(
  filtered: ReadonlyArray<AdminSeoQualityItem>,
  filters: FindingFilter,
  requestedPage: number,
  pageSize = 50,
) {
  const matchesVisibleFinding = (finding: AdminSeoQualityItem["findings"][number]) => {
    if (!isSeoIssueInScope(finding.code, filters.scope)) return false;
    if (filters.issue !== "all" && finding.code !== filters.issue) return false;
    return true;
  };
  const visible = filtered.filter((item) => item.findings.some(matchesVisibleFinding));
  let findingCount = 0;
  let profileCount = 0;
  let customGapEntities = 0;
  for (const item of visible) {
    const matching = item.findings.filter(matchesVisibleFinding);
    findingCount += matching.length;
    if (isSeoProfileAgenda(item.entity.agenda)) profileCount += 1;
    if (matching.some((finding) => finding.scope === "custom")) customGapEntities += 1;
  }
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const offset = (page - 1) * pageSize;
  return {
    total: visible.length,
    findingCount,
    profileCount,
    customGapEntities,
    totalPages,
    page,
    items: visible.slice(offset, offset + pageSize).map((item) => {
      const findings = item.findings.filter(matchesVisibleFinding);
      const customGapCount = findings.filter((finding) => finding.scope === "custom").length;
      return { ...item, findings, customGapCount, qualityFindingCount: findings.length - customGapCount };
    }),
  };
}
