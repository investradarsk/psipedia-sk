export const DIRECTORY_ADMIN_PAGE_SIZE = 50;
export type DirectoryAdminStatus = "all" | "published" | "draft";
export type DirectoryAdminVerification = "all" | "verified" | "unverified";
export type DirectoryAdminMedia = "all" | "with-image" | "without-image";
export type DirectoryAdminMembershipFilters = {
  category: string;
  status: DirectoryAdminStatus;
  q: string;
  region: string;
  district: string;
  city: string;
  verification: DirectoryAdminVerification;
  media: DirectoryAdminMedia;
};
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
    region: firstParam(params.get("region")).slice(0, 80),
    district: firstParam(params.get("district")).slice(0, 100),
    city: firstParam(params.get("city")).slice(0, 120),
    verification: firstParam(params.get("verification")) === "verified"
      ? "verified"
      : firstParam(params.get("verification")) === "unverified" ? "unverified" : "all",
    media: firstParam(params.get("media")) === "with-image"
      ? "with-image"
      : firstParam(params.get("media")) === "without-image" ? "without-image" : "all",
    page: /^\d{1,9}$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1,
  };
}

export function directoryAdminMembershipFilters(filters: DirectoryAdminFilters): DirectoryAdminMembershipFilters {
  return {
    category: filters.category,
    status: filters.status,
    q: filters.q,
    region: filters.region,
    district: filters.district,
    city: filters.city,
    verification: filters.verification,
    media: filters.media,
  };
}

export function normalizeDirectoryAdminMembershipFilters(
  filters: DirectoryAdminMembershipFilters,
): DirectoryAdminMembershipFilters {
  return {
    category: filters.category.trim(),
    status: filters.status === "published" || filters.status === "draft" ? filters.status : "all",
    q: filters.q.trim().slice(0, 100),
    region: filters.region.trim().slice(0, 80),
    district: filters.district.trim().slice(0, 100),
    city: filters.city.trim().slice(0, 120),
    verification: filters.verification === "verified" || filters.verification === "unverified" ? filters.verification : "all",
    media: filters.media === "with-image" || filters.media === "without-image" ? filters.media : "all",
  };
}

export function directoryAdminMembershipFingerprint(filters: DirectoryAdminMembershipFilters) {
  const normalized = normalizeDirectoryAdminMembershipFilters(filters);
  const params = new URLSearchParams();
  params.set("category", normalized.category);
  params.set("status", normalized.status);
  params.set("q", normalized.q);
  params.set("region", normalized.region);
  params.set("district", normalized.district);
  params.set("city", normalized.city);
  params.set("verification", normalized.verification);
  params.set("media", normalized.media);
  return `directory:v2:${params.toString()}`;
}

export function directoryAdminHref(filters: DirectoryAdminFilters) {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.q) params.set("q", filters.q);
  if (filters.region) params.set("region", filters.region);
  if (filters.district) params.set("district", filters.district);
  if (filters.city) params.set("city", filters.city);
  if (filters.verification !== "all") params.set("verification", filters.verification);
  if (filters.media !== "all") params.set("media", filters.media);
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
  return sqlNormalizedExpression(`coalesce(name, '') || ' ' || coalesce(city, '') || ' ' || coalesce(district, '') || ' ' || coalesce(region, '') || ' ' || (${categoryLabel}) || ' ' || coalesce(services_json, '')`);
}

export function directoryAdminMembershipQuery(
  filters: DirectoryAdminMembershipFilters,
  categories: readonly DirectoryAdminCategoryOption[],
) {
  const membership = normalizeDirectoryAdminMembershipFilters(filters);
  const clauses: string[] = [];
  const args: (string | number)[] = [];
  if (membership.category) { clauses.push("category = ?"); args.push(membership.category); }
  if (membership.status !== "all") { clauses.push("status = ?"); args.push(membership.status); }
  if (membership.region) { clauses.push("region = ?"); args.push(membership.region); }
  if (membership.district) { clauses.push("district = ?"); args.push(membership.district); }
  if (membership.city) { clauses.push("city = ?"); args.push(membership.city); }
  if (membership.verification !== "all") {
    clauses.push("verified = ?");
    args.push(membership.verification === "verified" ? 1 : 0);
  }
  if (membership.media === "with-image") clauses.push("coalesce(trim(image_url), '') <> ''");
  if (membership.media === "without-image") clauses.push("coalesce(trim(image_url), '') = ''");
  if (membership.q) {
    const normalized = normalizeSearchText(membership.q);
    if (normalized) {
      clauses.push(`${adminSearchExpression(categories)} LIKE ?`);
      args.push(`%${normalized}%`);
    }
  }
  return {
    membership,
    where: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "",
    args,
  };
}

export async function queryDirectoryAdmin<T>(
  database: ReadDatabase,
  filters: DirectoryAdminFilters,
  categories: readonly DirectoryAdminCategoryOption[],
  pageSize = DIRECTORY_ADMIN_PAGE_SIZE,
) {
  const membershipQuery = directoryAdminMembershipQuery(directoryAdminMembershipFilters(filters), categories);
  const membership = membershipQuery.membership;
  const safePageSize = Math.max(1, Math.min(100, Math.trunc(pageSize)));
  const categoryWhere = membership.category ? " WHERE category = ?" : "";
  const categoryArgs = membership.category ? [membership.category] : [];

  const totals = await database.prepare(`SELECT COUNT(*) AS total,
    COUNT(CASE WHEN status = 'published' THEN 1 END) AS published,
    COUNT(CASE WHEN status = 'draft' THEN 1 END) AS draft
    FROM directory_profiles${categoryWhere}`).bind(...categoryArgs).first<TotalsRow>();
  const count = await database.prepare(`SELECT COUNT(*) AS count FROM directory_profiles${membershipQuery.where}`).bind(...membershipQuery.args).first<CountRow>();
  const resultCount = Number(count?.count ?? 0);
  const pages = Math.max(1, Math.ceil(resultCount / safePageSize));
  const page = Math.min(Math.max(1, Math.trunc(filters.page || 1)), pages);
  const result = await database.prepare(`SELECT id, slug, name, category, status, services_json, city, district, region, image_url, verified, featured, updated_at
    FROM directory_profiles${membershipQuery.where} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`)
    .bind(...membershipQuery.args, safePageSize, (page - 1) * safePageSize).all<T>();
  const [regions, districts, cities] = await Promise.all([
    database.prepare("SELECT DISTINCT region AS value FROM directory_profiles WHERE trim(region) <> '' ORDER BY region").all<{ value: string }>(),
    database.prepare("SELECT DISTINCT district AS value FROM directory_profiles WHERE trim(district) <> '' ORDER BY district").all<{ value: string }>(),
    database.prepare("SELECT DISTINCT city AS value FROM directory_profiles WHERE trim(city) <> '' ORDER BY city").all<{ value: string }>(),
  ]);
  const values = (rows: { results: Array<{ value: string }> }) =>
    rows.results.map((row) => row.value?.trim()).filter((value): value is string => Boolean(value));

  return {
    counts: totals ?? { total: 0, published: 0, draft: 0 },
    resultCount,
    page,
    pageSize: safePageSize,
    pages,
    items: result.results,
    options: {
      regions: values(regions),
      districts: values(districts),
      cities: values(cities),
    },
  };
}
