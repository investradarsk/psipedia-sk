import { env } from "cloudflare:workers";
import { breedProfileHref, canonicalBreedIdsSql } from "@/lib/breed-canonical";

export const CONTENT_RELATION_MAX_ITEMS = 6;

export type PublicRelatedBreed = {
  id: number;
  slug: string;
  name: string;
  href: string;
  imageUrl: string | null;
  fciGroup: number;
};

type RelatedBreedRow = {
  id: number;
  slug: string;
  name: string;
  image_url: string | null;
  fci_group: number;
};

type RelationDatabase = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T>(): Promise<{ results: T[] }>;
    };
  };
};

type RuntimeBindings = { DB?: RelationDatabase };

function relationDatabase(database?: RelationDatabase) {
  if (database) return database;
  const runtime = (env as unknown as RuntimeBindings).DB;
  return runtime && typeof runtime.prepare === "function" ? runtime : null;
}

function boundedLimit(limit: number, fallback: number) {
  const value = Number.isFinite(limit) ? Math.trunc(limit) : fallback;
  return Math.max(1, Math.min(CONTENT_RELATION_MAX_ITEMS, value || fallback));
}

export function publicArticleRelationTargetSql(alias: string) {
  const relativeCanonical = `CASE
    WHEN ${alias}.portal_section = 'clanky' THEN '/clanky/' || ${alias}.slug
    ELSE '/' || ${alias}.portal_section || '/' || ${alias}.slug
  END`;
  return `(${alias}.status = 'published' OR (${alias}.status = 'scheduled' AND ${alias}.published_at <= ?))
    AND COALESCE(${alias}.noindex, 0) = 0
    AND COALESCE(TRIM(${alias}.canonical_url), '') IN (
      '',
      ${relativeCanonical},
      'https://psipedia.sk' || ${relativeCanonical}
    )`;
}

export function publicDirectoryRelationTargetSql(alias: string) {
  const seo = `CASE WHEN json_valid(${alias}.seo_json) THEN ${alias}.seo_json ELSE '{}' END`;
  const relativeCanonical = `'/adresar/' || ${alias}.category || '/' || ${alias}.slug`;
  return `${alias}.status = 'published'
    AND ${alias}.archived_at IS NULL
    AND COALESCE(json_extract(${seo}, '$.noindex'), 0) = 0
    AND COALESCE(TRIM(json_extract(${seo}, '$.canonicalUrl')), '') IN (
      '',
      ${relativeCanonical},
      'https://psipedia.sk' || ${relativeCanonical}
    )`;
}

function relatedBreed(row: RelatedBreedRow): PublicRelatedBreed {
  return {
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    href: breedProfileHref(row.slug),
    imageUrl: row.image_url,
    fciGroup: Number(row.fci_group),
  };
}

export function buildArticleRelatedBreedsQuery(articleSlug: string, now = new Date(), limit = 4) {
  const safeSlug = articleSlug.trim();
  if (!safeSlug) return null;
  const safeLimit = boundedLimit(limit, 4);
  return {
    sql: `SELECT DISTINCT b.id, b.slug, b.name, b.image_url, b.fci_group
      FROM managed_articles a
      JOIN breed_article_relations r ON r.article_id = a.id
      JOIN managed_breeds b ON b.id = r.breed_id
      WHERE a.slug = ?
        AND ${publicArticleRelationTargetSql("a")}
        AND b.id IN (${canonicalBreedIdsSql})
      ORDER BY b.fci_group ASC, b.name COLLATE NOCASE ASC, b.id ASC
      LIMIT ?`,
    bindings: [safeSlug, now.toISOString(), safeLimit] as const,
    limit: safeLimit,
  };
}

export async function listRelatedBreedsForArticle(
  articleSlug: string,
  options: { limit?: number; now?: Date; database?: RelationDatabase } = {},
): Promise<PublicRelatedBreed[]> {
  const database = relationDatabase(options.database);
  const query = buildArticleRelatedBreedsQuery(articleSlug, options.now ?? new Date(), options.limit ?? 4);
  if (!database || !query) return [];
  const result = await database.prepare(query.sql).bind(...query.bindings).all<RelatedBreedRow>();
  return result.results.map(relatedBreed);
}

export function buildDirectoryRelatedBreedsQuery(profileId: number, limit = 4) {
  if (!Number.isSafeInteger(profileId) || profileId <= 0) return null;
  const safeLimit = boundedLimit(limit, 4);
  return {
    sql: `SELECT DISTINCT b.id, b.slug, b.name, b.image_url, b.fci_group
      FROM directory_profiles d
      JOIN breed_directory_relations r ON r.profile_id = d.id
      JOIN managed_breeds b ON b.id = r.breed_id
      WHERE d.id = ?
        AND ${publicDirectoryRelationTargetSql("d")}
        AND b.id IN (${canonicalBreedIdsSql})
      ORDER BY b.fci_group ASC, b.name COLLATE NOCASE ASC, b.id ASC
      LIMIT ?`,
    bindings: [profileId, safeLimit] as const,
    limit: safeLimit,
  };
}

export async function listRelatedBreedsForDirectoryProfile(
  profileId: number,
  options: { limit?: number; database?: RelationDatabase } = {},
): Promise<PublicRelatedBreed[]> {
  const database = relationDatabase(options.database);
  const query = buildDirectoryRelatedBreedsQuery(profileId, options.limit ?? 4);
  if (!database || !query) return [];
  const result = await database.prepare(query.sql).bind(...query.bindings).all<RelatedBreedRow>();
  return result.results.map(relatedBreed);
}
