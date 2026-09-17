import { env } from "cloudflare:workers";
import type { AdoptionD1Database } from "./adoption-store.ts";
import {
  buildOrganizationPublicationPreflight,
  isOrganizationPublicationStatus,
  type OrganizationPublicationCandidate,
  type OrganizationPublicationPreflight,
} from "./help-organization-publication.ts";

type RuntimeBindings = { DB?: AdoptionD1Database };

type OrganizationPublicationRow = {
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
  published_at: string | null;
  last_verified_at: string | null;
  archived_at: string | null;
  updated_at: string;
};

export type OrganizationPublicationAdminItem = OrganizationPublicationCandidate & {
  preflight: OrganizationPublicationPreflight;
};

const ORGANIZATION_PUBLICATION_SELECT = `id, name, slug, legal_name, registration_number, type, status,
  short_description, description, public_email, public_phone, website_url, facebook_url, instagram_url,
  city, district, region, country_code, image_url, source_url, published_at, last_verified_at, archived_at, updated_at`;

function requireD1Binding(database?: AdoptionD1Database) {
  const bound = (env as unknown as RuntimeBindings).DB;
  const resolved = database ?? (bound && typeof bound.prepare === "function" ? bound : null);
  if (!resolved) throw new Error("Databáza organizácií zatiaľ nie je pripojená.");
  return resolved;
}

function toCandidate(row: OrganizationPublicationRow): OrganizationPublicationCandidate {
  if (!isOrganizationPublicationStatus(row.status)) {
    throw new Error(`Neplatný lifecycle stav organizácie #${row.id}: ${row.status}`);
  }
  return {
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    legalName: row.legal_name,
    registrationNumber: row.registration_number,
    type: row.type,
    status: row.status,
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
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
  };
}

function withPreflight(row: OrganizationPublicationRow): OrganizationPublicationAdminItem {
  const candidate = toCandidate(row);
  return { ...candidate, preflight: buildOrganizationPublicationPreflight(candidate) };
}

export async function listOrganizationPublicationAdmin(database?: AdoptionD1Database): Promise<OrganizationPublicationAdminItem[]> {
  const db = requireD1Binding(database);
  const result = await db.prepare(`
    SELECT ${ORGANIZATION_PUBLICATION_SELECT}
    FROM help_organizations
    ORDER BY CASE status WHEN 'DRAFT' THEN 0 WHEN 'PUBLISHED' THEN 1 ELSE 2 END,
      name COLLATE NOCASE ASC, id ASC
  `).all<OrganizationPublicationRow>();
  return result.results.map(withPreflight);
}

export async function getOrganizationPublicationAdminById(
  id: number,
  database?: AdoptionD1Database,
): Promise<OrganizationPublicationAdminItem | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const db = requireD1Binding(database);
  const row = await db.prepare(`
    SELECT ${ORGANIZATION_PUBLICATION_SELECT}
    FROM help_organizations
    WHERE id = ?
    LIMIT 1
  `).bind(id).first<OrganizationPublicationRow>();
  return row ? withPreflight(row) : null;
}
