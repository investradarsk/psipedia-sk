import type { ArticlePortalSection } from "@/lib/portal";

export type ArticleAdminBulkFilter = {
  portalSection: ArticlePortalSection | "";
  status: "all" | "published" | "scheduled" | "draft";
  q: string;
};

function normalizeStatus(value: unknown): ArticleAdminBulkFilter["status"] {
  return value === "published" || value === "scheduled" || value === "draft"
    ? value
    : "all";
}

export function normalizeArticleAdminBulkFilter(raw: unknown): ArticleAdminBulkFilter {
  const filter = typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const portalSection = typeof filter.portalSection === "string" ? filter.portalSection : "";
  return {
    portalSection: portalSection as ArticleAdminBulkFilter["portalSection"],
    status: normalizeStatus(filter.status),
    q: typeof filter.q === "string" ? filter.q.trim().toLocaleLowerCase("sk").slice(0, 100) : "",
  };
}

export function articleAdminBulkFingerprint(filter: ArticleAdminBulkFilter) {
  const normalized = normalizeArticleAdminBulkFilter(filter);
  return JSON.stringify({
    portalSection: normalized.portalSection,
    status: normalized.status,
    q: normalized.q,
  });
}
