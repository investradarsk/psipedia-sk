import { env } from "cloudflare:workers";
import { canonicalBreedIdsSql } from "@/lib/breed-canonical";
import { directoryProfileHref, isDirectoryCategory } from "@/lib/directory";
import { eventHref } from "@/lib/events";
import { helpCaseHref, isHelpCategory } from "@/lib/help";
import { dogReportHref } from "@/lib/lost-found-dogs";
import { articleHref } from "@/lib/portal";
import { DYNAMIC_URL_PAGE_SIZE, isDynamicUrlKind, type DynamicUrlKind, type DynamicUrlRecord, type DynamicUrlPage } from "@/lib/visual-library-dynamic-urls-contract";

/**
 * Owner-only, paginated inventory. Queries follow the public read-side
 * predicates; no drafts, contact fields or guessed slugs ever leave the API.
 */
type PublicRow = { id: number | string; slug: string; name: string; category?: string | null; section?: string | null };
type D1Read = Pick<D1Database, "prepare">;
const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function validSlug(value: string): boolean { return VALID_SLUG.test(value); }
function localHref(kind: DynamicUrlKind, row: PublicRow): string | null {
  if (!validSlug(row.slug)) return null;
  if (kind === "directory")
    return row.category && isDirectoryCategory(row.category)
      ? directoryProfileHref({ category: row.category, slug: row.slug }) : null;
  if (kind === "help")
    return row.category && isHelpCategory(row.category) && row.category !== "adopcia" && row.category !== "utulky"
      ? helpCaseHref({ category: row.category, slug: row.slug }) : null;
  if (kind === "lost-found")
    return row.category === "LOST" || row.category === "FOUND"
      ? dogReportHref({ type: row.category, slug: row.slug }) : null;
  if (kind === "events") return eventHref({slug:row.slug});
  if (kind === "breeds") return "/plemena/" + row.slug;
  if (kind === "organizations") return "/organizacie/" + row.slug;
  if (kind === "adoptions") return "/pomoc-psom/adopcia/" + row.slug;
  if (kind === "eshops") return "/recenzie/eshopy/" + row.slug;
  return articleHref({ slug: row.slug, portalSection: row.section as Parameters<typeof articleHref>[0]["portalSection"] });
}

// Each source is a fixed code-defined query, never a table supplied by the user.
// The SELECT projection contains only public ID, name and canonical slug fields.
const SOURCES: Record<DynamicUrlKind, { from: string; where: string; label: string; slug: string; category?: string; section?: string }> = {
  directory: {
    from: "directory_profiles p",
    where: "p.status='published' AND p.slug<>'' AND p.slug NOT GLOB '*[^a-z0-9-]*' AND p.category<>'' AND p.category NOT GLOB '*[^a-z0-9-]*'",
    label: "p.name", slug: "p.slug", category: "p.category",
  },
  organizations: {
    from: "help_organizations o",
    where: "o.status='PUBLISHED' AND o.published_at IS NOT NULL AND o.archived_at IS NULL AND o.slug<>'' AND o.slug NOT GLOB '*[^a-z0-9-]*'",
    label: "o.name", slug: "o.slug",
  },
  adoptions: {
    from: "adoption_dogs d",
    where: "d.status IN ('ACTIVE','RESERVED') AND d.slug<>'' AND d.slug NOT GLOB '*[^a-z0-9-]*'",
    label: "d.name", slug: "d.slug",
  },
  help: {
    from: "help_cases h",
    where: "h.status='published' AND h.category NOT IN ('adopcia','utulky') AND h.slug<>'' AND h.slug NOT GLOB '*[^a-z0-9-]*'",
    label: "h.title", slug: "h.slug", category: "h.category",
  },
  "lost-found": {
    from: "lost_found_dog_reports r",
    where: "r.published_at IS NOT NULL AND r.duplicate_of_id IS NULL AND r.status IN ('ACTIVE','RESOLVED','EXPIRED','ARCHIVED') AND r.type IN ('LOST','FOUND') AND r.slug<>'' AND r.slug NOT GLOB '*[^a-z0-9-]*'",
    label: "COALESCE(NULLIF(r.dog_name,''), 'Pes')", slug: "r.slug", category: "r.type",
  },
  events: {
    from: "managed_events e",
    where: "e.status='published' AND e.slug<>'' AND e.slug NOT GLOB '*[^a-z0-9-]*'",
    label: "e.title", slug: "e.slug",
  },
  breeds: {
    from: "managed_breeds b",
    where: `b.id IN (${canonicalBreedIdsSql})`,
    label: "b.name", slug: "b.slug",
  },
  articles: {
    from: "managed_articles a",
    where: "(a.status='published' OR (a.status='scheduled' AND a.published_at<=?)) AND a.slug<>'' AND a.slug NOT GLOB '*[^a-z0-9-]*'",
    label: "a.title", slug: "a.slug", section: "a.portal_section",
  },
  eshops: {
    from: "managed_eshops shop",
    where: "shop.status='published' AND shop.published_at IS NOT NULL AND shop.slug<>'' AND shop.slug NOT GLOB '*[^a-z0-9-]*'",
    label: "shop.name", slug: "shop.slug",
  },
};

export function buildDynamicUrlQuery(kind: DynamicUrlKind, query = "", at = new Date()) {
  const s = SOURCES[kind];
  const q = query.trim().slice(0, 100);
  const params: unknown[] = kind === "articles" ? [at.toISOString()] : [];
  const name = s.label;
  const searchSql = q ? ` AND (instr(lower(${name}),lower(?))>0 OR instr(lower(${s.slug}),lower(?))>0)` : "";
  if (q) params.push(q,q);
  const base = `FROM ${s.from} WHERE ${s.where}${searchSql}`;
  const select = `SELECT ${s.from.split(" ").at(-1)}.id AS id, ${s.slug} AS slug, ${name} AS name, ${s.category ?? "NULL"} AS category, ${s.section ?? "NULL"} AS section ${base} ORDER BY ${s.from.split(" ").at(-1)}.id ASC LIMIT ? OFFSET ?`;
  return { count: `SELECT COUNT(*) AS total ${base}`, select, params, q };
}

export async function listDynamicPublicUrls(input: {
  kind: DynamicUrlKind; page?: number; q?: string;
  database?: D1Read; now?: Date;
}): Promise<DynamicUrlPage> {
  const db = input.database ?? (env as unknown as { DB?: D1Database }).DB;
  if (!db || typeof db.prepare !== "function") throw new Error("Databáza verejných profilov nie je dostupná.");
  const kind = input.kind;
  if (!isDynamicUrlKind(kind)) throw new Error("Neznámy typ verejných URL.");
  const rawPage = input.page ?? 1;
  if (!Number.isSafeInteger(rawPage) || rawPage < 1 || rawPage > 1000000) throw new Error("Neplatná stránka.");
  const sql = buildDynamicUrlQuery(kind, input.q, input.now);
  const counted = await db.prepare(sql.count).bind(...sql.params).first<{ total: number }>();
  const total = Number(counted?.total);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Neúplný počet verejných URL.");
  const pages = Math.ceil(total / DYNAMIC_URL_PAGE_SIZE);
  const page = Math.min(rawPage, Math.max(1,pages));
  const result = await db.prepare(sql.select).bind(...sql.params,DYNAMIC_URL_PAGE_SIZE,(page-1)*DYNAMIC_URL_PAGE_SIZE).all<PublicRow>();
  const rows = result.results ?? [];
  const items: DynamicUrlRecord[] = rows.map(row => {
    const href = localHref(kind,row);
    // Do not report false completeness if a supposedly published row
    // cannot be represented by the canonical public route builder.
    if (!href) throw new Error("Publikovaný záznam nemá platnú verejnú URL; potrebná kontrola údajov.");
    return { id: row.id, label: row.name, url: "https://psipedia.sk" + href, kind,
      detail: row.category || row.section || undefined };
  });
  return { kind, page, pageSize: DYNAMIC_URL_PAGE_SIZE, total, pages,
    items, searched: sql.q, generatedAt: (input.now ?? new Date()).toISOString() };
}
