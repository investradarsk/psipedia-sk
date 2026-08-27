import { kynologicalClubCategory } from "@/lib/directory";

export type DirectoryClubMigrationStats = {
  total: number;
  published: number;
  blankNames: number;
  blankCities: number;
  missingDistricts: number;
  missingRegions: number;
  uniqueRegions: number;
  onlineRegions: number;
};

type StatsRow = {
  total: number;
  published: number;
  blank_names: number;
  blank_cities: number;
  missing_districts: number;
  missing_regions: number;
  unique_regions: number;
  online_regions: number;
};

type SlugRow = { id: number; slug: string };

const expectedClubCount = 248;
const expectedRegionCount = 8;

function mapStats(row: StatsRow | null): DirectoryClubMigrationStats {
  return {
    total: Number(row?.total ?? 0),
    published: Number(row?.published ?? 0),
    blankNames: Number(row?.blank_names ?? 0),
    blankCities: Number(row?.blank_cities ?? 0),
    missingDistricts: Number(row?.missing_districts ?? 0),
    missingRegions: Number(row?.missing_regions ?? 0),
    uniqueRegions: Number(row?.unique_regions ?? 0),
    onlineRegions: Number(row?.online_regions ?? 0),
  };
}

function assertBaseStats(stats: DirectoryClubMigrationStats, stage: "pred" | "po") {
  const failures = [
    stats.total === expectedClubCount || `počet klubov ${stats.total}`,
    stats.published === expectedClubCount || `publikované kluby ${stats.published}`,
    stats.blankNames === 0 || `prázdne názvy ${stats.blankNames}`,
    stats.blankCities === 0 || `prázdne mestá ${stats.blankCities}`,
    stats.missingRegions === 0 || `chýbajúce kraje ${stats.missingRegions}`,
    stats.onlineRegions === 0 || `kraj Online ${stats.onlineRegions}`,
  ].filter((value): value is string => typeof value === "string");
  if (failures.length) throw new Error(`Kontrola ${stage} migráciou zlyhala: ${failures.join(", ")}.`);
}

function assertPostStats(stats: DirectoryClubMigrationStats) {
  assertBaseStats(stats, "po");
  const failures = [
    stats.missingDistricts === 0 || `chýbajúce okresy ${stats.missingDistricts}`,
    stats.uniqueRegions === expectedRegionCount || `unikátne kraje ${stats.uniqueRegions}`,
  ].filter((value): value is string => typeof value === "string");
  if (failures.length) throw new Error(`Kontrola po migrácii zlyhala: ${failures.join(", ")}.`);
}

async function readStats(database: D1Database) {
  const row = await database.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END), 0) AS published,
      COALESCE(SUM(CASE WHEN TRIM(name) = '' THEN 1 ELSE 0 END), 0) AS blank_names,
      COALESCE(SUM(CASE WHEN TRIM(city) = '' THEN 1 ELSE 0 END), 0) AS blank_cities,
      COALESCE(SUM(CASE WHEN TRIM(district) = '' THEN 1 ELSE 0 END), 0) AS missing_districts,
      COALESCE(SUM(CASE WHEN TRIM(region) = '' THEN 1 ELSE 0 END), 0) AS missing_regions,
      COUNT(DISTINCT NULLIF(TRIM(region), '')) AS unique_regions,
      COALESCE(SUM(CASE WHEN region = 'Online' THEN 1 ELSE 0 END), 0) AS online_regions
    FROM directory_profiles
    WHERE category = ?
  `).bind(kynologicalClubCategory).first<StatsRow>();
  return mapStats(row);
}

async function readSourceDistrictFailures(database: D1Database) {
  const row = await database.prepare(`
    SELECT COUNT(*) AS total
    FROM directory_profiles
    WHERE category = ? AND (
      NOT json_valid(source_data_json)
      OR NULLIF(TRIM(CAST(json_extract(source_data_json, '$.Okres') AS TEXT)), '') IS NULL
    )
  `).bind(kynologicalClubCategory).first<{ total: number }>();
  return Number(row?.total ?? 0);
}

async function readSlugs(database: D1Database) {
  const result = await database.prepare(`
    SELECT id, slug FROM directory_profiles WHERE category = ? ORDER BY id ASC
  `).bind(kynologicalClubCategory).all<SlugRow>();
  return result.results.map((row) => `${row.id}:${row.slug}`);
}

export async function migrateDirectoryClubLocations(database: D1Database) {
  const [before, sourceDistrictFailures, slugsBefore] = await Promise.all([
    readStats(database),
    readSourceDistrictFailures(database),
    readSlugs(database),
  ]);
  assertBaseStats(before, "pred");
  if (sourceDistrictFailures > 0) throw new Error(`Kontrola pred migráciou zlyhala: ${sourceDistrictFailures} klubov nemá platný okres v source_data_json.`);
  if (slugsBefore.length !== expectedClubCount) throw new Error("Kontrola pred migráciou zlyhala: zoznam slugov nie je kompletný.");

  const [districtUpdate, regionUpdate] = await database.batch([
    database.prepare(`
      UPDATE directory_profiles
      SET district = TRIM(CAST(json_extract(source_data_json, '$.Okres') AS TEXT))
      WHERE category = ?
        AND TRIM(district) = ''
        AND json_valid(source_data_json)
        AND NULLIF(TRIM(CAST(json_extract(source_data_json, '$.Okres') AS TEXT)), '') IS NOT NULL
    `).bind(kynologicalClubCategory),
    database.prepare(`
      UPDATE directory_profiles
      SET region = CASE TRIM(region)
        WHEN 'Bratislavský' THEN 'Bratislavský kraj'
        WHEN 'Trnavský' THEN 'Trnavský kraj'
        WHEN 'Trenčiansky' THEN 'Trenčiansky kraj'
        WHEN 'Nitriansky' THEN 'Nitriansky kraj'
        WHEN 'Žilinský' THEN 'Žilinský kraj'
        WHEN 'Banskobystrický' THEN 'Banskobystrický kraj'
        WHEN 'Prešovský' THEN 'Prešovský kraj'
        WHEN 'Košický' THEN 'Košický kraj'
        ELSE TRIM(region)
      END
      WHERE category = ? AND TRIM(region) IN (
        'Bratislavský', 'Trnavský', 'Trenčiansky', 'Nitriansky',
        'Žilinský', 'Banskobystrický', 'Prešovský', 'Košický'
      )
    `).bind(kynologicalClubCategory),
  ]);

  const [after, slugsAfter] = await Promise.all([readStats(database), readSlugs(database)]);
  assertPostStats(after);
  if (slugsBefore.length !== slugsAfter.length || slugsBefore.some((slug, index) => slug !== slugsAfter[index])) {
    throw new Error("Kontrola po migrácii zlyhala: existujúce slugy sa zmenili.");
  }

  return {
    before,
    after,
    changed: {
      districts: Number(districtUpdate.meta?.changes ?? 0),
      regions: Number(regionUpdate.meta?.changes ?? 0),
    },
    slugsPreserved: true,
  };
}
