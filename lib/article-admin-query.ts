import { isArticlePortalSection, type ArticlePortalSection } from "./portal.ts";
import {
  adminContainsNeedle,
  boundedAdminPage,
  boundedAdminPageSize,
  sqlFoldAdminText,
} from "./admin-list-query.ts";

export const articleAdminStatuses = ["all", "published", "scheduled", "draft"] as const;
export const articleAdminSorts = ["updated", "title"] as const;
export const articleAdminDirections = ["asc", "desc"] as const;

export type ArticleAdminStatus = (typeof articleAdminStatuses)[number];
export type ArticleAdminSort = (typeof articleAdminSorts)[number];
export type ArticleAdminDirection = (typeof articleAdminDirections)[number];
export type ArticleAdminPortalSection = "all" | ArticlePortalSection;

export type ArticleAdminListFilters = {
  query: string;
  status: ArticleAdminStatus;
  portalSection: ArticleAdminPortalSection;
  sort: ArticleAdminSort;
  direction: ArticleAdminDirection;
  page: number;
  pageSize: number;
};

export function parseArticleAdminListFilters(params: { get(name: string): string | null }): ArticleAdminListFilters {
  const status = params.get("status") ?? "all";
  const section = params.get("section") ?? "all";
  const sort = params.get("sort") ?? "updated";
  const direction = params.get("direction") ?? "desc";
  return {
    query: (params.get("query") ?? params.get("q") ?? "").trim().slice(0, 120),
    status: (articleAdminStatuses as readonly string[]).includes(status) ? status as ArticleAdminStatus : "all",
    portalSection: section === "all" || isArticlePortalSection(section) ? section as ArticleAdminPortalSection : "all",
    sort: (articleAdminSorts as readonly string[]).includes(sort) ? sort as ArticleAdminSort : "updated",
    direction: (articleAdminDirections as readonly string[]).includes(direction) ? direction as ArticleAdminDirection : "desc",
    page: boundedAdminPage(params.get("page")),
    pageSize: boundedAdminPageSize(params.get("pageSize")),
  };
}

export function articleAdminListHref(
  basePath: string,
  filters: ArticleAdminListFilters,
  overrides: Partial<ArticleAdminListFilters> = {},
) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.query) params.set("query", next.query);
  if (next.status !== "all") params.set("status", next.status);
  if (next.portalSection !== "all") params.set("section", next.portalSection);
  if (next.sort !== "updated") params.set("sort", next.sort);
  if (next.direction !== "desc") params.set("direction", next.direction);
  if (next.pageSize !== 50) params.set("pageSize", String(next.pageSize));
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return `${basePath}${query ? `?${query}` : ""}`;
}

export function buildArticleAdminListQuery(
  filters: ArticleAdminListFilters,
  portalSection?: ArticlePortalSection,
) {
  const clauses: string[] = [];
  const bindings: Array<string | number> = [];
  if (portalSection) {
    clauses.push("portal_section = ?");
    bindings.push(portalSection);
  }
  if (filters.status !== "all") {
    clauses.push("status = ?");
    bindings.push(filters.status);
  }
  const needle = adminContainsNeedle(filters.query);
  if (needle) {
    const searchable = sqlFoldAdminText(
      "coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(excerpt, '') || ' ' || coalesce(category, '')",
    );
    clauses.push(`${searchable} LIKE ? ESCAPE '\\'`);
    bindings.push(needle);
  }
  const direction = filters.direction === "asc" ? "ASC" : "DESC";
  const orderBy = filters.sort === "title"
    ? `title COLLATE NOCASE ${direction}, id ${direction}`
    : `updated_at ${direction}, id ${direction}`;
  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    bindings,
    orderBy,
    page: filters.page,
    pageSize: filters.pageSize,
    offset: (filters.page - 1) * filters.pageSize,
  };
}
