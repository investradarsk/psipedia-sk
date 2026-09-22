import type { AdoptionD1Database } from "./adoption-store.ts";
import { cleanPublicOrganizationCopy } from "./public-integrity.ts";
import {
  listPublicAdoptionsByOrganizationId,
  type OrganizationPublicAdoption,
} from "./organization-adoption-store.ts";
import {
  listPublicOrganizationFundraisingMethods,
  type PublicOrganizationFundraisingMethod,
} from "./organization-fundraising-public.ts";

export type PublicOrganizationType =
  | "SHELTER"
  | "CIVIC_ASSOCIATION"
  | "RESCUE_ORGANIZATION"
  | "MUNICIPAL_ORGANIZATION"
  | "NONPROFIT"
  | "OTHER";

export type PublicOrganizationLocationRole = "UNSPECIFIED" | "SITE" | "LEGAL_SEAT" | "SERVICE_AREA";

export type PublicOrganizationLocation = {
  id: number | null;
  organizationId: number;
  role: PublicOrganizationLocationRole;
  label: string;
  city: string;
  district: string;
  region: string;
  countryCode: string;
  isPrimary: boolean;
  sortOrder: number;
};

export type PublicOrganizationDirectoryRelation = {
  id: number;
  name: string;
  slug: string;
  category: string;
};

export type PublicHelpOrganization = {
  id: number;
  name: string;
  slug: string;
  legalName: string;
  registrationNumber: string | null;
  type: PublicOrganizationType;
  shortDescription: string;
  description: string;
  publicEmail: string | null;
  publicPhone: string | null;
  websiteUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  city: string;
  district: string;
  region: string;
  countryCode: string;
  locations: PublicOrganizationLocation[];
  imageUrl: string | null;
  sourceUrl: string | null;
  publishedAt: string;
  lastVerifiedAt: string | null;
  updatedAt: string;
  directory: PublicOrganizationDirectoryRelation | null;
};

export type PublicOrganizationComposition = {
  organization: PublicHelpOrganization;
  adoptions: OrganizationPublicAdoption[];
  fundraisingMethods: PublicOrganizationFundraisingMethod[];
};

export type PublicOrganizationSitemapRecord = {
  slug: string;
  publishedAt: string;
  updatedAt: string;
};

export type PublicOrganizationIndexItem = {
  id: number;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  city: string;
  region: string;
  imageUrl: string | null;
  websiteUrl: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  publishedAt: string;
  lastVerifiedAt: string | null;
  updatedAt: string;
};

type PublicOrganizationRow = {
  id: number;
  name: string;
  slug: string;
  legal_name: string;
  registration_number: string | null;
  type: string;
  status: string;
  short_description: string;
  description: string;
  public_email: string | null;
  public_phone: string | null;
  website_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  city: string;
  district: string;
  region: string;
  country_code: string;
  image_url: string | null;
  source_url: string | null;
  published_at: string;
  last_verified_at: string | null;
  updated_at: string;
  directory_profile_id: number | null;
};

type PublicOrganizationLocationRow = {
  id: number;
  organization_id: number;
  role: string;
  label: string;
  city: string;
  district: string;
  region: string;
  country_code: string;
  is_primary: number;
  sort_order: number;
};

type PublicOrganizationSitemapRow = {
  slug: string;
  published_at: string;
  updated_at: string;
};

type PublicOrganizationIndexRow = {
  id: number;
  name: string;
  slug: string;
  short_description: string;
  description: string;
  city: string;
  region: string;
  image_url: string | null;
  website_url: string | null;
  public_email: string | null;
  public_phone: string | null;
  published_at: string;
  last_verified_at: string | null;
  updated_at: string;
};

type PublicDirectoryRow = {
  id: number;
  name: string;
  slug: string;
  category: string;
};

export const PUBLIC_ORGANIZATION_PREDICATE =
  "o.status = 'PUBLISHED' AND o.published_at IS NOT NULL AND o.archived_at IS NULL";

const PUBLIC_ORGANIZATION_SELECT = `o.id, o.name, o.slug, o.legal_name, o.registration_number, o.type, o.status,
  o.short_description, o.description, o.public_email, o.public_phone, o.website_url, o.facebook_url,
  o.instagram_url, o.city, o.district, o.region, o.country_code, o.image_url, o.source_url,
  o.published_at, o.last_verified_at, o.updated_at, o.directory_profile_id`;

export function buildPublicOrganizationBySlugQuery(slug: string) {
  if (!slug) return null;
  return {
    sql: `SELECT ${PUBLIC_ORGANIZATION_SELECT}
      FROM help_organizations o
      WHERE o.slug = ? AND ${PUBLIC_ORGANIZATION_PREDICATE}
      LIMIT 1`,
    bindings: [slug] as const,
  };
}

export function buildPublicOrganizationLocationsQuery(organizationId: number) {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return null;
  return {
    sql: `SELECT l.id, l.organization_id, l.role, l.label, l.city, l.district, l.region,
      l.country_code, l.is_primary, l.sort_order
      FROM organization_locations l
      WHERE l.organization_id = ?
      ORDER BY l.sort_order ASC, l.id ASC`,
    bindings: [organizationId] as const,
  };
}

export function buildPublishedOrganizationSitemapQuery() {
  return `SELECT o.slug, o.published_at, o.updated_at
    FROM help_organizations o
    WHERE ${PUBLIC_ORGANIZATION_PREDICATE}
    ORDER BY o.slug ASC`;
}

export function buildPublishedOrganizationIndexQuery(limit = 250) {
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  return {
    sql: `SELECT o.id, o.name, o.slug, o.short_description, o.description,
      COALESCE((
        SELECT l.city FROM organization_locations l
        WHERE l.organization_id = o.id
        ORDER BY l.is_primary DESC, l.sort_order ASC, l.id ASC
        LIMIT 1
      ), o.city) AS city,
      COALESCE((
        SELECT l.region FROM organization_locations l
        WHERE l.organization_id = o.id
        ORDER BY l.is_primary DESC, l.sort_order ASC, l.id ASC
        LIMIT 1
      ), o.region) AS region,
      o.image_url, o.website_url, o.public_email, o.public_phone,
      o.published_at, o.last_verified_at, o.updated_at
      FROM help_organizations o
      WHERE ${PUBLIC_ORGANIZATION_PREDICATE}
      ORDER BY o.name COLLATE NOCASE ASC, o.id ASC
      LIMIT ?`,
    bindings: [safeLimit] as const,
  };
}

function buildPublishedDirectoryQuery(directoryProfileId: number) {
  return {
    sql: `SELECT p.id, p.name, p.slug, p.category
      FROM directory_profiles p
      WHERE p.id = ? AND p.status = 'published' AND p.archived_at IS NULL
      LIMIT 1`,
    bindings: [directoryProfileId] as const,
  };
}

async function findPublicOrganizationRowBySlug(
  slug: string,
  database: AdoptionD1Database,
): Promise<PublicOrganizationRow | null> {
  const query = buildPublicOrganizationBySlugQuery(slug);
  if (!query) return null;
  return database.prepare(query.sql).bind(...query.bindings).first<PublicOrganizationRow>();
}

function toPublicOrganizationLocation(row: PublicOrganizationLocationRow): PublicOrganizationLocation {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    role: row.role as PublicOrganizationLocationRole,
    label: row.label,
    city: row.city,
    district: row.district,
    region: row.region,
    countryCode: row.country_code,
    isPrimary: Boolean(row.is_primary),
    sortOrder: Number(row.sort_order),
  };
}

function legacyPublicOrganizationLocation(row: PublicOrganizationRow): PublicOrganizationLocation {
  return {
    id: null,
    organizationId: Number(row.id),
    role: "UNSPECIFIED",
    label: "",
    city: row.city,
    district: row.district,
    region: row.region,
    countryCode: row.country_code,
    isPrimary: true,
    sortOrder: 0,
  };
}

async function listPublicOrganizationLocations(
  row: PublicOrganizationRow,
  database: AdoptionD1Database,
): Promise<PublicOrganizationLocation[]> {
  const query = buildPublicOrganizationLocationsQuery(Number(row.id));
  if (!query) return [legacyPublicOrganizationLocation(row)];
  const result = await database
    .prepare(query.sql)
    .bind(...query.bindings)
    .all<PublicOrganizationLocationRow>();
  if (!result.results.length) return [legacyPublicOrganizationLocation(row)];
  return result.results.map(toPublicOrganizationLocation);
}

async function findPublishedDirectoryRelation(
  directoryProfileId: number | null,
  database: AdoptionD1Database,
): Promise<PublicOrganizationDirectoryRelation | null> {
  if (directoryProfileId === null || !Number.isSafeInteger(directoryProfileId) || directoryProfileId <= 0) return null;
  const query = buildPublishedDirectoryQuery(directoryProfileId);
  const row = await database.prepare(query.sql).bind(...query.bindings).first<PublicDirectoryRow>();
  if (!row) return null;
  return { id: Number(row.id), name: row.name, slug: row.slug, category: row.category };
}

function toPublicOrganization(
  row: PublicOrganizationRow,
  directory: PublicOrganizationDirectoryRelation | null,
  locations: PublicOrganizationLocation[],
): PublicHelpOrganization {
  const primaryLocation = locations.find((location) => location.isPrimary) ?? locations[0];
  return {
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    legalName: row.legal_name,
    registrationNumber: row.registration_number,
    type: row.type as PublicOrganizationType,
    shortDescription: cleanPublicOrganizationCopy(row.short_description),
    description: cleanPublicOrganizationCopy(row.description),
    publicEmail: row.public_email,
    publicPhone: row.public_phone,
    websiteUrl: row.website_url,
    facebookUrl: row.facebook_url,
    instagramUrl: row.instagram_url,
    city: primaryLocation?.city ?? row.city,
    district: primaryLocation?.district ?? row.district,
    region: primaryLocation?.region ?? row.region,
    countryCode: primaryLocation?.countryCode ?? row.country_code,
    locations,
    imageUrl: row.image_url,
    sourceUrl: row.source_url,
    publishedAt: row.published_at,
    lastVerifiedAt: row.last_verified_at,
    updatedAt: row.updated_at,
    directory,
  };
}

export async function getPublicOrganizationBySlug(
  slug: string,
  database: AdoptionD1Database,
): Promise<PublicHelpOrganization | null> {
  const row = await findPublicOrganizationRowBySlug(slug, database);
  if (!row) return null;
  const [locations, directory] = await Promise.all([
    listPublicOrganizationLocations(row, database),
    findPublishedDirectoryRelation(row.directory_profile_id, database),
  ]);
  return toPublicOrganization(row, directory, locations);
}

export async function listPublishedOrganizationsForSitemap(
  database: AdoptionD1Database,
): Promise<PublicOrganizationSitemapRecord[]> {
  const { results } = await database
    .prepare(buildPublishedOrganizationSitemapQuery())
    .all<PublicOrganizationSitemapRow>();
  return results.map((row) => ({
    slug: row.slug,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }));
}

export async function listPublishedOrganizations(
  database: AdoptionD1Database,
  limit = 250,
): Promise<PublicOrganizationIndexItem[]> {
  const query = buildPublishedOrganizationIndexQuery(limit);
  const { results } = await database
    .prepare(query.sql)
    .bind(...query.bindings)
    .all<PublicOrganizationIndexRow>();
  return results.map((row) => ({
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    shortDescription: cleanPublicOrganizationCopy(row.short_description),
    description: cleanPublicOrganizationCopy(row.description),
    city: row.city,
    region: row.region,
    imageUrl: row.image_url,
    websiteUrl: row.website_url,
    publicEmail: row.public_email,
    publicPhone: row.public_phone,
    publishedAt: row.published_at,
    lastVerifiedAt: row.last_verified_at,
    updatedAt: row.updated_at,
  }));
}

export async function getPublicOrganizationCompositionBySlug(
  slug: string,
  database: AdoptionD1Database,
): Promise<PublicOrganizationComposition | null> {
  const row = await findPublicOrganizationRowBySlug(slug, database);
  if (!row) return null;
  const [locations, adoptions, directory, fundraisingMethods] = await Promise.all([
    listPublicOrganizationLocations(row, database),
    listPublicAdoptionsByOrganizationId(Number(row.id), database),
    findPublishedDirectoryRelation(row.directory_profile_id, database),
    listPublicOrganizationFundraisingMethods(Number(row.id), row.status, database),
  ]);
  return {
    organization: toPublicOrganization(row, directory, locations),
    adoptions,
    fundraisingMethods,
  };
}
