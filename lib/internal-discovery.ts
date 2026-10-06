import { env } from "cloudflare:workers";
import type { PublicDirectoryProfile } from "@/lib/directory";
import {
  DIRECTORY_LOCATION_LANDING_REGISTRY,
  canonicalDirectoryLocationLandingCategory,
  directoryLocationLandingIndexable,
  directoryLocationLandingPath,
  directoryLocationLandingSupportsDimension,
  publicCanonicalDirectoryLocationSql,
  type DirectoryLocationLanding,
  type DirectoryLocationLandingCategory,
} from "@/lib/directory-location-landings";
import {
  breedingStationBreedLandingPath,
  breedingStationRegionLandingPath,
  type BreedingStationLanding,
} from "@/lib/breeding-station-landings";
import {
  getSlovakLandingLocationByRawValue,
  slovakLandingLocationSqlClause,
  type SlovakLandingDimension,
  type SlovakLandingLocation,
} from "@/lib/slovak-location-landings";
import {
  SLOVAK_DISTRICTS_BY_REGION,
  SLOVAK_MUNICIPALITIES_BY_DISTRICT,
} from "@/lib/slovakia-locations";

export const INTERNAL_DISCOVERY_MAX_LINKS = 8;

export type InternalDiscoveryLink = {
  href: string;
  label: string;
  description?: string;
};

type DirectoryLandingCandidate = {
  category: DirectoryLocationLandingCategory;
  dimension: SlovakLandingDimension;
  location: SlovakLandingLocation;
  href: string;
  label: string;
};

type DiscoveryDatabase = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
    };
  };
};

type RuntimeBindings = { DB?: DiscoveryDatabase };

function discoveryDatabase(database?: DiscoveryDatabase) {
  if (database) return database;
  const bound = (env as unknown as RuntimeBindings).DB;
  return bound && typeof bound.prepare === "function" ? bound : null;
}

function canonicalDiscoveryPath(href: string) {
  return /^\/[a-z0-9][a-z0-9/-]*$/i.test(href) && !href.includes("?") && !href.includes("#");
}

export function boundInternalDiscoveryLinks(
  links: readonly InternalDiscoveryLink[],
  limit = INTERNAL_DISCOVERY_MAX_LINKS,
) {
  const safeLimit = Math.max(1, Math.min(INTERNAL_DISCOVERY_MAX_LINKS, Math.trunc(limit) || INTERNAL_DISCOVERY_MAX_LINKS));
  const seen = new Set<string>();
  return links.flatMap((link) => {
    const href = link.href.trim();
    const label = link.label.trim();
    if (!href || !label || !canonicalDiscoveryPath(href) || seen.has(href)) return [];
    seen.add(href);
    return [{ ...link, href, label }];
  }).slice(0, safeLimit);
}

function locationColumn(dimension: SlovakLandingDimension) {
  return dimension === "region" ? "d.region" : dimension === "district" ? "d.district" : "d.city";
}

function directoryLandingLabel(
  category: DirectoryLocationLandingCategory,
  location: SlovakLandingLocation,
) {
  return `${DIRECTORY_LOCATION_LANDING_REGISTRY[category].label} ${location.phrase}`;
}

function candidate(
  category: DirectoryLocationLandingCategory,
  dimension: SlovakLandingDimension,
  location: SlovakLandingLocation | null,
): DirectoryLandingCandidate | null {
  if (!location || !directoryLocationLandingSupportsDimension(category, dimension)) return null;
  return {
    category,
    dimension,
    location,
    href: directoryLocationLandingPath(category, dimension, location.slug),
    label: directoryLandingLabel(category, location),
  };
}

export function buildDirectoryProfileLocationCandidates(
  profile: Pick<PublicDirectoryProfile, "category" | "city" | "district" | "region">,
) {
  const category = canonicalDirectoryLocationLandingCategory(profile.category);
  if (!category) return [];
  return [
    candidate(category, "city", getSlovakLandingLocationByRawValue("city", profile.city)),
    candidate(category, "district", getSlovakLandingLocationByRawValue("district", profile.district)),
    candidate(category, "region", getSlovakLandingLocationByRawValue("region", profile.region)),
  ].filter((item): item is DirectoryLandingCandidate => Boolean(item));
}

function regionForDistrictName(districtName: string) {
  for (const [regionName, districts] of Object.entries(SLOVAK_DISTRICTS_BY_REGION)) {
    if (districts.includes(districtName)) {
      return getSlovakLandingLocationByRawValue("region", regionName);
    }
  }
  return null;
}

function parentLocationsForCity(location: SlovakLandingLocation) {
  const rawNames = new Set(location.sql.values);
  const districts = Object.entries(SLOVAK_MUNICIPALITIES_BY_DISTRICT)
    .filter(([, cities]) => cities.some((city) => rawNames.has(city)))
    .map(([district]) => district);

  const uniqueDistricts = [...new Set(districts)];
  const district = uniqueDistricts.length === 1
    ? getSlovakLandingLocationByRawValue("district", uniqueDistricts[0])
    : null;

  const regions = uniqueDistricts
    .map((districtName) => regionForDistrictName(districtName)?.name ?? "")
    .filter(Boolean);
  const uniqueRegions = [...new Set(regions)];
  const region = uniqueRegions.length === 1
    ? getSlovakLandingLocationByRawValue("region", uniqueRegions[0])
    : null;

  return { district, region };
}

export function buildDirectoryLocationParentCandidates(landing: DirectoryLocationLanding) {
  const category = landing.category;
  if (landing.dimension === "region") return [];

  if (landing.dimension === "district") {
    return [
      candidate(category, "region", regionForDistrictName(landing.location.name)),
    ].filter((item): item is DirectoryLandingCandidate => Boolean(item));
  }

  const parents = parentLocationsForCity(landing.location);
  return [
    candidate(category, "district", parents.district),
    candidate(category, "region", parents.region),
  ].filter((item): item is DirectoryLandingCandidate => Boolean(item));
}

export function buildDirectoryDiscoveryCountQuery(
  category: DirectoryLocationLandingCategory,
  candidates: readonly DirectoryLandingCandidate[],
) {
  const unique = [...new Map(candidates.map((item) => [item.href, item])).values()].slice(0, 3);
  if (!unique.length) return null;

  const bindings: unknown[] = [];
  const projections = unique.map((item, index) => {
    const clause = slovakLandingLocationSqlClause(locationColumn(item.dimension), item.location);
    bindings.push(...clause.bindings);
    return `SUM(CASE WHEN ${clause.sql} THEN 1 ELSE 0 END) AS target_${index}`;
  });

  return {
    sql: `SELECT
      ${projections.join(",\n      ")}
    FROM directory_profiles d
    WHERE ${publicCanonicalDirectoryLocationSql("d")}
      AND d.category = ?`,
    bindings: [...bindings, category] as readonly unknown[],
    candidates: unique,
  };
}

async function resolveIndexableDirectoryLinks(
  category: DirectoryLocationLandingCategory,
  candidates: readonly DirectoryLandingCandidate[],
  databaseInput?: DiscoveryDatabase,
) {
  const query = buildDirectoryDiscoveryCountQuery(category, candidates);
  const database = discoveryDatabase(databaseInput);
  if (!query || !database) return [];

  const row = await database.prepare(query.sql).bind(...query.bindings).first<Record<string, number | string | null>>();
  if (!row) return [];

  return boundInternalDiscoveryLinks(query.candidates.flatMap((item, index) => {
    const profileCount = Number(row[`target_${index}`] ?? 0);
    if (!directoryLocationLandingIndexable(category, profileCount)) return [];
    return [{
      href: item.href,
      label: item.label,
      description: `${profileCount} publikovaných profilov`,
    }];
  }), 3);
}

export async function listIndexableDirectoryProfileLocationLinks(
  profile: Pick<PublicDirectoryProfile, "category" | "city" | "district" | "region">,
  database?: DiscoveryDatabase,
) {
  const category = canonicalDirectoryLocationLandingCategory(profile.category);
  if (!category) return [];
  return resolveIndexableDirectoryLinks(category, buildDirectoryProfileLocationCandidates(profile), database);
}

export async function listIndexableDirectoryLandingParentLinks(
  landing: DirectoryLocationLanding,
  database?: DiscoveryDatabase,
) {
  return resolveIndexableDirectoryLinks(landing.category, buildDirectoryLocationParentCandidates(landing), database);
}

export function buildBreedingStationDiscoveryLinks(landing: BreedingStationLanding) {
  const links: InternalDiscoveryLink[] = [];
  if (landing.kind === "breed-region" && landing.indexable && landing.breed && landing.region) {
    links.push(
      {
        href: breedingStationBreedLandingPath(landing.breed.slug),
        label: `Všetky chovateľské stanice plemena ${landing.breed.name}`,
      },
      {
        href: breedingStationRegionLandingPath(landing.region.slug),
        label: `Chovateľské stanice v ${landing.region.locative}`,
      },
    );
  }
  if (landing.breed) {
    links.push({
      href: `/plemena/${landing.breed.slug}`,
      label: landing.breed.name,
      description: "Profil plemena",
    });
  }
  return boundInternalDiscoveryLinks(links, 3);
}
