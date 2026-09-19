/** Read-only server-side queries and domain rules for the canonical generic Help admin. */
export const HELP_ADMIN_PAGE_SIZE = 50;
export const HELP_ADMIN_DEDICATED_CATEGORIES = ["adopcia", "utulky", "stratene-a-najdene"] as const;
export const HELP_ADMIN_CREATE_CATEGORIES = ["docasna-opatera", "zbierky", "dobrovolnictvo"] as const;
export const HELP_ADMIN_CATEGORIES = [...HELP_ADMIN_CREATE_CATEGORIES, "urgentne-pripady"] as const;

export type HelpAdminCategory = (typeof HELP_ADMIN_CATEGORIES)[number] | "all";
export type HelpAdminStatus = "all" | "published" | "draft";
export type HelpAdminUrgency = "all" | "urgent";
export type HelpAdminState = "all" | "current" | "resolved";
export type HelpAdminFilters = {
  category: HelpAdminCategory;
  status: HelpAdminStatus;
  urgent: HelpAdminUrgency;
  state: HelpAdminState;
  organization: string;
  location: string;
  q: string;
  page: number;
};

type Statement = { bind(...values: (string | number)[]): Statement; first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }> };
type ReadDatabase = { prepare(sql: string): Statement };

const DEDICATED_SQL = HELP_ADMIN_DEDICATED_CATEGORIES.map((value) => `'${value}'`).join(", ");
export function helpAdminDomainSql(column = "category") {
  return `${column} NOT IN (${DEDICATED_SQL})`;
}
export const HELP_ADMIN_DOMAIN_SQL = helpAdminDomainSql();

export function isHelpAdminDedicatedCategory(value: string) {
  return HELP_ADMIN_DEDICATED_CATEGORIES.some((category) => category === value);
}
export function isHelpAdminCreateCategory(value: string) {
  return HELP_ADMIN_CREATE_CATEGORIES.some((category) => category === value);
}
export function isHelpAdminManagedCategory(value: string) {
  return HELP_ADMIN_CATEGORIES.some((category) => category === value);
}

function limited(value: string | null, max = 120) {
  return (value ?? "").trim().slice(0, max);
}

export function parseHelpAdminFilters(params: { get(name: string): string | null }): HelpAdminFilters {
  const category = params.get("category") ?? "all";
  const status = params.get("status") ?? "all";
  const urgent = params.get("urgent") ?? "all";
  const state = params.get("state") ?? "all";
  const rawPage = params.get("page") ?? "1";
  return {
    category: isHelpAdminManagedCategory(category) ? category as HelpAdminCategory : "all",
    status: status === "published" || status === "draft" ? status : "all",
    urgent: urgent === "urgent" ? "urgent" : "all",
    state: state === "current" || state === "resolved" ? state : "all",
    organization: limited(params.get("organization")),
    location: limited(params.get("location")),
    q: limited(params.get("q")),
    page: /^\d{1,9}$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1,
  };
}

const SQL_FOLD_PAIRS = [
  ["Á", "A"], ["Ä", "A"], ["Č", "C"], ["Ď", "D"], ["É", "E"], ["Í", "I"], ["Ľ", "L"], ["Ĺ", "L"], ["Ň", "N"],
  ["Ó", "O"], ["Ô", "O"], ["Ŕ", "R"], ["Š", "S"], ["Ť", "T"], ["Ú", "U"], ["Ý", "Y"], ["Ž", "Z"],
  ["á", "a"], ["ä", "a"], ["č", "c"], ["ď", "d"], ["é", "e"], ["í", "i"], ["ľ", "l"], ["ĺ", "l"], ["ň", "n"],
  ["ó", "o"], ["ô", "o"], ["ŕ", "r"], ["š", "s"], ["ť", "t"], ["ú", "u"], ["ý", "y"], ["ž", "z"],
] as const;

export function foldHelpAdminText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("sk");
}

function foldedSql(expression: string) {
  const replaced = SQL_FOLD_PAIRS.reduce((current, [from, to]) => `replace(${current}, '${from}', '${to}')`, expression);
  return `lower(${replaced})`;
}

function likeNeedle(value: string) {
  const folded = foldHelpAdminText(value).replace(/[\\%_]/g, "\\$&");
  return `%${folded}%`;
}

export function buildHelpAdminWhere(filters: HelpAdminFilters) {
  const clauses: string[] = [HELP_ADMIN_DOMAIN_SQL];
  const args: string[] = [];
  if (filters.category !== "all") { clauses.push("category = ?"); args.push(filters.category); }
  if (filters.status !== "all") { clauses.push("status = ?"); args.push(filters.status); }
  if (filters.urgent === "urgent") clauses.push("urgent = 1 AND resolved = 0");
  if (filters.state === "current") clauses.push("resolved = 0");
  if (filters.state === "resolved") clauses.push("resolved = 1");
  if (filters.q) {
    const needle = likeNeedle(filters.q);
    clauses.push(`(${foldedSql("title")} LIKE ? ESCAPE '\\' OR ${foldedSql("dog_name")} LIKE ? ESCAPE '\\' OR ${foldedSql("organization")} LIKE ? ESCAPE '\\' OR ${foldedSql("city")} LIKE ? ESCAPE '\\')`);
    args.push(needle, needle, needle, needle);
  }
  if (filters.organization) {
    clauses.push(`${foldedSql("organization")} LIKE ? ESCAPE '\\'`);
    args.push(likeNeedle(filters.organization));
  }
  if (filters.location) {
    clauses.push(`${foldedSql("COALESCE(city, '') || ' ' || COALESCE(region, '') || ' ' || COALESCE(location_note, '')")} LIKE ? ESCAPE '\\'`);
    args.push(likeNeedle(filters.location));
  }
  return { where: ` WHERE ${clauses.join(" AND ")}`, args };
}

export async function queryHelpAdmin<T>(database: ReadDatabase, filters: HelpAdminFilters) {
  const totals = await database.prepare(`SELECT COUNT(*) AS total,
    COUNT(CASE WHEN status = 'published' THEN 1 END) AS published,
    COUNT(CASE WHEN status = 'draft' THEN 1 END) AS draft,
    COUNT(CASE WHEN urgent = 1 AND resolved = 0 THEN 1 END) AS urgent,
    COUNT(CASE WHEN resolved = 0 THEN 1 END) AS current,
    COUNT(CASE WHEN resolved = 1 THEN 1 END) AS resolved
    FROM help_cases
    WHERE ${HELP_ADMIN_DOMAIN_SQL}`).first<{ total: number; published: number; draft: number; urgent: number; current: number; resolved: number }>();
  const grouped = await database.prepare(`SELECT category, COUNT(*) AS count FROM help_cases WHERE ${HELP_ADMIN_DOMAIN_SQL} GROUP BY category`).all<{ category: string; count: number }>();
  const { where, args } = buildHelpAdminWhere(filters);
  const count = await database.prepare(`SELECT COUNT(*) AS count FROM help_cases${where}`).bind(...args).first<{ count: number }>();
  const resultCount = count?.count ?? 0;
  const pages = Math.max(1, Math.ceil(resultCount / HELP_ADMIN_PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const result = await database.prepare(`SELECT id, slug, title, category, status, organization, dog_name, city, image_url, verified, urgent, resolved
    FROM help_cases${where} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`)
    .bind(...args, HELP_ADMIN_PAGE_SIZE, (page - 1) * HELP_ADMIN_PAGE_SIZE).all<T>();
  return {
    totals: totals ?? { total: 0, published: 0, draft: 0, urgent: 0, current: 0, resolved: 0 },
    categoryCounts: Object.fromEntries(grouped.results.map((row) => [row.category, row.count])),
    resultCount,
    pages,
    page,
    items: result.results,
  };
}
