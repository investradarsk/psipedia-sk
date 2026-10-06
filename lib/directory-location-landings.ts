import { env } from "cloudflare:workers";
import { publicDirectoryRelationTargetSql } from "@/lib/content-relations";
import {
  getDirectoryCategory,
  type DirectoryCategorySlug,
  type PublicDirectoryProfile,
} from "@/lib/directory";
import {
  directoryLocationSegment,
  getSlovakLandingLocationBySlug,
  slovakLandingLocationSqlClause,
  type SlovakLandingDimension,
  type SlovakLandingLocation,
} from "@/lib/slovak-location-landings";

export const DIRECTORY_LOCATION_LANDING_DEFAULT_INDEX_THRESHOLD = 2;

type DirectoryLocationLandingConfig = {
  label: string;
  dimensions: readonly SlovakLandingDimension[];
  indexThreshold: number;
};

export const DIRECTORY_LOCATION_LANDING_REGISTRY = {
  veterinari: {
    label: "Veterinári",
    dimensions: ["region", "district", "city"],
    indexThreshold: 2,
  },
  treneri: {
    label: "Psí tréneri a psie školy",
    dimensions: ["region", "district", "city"],
    indexThreshold: 2,
  },
  "kynologicke-kluby": {
    label: "Kynologické kluby",
    dimensions: ["region", "district"],
    indexThreshold: 2,
  },
  "chovatelske-kluby": {
    label: "Chovateľské kluby",
    dimensions: ["region", "district"],
    indexThreshold: 2,
  },
  "salony-a-sluzby": {
    label: "Psie salóny",
    dimensions: ["region", "district", "city"],
    indexThreshold: 2,
  },
  "hotely-a-opatrovanie": {
    label: "Hotely a opatrovanie psov",
    dimensions: ["region", "district", "city"],
    indexThreshold: 2,
  },
  vencenie: {
    label: "Venčenie psov",
    dimensions: ["region", "city"],
    indexThreshold: 2,
  },
  fyzioterapia: {
    label: "Fyzioterapia pre psov",
    dimensions: ["region", "city"],
    indexThreshold: 2,
  },
  "dalsie-sluzby": {
    label: "Ďalšie služby pre psov",
    dimensions: ["region"],
    indexThreshold: 2,
  },
} as const satisfies Partial<Record<DirectoryCategorySlug, DirectoryLocationLandingConfig>>;

export type DirectoryLocationLandingCategory = keyof typeof DIRECTORY_LOCATION_LANDING_REGISTRY;

export const DIRECTORY_LOCATION_CATEGORY_ALIASES = {
  "psie-skoly": "treneri",
} as const satisfies Partial<Record<DirectoryCategorySlug, DirectoryLocationLandingCategory>>;

export type DirectoryLocationLandingSelector = {
  category: string;
  dimension: SlovakLandingDimension;
  locationSlug: string;
};

export type DirectoryLocationLanding = {
  category: DirectoryLocationLandingCategory;
  categoryLabel: string;
  dimension: SlovakLandingDimension;
  location: SlovakLandingLocation;
  path: string;
  profiles: PublicDirectoryProfile[];
  total: number;
  indexThreshold: number;
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
  category: string;
  excerpt: string | null;
  services_json: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  price_note: string | null;
  image_url: string | null;
  featured: number | string | null;
  updated_at: string | null;
};

type RuntimeBindings = { DB?: D1Database };

function runtimeDatabase(database?: D1Database) {
  if (database) return database;
  const bound = (env as unknown as RuntimeBindings).DB;
  return bound && typeof bound.prepare === "function" ? bound : null;
}

function safeStringList(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim())
          .slice(0, 20)
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
    category: row.category as DirectoryCategorySlug,
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

export function isDirectoryLocationLandingCategory(
  value: string,
): value is DirectoryLocationLandingCategory {
  return Object.prototype.hasOwnProperty.call(DIRECTORY_LOCATION_LANDING_REGISTRY, value);
}

export function canonicalDirectoryLocationLandingCategory(
  value: string,
): DirectoryLocationLandingCategory | null {
  if (isDirectoryLocationLandingCategory(value)) return value;
  return DIRECTORY_LOCATION_CATEGORY_ALIASES[value as keyof typeof DIRECTORY_LOCATION_CATEGORY_ALIASES] ?? null;
}

export function getDirectoryLocationLandingConfig(category: string) {
  const canonical = canonicalDirectoryLocationLandingCategory(category);
  return canonical ? DIRECTORY_LOCATION_LANDING_REGISTRY[canonical] : null;
}

export function directoryLocationLandingSupportsDimension(
  category: string,
  dimension: SlovakLandingDimension,
) {
  const config = getDirectoryLocationLandingConfig(category);
  return Boolean(config && (config.dimensions as readonly SlovakLandingDimension[]).includes(dimension));
}

export function directoryLocationLandingPath(
  category: DirectoryLocationLandingCategory,
  dimension: SlovakLandingDimension,
  locationSlug: string,
) {
  return `/adresar/${category}/${directoryLocationSegment(dimension)}/${locationSlug}`;
}

export function directoryLocationLandingIndexable(
  category: DirectoryLocationLandingCategory,
  profileCount: number,
) {
  const threshold = DIRECTORY_LOCATION_LANDING_REGISTRY[category].indexThreshold
    ?? DIRECTORY_LOCATION_LANDING_DEFAULT_INDEX_THRESHOLD;
  return Number.isFinite(profileCount) && profileCount >= threshold;
}

export function publicCanonicalDirectoryLocationSql(alias: string) {
  return `${publicDirectoryRelationTargetSql(alias)}
    AND TRIM(${alias}.slug) <> ''
    AND ${alias}.slug NOT GLOB '*[^a-z0-9-]*'
    AND TRIM(${alias}.name) <> ''`;
}

function locationColumn(dimension: SlovakLandingDimension) {
  return dimension === "region" ? "d.region" : dimension === "district" ? "d.district" : "d.city";
}

export function buildDirectoryLocationLandingQuery(selector: DirectoryLocationLandingSelector) {
  const canonicalCategory = canonicalDirectoryLocationLandingCategory(selector.category);
  if (!canonicalCategory || canonicalCategory !== selector.category) return null;

  const config = DIRECTORY_LOCATION_LANDING_REGISTRY[canonicalCategory];
  if (!(config.dimensions as readonly SlovakLandingDimension[]).includes(selector.dimension)) return null;

  const location = getSlovakLandingLocationBySlug(selector.dimension, selector.locationSlug);
  if (!location) return null;

  const locationClause = slovakLandingLocationSqlClause(locationColumn(selector.dimension), location);
  return {
    category: canonicalCategory,
    dimension: selector.dimension,
    location,
    sql: `SELECT
      d.id, d.slug, d.name, d.category, d.excerpt, d.services_json,
      d.city, d.district, d.region, d.price_note, d.image_url, d.featured, d.updated_at
    FROM directory_profiles d
    WHERE ${publicCanonicalDirectoryLocationSql("d")}
      AND d.category = ?
      AND ${locationClause.sql}
    ORDER BY d.featured DESC, d.name COLLATE NOCASE ASC, d.id ASC`,
    bindings: [canonicalCategory, ...locationClause.bindings] as readonly unknown[],
  };
}

function buildPresentation(input: {
  category: DirectoryLocationLandingCategory;
  location: SlovakLandingLocation;
  total: number;
}) {
  const config = DIRECTORY_LOCATION_LANDING_REGISTRY[input.category];
  const category = getDirectoryCategory(input.category);
  if (!category) throw new Error("directory-location-landing-category-missing");

  const h1 = `${config.label} ${input.location.phrase}`;
  return {
    categoryLabel: category.label,
    h1,
    seoTitle: h1,
    description: `${h1}. Adresár aktuálne obsahuje ${input.total} publikovaných profilov pre túto lokalitu.`,
    intro: `Zobrazené profily patria do kategórie ${category.label.toLocaleLowerCase("sk")} a majú v Psipedii uvedenú lokalitu ${input.location.name}.`,
  };
}

export async function getDirectoryLocationLanding(
  selector: DirectoryLocationLandingSelector,
  databaseInput?: D1Database,
): Promise<DirectoryLocationLanding | null> {
  const database = runtimeDatabase(databaseInput);
  const query = buildDirectoryLocationLandingQuery(selector);
  if (!database || !query) return null;

  const result = await database.prepare(query.sql).bind(...query.bindings).all<LandingRow>();
  const rows = result.results ?? [];
  if (rows.length === 0) return null;

  const total = rows.length;
  const presentation = buildPresentation({
    category: query.category,
    location: query.location,
    total,
  });
  const indexThreshold = DIRECTORY_LOCATION_LANDING_REGISTRY[query.category].indexThreshold;

  return {
    category: query.category,
    ...presentation,
    dimension: query.dimension,
    location: query.location,
    path: directoryLocationLandingPath(query.category, query.dimension, query.location.slug),
    profiles: rows.map(profileFromRow),
    total,
    indexThreshold,
    indexable: directoryLocationLandingIndexable(query.category, total),
    lastModified: newestTimestamp(rows.map((row) => row.updated_at)),
  };
}

export function buildDirectoryLocationLandingBreadcrumbs(landing: DirectoryLocationLanding) {
  return [
    { name: "Domov", path: "/" },
    { name: "Služby pre psov", path: "/adresar" },
    { name: landing.categoryLabel, path: `/adresar/${landing.category}` },
    { name: landing.location.name, path: landing.path },
  ];
}
