import type { AdminSeoQualityItem } from "./admin-seo-quality-rules";

type FindingFilter = { scope: "all" | "quality" | "custom"; issue: string };

export function selectAdminSeoQualityPage(
  filtered: ReadonlyArray<AdminSeoQualityItem>,
  filters: FindingFilter,
  requestedPage: number,
  pageSize = 50,
) {
  const matchesVisibleFinding = (finding: AdminSeoQualityItem["findings"][number]) => {
    if (filters.scope === "quality" && finding.scope === "custom") return false;
    if (filters.scope === "custom" && finding.scope !== "custom") return false;
    if (filters.issue !== "all" && finding.code !== filters.issue) return false;
    return true;
  };
  const visible = filtered.filter((item) => item.findings.some(matchesVisibleFinding));
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const offset = (page - 1) * pageSize;
  return {
    total: visible.length,
    totalPages,
    page,
    items: visible.slice(offset, offset + pageSize).map((item) => ({
      ...item,
      findings: item.findings.filter(matchesVisibleFinding),
    })),
  };
}
