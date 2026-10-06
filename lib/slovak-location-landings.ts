import {
  SLOVAK_DISTRICTS_BY_REGION,
  SLOVAK_MUNICIPALITIES_BY_DISTRICT,
  SLOVAK_REGIONS,
} from "@/lib/slovakia-locations";

export type SlovakLandingDimension = "region" | "district" | "city";

export type SlovakLandingLocation = {
  dimension: SlovakLandingDimension;
  slug: string;
  name: string;
  phrase: string;
  sql: {
    values: readonly string[];
    prefixes?: readonly string[];
  };
};

export type SlovakRegionLandingLocation = SlovakLandingLocation & {
  dimension: "region";
  locative: string;
};

export const SLOVAK_REGION_LANDINGS = [
  { dimension: "region", slug: "bratislavsky", name: "Bratislavský kraj", locative: "Bratislavskom kraji", phrase: "v Bratislavskom kraji", sql: { values: ["Bratislavský kraj", "Bratislavský"] } },
  { dimension: "region", slug: "trnavsky", name: "Trnavský kraj", locative: "Trnavskom kraji", phrase: "v Trnavskom kraji", sql: { values: ["Trnavský kraj", "Trnavský"] } },
  { dimension: "region", slug: "trenciansky", name: "Trenčiansky kraj", locative: "Trenčianskom kraji", phrase: "v Trenčianskom kraji", sql: { values: ["Trenčiansky kraj", "Trenčiansky"] } },
  { dimension: "region", slug: "nitriansky", name: "Nitriansky kraj", locative: "Nitrianskom kraji", phrase: "v Nitrianskom kraji", sql: { values: ["Nitriansky kraj", "Nitriansky"] } },
  { dimension: "region", slug: "zilinsky", name: "Žilinský kraj", locative: "Žilinskom kraji", phrase: "v Žilinskom kraji", sql: { values: ["Žilinský kraj", "Žilinský"] } },
  { dimension: "region", slug: "banskobystricky", name: "Banskobystrický kraj", locative: "Banskobystrickom kraji", phrase: "v Banskobystrickom kraji", sql: { values: ["Banskobystrický kraj", "Banskobystrický"] } },
  { dimension: "region", slug: "presovsky", name: "Prešovský kraj", locative: "Prešovskom kraji", phrase: "v Prešovskom kraji", sql: { values: ["Prešovský kraj", "Prešovský"] } },
  { dimension: "region", slug: "kosicky", name: "Košický kraj", locative: "Košickom kraji", phrase: "v Košickom kraji", sql: { values: ["Košický kraj", "Košický"] } },
] as const satisfies readonly SlovakRegionLandingLocation[];

if (
  SLOVAK_REGION_LANDINGS.length !== SLOVAK_REGIONS.length
  || SLOVAK_REGION_LANDINGS.some((region) => !(SLOVAK_REGIONS as readonly string[]).includes(region.name))
) {
  throw new Error("slovak-region-landing-map-out-of-sync");
}

export function slovakLocationSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("sk")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function uniqueCanonicalLocations(
  entries: Array<{ name: string; identity: string }>,
  dimension: "district" | "city",
) {
  const bySlug = new Map<string, Array<{ name: string; identity: string }>>();
  for (const entry of entries) {
    const slug = slovakLocationSlug(entry.name);
    if (!slug) continue;
    const bucket = bySlug.get(slug) ?? [];
    bucket.push(entry);
    bySlug.set(slug, bucket);
  }

  const result = new Map<string, SlovakLandingLocation>();
  for (const [slug, bucket] of bySlug) {
    if (bucket.length !== 1) continue;
    const [{ name }] = bucket;
    result.set(slug, {
      dimension,
      slug,
      name,
      phrase: dimension === "district" ? `v okrese ${name}` : `v meste ${name}`,
      sql: { values: [name] },
    });
  }
  return result;
}

const DISTRICT_LOCATIONS = uniqueCanonicalLocations(
  Object.entries(SLOVAK_DISTRICTS_BY_REGION).flatMap(([region, districts]) => (
    districts.map((name) => ({ name, identity: `${region}|${name}` }))
  )),
  "district",
);

const CITY_AGGREGATES = [
  {
    dimension: "city",
    slug: "bratislava",
    name: "Bratislava",
    phrase: "v meste Bratislava",
    sql: { values: ["Bratislava"], prefixes: ["Bratislava - "] },
  },
  {
    dimension: "city",
    slug: "kosice",
    name: "Košice",
    phrase: "v meste Košice",
    sql: { values: ["Košice"], prefixes: ["Košice - "] },
  },
] as const satisfies readonly SlovakLandingLocation[];

const CITY_LOCATIONS = uniqueCanonicalLocations(
  Object.entries(SLOVAK_MUNICIPALITIES_BY_DISTRICT).flatMap(([district, cities]) => (
    cities
      .filter((name) => !/^Bratislava - /u.test(name) && !/^Košice - /u.test(name))
      .map((name) => ({ name, identity: `${district}|${name}` }))
  )),
  "city",
);
for (const aggregate of CITY_AGGREGATES) CITY_LOCATIONS.set(aggregate.slug, aggregate);

const REGION_BY_SLUG = new Map<string, SlovakRegionLandingLocation>(
  SLOVAK_REGION_LANDINGS.map((region) => [region.slug, region]),
);

function cleanSlug(value: string | null | undefined) {
  const clean = value?.trim() ?? "";
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean) ? clean : "";
}

export function getSlovakLandingLocationBySlug(
  dimension: SlovakLandingDimension,
  slug: string | null | undefined,
): SlovakLandingLocation | null {
  const clean = cleanSlug(slug);
  if (!clean) return null;
  if (dimension === "region") return REGION_BY_SLUG.get(clean) ?? null;
  if (dimension === "district") return DISTRICT_LOCATIONS.get(clean) ?? null;
  return CITY_LOCATIONS.get(clean) ?? null;
}

function exactRegion(raw: string) {
  const clean = raw.trim();
  return SLOVAK_REGION_LANDINGS.find((region) => (region.sql.values as readonly string[]).includes(clean)) ?? null;
}

function exactDistrict(raw: string) {
  const clean = raw.trim();
  const slug = slovakLocationSlug(clean);
  const district = DISTRICT_LOCATIONS.get(slug);
  return district?.name === clean ? district : null;
}

function exactCity(raw: string) {
  const clean = raw.trim();
  for (const aggregate of CITY_AGGREGATES) {
    if (
      (aggregate.sql.values as readonly string[]).includes(clean)
      || aggregate.sql.prefixes?.some((prefix) => clean.startsWith(prefix))
    ) return aggregate;
  }
  const slug = slovakLocationSlug(clean);
  const city = CITY_LOCATIONS.get(slug);
  return city?.name === clean ? city : null;
}

export function getSlovakLandingLocationByRawValue(
  dimension: SlovakLandingDimension,
  raw: string | null | undefined,
): SlovakLandingLocation | null {
  const clean = raw?.trim() ?? "";
  if (!clean) return null;
  if (dimension === "region") return exactRegion(clean);
  if (dimension === "district") return exactDistrict(clean);
  return exactCity(clean);
}

export function slovakLandingLocationSqlClause(
  columnExpression: string,
  location: SlovakLandingLocation,
) {
  const clauses: string[] = [];
  const bindings: string[] = [];
  for (const value of location.sql.values) {
    clauses.push(`TRIM(${columnExpression}) = ?`);
    bindings.push(value);
  }
  for (const prefix of location.sql.prefixes ?? []) {
    clauses.push(`TRIM(${columnExpression}) LIKE ?`);
    bindings.push(`${prefix}%`);
  }
  return {
    sql: clauses.length > 1 ? `(${clauses.join(" OR ")})` : clauses[0] ?? "0 = 1",
    bindings,
  };
}

export function directoryLocationSegment(dimension: SlovakLandingDimension) {
  return dimension === "region" ? "kraj" : dimension === "district" ? "okres" : "mesto";
}
