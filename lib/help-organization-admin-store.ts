import { env } from "cloudflare:workers";
import type { AdoptionD1Database } from "./adoption-store.ts";
import {
  ORGANIZATION_ADMIN_PAGE_SIZE,
  normalizeOrganizationAdminSearch,
  sqlOrganizationAdminNormalizedExpression,
  type OrganizationAdminFilters,
} from "./help-organization-admin-query.ts";
import {
  buildOrganizationPublicationPreflight,
  isOrganizationPublicationStatus,
  isOrganizationPublicationType,
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
  image_key: string | null;
  source_url: string | null;
  directory_profile_id: number | null;
  published_at: string | null;
  last_verified_at: string | null;
  archived_at: string | null;
  updated_at: string;
  location_count: number;
  fundraising_count: number;
  resolved_city: string;
  resolved_district: string;
  resolved_region: string;
};

export type OrganizationPublicationAdminItem = OrganizationPublicationCandidate & {
  preflight: OrganizationPublicationPreflight;
  imageKey: string | null;
  directoryProfileId: number | null;
  locationCount: number;
  fundraisingCount: number;
  primaryCity: string;
  primaryDistrict: string;
  primaryRegion: string;
  completenessHints: string[];
};

export type OrganizationAdminPage = {
  items: OrganizationPublicationAdminItem[];
  counts: { total: number; draft: number; published: number; archived: number };
  resultCount: number;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  options: { regions: string[]; districts: string[]; cities: string[] };
};

const resolvedCity = `COALESCE(NULLIF((SELECT l.city FROM organization_locations l WHERE l.organization_id = o.id ORDER BY l.is_primary DESC, l.sort_order ASC, l.id ASC LIMIT 1), ''), o.city)`;
const resolvedDistrict = `COALESCE(NULLIF((SELECT l.district FROM organization_locations l WHERE l.organization_id = o.id ORDER BY l.is_primary DESC, l.sort_order ASC, l.id ASC LIMIT 1), ''), o.district)`;
const resolvedRegion = `COALESCE(NULLIF((SELECT l.region FROM organization_locations l WHERE l.organization_id = o.id ORDER BY l.is_primary DESC, l.sort_order ASC, l.id ASC LIMIT 1), ''), o.region)`;

const ORGANIZATION_PUBLICATION_SELECT = `o.id, o.name, o.slug, o.legal_name, o.registration_number, o.type, o.status,
  o.short_description, o.description, o.public_email, o.public_phone, o.website_url, o.facebook_url, o.instagram_url,
  o.city, o.district, o.region, o.country_code, o.image_url, o.image_key, o.source_url, o.directory_profile_id,
  o.published_at, o.last_verified_at, o.archived_at, o.updated_at,
  (SELECT COUNT(*) FROM organization_locations lc WHERE lc.organization_id = o.id) AS location_count,
  (SELECT COUNT(*) FROM organization_fundraising_methods fm WHERE fm.organization_id = o.id AND fm.archived_at IS NULL) AS fundraising_count,
  ${resolvedCity} AS resolved_city, ${resolvedDistrict} AS resolved_district, ${resolvedRegion} AS resolved_region`;

function requireD1Binding(database?: AdoptionD1Database) {
  const bound = (env as unknown as RuntimeBindings).DB;
  const resolved = database ?? (bound && typeof bound.prepare === "function" ? bound : null);
  if (!resolved) throw new Error("Databáza organizácií zatiaľ nie je pripojená.");
  return resolved;
}

function completenessHints(row: OrganizationPublicationRow) {
  const hints: string[] = [];
  const hasLocation = Number(row.location_count) > 0 || Boolean(row.resolved_city.trim() || row.resolved_district.trim() || row.resolved_region.trim());
  if (!hasLocation) hints.push("Bez lokality");
  if (!(row.public_email?.trim() || row.public_phone?.trim() || row.website_url?.trim())) hints.push("Bez kontaktu");
  if (!(row.short_description.trim() || row.description.trim())) hints.push("Bez verejného popisu");
  if (!row.image_url?.trim()) hints.push("Bez obrázka");
  if (!isOrganizationPublicationType(row.type)) hints.push("Neplatný typ");
  return hints;
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
    city: row.resolved_city ?? row.city,
    district: row.resolved_district ?? row.district,
    region: row.resolved_region ?? row.region,
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
  return {
    ...candidate,
    preflight: buildOrganizationPublicationPreflight(candidate),
    imageKey: row.image_key,
    directoryProfileId: row.directory_profile_id === null ? null : Number(row.directory_profile_id),
    locationCount: Number(row.location_count ?? 0),
    fundraisingCount: Number(row.fundraising_count ?? 0),
    primaryCity: row.resolved_city ?? "",
    primaryDistrict: row.resolved_district ?? "",
    primaryRegion: row.resolved_region ?? "",
    completenessHints: completenessHints(row),
  };
}

function adminWhere(filters: OrganizationAdminFilters) {
  const clauses: string[] = [];
  const args: Array<string | number> = [];
  if (filters.type) { clauses.push("o.type = ?"); args.push(filters.type); }
  if (filters.status !== "all") { clauses.push("o.status = ?"); args.push(filters.status); }
  if (filters.region) { clauses.push(`${resolvedRegion} = ?`); args.push(filters.region); }
  if (filters.district) { clauses.push(`${resolvedDistrict} = ?`); args.push(filters.district); }
  if (filters.city) { clauses.push(`${resolvedCity} = ?`); args.push(filters.city); }
  if (filters.missingLocation) {
    clauses.push(`NOT EXISTS (SELECT 1 FROM organization_locations ml WHERE ml.organization_id = o.id)
      AND trim(coalesce(o.address, '')) = '' AND trim(coalesce(o.city, '')) = ''
      AND trim(coalesce(o.district, '')) = '' AND trim(coalesce(o.region, '')) = ''`);
  }
  if (filters.incomplete) {
    clauses.push(`(
      (NOT EXISTS (SELECT 1 FROM organization_locations il WHERE il.organization_id = o.id)
        AND trim(coalesce(o.address, '')) = '' AND trim(coalesce(o.city, '')) = ''
        AND trim(coalesce(o.district, '')) = '' AND trim(coalesce(o.region, '')) = '')
      OR (trim(coalesce(o.public_email, '')) = '' AND trim(coalesce(o.public_phone, '')) = '' AND trim(coalesce(o.website_url, '')) = '')
      OR (trim(coalesce(o.short_description, '')) = '' AND trim(coalesce(o.description, '')) = '')
      OR trim(coalesce(o.image_url, '')) = ''
      OR o.type NOT IN ('SHELTER','CIVIC_ASSOCIATION','RESCUE_ORGANIZATION','MUNICIPAL_ORGANIZATION','NONPROFIT','OTHER')
    )`);
  }
  if (filters.q) {
    const normalized = normalizeOrganizationAdminSearch(filters.q);
    if (normalized) {
      const expression = sqlOrganizationAdminNormalizedExpression(`coalesce(o.name, '') || ' ' || coalesce(o.legal_name, '') || ' ' || coalesce(o.slug, '') || ' ' || coalesce(o.registration_number, '') || ' ' || coalesce(o.public_email, '') || ' ' || coalesce(o.public_phone, '') || ' ' || coalesce(o.website_url, '') || ' ' || coalesce(${resolvedCity}, '') || ' ' || coalesce(${resolvedDistrict}, '') || ' ' || coalesce(${resolvedRegion}, '')`);
      clauses.push(`${expression} LIKE ?`);
      args.push(`%${normalized}%`);
    }
  }
  return { where: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", args };
}

async function optionValues(database: AdoptionD1Database, column: "region" | "district" | "city") {
  const result = await database.prepare(`
    SELECT value FROM (
      SELECT trim(${column}) AS value FROM organization_locations WHERE trim(${column}) <> ''
      UNION
      SELECT trim(${column}) AS value FROM help_organizations WHERE trim(${column}) <> ''
    ) ORDER BY value COLLATE NOCASE ASC
  `).all<{ value: string }>();
  return result.results.map((row) => row.value).filter(Boolean);
}

export async function getOrganizationAdminPage(
  filters: OrganizationAdminFilters,
  database?: AdoptionD1Database,
): Promise<OrganizationAdminPage> {
  const db = requireD1Binding(database);
  const membership = adminWhere(filters);
  const totalRow = await db.prepare(`SELECT COUNT(*) AS total,
    COUNT(CASE WHEN status = 'DRAFT' THEN 1 END) AS draft,
    COUNT(CASE WHEN status = 'PUBLISHED' THEN 1 END) AS published,
    COUNT(CASE WHEN status = 'ARCHIVED' THEN 1 END) AS archived
    FROM help_organizations`).first<{ total: number; draft: number; published: number; archived: number }>();
  const countRow = await db.prepare(`SELECT COUNT(*) AS count FROM help_organizations o${membership.where}`)
    .bind(...membership.args).first<{ count: number }>();
  const resultCount = Number(countRow?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(resultCount / ORGANIZATION_ADMIN_PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page), totalPages);
  const result = await db.prepare(`
    SELECT ${ORGANIZATION_PUBLICATION_SELECT}
    FROM help_organizations o${membership.where}
    ORDER BY o.updated_at DESC, o.id DESC
    LIMIT ? OFFSET ?
  `).bind(...membership.args, ORGANIZATION_ADMIN_PAGE_SIZE, (page - 1) * ORGANIZATION_ADMIN_PAGE_SIZE).all<OrganizationPublicationRow>();
  const [regions, districts, cities] = await Promise.all([
    optionValues(db, "region"),
    optionValues(db, "district"),
    optionValues(db, "city"),
  ]);
  const counts = totalRow ?? { total: 0, draft: 0, published: 0, archived: 0 };
  return {
    items: result.results.map(withPreflight),
    counts: {
      total: Number(counts.total ?? 0),
      draft: Number(counts.draft ?? 0),
      published: Number(counts.published ?? 0),
      archived: Number(counts.archived ?? 0),
    },
    resultCount,
    pagination: { page, pageSize: ORGANIZATION_ADMIN_PAGE_SIZE, total: resultCount, totalPages },
    options: { regions, districts, cities },
  };
}

export async function listOrganizationPublicationAdmin(database?: AdoptionD1Database): Promise<OrganizationPublicationAdminItem[]> {
  const db = requireD1Binding(database);
  const result = await db.prepare(`
    SELECT ${ORGANIZATION_PUBLICATION_SELECT}
    FROM help_organizations o
    ORDER BY CASE o.status WHEN 'DRAFT' THEN 0 WHEN 'PUBLISHED' THEN 1 ELSE 2 END,
      o.name COLLATE NOCASE ASC, o.id ASC
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
    FROM help_organizations o
    WHERE o.id = ?
    LIMIT 1
  `).bind(id).first<OrganizationPublicationRow>();
  return row ? withPreflight(row) : null;
}
