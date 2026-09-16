import type { AdoptionD1Database } from "./adoption-store.ts";
import {
  listPublicAdoptionsByOrganizationId,
  type OrganizationPublicAdoption,
} from "./organization-adoption-store.ts";

export type PublicOrganizationType =
  | "SHELTER"
  | "CIVIC_ASSOCIATION"
  | "RESCUE_ORGANIZATION"
  | "MUNICIPAL_ORGANIZATION"
  | "NONPROFIT"
  | "OTHER";

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
};

export type PublicOrganizationSitemapRecord = {
  slug: string;
  publishedAt: string;
  updatedAt: string;
};

type PublicOrganizationRow = {
  id: number;
  name: string;
  slug: string;
  legal_name: string;
  registration_number: string | null;
  type: string;
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

type PublicOrganizationSitemapRow = {
  slug: string;
  published_at: string;
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

const PUBLIC_ORGANIZATION_SELECT = `o.id, o.name, o.slug, o.legal_name, o.registration_number, o.type,
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

export function buildPublishedOrganizationSitemapQuery() {
  return `SELECT o.slug, o.published_at, o.updated_at
    FROM help_organizations o
    WHERE ${PUBLIC_ORGANIZATION_PREDICATE}
    ORDER BY o.slug ASC`;
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
): PublicHelpOrganization {
  return {
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    legalName: row.legal_name,
    registrationNumber: row.registration_number,
    type: row.type as PublicOrganizationType,
    shortDescription: row.short_description,
    description: row.description,
    publicEmail: row.public_email,
    publicPhone: row.public_phone,
    websiteUrl: row.website_url,
    facebookUrl: row.facebook_url,
    instagramUrl: row.instagram_url,
    city: row.city,
    district: row.district,
    region: row.region,
    countryCode: row.country_code,
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
  const directory = await findPublishedDirectoryRelation(row.directory_profile_id, database);
  return toPublicOrganization(row, directory);
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

export async function getPublicOrganizationCompositionBySlug(
  slug: string,
  database: AdoptionD1Database,
): Promise<PublicOrganizationComposition | null> {
  const row = await findPublicOrganizationRowBySlug(slug, database);
  if (!row) return null;
  const [adoptions, directory] = await Promise.all([
    listPublicAdoptionsByOrganizationId(Number(row.id), database),
    findPublishedDirectoryRelation(row.directory_profile_id, database),
  ]);
  return {
    organization: toPublicOrganization(row, directory),
    adoptions,
  };
}
