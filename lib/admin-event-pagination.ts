import { defaultEventFilters, normalizeEventSearch, type AdminEventFilters, type AdminEventSummary } from "./admin-events";
import { eventTypes, slovakRegions } from "./events";

export const ADMIN_EVENT_PAGE_SIZE = 50;
export const ADMIN_EVENT_MAX_PAGE_SIZE = 100;

export type AdminEventListQuery = {
  filters: AdminEventFilters;
  page: number;
  pageSize: number;
};

export type AdminEventPageCounts = {
  all: number;
  upcoming: number;
  current: number;
  past: number;
  published: number;
  draft: number;
  cancelled: number;
};

export type AdminEventPageResult = {
  events: AdminEventSummary[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  counts: AdminEventPageCounts;
  years: string[];
};

function positiveInteger(value: string | null, fallback: number, maximum: number) {
  if (!value || !/^[0-9]+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.max(1, Math.min(maximum, parsed)) : fallback;
}

export function parseAdminEventListQuery(params: URLSearchParams): AdminEventListQuery {
  const pick = (key: string, allowed: readonly string[], fallback: string) => {
    const value = params.get(key) ?? fallback;
    return allowed.includes(value) ? value : fallback;
  };
  return {
    page: positiveInteger(params.get("page"), 1, 1000000),
    pageSize: positiveInteger(params.get("pageSize"), ADMIN_EVENT_PAGE_SIZE, ADMIN_EVENT_MAX_PAGE_SIZE),
    filters: {
      query: (params.get("query") ?? "").slice(0, 160).trim(),
      time: pick("time", ["all", "upcoming", "current", "past", "cancelled"], "all"),
      status: pick("status", ["all", "published", "draft"], "all"),
      type: pick("type", ["", ...eventTypes], ""),
      region: pick("region", ["", ...slovakRegions], ""),
      month: pick("month", ["", ...Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"))], ""),
      year: /^\d{4}$/.test(params.get("year") ?? "") ? params.get("year")! : "",
      sort: pick("sort", ["date", "updated", "created", "title"], defaultEventFilters.sort),
    },
  };
}

export function adminEventListSearchParams(query: AdminEventListQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query.filters)) params.set(key, value);
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  return params;
}

// SQLite's stock lower()/LIKE do not fold Slovak accents. Fold the indexed
// result set in SQL so search covers EVERY record, never just the loaded page.
// No schema changes, triggers, shadow tables or production backfill required.
const accentPairs: [string, string][] = [
  ["á", "a"], ["ä", "a"], ["č", "c"], ["ď", "d"], ["é", "e"], ["í", "i"],
  ["ĺ", "l"], ["ľ", "l"], ["ň", "n"], ["ó", "o"], ["ô", "o"], ["ŕ", "r"],
  ["š", "s"], ["ť", "t"], ["ú", "u"], ["ý", "y"], ["ž", "z"],
];
const searchableFields = ["title", "city", "venue", "organizer", "event_type", "region", "slug"];
const joinedFields = searchableFields.map((field) => "COALESCE(" + field + ", '')").join(" || ' ' || ");
function foldSql(expression: string) {
  return "lower(" + accentPairs.reduce((sql, [accent, ascii]) =>
    "replace(replace(" + sql + ", '" + accent + "', '" + ascii + "'), '" + accent.toUpperCase() + "', '" + ascii + "')",
    expression,
  ) + ")";
}
const foldedFieldsSql = foldSql(joinedFields);
const endDateSql = "COALESCE(NULLIF(end_date, ''), start_date)";

export function buildAdminEventPageSql(input: AdminEventListQuery, today: string) {
  const filters = input.filters;
  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (filters.time === "cancelled") conditions.push("cancelled = 1");
  else if (filters.time !== "all") {
    conditions.push("cancelled = 0");
    if (filters.time === "upcoming") { conditions.push("start_date > ?"); values.push(today); }
    if (filters.time === "past") { conditions.push(endDateSql + " < ?"); values.push(today); }
    if (filters.time === "current") {
      conditions.push("start_date <= ? AND " + endDateSql + " >= ?");
      values.push(today, today);
    }
  }
  if (filters.status !== "all") { conditions.push("status = ?"); values.push(filters.status); }
  if (filters.type) { conditions.push("event_type = ?"); values.push(filters.type); }
  if (filters.region) { conditions.push("region = ?"); values.push(filters.region); }
  if (filters.month) { conditions.push("substr(start_date, 6, 2) = ?"); values.push(filters.month); }
  if (filters.year) { conditions.push("substr(start_date, 1, 4) = ?"); values.push(filters.year); }

  // Each search term must occur somewhere in the same record. instr() makes
  // underscores/percent signs literal (unlike LIKE patterns).
  const words = normalizeEventSearch(filters.query.slice(0, 160)).trim().split(/\s+/).filter(Boolean).slice(0, 16);
  for (const word of words) {
    conditions.push("instr(" + foldedFieldsSql + ", ?) > 0");
    values.push(word);
  }

  const where = conditions.length ? conditions.map((value) => "(" + value + ")").join(" AND ") : "1=1";
  let order: string;
  let orderValues: (string | number)[] = [];
  if (filters.sort === "title") order = foldSql("title") + " ASC, title COLLATE NOCASE ASC, id ASC";
  else if (filters.sort === "updated") order = "updated_at DESC, id ASC";
  else if (filters.sort === "created") order = "created_at DESC, id ASC";
  else {
    const rank = "CASE WHEN cancelled = 1 THEN 3 WHEN " + endDateSql + " < ? THEN 2 WHEN start_date > ? THEN 1 ELSE 0 END";
    order = rank + " ASC, " +
      "CASE WHEN cancelled = 0 AND " + endDateSql + " >= ? THEN start_date END ASC, " +
      "CASE WHEN cancelled = 1 OR " + endDateSql + " < ? THEN " + endDateSql + " END DESC, " +
      "start_time ASC, id ASC";
    orderValues = [today, today, today, today];
  }
  return { where, values, order, orderValues };
}

export const adminEventGlobalCountsSql = [
  "SELECT COUNT(*) AS all_count,",
  "SUM(CASE WHEN cancelled = 0 AND start_date > ? THEN 1 ELSE 0 END) AS upcoming,",
  "SUM(CASE WHEN cancelled = 0 AND start_date <= ? AND " + endDateSql + " >= ? THEN 1 ELSE 0 END) AS current,",
  "SUM(CASE WHEN cancelled = 0 AND " + endDateSql + " < ? THEN 1 ELSE 0 END) AS past,",
  "SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,",
  "SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft,",
  "SUM(CASE WHEN cancelled = 1 THEN 1 ELSE 0 END) AS cancelled",
  "FROM managed_events",
].join(" ");

export const adminEventYearsSql =
  "SELECT DISTINCT substr(start_date, 1, 4) AS year FROM managed_events " +
  "WHERE start_date GLOB '[0-9][0-9][0-9][0-9]-*' ORDER BY year ASC LIMIT 200";
