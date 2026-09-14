/** Read-only, server-side queries for the help_cases admin listing. */
export const HELP_ADMIN_PAGE_SIZE = 50;
export const HELP_ADMIN_CATEGORIES = ["adopcia", "utulky", "docasna-opatera", "zbierky", "dobrovolnictvo"] as const;
export type HelpAdminCategory = (typeof HELP_ADMIN_CATEGORIES)[number] | "all";
export type HelpAdminStatus = "all" | "published" | "draft";
export type HelpAdminFilters = { category: HelpAdminCategory; status: HelpAdminStatus; q: string; page: number };

type Statement = { bind(...values: (string | number)[]): Statement; first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }> };
type ReadDatabase = { prepare(sql: string): Statement };

export function parseHelpAdminFilters(params: { get(name: string): string | null }): HelpAdminFilters {
  const category = params.get("category") ?? "all";
  const status = params.get("status") ?? "all";
  const rawPage = params.get("page") ?? "1";
  return {
    category: HELP_ADMIN_CATEGORIES.some((value) => value === category) ? category as HelpAdminCategory : "all",
    status: status === "published" || status === "draft" ? status : "all",
    q: (params.get("q") ?? "").trim().slice(0, 120),
    page: /^\d{1,9}$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1,
  };
}

export function buildHelpAdminWhere(filters: HelpAdminFilters) {
  const clauses: string[] = [];
  const args: string[] = [];
  if (filters.category !== "all") { clauses.push("category = ?"); args.push(filters.category); }
  if (filters.status !== "all") { clauses.push("status = ?"); args.push(filters.status); }
  if (filters.q) {
    const needle = `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`;
    clauses.push("(title LIKE ? ESCAPE '\\' OR dog_name LIKE ? ESCAPE '\\' OR organization LIKE ? ESCAPE '\\' OR city LIKE ? ESCAPE '\\')");
    args.push(needle, needle, needle, needle);
  }
  return { where: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", args };
}

export async function queryHelpAdmin<T>(database: ReadDatabase, filters: HelpAdminFilters) {
  const totals = await database.prepare(`SELECT COUNT(*) AS total,
    COUNT(CASE WHEN status = 'published' THEN 1 END) AS published,
    COUNT(CASE WHEN status = 'draft' THEN 1 END) AS draft,
    COUNT(CASE WHEN status = 'published' AND urgent = 1 AND resolved = 0 THEN 1 END) AS urgent
    FROM help_cases`).first<{ total: number; published: number; draft: number; urgent: number }>();
  const grouped = await database.prepare("SELECT category, COUNT(*) AS count FROM help_cases GROUP BY category").all<{ category: string; count: number }>();
  const { where, args } = buildHelpAdminWhere(filters);
  const count = await database.prepare(`SELECT COUNT(*) AS count FROM help_cases${where}`).bind(...args).first<{ count: number }>();
  const resultCount = count?.count ?? 0;
  const pages = Math.max(1, Math.ceil(resultCount / HELP_ADMIN_PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const result = await database.prepare(`SELECT id, slug, title, category, status, organization, dog_name, city, image_url, verified, urgent, resolved
    FROM help_cases${where} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`)
    .bind(...args, HELP_ADMIN_PAGE_SIZE, (page - 1) * HELP_ADMIN_PAGE_SIZE).all<T>();
  return { totals: totals ?? { total: 0, published: 0, draft: 0, urgent: 0 }, categoryCounts: Object.fromEntries(grouped.results.map((row) => [row.category, row.count])), resultCount, pages, page, items: result.results };
}
