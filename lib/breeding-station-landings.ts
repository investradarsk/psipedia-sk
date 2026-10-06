import { env } from "cloudflare:workers";
import { canonicalBreedWinnerSql } from "@/lib/breed-canonical";
import { publicDirectoryRelationTargetSql } from "@/lib/content-relations";
import type { PublicDirectoryProfile } from "@/lib/directory";
import { SLOVAK_REGION_LANDINGS, type SlovakRegionLandingLocation } from "@/lib/slovak-location-landings";

export const BREEDING_STATION_CATEGORY = "chovatelske-stanice" as const;
export const BREEDING_STATION_LANDING_INDEX_THRESHOLD = 2;

export type BreedingStationRegion = SlovakRegionLandingLocation;

export const BREEDING_STATION_REGIONS = SLOVAK_REGION_LANDINGS;

export type BreedingStationLandingSelector = {
  breedSlug?: string;
  regionSlug?: string;
};

export type BreedingStationLandingBreed = {
  id: number;
  slug: string;
  name: string;
  updatedAt: string | null;
};

export type BreedingStationLanding = {
  kind: "breed" | "region" | "breed-region";
  path: string;
  breed: BreedingStationLandingBreed | null;
  region: BreedingStationRegion | null;
  profiles: PublicDirectoryProfile[];
  total: number;
  indexable: boolean;
  lastModified: string | null;
  h1: string;
  seoTitle: string;
  description: string;
  intro: string;
};

type LandingRow = {
  id: number;
  slug: string;
  name: string;
  excerpt: string | null;
  services_json: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  price_note: string | null;
  image_url: string | null;
  featured: number | string | null;
  updated_at: string | null;
  breed_id: number | null;
  breed_slug: string | null;
  breed_name: string | null;
  breed_updated_at: string | null;
  relation_created_at: string | null;
};

type RuntimeBindings = { DB?: D1Database };

function runtimeDatabase(database?: D1Database) {
  if (database) return database;
  const bound = (env as unknown as RuntimeBindings).DB;
  return bound && typeof bound.prepare === "function" ? bound : null;
}

function cleanSlug(value: string | null | undefined) {
  const clean = value?.trim() ?? "";
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean) ? clean : "";
}

function withoutRegionSuffix(region: BreedingStationRegion) {
  return region.name.replace(/ kraj$/u, "");
}

function safeStringList(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

function newestTimestamp(values: Array<string | null | undefined>) {
  const candidates = values.map((value) => value?.trim() ?? "").filter(Boolean).sort();
  return candidates.at(-1) ?? null;
}

function profileFromRow(row: LandingRow): PublicDirectoryProfile {
  return {
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    category: BREEDING_STATION_CATEGORY,
    excerpt: row.excerpt?.trim() ?? "",
    description: "",
    services: safeStringList(row.services_json),
    qualifications: [],
    city: row.city?.trim() ?? "",
    district: row.district?.trim() ?? "",
    region: row.region?.trim() ?? "",
    address: "",
    postalCode: "",
    street: "",
    houseNumber: "",
    addressFormat: "",
    serviceAddressConfirmation: "LEGACY_UNCONFIRMED",
    formattedServiceAddress: null,
    priceNote: row.price_note?.trim() ?? "",
    websiteUrl: null,
    imageUrl: row.image_url?.trim() || null,
    verified: false,
    featured: Number(row.featured) === 1,
    updatedAt: row.updated_at?.trim() ?? "",
    importData: null,
  };
}

export function getBreedingStationRegionBySlug(slug: string | null | undefined) {
  const clean = cleanSlug(slug);
  return BREEDING_STATION_REGIONS.find((region) => region.slug === clean) ?? null;
}

export function breedingStationBreedLandingPath(breedSlug: string) {
  return `/adresar/${BREEDING_STATION_CATEGORY}/plemeno/${breedSlug}`;
}

export function breedingStationRegionLandingPath(regionSlug: string) {
  return `/adresar/${BREEDING_STATION_CATEGORY}/kraj/${regionSlug}`;
}

export function breedingStationBreedRegionLandingPath(breedSlug: string, regionSlug: string) {
  return `/adresar/${BREEDING_STATION_CATEGORY}/plemeno/${breedSlug}/kraj/${regionSlug}`;
}

export function breedingStationLandingIndexable(profileCount: number) {
  return Number.isFinite(profileCount) && profileCount >= BREEDING_STATION_LANDING_INDEX_THRESHOLD;
}

export function publicCanonicalBreedingStationSql(alias: string) {
  return `${publicDirectoryRelationTargetSql(alias)}
    AND ${alias}.category = '${BREEDING_STATION_CATEGORY}'
    AND TRIM(${alias}.slug) <> ''
    AND ${alias}.slug NOT GLOB '*[^a-z0-9-]*'
    AND TRIM(${alias}.name) <> ''`;
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function breedingStationRegionSlugSql(columnExpression = "d.region") {
  const branches = BREEDING_STATION_REGIONS.map((region) => (
    `WHEN TRIM(${columnExpression}) IN (${sqlLiteral(region.name)}, ${sqlLiteral(withoutRegionSuffix(region))}) THEN ${sqlLiteral(region.slug)}`
  ));
  return `CASE ${branches.join(" ")} ELSE NULL END`;
}

export function buildBreedingStationLandingQuery(selector: BreedingStationLandingSelector) {
  const breedSlug = selector.breedSlug === undefined ? "" : cleanSlug(selector.breedSlug);
  if (selector.breedSlug !== undefined && !breedSlug) return null;

  const region = selector.regionSlug === undefined ? null : getBreedingStationRegionBySlug(selector.regionSlug);
  if (selector.regionSlug !== undefined && !region) return null;
  if (!breedSlug && !region) return null;

  const regionClause = region ? "AND TRIM(d.region) IN (?, ?)" : "";
  const regionBindings = region ? [region.name, withoutRegionSuffix(region)] : [];

  if (breedSlug) {
    return {
      kind: region ? "breed-region" as const : "breed" as const,
      region,
      sql: `SELECT
        d.id, d.slug, d.name, d.excerpt, d.services_json, d.city, d.district, d.region,
        d.price_note, d.image_url, d.featured, d.updated_at,
        b.id AS breed_id, b.slug AS breed_slug, b.name AS breed_name, b.updated_at AS breed_updated_at,
        MAX(r.created_at) AS relation_created_at
      FROM managed_breeds b
      JOIN breed_directory_relations r ON r.breed_id = b.id
      JOIN directory_profiles d ON d.id = r.profile_id
      WHERE b.slug = ?
        AND ${canonicalBreedWinnerSql("b")}
        AND ${publicCanonicalBreedingStationSql("d")}
        ${regionClause}
      GROUP BY
        d.id, d.slug, d.name, d.excerpt, d.services_json, d.city, d.district, d.region,
        d.price_note, d.image_url, d.featured, d.updated_at,
        b.id, b.slug, b.name, b.updated_at
      ORDER BY d.featured DESC, d.name COLLATE NOCASE ASC, d.id ASC`,
      bindings: [breedSlug, ...regionBindings] as readonly unknown[],
    };
  }

  return {
    kind: "region" as const,
    region,
    sql: `SELECT
      d.id, d.slug, d.name, d.excerpt, d.services_json, d.city, d.district, d.region,
      d.price_note, d.image_url, d.featured, d.updated_at,
      NULL AS breed_id, NULL AS breed_slug, NULL AS breed_name, NULL AS breed_updated_at,
      NULL AS relation_created_at
    FROM directory_profiles d
    WHERE ${publicCanonicalBreedingStationSql("d")}
      ${regionClause}
    ORDER BY d.featured DESC, d.name COLLATE NOCASE ASC, d.id ASC`,
    bindings: regionBindings as readonly unknown[],
  };
}

function buildPresentation(input: {
  kind: BreedingStationLanding["kind"];
  breed: BreedingStationLandingBreed | null;
  region: BreedingStationRegion | null;
  total: number;
}) {
  const { kind, breed, region, total } = input;
  if (kind === "breed-region" && breed && region) {
    return {
      path: breedingStationBreedRegionLandingPath(breed.slug, region.slug),
      h1: `Chovateľské stanice pre plemeno ${breed.name} v ${region.locative}`,
      seoTitle: `Chovateľské stanice pre plemeno ${breed.name} v ${region.locative}`,
      description: `Zoznam chovateľských staníc pre plemeno ${breed.name} v ${region.locative}. Aktuálne obsahuje ${total} publikovaných profilov.`,
      intro: `Publikované chovateľské stanice pre plemeno ${breed.name}, ktoré majú v Psipedii uvedený ${region.name}.`,
    };
  }
  if (kind === "breed" && breed) {
    return {
      path: breedingStationBreedLandingPath(breed.slug),
      h1: `Chovateľské stanice pre plemeno ${breed.name}`,
      seoTitle: `Chovateľské stanice pre plemeno ${breed.name} na Slovensku`,
      description: `Zoznam chovateľských staníc pre plemeno ${breed.name} na Slovensku. Aktuálne obsahuje ${total} publikovaných profilov.`,
      intro: `Publikované chovateľské stanice pre plemeno ${breed.name} prepojené s canonical profilom plemena v Psipedii.`,
    };
  }
  if (region) {
    return {
      path: breedingStationRegionLandingPath(region.slug),
      h1: `Chovateľské stanice v ${region.locative}`,
      seoTitle: `Chovateľské stanice v ${region.locative}`,
      description: `Zoznam chovateľských staníc v ${region.locative}. Aktuálne obsahuje ${total} publikovaných profilov.`,
      intro: `Publikované chovateľské stanice, ktoré majú v Psipedii uvedený ${region.name}.`,
    };
  }
  throw new Error("invalid-breeding-station-landing-presentation");
}

export async function getBreedingStationLanding(
  selector: BreedingStationLandingSelector,
  databaseInput?: D1Database,
): Promise<BreedingStationLanding | null> {
  const database = runtimeDatabase(databaseInput);
  const query = buildBreedingStationLandingQuery(selector);
  if (!database || !query) return null;

  const result = await database.prepare(query.sql).bind(...query.bindings).all<LandingRow>();
  const rows = result.results ?? [];
  if (rows.length === 0) return null;

  const first = rows[0];
  const breed = first.breed_id && first.breed_slug && first.breed_name
    ? {
        id: Number(first.breed_id),
        slug: first.breed_slug,
        name: first.breed_name,
        updatedAt: first.breed_updated_at,
      }
    : null;
  if (query.kind !== "region" && !breed) return null;

  const total = rows.length;
  const presentation = buildPresentation({
    kind: query.kind,
    breed,
    region: query.region,
    total,
  });

  return {
    kind: query.kind,
    ...presentation,
    breed,
    region: query.region,
    profiles: rows.map(profileFromRow),
    total,
    indexable: breedingStationLandingIndexable(total),
    lastModified: newestTimestamp(rows.flatMap((row) => [
      row.updated_at,
      row.breed_updated_at,
      row.relation_created_at,
    ])),
  };
}

export function buildBreedingStationLandingBreadcrumbs(landing: BreedingStationLanding) {
  const breadcrumbs = [
    { name: "Domov", path: "/" },
    { name: "Služby pre psov", path: "/adresar" },
    { name: "Chovateľské stanice", path: `/adresar/${BREEDING_STATION_CATEGORY}` },
  ];

  if (landing.breed) {
    breadcrumbs.push({
      name: `Plemeno ${landing.breed.name}`,
      path: breedingStationBreedLandingPath(landing.breed.slug),
    });
  }
  if (landing.region) {
    breadcrumbs.push({
      name: landing.region.name,
      path: landing.breed
        ? breedingStationBreedRegionLandingPath(landing.breed.slug, landing.region.slug)
        : breedingStationRegionLandingPath(landing.region.slug),
    });
  }
  return breadcrumbs;
}
