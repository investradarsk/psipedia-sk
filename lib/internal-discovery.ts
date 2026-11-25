import { breedProfileHref } from "@/lib/breed-canonical";
import { env } from "cloudflare:workers";
import { formatSlovakCount } from "@/lib/slovak-count";
import type { PublicDirectoryProfile } from "@/lib/directory";
import {
  DIRECTORY_LOCATION_LANDING_REGISTRY,
  canonicalDirectoryLocationLandingCategory,
  directoryLocationLandingIndexable,
  directoryLocationCanonicalPath,
  getDirectoryLocationLandingAncestors,
  directoryLocationLandingPath,
  directoryLocationLandingSupportsDimension,
  buildDirectoryLocationMembershipQuery,
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
  type SlovakLandingDimension,
  type SlovakLandingLocation,
} from "@/lib/slovak-location-landings";

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
    candidate(
      category,
      "district",
      getSlovakLandingLocationByRawValue("district", profile.district),
    ),
    candidate(category, "region", getSlovakLandingLocationByRawValue("region", profile.region)),
  ].filter((item): item is DirectoryLandingCandidate => Boolean(item));
}

export function buildDirectoryLocationParentCandidates(landing: DirectoryLocationLanding) {
  return getDirectoryLocationLandingAncestors(landing.category, landing.location)
    .reverse()
    .map((location) => candidate(landing.category, location.dimension, location))
    .filter((item): item is DirectoryLandingCandidate => item !== null);
}

export function buildDirectoryDiscoveryCountQuery(
  category: DirectoryLocationLandingCategory,
  candidates: readonly DirectoryLandingCandidate[],
) {
  const requested = [...new Map(candidates.map((item) => [item.href, item])).values()].slice(0, 3);
  const withAncestors = requested.flatMap((item) => [
    item,
    ...getDirectoryLocationLandingAncestors(category, item.location)
      .map((location) => candidate(category, location.dimension, location))
      .filter((parent): parent is DirectoryLandingCandidate => parent !== null),
  ]);
  const unique = [
    ...new Map([...requested, ...withAncestors].map((item) => [item.href, item])).values(),
  ];
  if (!unique.length) return null;

  return {
    ...buildDirectoryLocationMembershipQuery(
      category,
      unique.map((item) => item.location),
    ),
    candidates: unique,
    requestedCount: requested.length,
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

  const row = await database
    .prepare(query.sql)
    .bind(...query.bindings)
    .first<Record<string, number | string | null>>();
  if (!row) return [];

  const memberships = new Map(
    query.candidates.map((item, index) => [
      item.href,
      String(row[`profiles_${index}`] ?? "")
        .split(",")
        .filter(Boolean),
    ]),
  );
  return boundInternalDiscoveryLinks(
    query.candidates.slice(0, query.requestedCount).flatMap((item) => {
      const profileCount = memberships.get(item.href)?.length ?? 0;
      if (
        !directoryLocationLandingIndexable(category, profileCount) ||
        directoryLocationCanonicalPath(category, item.location, memberships) !== item.href
      )
        return [];
      return [
        {
          href: item.href,
          label: item.label,
          description: formatSlovakCount(profileCount, {
            one: "publikovaný profil",
            few: "publikované profily",
            many: "publikovaných profilov",
          }),
        },
      ];
    }),
    3,
  );
}

export async function listIndexableDirectoryProfileLocationLinks(
  profile: Pick<PublicDirectoryProfile, "category" | "city" | "district" | "region">,
  database?: DiscoveryDatabase,
) {
  const category = canonicalDirectoryLocationLandingCategory(profile.category);
  if (!category) return [];
  return resolveIndexableDirectoryLinks(
    category,
    buildDirectoryProfileLocationCandidates(profile),
    database,
  );
}

export async function listIndexableDirectoryLandingParentLinks(
  landing: DirectoryLocationLanding,
  database?: DiscoveryDatabase,
) {
  return resolveIndexableDirectoryLinks(
    landing.category,
    buildDirectoryLocationParentCandidates(landing),
    database,
  );
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
      href: breedProfileHref(landing.breed.slug, landing.breed.fciGroup),
      label: landing.breed.name,
      description: "Profil plemena",
    });
  }
  return boundInternalDiscoveryLinks(links, 3);
}
