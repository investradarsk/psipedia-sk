export const DIRECTORY_ADMIN_PAGE_SIZE = 50;
export type DirectoryAdminStatus = "all" | "published" | "draft";
export type DirectoryAdminMembershipFilters = { category: string; status: DirectoryAdminStatus; q: string };
export type DirectoryAdminFilters = DirectoryAdminMembershipFilters & { page: number };
export type DirectoryAdminCategoryOption = { readonly slug: string; readonly label: string };

type Statement = {
  bind(...values: (string | number)[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
};
type ReadDatabase = { prepare(sql: string): Statement };

type CountRow = { count: number };
type TotalsRow = { total: number; published: number; draft: number };

function firstParam(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function parseDirectoryAdminFilters(
  params: { get(name: string): string | null },
  isCategory: (value: string) => boolean,
): DirectoryAdminFilters {
  const rawCategory = firstParam(params.get("category"));
  const rawStatus = firstParam(params.get("status"));
  const rawPage = firstParam(params.get("page")) || "1";
  return {
    category: rawCategory && isCategory(rawCategory) ? rawCategory : "",
    status: rawStatus === "published" || rawStatus === "draft" ? rawStatus : "all",
    q: firstParam(params.get("q")).slice(0, 100),
    page: /^\d{1,9}$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1,
  };
}

export function directoryAdminMembershipFilters(filters: DirectoryAdminFilters): DirectoryAdminMembershipFilters {
  return { category: filters.category, status: filters.status, q: filters.q };
}

export function directoryAdminHref(filters: DirectoryAdminFilters) {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.q) params.set("q", filters.q);
  if (filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return `/admin/adresar${query ? `?${query}` : ""}`;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sk")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function sqlNormalizedExpression(columnExpression: string) {
  const replacements: Array<[string, string]> = [
    ["á", "a"], ["ä", "a"], ["č", "c"], ["ď", "d"], ["é", "e"], ["í", "i"],
    ["ĺ", "l"], ["ľ", "l"], ["ň", "n"], ["ó", "o"], ["ô", "o"], ["ŕ", "r"],
    ["š", "s"], ["ť", "t"], ["ú", "u"], ["ý", "y"], ["ž", "z"],
    ["Á", "a"], ["Ä", "a"], ["Č", "c"], ["Ď", "d"], ["É", "e"], ["Í", "i"],
    ["Ĺ", "l"], ["Ľ", "l"], ["Ň", "n"], ["Ó", "o"], ["Ô", "o"], ["Ŕ", "r"],
    ["Š", "s"], ["Ť", "t"], ["Ú", "u"], ["Ý", "y"], ["Ž", "z"],
  ];
  let expression = replacements.reduce((current, [from, to]) => `replace(${current}, '${from}', '${to}')`, `lower(${columnExpression})`);
  for (const punctuation of ["-", "/", "&", ".", ",", "(", ")", "[", "]", '"']) {
    const escaped = punctuation.replaceAll("'", "''");
    expression = `replace(${expression}, '${escaped}', ' ')`;
  }
  return expression;
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function adminSearchExpression(categories: readonly DirectoryAdminCategoryOption[]) {
  const categoryLabel = categories.length
    ? `CASE category ${categories.map((item) => `WHEN ${sqlLiteral(item.slug)} THEN ${sqlLiteral(item.label)}`).join(" ")} ELSE category END`
    : "category";
  return sqlNormalizedExpression(`coalesce(name, '') || ' ' || coalesce(city, '') || ' ' || coalesce(region, '') || ' ' || (${categoryLabel}) || ' ' || coalesce(services_json, '')`);
}

function normalizedMembership(filters: DirectoryAdminFilters) {
  return {
    category: filters.category.trim(),
    status: filters.status === "published" || filters.status === "draft" ? filters.status : "all" as DirectoryAdminStatus,
    q: filters.q.trim().slice(0, 100),
  };
}

export async function queryDirectoryAdmin<T>(
  database: ReadDatabase,
  filters: DirectoryAdminFilters,
  categories: readonly DirectoryAdminCategoryOption[],
  pageSize = DIRECTORY_ADMIN_PAGE_SIZE,
) {
  const membership = normalizedMembership(filters);
  const safePageSize = Math.max(1, Math.min(100, Math.trunc(pageSize)));
  const clauses: string[] = [];
  const args: (string | number)[] = [];
  if (membership.category) { clauses.push("category = ?"); args.push(membership.category); }
  if (membership.status !== "all") { clauses.push("status = ?"); args.push(membership.status); }
  if (membership.q) {
    const normalized = normalizeSearchText(membership.q);
    if (normalized) {
      clauses.push(`${adminSearchExpression(categories)} LIKE ?`);
      args.push(`%${normalized}%`);
    }
  }
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const categoryWhere = membership.category ? " WHERE category = ?" : "";
  const categoryArgs = membership.category ? [membership.category] : [];

  const totals = await database.prepare(`SELECT COUNT(*) AS total,
    COUNT(CASE WHEN status = 'published' THEN 1 END) AS published,
    COUNT(CASE WHEN status = 'draft' THEN 1 END) AS draft
    FROM directory_profiles${categoryWhere}`).bind(...categoryArgs).first<TotalsRow>();
  const count = await database.prepare(`SELECT COUNT(*) AS count FROM directory_profiles${where}`).bind(...args).first<CountRow>();
  const resultCount = Number(count?.count ?? 0);
  const pages = Math.max(1, Math.ceil(resultCount / safePageSize));
  const page = Math.min(Math.max(1, Math.trunc(filters.page || 1)), pages);
  const result = await database.prepare(`SELECT id, slug, name, category, status, services_json, city, district, region, image_url, verified, featured
    FROM directory_profiles${where} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`)
    .bind(...args, safePageSize, (page - 1) * safePageSize).all<T>();

  return {
    counts: totals ?? { total: 0, published: 0, draft: 0 },
    resultCount,
    page,
    pageSize: safePageSize,
    pages,
    items: result.results,
  };
}
