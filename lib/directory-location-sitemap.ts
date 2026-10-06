import { env } from "cloudflare:workers";
import {
  DIRECTORY_LOCATION_LANDING_REGISTRY,
  directoryLocationLandingPath,
  publicCanonicalDirectoryLocationSql,
  type DirectoryLocationLandingCategory,
} from "@/lib/directory-location-landings";
import {
  getSlovakLandingLocationByRawValue,
  type SlovakLandingDimension,
} from "@/lib/slovak-location-landings";

export type DirectoryLocationLandingSitemapRecord = {
  path: string;
  profileCount: number;
  lastModified: string | null;
  category: DirectoryLocationLandingCategory;
  dimension: SlovakLandingDimension;
};

type AggregateRow = {
  category: string;
  location_value: string | null;
  profile_count: number | string;
  profile_updated_at: string | null;
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

function categoriesForDimension(dimension: SlovakLandingDimension) {
  return (Object.entries(DIRECTORY_LOCATION_LANDING_REGISTRY) as Array<
    [DirectoryLocationLandingCategory, (typeof DIRECTORY_LOCATION_LANDING_REGISTRY)[DirectoryLocationLandingCategory]]
  >)
    .filter(([, config]) => (config.dimensions as readonly SlovakLandingDimension[]).includes(dimension))
    .map(([category]) => category);
}

function locationColumn(dimension: SlovakLandingDimension) {
  return dimension === "region" ? "d.region" : dimension === "district" ? "d.district" : "d.city";
}

export function buildDirectoryLocationLandingSitemapQueries() {
  return (["region", "district", "city"] as const).map((dimension) => {
    const categories = categoriesForDimension(dimension);
    const column = locationColumn(dimension);
    const placeholders = categories.map(() => "?").join(", ");
    return {
      dimension,
      sql: `SELECT
        d.category AS category,
        TRIM(${column}) AS location_value,
        COUNT(DISTINCT d.id) AS profile_count,
        MAX(d.updated_at) AS profile_updated_at
      FROM directory_profiles d
      WHERE ${publicCanonicalDirectoryLocationSql("d")}
        AND d.category IN (${placeholders})
        AND TRIM(${column}) <> ''
      GROUP BY d.category, TRIM(${column})`,
      bindings: categories as readonly unknown[],
    };
  });
}

export async function listIndexableDirectoryLocationLandingSitemapRecords(
  databaseInput?: D1Database,
): Promise<DirectoryLocationLandingSitemapRecord[]> {
  const database = runtimeDatabase(databaseInput);
  if (!database) return [];

  const queries = buildDirectoryLocationLandingSitemapQueries();
  const results = await database.batch(
    queries.map((query) => database.prepare(query.sql).bind(...query.bindings)),
  );

  const aggregate = new Map<string, DirectoryLocationLandingSitemapRecord>();

  results.forEach((result, index) => {
    const dimension = queries[index].dimension;
    for (const rawRow of result.results ?? []) {
      const row = rawRow as unknown as AggregateRow;
      const category = row.category?.trim() as DirectoryLocationLandingCategory;
      const config = DIRECTORY_LOCATION_LANDING_REGISTRY[category];
      if (!config || !(config.dimensions as readonly SlovakLandingDimension[]).includes(dimension)) continue;

      const location = getSlovakLandingLocationByRawValue(dimension, row.location_value);
      if (!location) continue;

      const path = directoryLocationLandingPath(category, dimension, location.slug);
      const profileCount = Number(row.profile_count ?? 0);
      if (!Number.isFinite(profileCount) || profileCount <= 0) continue;

      const existing = aggregate.get(path);
      aggregate.set(path, {
        path,
        profileCount: (existing?.profileCount ?? 0) + profileCount,
        lastModified: newestTimestamp([existing?.lastModified, row.profile_updated_at]),
        category,
        dimension,
      });
    }
  });

  return [...aggregate.values()]
    .filter((record) => record.profileCount >= DIRECTORY_LOCATION_LANDING_REGISTRY[record.category].indexThreshold)
    .sort((left, right) => left.path.localeCompare(right.path, "sk"));
}
