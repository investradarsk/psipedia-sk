import { env } from "cloudflare:workers";
import { getDirectoryCategory } from "@/lib/directory";
import { getHelpCategory } from "@/lib/help";
import { portalSections, portalSubpageHref } from "@/lib/portal";
import {
  SEARCH_MAX_PAGE,
  SEARCH_MAX_VISIBLE_RESULTS,
  SEARCH_PAGE_SIZE,
  applyPortalSearchFilterOverrides,
  normalizePortalSearch,
  parsePortalSearchQuery,
  scorePortalSearchItem,
  stablePortalSearchSort,
  type ParsedPortalSearchQuery,
  type PortalSearchFilterOverrides,
  type PortalSearchRankable,
} from "@/lib/portal-search-query";

export { normalizePortalSearch, parsePortalSearchQuery } from "@/lib/portal-search-query";

export type PortalSearchItem = {
  href: string;
  title: string;
  type: string;
  description: string;
  keywords: string;
  score: number;
  kind: PortalSearchRankable["kind"];
  category?: string;
  city?: string;
  district?: string;
  region?: string;
  services?: string;
  publishedAt?: string;
  imageUrl?: string;
  newsCategory?: string;
};

export type PortalSearchResultPage = {
  items: PortalSearchItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  capped: boolean;
  parsed: ParsedPortalSearchQuery;
};

type RuntimeBindings = { DB?: D1Database };
type SearchRow = {
  href: string;
  title: string;
  type: string;
  description: string;
  keywords: string;
  kind: PortalSearchRankable["kind"];
  category: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  services: string | null;
  published_at?: string | null;
  image_url?: string | null;
  news_category?: string | null;
  source_total: number;
};

type QuerySpec = { sql: string; bindings: unknown[] };

const DIACRITIC_REPLACEMENTS = [
  ["Á", "A"], ["Ä", "A"], ["Č", "C"], ["Ď", "D"], ["É", "E"], ["Í", "I"], ["Ĺ", "L"], ["Ľ", "L"],
  ["Ň", "N"], ["Ó", "O"], ["Ô", "O"], ["Ŕ", "R"], ["Š", "S"], ["Ť", "T"], ["Ú", "U"], ["Ý", "Y"], ["Ž", "Z"],
  ["á", "a"], ["ä", "a"], ["č", "c"], ["ď", "d"], ["é", "e"], ["í", "i"], ["ĺ", "l"], ["ľ", "l"],
  ["ň", "n"], ["ó", "o"], ["ô", "o"], ["ŕ", "r"], ["š", "s"], ["ť", "t"], ["ú", "u"], ["ý", "y"], ["ž", "z"],
] as const;

function database() {
  const db = (env as unknown as RuntimeBindings).DB;
  return db && typeof db.prepare === "function" ? db : null;
}

function normalizedSql(expression: string) {
  let sql = `CAST(COALESCE(${expression}, '') AS TEXT)`;
  for (const [from, to] of DIACRITIC_REPLACEMENTS) sql = `replace(${sql}, '${from}', '${to}')`;
  for (const symbol of ["-", ".", ",", "/", "(", ")", ":", ";"]) sql = `replace(${sql}, '${symbol}', ' ')`;
  return `lower(trim(${sql}))`;
}

function tokenClauses(expression: string, tokens: string[], bindings: unknown[]) {
  if (!tokens.length) return [];
  const normalized = normalizedSql(expression);
  return tokens.map((token) => {
    bindings.push(`%${token}%`);
    return `${normalized} LIKE ?`;
  });
}

function persistedTokenClauses(searchExpression: string, fallbackExpression: string, tokens: string[], bindings: unknown[]) {
  if (!tokens.length) return [];
  const fallback = normalizedSql(fallbackExpression);
  return tokens.map((token) => {
    const pattern = `%${token}%`;
    bindings.push(pattern, pattern);
    return `(${searchExpression} LIKE ? OR ${fallback} LIKE ?)`;
  });
}

function exactTitleOrder(titleExpression: string, parsed: ParsedPortalSearchQuery, bindings: unknown[]) {
  bindings.push(parsed.normalized);
  return `CASE WHEN ${normalizedSql(titleExpression)} = ? THEN 0 ELSE 1 END`;
}

function titlePrefixOrder(titleExpression: string, parsed: ParsedPortalSearchQuery, bindings: unknown[]) {
  bindings.push(`${parsed.normalized}%`);
  return `CASE WHEN ${normalizedSql(titleExpression)} LIKE ? THEN 0 ELSE 1 END`;
}

function locationOrder(
  parsed: ParsedPortalSearchQuery,
  bindings: unknown[],
  fields: { city: string; district?: string; region: string },
) {
  const location = parsed.location;
  if (!location) return "0 + 0";
  const cases: string[] = [];
  let rank = 0;
  if (location.level === "city" && location.city) {
    const city = normalizePortalSearch(location.city);
    bindings.push(city, `${city} %`);
    const citySql = normalizedSql(fields.city);
    cases.push(`WHEN ${citySql} = ? OR ${citySql} LIKE ? THEN ${rank}`);
    rank += 1;
  }
  if (location.district && fields.district) {
    bindings.push(normalizePortalSearch(location.district));
    cases.push(`WHEN ${normalizedSql(fields.district)} = ? THEN ${rank}`);
    rank += 1;
  }
  if (location.region) {
    bindings.push(normalizePortalSearch(location.region));
    cases.push(`WHEN ${normalizedSql(fields.region)} = ? THEN ${rank}`);
    rank += 1;
  }
  return cases.length ? `CASE ${cases.join(" ")} ELSE ${rank} END` : "0 + 0";
}

function tokenMatchOrder(expression: string, tokens: string[], bindings: unknown[]) {
  if (!tokens.length) return "0 + 0";
  const normalized = normalizedSql(expression);
  const clauses = tokens.map((token) => {
    bindings.push(`%${token}%`);
    return `${normalized} LIKE ?`;
  });
  return `CASE WHEN ${clauses.join(" AND ")} THEN 0 ELSE 1 END`;
}

function addLocationWhere(
  clauses: string[],
  bindings: unknown[],
  parsed: ParsedPortalSearchQuery,
  fields: { city: string; district?: string; region: string },
) {
  const location = parsed.location;
  if (!location) return;
  const alternatives: string[] = [];
  if (location.level === "city") {
    const city = normalizePortalSearch(location.city);
    const citySql = normalizedSql(fields.city);
    bindings.push(city, `${city} %`);
    alternatives.push(`${citySql} = ?`, `${citySql} LIKE ?`);
  }
  if ((location.level === "city" || location.level === "district") && location.district && fields.district) {
    bindings.push(normalizePortalSearch(location.district));
    alternatives.push(`${normalizedSql(fields.district)} = ?`);
  }
  if (location.region) {
    bindings.push(normalizePortalSearch(location.region));
    alternatives.push(`${normalizedSql(fields.region)} = ?`);
  }
  if (alternatives.length) clauses.push(`(${alternatives.join(" OR ")})`);
}

function selectWithWindow(columns: string, from: string, clauses: string[], orderBy: string, limit: number) {
  return `SELECT ${columns}, COUNT(*) OVER() AS source_total
    FROM ${from}
    WHERE ${clauses.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT ${limit}`;
}

function directoryQuery(parsed: ParsedPortalSearchQuery, limit: number): QuerySpec | null {
  const bindings: unknown[] = [];
  const clauses = ["p.status = 'published'", "p.archived_at IS NULL"];
  if (parsed.directoryCategory) {
    clauses.push("p.category = ?");
    bindings.push(parsed.directoryCategory);
  }
  addLocationWhere(clauses, bindings, parsed, {
    city: "p.city",
    district: `COALESCE(NULLIF(p.district, ''), json_extract(p.source_data_json, '$."Okres"'), '')`,
    region: "p.region",
  });
  const tokens = parsed.directoryCategory ? parsed.residualTokens : parsed.contentTokens;
  if (!parsed.directoryCategory && !tokens.length) return null;
  clauses.push(...persistedTokenClauses(
    "p.search_text",
    `p.name || ' ' || p.excerpt || ' ' || p.description || ' ' || p.services_json || ' ' || p.city || ' ' || p.district || ' ' || p.region || ' ' || p.address`,
    tokens,
    bindings,
  ));
  const exactOrder = exactTitleOrder("p.name", parsed, bindings);
  const localityOrder = locationOrder(parsed, bindings, {
    city: "p.city",
    district: `COALESCE(NULLIF(p.district, ''), json_extract(p.source_data_json, '$."Okres"'), '')`,
    region: "p.region",
  });
  const prefixOrder = titlePrefixOrder("p.name", parsed, bindings);
  const serviceOrder = tokenMatchOrder("p.services_json", parsed.residualTokens, bindings);
  const columns = `'/adresar/' || p.category || '/' || p.slug AS href,
    p.name AS title,
    CASE WHEN p.category = 'veterinari' THEN 'Veterinár'
         WHEN p.category = 'treneri' THEN 'Psí tréner'
         ELSE 'Služba pre psov' END AS type,
    p.excerpt AS description,
    p.category || ' ' || p.services_json || ' ' || p.city || ' ' || p.district || ' ' || p.region AS keywords,
    'directory' AS kind, p.category AS category, p.city AS city,
    COALESCE(NULLIF(p.district, ''), json_extract(p.source_data_json, '$."Okres"'), '') AS district,
    p.region AS region, p.services_json AS services`;
  return {
    sql: selectWithWindow(columns, "directory_profiles p", clauses, `${exactOrder}, ${localityOrder}, ${prefixOrder}, ${serviceOrder}, p.name COLLATE NOCASE ASC, p.category ASC, p.slug ASC`, limit),
    bindings,
  };
}

function articleQuery(parsed: ParsedPortalSearchQuery, limit: number, section: string): QuerySpec | null {
  const tokens = parsed.contentTokens;
  if (!tokens.length) return null;
  const bindings: unknown[] = [new Date().toISOString()];
  const clauses = ["(a.status = 'published' OR (a.status = 'scheduled' AND a.published_at <= ?))"];
  if (section) {
    clauses.push("a.portal_section = ?");
    bindings.push(section);
  }
  clauses.push(...tokenClauses(
    `a.title || ' ' || a.excerpt || ' ' || a.intro || ' ' || a.focus_keyword || ' ' || a.category`,
    tokens,
    bindings,
  ));
  const exactOrder = exactTitleOrder("a.title", parsed, bindings);
  const prefixOrder = titlePrefixOrder("a.title", parsed, bindings);
  const columns = `CASE WHEN a.portal_section = 'clanky' THEN '/clanky/' || a.slug ELSE '/' || a.portal_section || '/' || a.slug END AS href,
    a.title AS title,
    CASE WHEN a.portal_section = 'novinky' THEN 'Novinka' ELSE 'Článok' END AS type,
    a.excerpt AS description,
    a.category || ' ' || a.focus_keyword || ' ' || a.portal_section AS keywords,
    'article' AS kind, a.category AS category, '' AS city, '' AS district, '' AS region, '' AS services,
    a.published_at AS published_at, a.image_url AS image_url, a.news_category AS news_category`;
  return {
    sql: selectWithWindow(columns, "managed_articles a", clauses, `${exactOrder}, ${prefixOrder}, a.title COLLATE NOCASE ASC, a.slug ASC`, limit),
    bindings,
  };
}

function breedQuery(parsed: ParsedPortalSearchQuery, limit: number): QuerySpec | null {
  const tokens = parsed.contentTokens;
  if (!tokens.length) return null;
  const bindings: unknown[] = [];
  const clauses = ["b.status = 'published'"];
  clauses.push(...persistedTokenClauses(
    "b.search_text",
    `b.name || ' ' || b.official_fci_name || ' ' || b.group_name || ' ' || b.fci_section || ' ' || b.origin || ' ' || b.intro`,
    tokens,
    bindings,
  ));
  const exactOrder = exactTitleOrder("b.name", parsed, bindings);
  const prefixOrder = titlePrefixOrder("b.name", parsed, bindings);
  const columns = `'/plemena/' || b.slug AS href, b.name AS title, 'Plemeno' AS type,
    b.intro AS description,
    b.official_fci_name || ' ' || b.group_name || ' ' || b.fci_section || ' ' || b.origin AS keywords,
    'breed' AS kind, '' AS category, '' AS city, '' AS district, '' AS region, '' AS services`;
  return { sql: selectWithWindow(columns, "managed_breeds b", clauses, `${exactOrder}, ${prefixOrder}, b.name COLLATE NOCASE ASC, b.slug ASC`, limit), bindings };
}

function eventQuery(parsed: ParsedPortalSearchQuery, limit: number): QuerySpec | null {
  const bindings: unknown[] = [];
  const clauses = ["e.status = 'published'"];
  if (parsed.eventType) {
    clauses.push("e.event_type = ?");
    bindings.push(parsed.eventType);
  }
  addLocationWhere(clauses, bindings, parsed, { city: "e.city", region: "e.region" });
  const tokens = parsed.eventType ? parsed.residualTokens : parsed.contentTokens;
  clauses.push(...tokenClauses(
    `e.title || ' ' || e.excerpt || ' ' || e.event_type || ' ' || e.organizer || ' ' || e.venue || ' ' || e.city || ' ' || e.region`,
    tokens,
    bindings,
  ));
  if (!parsed.eventType && !tokens.length) return null;
  const exactOrder = exactTitleOrder("e.title", parsed, bindings);
  const localityOrder = locationOrder(parsed, bindings, { city: "e.city", region: "e.region" });
  const prefixOrder = titlePrefixOrder("e.title", parsed, bindings);
  const columns = `'/podujatia/' || e.slug AS href, e.title AS title, 'Podujatie' AS type,
    e.excerpt AS description,
    e.event_type || ' ' || e.organizer || ' ' || e.venue || ' ' || e.start_date AS keywords,
    'event' AS kind, e.event_type AS category, e.city AS city, '' AS district, e.region AS region, '' AS services`;
  return { sql: selectWithWindow(columns, "managed_events e", clauses, `${exactOrder}, ${localityOrder}, ${prefixOrder}, e.title COLLATE NOCASE ASC, e.slug ASC`, limit), bindings };
}

function organizationLocationExpression(field: "city" | "district" | "region") {
  return `COALESCE((SELECT l.${field} FROM organization_locations l WHERE l.organization_id = o.id ORDER BY l.is_primary DESC, l.sort_order ASC, l.id ASC LIMIT 1), o.${field})`;
}

function organizationQuery(parsed: ParsedPortalSearchQuery, limit: number): QuerySpec | null {
  const tokens = parsed.entityIntent === "organization" ? parsed.residualTokens : parsed.contentTokens;
  if (!tokens.length && parsed.entityIntent !== "organization") return null;
  const bindings: unknown[] = [];
  const clauses = ["o.status = 'PUBLISHED'", "o.published_at IS NOT NULL", "o.archived_at IS NULL"];
  const city = organizationLocationExpression("city");
  const district = organizationLocationExpression("district");
  const region = organizationLocationExpression("region");
  addLocationWhere(clauses, bindings, parsed, { city, district, region });
  clauses.push(...tokenClauses(
    `o.name || ' ' || o.short_description || ' ' || o.description || ' ' || o.type || ' ' || ${city} || ' ' || ${district} || ' ' || ${region}`,
    tokens,
    bindings,
  ));
  const exactOrder = exactTitleOrder("o.name", parsed, bindings);
  const prefixOrder = titlePrefixOrder("o.name", parsed, bindings);
  const columns = `'/organizacie/' || o.slug AS href, o.name AS title, 'Organizácia' AS type,
    o.short_description AS description,
    o.type || ' ' || ${city} || ' ' || ${district} || ' ' || ${region} AS keywords,
    'organization' AS kind, o.type AS category, ${city} AS city, ${district} AS district, ${region} AS region, '' AS services`;
  return { sql: selectWithWindow(columns, "help_organizations o", clauses, `${exactOrder}, ${prefixOrder}, o.name COLLATE NOCASE ASC, o.slug ASC`, limit), bindings };
}

function adoptionQuery(parsed: ParsedPortalSearchQuery, limit: number): QuerySpec | null {
  const tokens = parsed.entityIntent === "adoption" ? parsed.residualTokens : parsed.contentTokens;
  if (!tokens.length && parsed.entityIntent !== "adoption") return null;
  const bindings: unknown[] = [];
  const clauses = ["d.status IN ('ACTIVE','RESERVED')"];
  addLocationWhere(clauses, bindings, parsed, { city: "d.city", district: "d.district", region: "d.region" });
  clauses.push(...persistedTokenClauses(
    "d.search_text",
    `d.name || ' ' || d.breed_name || ' ' || d.organization_name || ' ' || d.short_description || ' ' || d.description || ' ' || d.city || ' ' || d.district || ' ' || d.region`,
    tokens,
    bindings,
  ));
  const exactOrder = exactTitleOrder("d.name", parsed, bindings);
  const prefixOrder = titlePrefixOrder("d.name", parsed, bindings);
  const columns = `'/pomoc-psom/adopcia/' || d.slug AS href, d.name AS title, 'Pes na adopciu' AS type,
    d.short_description AS description,
    d.breed_name || ' ' || d.organization_name || ' ' || d.city || ' ' || d.district || ' ' || d.region AS keywords,
    'adoption' AS kind, 'adopcia' AS category, d.city AS city, d.district AS district, d.region AS region, '' AS services`;
  return { sql: selectWithWindow(columns, "adoption_dogs d", clauses, `${exactOrder}, ${prefixOrder}, d.name COLLATE NOCASE ASC, d.slug ASC`, limit), bindings };
}

function helpQuery(parsed: ParsedPortalSearchQuery, limit: number): QuerySpec | null {
  const tokens = parsed.contentTokens;
  if (!tokens.length) return null;
  const bindings: unknown[] = [];
  const clauses = ["h.status = 'published'", "h.category NOT IN ('adopcia','utulky','stratene-a-najdene')"];
  addLocationWhere(clauses, bindings, parsed, { city: "h.city", region: "h.region" });
  clauses.push(...tokenClauses(
    `h.title || ' ' || h.excerpt || ' ' || h.description || ' ' || h.organization || ' ' || h.dog_name || ' ' || h.breed || ' ' || h.city || ' ' || h.region || ' ' || h.category`,
    tokens,
    bindings,
  ));
  const exactOrder = exactTitleOrder("h.title", parsed, bindings);
  const prefixOrder = titlePrefixOrder("h.title", parsed, bindings);
  const columns = `'/pomoc-psom/' || h.category || '/' || h.slug AS href, h.title AS title, 'Pomoc psom' AS type,
    h.excerpt AS description,
    h.organization || ' ' || h.dog_name || ' ' || h.breed || ' ' || h.city || ' ' || h.region || ' ' || h.category AS keywords,
    'help' AS kind, h.category AS category, h.city AS city, '' AS district, h.region AS region, '' AS services`;
  return { sql: selectWithWindow(columns, "help_cases h", clauses, `${exactOrder}, ${prefixOrder}, h.title COLLATE NOCASE ASC, h.category ASC, h.slug ASC`, limit), bindings };
}

function lostFoundQuery(parsed: ParsedPortalSearchQuery, limit: number): QuerySpec | null {
  const tokens = parsed.entityIntent === "lost-found" ? parsed.residualTokens : parsed.contentTokens;
  if (!tokens.length && parsed.entityIntent !== "lost-found") return null;
  const bindings: unknown[] = [new Date().toISOString()];
  const clauses = ["r.status = 'ACTIVE'", "r.published_at IS NOT NULL", "(r.expires_at IS NULL OR r.expires_at > ?)"];
  addLocationWhere(clauses, bindings, parsed, { city: "r.city", district: "r.district", region: "r.region" });
  clauses.push(...persistedTokenClauses(
    "r.search_text",
    `COALESCE(r.dog_name, '') || ' ' || r.breed || ' ' || r.color || ' ' || r.description || ' ' || r.distinguishing_marks || ' ' || r.city || ' ' || r.district || ' ' || r.region`,
    tokens,
    bindings,
  ));
  const title = `CASE WHEN r.type = 'LOST' THEN 'Stratený ' ELSE 'Nájdený ' END || COALESCE(NULLIF(r.dog_name, ''), NULLIF(r.breed, ''), 'pes')`;
  const exactOrder = exactTitleOrder(title, parsed, bindings);
  const prefixOrder = titlePrefixOrder(title, parsed, bindings);
  const columns = `CASE WHEN r.type = 'LOST' THEN '/pomoc-psom/stratene-psy/' || r.slug ELSE '/pomoc-psom/najdene-psy/' || r.slug END AS href,
    ${title} AS title, 'Pomoc psom' AS type,
    r.description AS description,
    r.breed || ' ' || r.color || ' ' || r.city || ' ' || r.district || ' ' || r.region AS keywords,
    'lost-found' AS kind, r.type AS category, r.city AS city, r.district AS district, r.region AS region, '' AS services`;
  return { sql: selectWithWindow(columns, "lost_found_dog_reports r", clauses, `${exactOrder}, ${prefixOrder}, ${title} COLLATE NOCASE ASC, r.type ASC, r.slug ASC`, limit), bindings };
}

function staticSectionItems(parsed: ParsedPortalSearchQuery, section: string): PortalSearchItem[] {
  const rank = (item: Omit<PortalSearchItem, "score">) => ({ ...item, score: scorePortalSearchItem(item, parsed) });
  return portalSections
    .filter((portalSection) => !section || portalSection.slug === section)
    .flatMap((portalSection) => [
      rank({
        href: `/${portalSection.slug}`,
        title: portalSection.label,
        type: "Sekcia",
        description: portalSection.description,
        keywords: `${portalSection.eyebrow} ${portalSection.intro}`,
        kind: "section",
      }),
      ...portalSection.subpages
        .filter((subpage) => subpage.visible !== false)
        .map((subpage) => rank({
          href: portalSubpageHref(portalSection, subpage),
          title: subpage.label,
          type: "Sekcia",
          description: subpage.description,
          keywords: `${portalSection.label} ${portalSection.description} ${(subpage.popularTopics ?? []).join(" ")} ${(subpage.commonQuestions ?? []).join(" ")}`,
          kind: "section" as const,
        })),
    ])
    .filter((item) => item.score < 999);
}

function rowToItem(row: SearchRow, parsed: ParsedPortalSearchQuery): PortalSearchItem | null {
  const city = row.city?.trim() ?? "";
  const district = row.district?.trim() ?? "";
  const region = row.region?.trim() ?? "";
  const description = row.description?.trim() ?? "";
  const item: PortalSearchItem = {
    href: row.href,
    title: row.title,
    type: row.type,
    description,
    keywords: row.keywords ?? "",
    kind: row.kind,
    category: row.category ?? undefined,
    city: city || undefined,
    district: district || undefined,
    region: region || undefined,
    services: row.services ?? undefined,
    publishedAt: row.published_at ?? undefined,
    imageUrl: row.image_url?.trim() || undefined,
    newsCategory: row.news_category?.trim() || undefined,
    score: 999,
  };
  item.score = scorePortalSearchItem({ ...item, haystack: item.keywords }, parsed);
  return item.score < 999 ? item : null;
}

function allowedSpecs(parsed: ParsedPortalSearchQuery, limit: number, section: string) {
  if (section) return [articleQuery(parsed, limit, section)].filter((item): item is QuerySpec => Boolean(item));
  return [
    directoryQuery(parsed, limit),
    articleQuery(parsed, limit, ""),
    breedQuery(parsed, limit),
    eventQuery(parsed, limit),
    organizationQuery(parsed, limit),
    adoptionQuery(parsed, limit),
    helpQuery(parsed, limit),
    lostFoundQuery(parsed, limit),
  ].filter((item): item is QuerySpec => Boolean(item));
}

export function buildPortalSearchQuerySpecsForTest(
  query: string,
  limit = SEARCH_PAGE_SIZE,
  filters: PortalSearchFilterOverrides = {},
) {
  const parsed = applyPortalSearchFilterOverrides(parsePortalSearchQuery(query), filters);
  const safeLimit = Math.max(1, Math.min(SEARCH_MAX_VISIBLE_RESULTS, Math.trunc(limit)));
  return allowedSpecs(parsed, safeLimit, "").map((spec) => ({
    sql: spec.sql,
    bindingCount: spec.bindings.length,
  }));
}

export async function searchPortal(
  query: string,
  options: {
    page?: number;
    pageSize?: number;
    section?: string;
    filters?: PortalSearchFilterOverrides;
  } = {},
): Promise<PortalSearchResultPage> {
  const parsed = applyPortalSearchFilterOverrides(parsePortalSearchQuery(query), options.filters);
  const pageSize = Math.max(1, Math.min(48, Math.trunc(options.pageSize ?? SEARCH_PAGE_SIZE)));
  const page = Math.max(1, Math.min(SEARCH_MAX_PAGE, Math.trunc(options.page ?? 1)));
  const section = ["starostlivost", "aktivity", "steniatka"].includes(options.section ?? "") ? options.section! : "";
  if (parsed.normalized.length < 2) return { items: [], total: 0, page: 1, pageSize, totalPages: 0, capped: false, parsed };

  const need = Math.min(SEARCH_MAX_VISIBLE_RESULTS, page * pageSize);
  const staticItems = staticSectionItems(parsed, section);
  const db = database();
  const databaseItems: PortalSearchItem[] = [];
  let databaseTotal = 0;

  if (db) {
    const specs = allowedSpecs(parsed, need, section);
    if (specs.length) {
      const results = await db.batch(specs.map((spec) => db.prepare(spec.sql).bind(...spec.bindings)));
      for (const result of results) {
        const rows = (result.results ?? []) as unknown as SearchRow[];
        databaseTotal += Number(rows[0]?.source_total ?? 0);
        for (const row of rows) {
          const item = rowToItem(row, parsed);
          if (item) databaseItems.push(item);
        }
      }
    }
  }

  const unique = [...new Map([...staticItems, ...databaseItems].map((item) => [item.href, item])).values()];
  const sorted = stablePortalSearchSort(unique);
  const total = databaseTotal + staticItems.length;
  const capped = total > SEARCH_MAX_VISIBLE_RESULTS;
  const totalPages = Math.min(SEARCH_MAX_PAGE, Math.ceil(total / pageSize));
  const effectivePage = Math.min(page, Math.max(1, totalPages));
  const start = (effectivePage - 1) * pageSize;
  return {
    items: sorted.slice(start, start + pageSize),
    total,
    page: effectivePage,
    pageSize,
    totalPages,
    capped,
    parsed,
  };
}

function kindFromLegacyType(type: string): PortalSearchRankable["kind"] {
  if (type === "Plemeno") return "breed";
  if (type === "Článok" || type === "Novinka") return "article";
  if (type === "Podujatie") return "event";
  if (type === "Veterinár" || type === "Psí tréner" || type === "Služba pre psov") return "directory";
  if (type === "Organizácia" || type === "Útulok") return "organization";
  if (type === "Pes na adopciu") return "adoption";
  if (type === "Pomoc psom") return "help";
  return "section";
}

export function filterPortalSearch(items: Omit<PortalSearchItem, "score" | "kind">[], query: string, limit = 100) {
  const parsed = parsePortalSearchQuery(query);
  if (parsed.normalized.length < 2) return [];
  return stablePortalSearchSort(items.map((item) => {
    const kind = kindFromLegacyType(item.type);
    return { ...item, kind, score: scorePortalSearchItem({ ...item, kind, haystack: item.keywords }, parsed) };
  }).filter((item) => item.score < 999)).slice(0, limit);
}

/** @deprecated Full in-memory portal indexes are intentionally disabled by SEARCH-1. */
export async function getPortalSearchIndex(): Promise<PortalSearchItem[]> {
  return [];
}

/** Header search submits to /hladat and therefore uses the same server search contract. */
export async function getHeaderSearchIndex(): Promise<PortalSearchItem[]> {
  return [];
}

export function portalSearchMapHref(parsed: ParsedPortalSearchQuery) {
  const params = new URLSearchParams();
  if (parsed.entityIntent === "directory") {
    params.set("category", "services");
    if (parsed.directoryCategory) params.set("subcategory", parsed.directoryCategory);
  } else if (parsed.entityIntent === "event") {
    params.set("category", "events");
    if (parsed.eventType) params.set("eventType", parsed.eventType);
  } else if (parsed.entityIntent === "organization") {
    params.set("category", "organizations");
  } else {
    return null;
  }

  if (parsed.location?.region) params.set("region", parsed.location.region);
  if (parsed.location?.district) params.set("district", parsed.location.district);
  if (parsed.location?.city) params.set("city", parsed.location.city);
  const residualSearch = parsed.residualTokens.join(" ").trim();
  if (residualSearch.length >= 2) params.set("search", residualSearch);
  return `/mapa?${params.toString()}`;
}

export function portalSearchFallbacks(parsed: ParsedPortalSearchQuery) {
  const links: Array<{ href: string; label: string }> = [];
  if (parsed.directoryCategory) {
    const category = getDirectoryCategory(parsed.directoryCategory);
    if (parsed.location?.level === "city" && parsed.location.district) {
      const params = new URLSearchParams({ region: parsed.location.region, district: parsed.location.district });
      links.push({ href: `/adresar/${parsed.directoryCategory}?${params}`, label: `Skúsiť celý okres ${parsed.location.district}` });
    }
    links.push({ href: `/adresar/${parsed.directoryCategory}`, label: category ? `Všetky: ${category.label}` : "Otvoriť adresár" });
  } else if (parsed.eventType) {
    links.push({ href: "/podujatia", label: "Pozrieť všetky podujatia" });
  } else if (parsed.entityIntent === "adoption") {
    links.push({ href: "/pomoc-psom/adopcia", label: "Psy na adopciu" });
  } else if (parsed.entityIntent === "organization") {
    links.push({ href: "/pomoc-psom/utulky", label: getHelpCategory("utulky")?.label ?? "Útulky a organizácie" });
  } else if (parsed.entityIntent === "lost-found") {
    links.push({ href: "/pomoc-psom/stratene-a-najdene", label: "Stratené a nájdené psy" });
  }
  return links;
}
