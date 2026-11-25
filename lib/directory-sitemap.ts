import { env } from "cloudflare:workers";
import type { ArticleSeo } from "./content.ts";
import { sitemapCanonicalFromD1 } from "./sitemap-seo.ts";

export const DIRECTORY_SITEMAP_BATCH_SIZE = 500;
export const DIRECTORY_SITEMAP_MAX_BATCH_SIZE = 1000;

export type DirectorySitemapRecord = {
  id: number;
  slug: string;
  category: string;
  status: "published";
  updatedAt: string | null;
  seo: Pick<ArticleSeo, "canonicalUrl" | "noindex">;
};

type DirectorySitemapRow = {
  id: number;
  slug: string;
  category: string;
  updated_at: string | null;
  canonical_url: unknown;
  noindex: number | string | null;
};

type RuntimeBindings = { DB?: D1Database };

function directorySitemapDatabase() {
  const database = (env as unknown as RuntimeBindings).DB;
  return database && typeof database.prepare === "function" ? database : null;
}

export function buildPublishedDirectorySitemapPageQuery(
  afterId = 0,
  batchSize = DIRECTORY_SITEMAP_BATCH_SIZE,
) {
  const safeAfterId = Number.isSafeInteger(afterId) && afterId > 0 ? afterId : 0;
  const safeBatchSize = Math.max(
    1,
    Math.min(DIRECTORY_SITEMAP_MAX_BATCH_SIZE, Math.trunc(batchSize) || DIRECTORY_SITEMAP_BATCH_SIZE),
  );

  return {
    sql: `SELECT
      id,
      slug,
      category,
      updated_at,
      COALESCE((SELECT canonical_url FROM directory_profile_seo WHERE profile_id=directory_profiles.id), '') AS canonical_url,
      COALESCE((SELECT noindex FROM directory_profile_seo WHERE profile_id=directory_profiles.id), 0) AS noindex
      FROM directory_profiles
      WHERE status = 'published'
        AND archived_at IS NULL
        AND id > ?
      ORDER BY id ASC
      LIMIT ?`,
    bindings: [safeAfterId, safeBatchSize] as const,
    batchSize: safeBatchSize,
  };
}

function rowToDirectorySitemapRecord(row: DirectorySitemapRow): DirectorySitemapRecord {
  return {
    id: Number(row.id),
    slug: row.slug?.trim() ?? "",
    category: row.category?.trim() ?? "",
    status: "published",
    updatedAt: row.updated_at || null,
    seo: {
      canonicalUrl: sitemapCanonicalFromD1(row.canonical_url),
      noindex: Number(row.noindex) === 1 || row.noindex === "true",
    },
  };
}

/**
 * Sitemap export read model.
 *
 * Uses keyset pagination on the immutable numeric id ordering. The per-query
 * LIMIT bounds each D1 response, while the loop has no product-level total cap.
 */
export async function listPublishedDirectorySitemapRecords(
  database: D1Database,
  options: { batchSize?: number } = {},
): Promise<DirectorySitemapRecord[]> {
  const records: DirectorySitemapRecord[] = [];
  let afterId = 0;

  for (;;) {
    const query = buildPublishedDirectorySitemapPageQuery(afterId, options.batchSize);
    const result = await database
      .prepare(query.sql)
      .bind(...query.bindings)
      .all<DirectorySitemapRow>();
    const rows = result.results ?? [];
    if (!rows.length) break;

    for (const row of rows) records.push(rowToDirectorySitemapRecord(row));

    const nextAfterId = Number(rows.at(-1)?.id ?? 0);
    if (!Number.isSafeInteger(nextAfterId) || nextAfterId <= afterId) {
      throw new Error("directory-sitemap-cursor-did-not-advance");
    }
    afterId = nextAfterId;

    if (rows.length < query.batchSize) break;
  }

  return records;
}

export async function getPublishedDirectorySitemapRecords() {
  const database = directorySitemapDatabase();
  if (!database) return [] as DirectorySitemapRecord[];
  return listPublishedDirectorySitemapRecords(database);
}
