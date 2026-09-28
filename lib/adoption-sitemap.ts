import { env } from "cloudflare:workers";
import { adoptionIsIndexable } from "./adoption.ts";
import type { AdoptionD1Database } from "./adoption-store.ts";

export const ADOPTION_SITEMAP_BATCH_SIZE = 500;
export const ADOPTION_SITEMAP_MAX_BATCH_SIZE = 1000;

export type AdoptionSitemapItem = {
  id: number;
  slug: string;
  updatedAt: string;
  mainImage: string | null;
};

type AdoptionSitemapRow = {
  id: number;
  slug: string;
  status: string;
  description: string;
  last_verified_at: string | null;
  updated_at: string;
  main_image: string | null;
};

type RuntimeBindings = { DB?: AdoptionD1Database };

function adoptionSitemapDatabase() {
  const database = (env as unknown as RuntimeBindings).DB;
  return database && typeof database.prepare === "function" ? database : null;
}

export function buildIndexableAdoptionSitemapPageQuery(
  afterId = 0,
  batchSize = ADOPTION_SITEMAP_BATCH_SIZE,
) {
  const safeAfterId = Number.isSafeInteger(afterId) && afterId > 0 ? afterId : 0;
  const safeBatchSize = Math.max(
    1,
    Math.min(ADOPTION_SITEMAP_MAX_BATCH_SIZE, Math.trunc(batchSize) || ADOPTION_SITEMAP_BATCH_SIZE),
  );

  return {
    sql: `SELECT id, slug, status, description, last_verified_at, updated_at, main_image
      FROM adoption_dogs
      WHERE status = 'ACTIVE'
        AND id > ?
      ORDER BY id ASC
      LIMIT ?`,
    bindings: [safeAfterId, safeBatchSize] as const,
    batchSize: safeBatchSize,
  };
}

export async function listIndexableAdoptionSitemapRecords(
  database: AdoptionD1Database,
  options: { batchSize?: number; now?: Date } = {},
): Promise<AdoptionSitemapItem[]> {
  const records: AdoptionSitemapItem[] = [];
  const now = options.now ?? new Date();
  let afterId = 0;

  for (;;) {
    const query = buildIndexableAdoptionSitemapPageQuery(afterId, options.batchSize);
    const result = await database
      .prepare(query.sql)
      .bind(...query.bindings)
      .all<AdoptionSitemapRow>();
    const rows = result.results ?? [];
    if (!rows.length) break;

    for (const row of rows) {
      if (!adoptionIsIndexable({
        status: row.status === "ACTIVE" ? "ACTIVE" : "DRAFT",
        description: row.description ?? "",
        lastVerifiedAt: row.last_verified_at,
      }, now)) continue;
      records.push({
        id: Number(row.id),
        slug: row.slug?.trim() ?? "",
        updatedAt: row.updated_at,
        mainImage: row.main_image || null,
      });
    }

    const nextAfterId = Number(rows.at(-1)?.id ?? 0);
    if (!Number.isSafeInteger(nextAfterId) || nextAfterId <= afterId) {
      throw new Error("adoption-sitemap-cursor-did-not-advance");
    }
    afterId = nextAfterId;

    if (rows.length < query.batchSize) break;
  }

  return records;
}

export async function listIndexableAdoptionsForSitemap(now = new Date()) {
  const database = adoptionSitemapDatabase();
  if (!database) return [] as AdoptionSitemapItem[];
  return listIndexableAdoptionSitemapRecords(database, { now });
}
