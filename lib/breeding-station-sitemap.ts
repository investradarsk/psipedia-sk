import { env } from "cloudflare:workers";
import {
  BREEDING_STATION_LANDING_INDEX_THRESHOLD,
  breedingStationBreedLandingPath,
  breedingStationBreedRegionLandingPath,
  breedingStationRegionLandingPath,
  breedingStationRegionSlugSql,
  getBreedingStationRegionBySlug,
  publicCanonicalBreedingStationSql,
} from "@/lib/breeding-station-landings";
import { canonicalBreedWinnerSql } from "@/lib/breed-canonical";

export type BreedingStationLandingSitemapRecord = {
  path: string;
  profileCount: number;
  lastModified: string | null;
  kind: "breed" | "region" | "breed-region";
};

type AggregateRow = {
  breed_slug: string | null;
  region_slug: string | null;
  profile_count: number | string;
  profile_updated_at: string | null;
  breed_updated_at: string | null;
  relation_created_at: string | null;
};

type RuntimeBindings = { DB?: D1Database };

function runtimeDatabase(database?: D1Database) {
  if (database) return database;
  const bound = (env as unknown as RuntimeBindings).DB;
  return bound && typeof bound.prepare === "function" ? bound : null;
}

function newestTimestamp(values: Array<string | null | undefined>) {
  const candidates = values.map((value) => value?.trim() ?? "").filter(Boolean).sort();
  return candidates.at(-1) ?? null;
}

export function buildBreedingStationLandingSitemapQueries() {
  const regionSlug = breedingStationRegionSlugSql("d.region");
  const threshold = BREEDING_STATION_LANDING_INDEX_THRESHOLD;

  return [
    {
      kind: "breed" as const,
      sql: `SELECT
        b.slug AS breed_slug,
        NULL AS region_slug,
        COUNT(DISTINCT d.id) AS profile_count,
        MAX(d.updated_at) AS profile_updated_at,
        MAX(b.updated_at) AS breed_updated_at,
        MAX(r.created_at) AS relation_created_at
      FROM managed_breeds b
      JOIN breed_directory_relations r ON r.breed_id = b.id
      JOIN directory_profiles d ON d.id = r.profile_id
      WHERE ${canonicalBreedWinnerSql("b")}
        AND ${publicCanonicalBreedingStationSql("d")}
      GROUP BY b.id, b.slug, b.updated_at
      HAVING COUNT(DISTINCT d.id) >= ?`,
      bindings: [threshold] as readonly unknown[],
    },
    {
      kind: "region" as const,
      sql: `SELECT
        NULL AS breed_slug,
        ${regionSlug} AS region_slug,
        COUNT(DISTINCT d.id) AS profile_count,
        MAX(d.updated_at) AS profile_updated_at,
        NULL AS breed_updated_at,
        NULL AS relation_created_at
      FROM directory_profiles d
      WHERE ${publicCanonicalBreedingStationSql("d")}
        AND ${regionSlug} IS NOT NULL
      GROUP BY ${regionSlug}
      HAVING COUNT(DISTINCT d.id) >= ?`,
      bindings: [threshold] as readonly unknown[],
    },
    {
      kind: "breed-region" as const,
      sql: `SELECT
        b.slug AS breed_slug,
        ${regionSlug} AS region_slug,
        COUNT(DISTINCT d.id) AS profile_count,
        MAX(d.updated_at) AS profile_updated_at,
        MAX(b.updated_at) AS breed_updated_at,
        MAX(r.created_at) AS relation_created_at
      FROM managed_breeds b
      JOIN breed_directory_relations r ON r.breed_id = b.id
      JOIN directory_profiles d ON d.id = r.profile_id
      WHERE ${canonicalBreedWinnerSql("b")}
        AND ${publicCanonicalBreedingStationSql("d")}
        AND ${regionSlug} IS NOT NULL
      GROUP BY b.id, b.slug, b.updated_at, ${regionSlug}
      HAVING COUNT(DISTINCT d.id) >= ?`,
      bindings: [threshold] as readonly unknown[],
    },
  ] as const;
}

export async function listIndexableBreedingStationLandingSitemapRecords(
  databaseInput?: D1Database,
): Promise<BreedingStationLandingSitemapRecord[]> {
  const database = runtimeDatabase(databaseInput);
  if (!database) return [];

  const queries = buildBreedingStationLandingSitemapQueries();
  const results = await database.batch(
    queries.map((query) => database.prepare(query.sql).bind(...query.bindings)),
  );

  const records: BreedingStationLandingSitemapRecord[] = [];
  results.forEach((result, index) => {
    const kind = queries[index].kind;
    for (const rawRow of result.results ?? []) {
      const row = rawRow as unknown as AggregateRow;
      const breedSlug = row.breed_slug?.trim() ?? "";
      const region = row.region_slug ? getBreedingStationRegionBySlug(row.region_slug) : null;
      const profileCount = Number(row.profile_count ?? 0);
      if (profileCount < BREEDING_STATION_LANDING_INDEX_THRESHOLD) continue;

      const path = kind === "breed" && breedSlug
        ? breedingStationBreedLandingPath(breedSlug)
        : kind === "region" && region
          ? breedingStationRegionLandingPath(region.slug)
          : kind === "breed-region" && breedSlug && region
            ? breedingStationBreedRegionLandingPath(breedSlug, region.slug)
            : null;
      if (!path) continue;

      records.push({
        path,
        profileCount,
        kind,
        lastModified: newestTimestamp([
          row.profile_updated_at,
          row.breed_updated_at,
          row.relation_created_at,
        ]),
      });
    }
  });

  return [...new Map(records.map((record) => [record.path, record])).values()]
    .sort((left, right) => left.path.localeCompare(right.path, "sk"));
}
