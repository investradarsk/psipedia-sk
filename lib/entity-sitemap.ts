import { env } from "cloudflare:workers";
import { articles as seedArticles, type ArticleSeo } from "./content.ts";
import { isArticlePortalSection, type ArticlePortalSection } from "./portal.ts";

export const ENTITY_SITEMAP_BATCH_SIZE = 500;
export const ENTITY_SITEMAP_MAX_BATCH_SIZE = 1000;

type RuntimeBindings = { DB?: D1Database };

type SeoProjection = Pick<ArticleSeo, "canonicalUrl" | "noindex">;

export type ArticleSitemapRecord = {
  id: number;
  slug: string;
  portalSection: ArticlePortalSection;
  status: "published" | "scheduled";
  updatedAt: string | null;
  imageUrl: string | null;
  seo: SeoProjection;
};

export type EventSitemapRecord = {
  id: number;
  slug: string;
  status: "published";
  updatedAt: string | null;
  imageUrl: string | null;
  seo: SeoProjection;
};

export type HelpSitemapRecord = {
  id: number;
  slug: string;
  category: string;
  status: "published";
  updatedAt: string | null;
  imageUrl: string | null;
  seo: SeoProjection;
};

type ArticleRow = {
  id: number;
  slug: string;
  portal_section: string;
  status: string;
  updated_at: string | null;
  published_at: string | null;
  image_url: string | null;
  canonical_url: string | null;
  noindex: number | string | null;
};

type EventRow = {
  id: number;
  slug: string;
  updated_at: string | null;
  image_url: string | null;
  canonical_url: string | null;
  noindex: number | string | null;
};

type HelpRow = {
  id: number;
  slug: string;
  category: string;
  updated_at: string | null;
  image_url: string | null;
  canonical_url: string | null;
  noindex: number | string | null;
};

function sitemapDatabase() {
  const database = (env as unknown as RuntimeBindings).DB;
  return database && typeof database.prepare === "function" ? database : null;
}

function safeBatchSize(batchSize = ENTITY_SITEMAP_BATCH_SIZE) {
  return Math.max(
    1,
    Math.min(ENTITY_SITEMAP_MAX_BATCH_SIZE, Math.trunc(batchSize) || ENTITY_SITEMAP_BATCH_SIZE),
  );
}

function seoProjection(row: { canonical_url: string | null; noindex: number | string | null }): SeoProjection {
  return {
    canonicalUrl: row.canonical_url?.trim() || "",
    noindex: Number(row.noindex) === 1 || row.noindex === "true",
  };
}

async function collectKeysetRows<Row extends { id: number }>(
  database: D1Database,
  buildQuery: (afterId: number, batchSize: number) => { sql: string; bindings: readonly unknown[] },
  batchSize = ENTITY_SITEMAP_BATCH_SIZE,
) {
  const size = safeBatchSize(batchSize);
  const rows: Row[] = [];
  let afterId = 0;

  for (;;) {
    const query = buildQuery(afterId, size);
    const result = await database.prepare(query.sql).bind(...query.bindings).all<Row>();
    const page = result.results ?? [];
    if (!page.length) break;

    rows.push(...page);
    const nextAfterId = Number(page.at(-1)?.id ?? 0);
    if (!Number.isSafeInteger(nextAfterId) || nextAfterId <= afterId) {
      throw new Error("entity-sitemap-cursor-did-not-advance");
    }
    afterId = nextAfterId;
    if (page.length < size) break;
  }

  return rows;
}

export function buildPublishedArticleSitemapPageQuery(
  afterId = 0,
  batchSize = ENTITY_SITEMAP_BATCH_SIZE,
  nowIso = new Date().toISOString(),
) {
  const size = safeBatchSize(batchSize);
  const safeAfterId = Number.isSafeInteger(afterId) && afterId > 0 ? afterId : 0;
  return {
    sql: `SELECT
      id,
      slug,
      portal_section,
      status,
      updated_at,
      published_at,
      image_url,
      canonical_url,
      noindex
      FROM managed_articles
      WHERE (status = 'published' OR (status = 'scheduled' AND published_at <= ?))
        AND id > ?
      ORDER BY id ASC
      LIMIT ?`,
    bindings: [nowIso, safeAfterId, size] as const,
    batchSize: size,
  };
}

export async function listPublishedArticleSitemapRecords(
  database: D1Database,
  options: { batchSize?: number; nowIso?: string } = {},
): Promise<ArticleSitemapRecord[]> {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const rows = await collectKeysetRows<ArticleRow>(
    database,
    (afterId, batchSize) => buildPublishedArticleSitemapPageQuery(afterId, batchSize, nowIso),
    options.batchSize,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    slug: row.slug?.trim() ?? "",
    portalSection: isArticlePortalSection(row.portal_section) ? row.portal_section : "clanky",
    status: row.status === "scheduled" ? "scheduled" : "published",
    updatedAt: row.updated_at || row.published_at || null,
    imageUrl: row.image_url || null,
    seo: seoProjection(row),
  }));
}

export async function getPublishedArticleSitemapRecords() {
  const database = sitemapDatabase();
  if (!database) {
    return seedArticles.map((article, index) => ({
      id: -(index + 1),
      slug: article.slug,
      portalSection: article.portalSection && isArticlePortalSection(article.portalSection) ? article.portalSection : "clanky",
      status: "published" as const,
      updatedAt: article.updatedDateIso || article.dateIso || null,
      imageUrl: article.image ?? null,
      seo: {
        canonicalUrl: article.seo?.canonicalUrl ?? "",
        noindex: Boolean(article.seo?.noindex),
      },
    }));
  }
  return listPublishedArticleSitemapRecords(database);
}

export function buildPublishedEventSitemapPageQuery(afterId = 0, batchSize = ENTITY_SITEMAP_BATCH_SIZE) {
  const size = safeBatchSize(batchSize);
  const safeAfterId = Number.isSafeInteger(afterId) && afterId > 0 ? afterId : 0;
  return {
    sql: `SELECT
      id,
      slug,
      updated_at,
      image_url,
      CASE
        WHEN json_valid(seo_json) THEN COALESCE(json_extract(seo_json, '$.canonicalUrl'), '')
        ELSE ''
      END AS canonical_url,
      CASE
        WHEN json_valid(seo_json) THEN COALESCE(json_extract(seo_json, '$.noindex'), 0)
        ELSE 0
      END AS noindex
      FROM managed_events
      WHERE status = 'published'
        AND id > ?
      ORDER BY id ASC
      LIMIT ?`,
    bindings: [safeAfterId, size] as const,
    batchSize: size,
  };
}

export async function listPublishedEventSitemapRecords(
  database: D1Database,
  options: { batchSize?: number } = {},
): Promise<EventSitemapRecord[]> {
  const rows = await collectKeysetRows<EventRow>(
    database,
    (afterId, batchSize) => buildPublishedEventSitemapPageQuery(afterId, batchSize),
    options.batchSize,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    slug: row.slug?.trim() ?? "",
    status: "published",
    updatedAt: row.updated_at || null,
    imageUrl: row.image_url || null,
    seo: seoProjection(row),
  }));
}

export async function getPublishedEventSitemapRecords() {
  const database = sitemapDatabase();
  return database ? listPublishedEventSitemapRecords(database) : [] as EventSitemapRecord[];
}

export function buildPublishedHelpSitemapPageQuery(afterId = 0, batchSize = ENTITY_SITEMAP_BATCH_SIZE) {
  const size = safeBatchSize(batchSize);
  const safeAfterId = Number.isSafeInteger(afterId) && afterId > 0 ? afterId : 0;
  return {
    sql: `SELECT
      id,
      slug,
      category,
      updated_at,
      image_url,
      CASE
        WHEN json_valid(seo_json) THEN COALESCE(json_extract(seo_json, '$.canonicalUrl'), '')
        ELSE ''
      END AS canonical_url,
      CASE
        WHEN json_valid(seo_json) THEN COALESCE(json_extract(seo_json, '$.noindex'), 0)
        ELSE 0
      END AS noindex
      FROM help_cases
      WHERE status = 'published'
        AND id > ?
      ORDER BY id ASC
      LIMIT ?`,
    bindings: [safeAfterId, size] as const,
    batchSize: size,
  };
}

export async function listPublishedHelpSitemapRecords(
  database: D1Database,
  options: { batchSize?: number } = {},
): Promise<HelpSitemapRecord[]> {
  const rows = await collectKeysetRows<HelpRow>(
    database,
    (afterId, batchSize) => buildPublishedHelpSitemapPageQuery(afterId, batchSize),
    options.batchSize,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    slug: row.slug?.trim() ?? "",
    category: row.category?.trim() ?? "",
    status: "published",
    updatedAt: row.updated_at || null,
    imageUrl: row.image_url || null,
    seo: seoProjection(row),
  }));
}

export async function getPublishedHelpSitemapRecords() {
  const database = sitemapDatabase();
  return database ? listPublishedHelpSitemapRecords(database) : [] as HelpSitemapRecord[];
}
