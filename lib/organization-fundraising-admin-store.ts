import { env } from "cloudflare:workers";
import type { AdoptionD1Database } from "./adoption-store.ts";
import {
  mapOrganizationFundraisingMethodRow,
  type OrganizationFundraisingMethodRecord,
  type OrganizationFundraisingMethodStorageRow,
} from "./organization-fundraising-store.ts";

type RuntimeBindings = { DB?: AdoptionD1Database };
type OrganizationAdminRow = {
  id: number;
  name: string;
  slug: string;
  status: string;
  archived_at: string | null;
};

export type OrganizationFundraisingAdminOrganization = {
  id: number;
  name: string;
  slug: string;
  status: string;
  archivedAt: string | null;
};

export const ORGANIZATION_FUNDRAISING_ADMIN_SELECT = `id, organization_id, type, label, url, value, instructions,
  beneficiary_identity, ownership, sort_order, is_active, verification_status, verified_at, verified_by,
  verification_source_url, verification_expires_at, valid_until, version, archived_at, created_at, updated_at,
  created_by, updated_by`;

export function requireOrganizationFundraisingD1(database?: AdoptionD1Database) {
  const bound = (env as unknown as RuntimeBindings).DB;
  const resolved = database ?? (bound && typeof bound.prepare === "function" ? bound : null);
  if (!resolved) throw new Error("Databáza fundraisingu zatiaľ nie je pripojená.");
  return resolved;
}

export async function getOrganizationFundraisingAdminOrganization(
  organizationId: number,
  database?: AdoptionD1Database,
): Promise<OrganizationFundraisingAdminOrganization | null> {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return null;
  const db = requireOrganizationFundraisingD1(database);
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

export async function listOrganizationFundraisingMethodsAdmin(
  organizationId: number,
  database?: AdoptionD1Database,
): Promise<OrganizationFundraisingMethodRecord[]> {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return [];
  const db = requireOrganizationFundraisingD1(database);
  const result = await db.prepare(`
    SELECT ${ORGANIZATION_FUNDRAISING_ADMIN_SELECT}
    FROM organization_fundraising_methods
    WHERE organization_id = ?
    ORDER BY sort_order ASC, id ASC
  `).bind(organizationId).all<OrganizationFundraisingMethodStorageRow>();
  return result.results.map(mapOrganizationFundraisingMethodRow);
}

export async function getOrganizationFundraisingMethodAdmin(
  organizationId: number,
  methodId: number,
  database?: AdoptionD1Database,
): Promise<OrganizationFundraisingMethodRecord | null> {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return null;
  if (!Number.isSafeInteger(methodId) || methodId <= 0) return null;
  const db = requireOrganizationFundraisingD1(database);
  const row = await db.prepare(`
    SELECT ${ORGANIZATION_FUNDRAISING_ADMIN_SELECT}
    FROM organization_fundraising_methods
    WHERE id = ? AND organization_id = ?
    LIMIT 1
  `).bind(methodId, organizationId).first<OrganizationFundraisingMethodStorageRow>();
  return row ? mapOrganizationFundraisingMethodRow(row) : null;
}
