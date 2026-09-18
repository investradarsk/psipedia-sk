import { env } from "cloudflare:workers";
import type { AdoptionD1Database } from "./adoption-store.ts";
import type { OrganizationLocationRole } from "./organization-location-admin.ts";

type RuntimeBindings = { DB?: AdoptionD1Database };

type OrganizationAdminRow = {
  id: number;
  name: string;
  slug: string;
  status: string;
  archived_at: string | null;
};

type OrganizationLocationRow = {
  id: number;
  organization_id: number;
  role: string;
  label: string;
  address: string;
  city: string;
  district: string;
  region: string;
  country_code: string;
  is_primary: number;
  sort_order: number;
};

export type OrganizationLocationAdminOrganization = {
  id: number;
  name: string;
  slug: string;
  status: string;
  archivedAt: string | null;
};

export type OrganizationLocationAdminRecord = {
  id: number;
  organizationId: number;
  role: OrganizationLocationRole;
  label: string;
  address: string;
  city: string;
  district: string;
  region: string;
  countryCode: string;
  isPrimary: boolean;
  sortOrder: number;
};

const ORGANIZATION_LOCATION_ADMIN_SELECT = `id, organization_id, role, label, address, city, district, region,
  country_code, is_primary, sort_order`;

export function requireOrganizationLocationD1(database?: AdoptionD1Database) {
  const bound = (env as unknown as RuntimeBindings).DB;
  const resolved = database ?? (bound && typeof bound.prepare === "function" ? bound : null);
  if (!resolved) throw new Error("Databáza lokalít organizácií zatiaľ nie je pripojená.");
  return resolved;
}

function mapLocation(row: OrganizationLocationRow): OrganizationLocationAdminRecord {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    role: row.role as OrganizationLocationRole,
    label: row.label,
    address: row.address,
    city: row.city,
    district: row.district,
    region: row.region,
    countryCode: row.country_code,
    isPrimary: Boolean(row.is_primary),
    sortOrder: Number(row.sort_order),
  };
}

export async function getOrganizationLocationAdminOrganization(
  organizationId: number,
  database?: AdoptionD1Database,
): Promise<OrganizationLocationAdminOrganization | null> {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return null;
  const db = requireOrganizationLocationD1(database);
  const row = await db.prepare(`
    SELECT id, name, slug, status, archived_at
    FROM help_organizations
    WHERE id = ?
    LIMIT 1
  `).bind(organizationId).first<OrganizationAdminRow>();
  return row ? {
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    status: row.status,
    archivedAt: row.archived_at,
  } : null;
}

export async function listOrganizationLocationsAdmin(
  organizationId: number,
  database?: AdoptionD1Database,
): Promise<OrganizationLocationAdminRecord[]> {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return [];
  const db = requireOrganizationLocationD1(database);
  const result = await db.prepare(`
    SELECT ${ORGANIZATION_LOCATION_ADMIN_SELECT}
    FROM organization_locations
    WHERE organization_id = ?
    ORDER BY sort_order ASC, id ASC
  `).bind(organizationId).all<OrganizationLocationRow>();
  return result.results.map(mapLocation);
}

export async function getOrganizationLocationAdmin(
  organizationId: number,
  locationId: number,
  database?: AdoptionD1Database,
): Promise<OrganizationLocationAdminRecord | null> {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return null;
  if (!Number.isSafeInteger(locationId) || locationId <= 0) return null;
  const db = requireOrganizationLocationD1(database);
  const row = await db.prepare(`
    SELECT ${ORGANIZATION_LOCATION_ADMIN_SELECT}
    FROM organization_locations
    WHERE id = ? AND organization_id = ?
    LIMIT 1
  `).bind(locationId, organizationId).first<OrganizationLocationRow>();
  return row ? mapLocation(row) : null;
}
