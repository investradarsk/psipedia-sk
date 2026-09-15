import { adoptionPublicStatuses, type AdoptionPublicStatus } from "./adoption.ts";
import type { AdoptionD1Database } from "./adoption-store.ts";

export type OrganizationPublicAdoption = {
  id: number;
  name: string;
  slug: string;
  status: AdoptionPublicStatus;
  organizationId: number;
  organizationName: string;
  organizationSlug: string | null;
  city: string;
  mainImage: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

type OrganizationPublicAdoptionRow = {
  id: number;
  name: string;
  slug: string;
  status: string;
  organization_id: number;
  organization_name: string;
  organization_slug: string | null;
  city: string;
  main_image: string | null;
  published_at: string | null;
  updated_at: string;
};

export const ORGANIZATION_PUBLIC_ADOPTIONS_ORDER = "COALESCE(d.published_at, d.updated_at) DESC, d.id DESC";

export function buildOrganizationPublicAdoptionsQuery(organizationId: number) {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return null;
  const statusPlaceholders = adoptionPublicStatuses.map(() => "?").join(", ");
  return {
    sql: `SELECT d.id, d.name, d.slug, d.status, d.organization_id, d.organization_name, d.organization_slug,
      d.city, d.main_image, d.published_at, d.updated_at
      FROM adoption_dogs d
      WHERE d.organization_id = ? AND d.status IN (${statusPlaceholders})
      ORDER BY ${ORGANIZATION_PUBLIC_ADOPTIONS_ORDER}`,
    bindings: [organizationId, ...adoptionPublicStatuses] as const,
  };
}

export async function listPublicAdoptionsByOrganizationId(
  organizationId: number,
  database: AdoptionD1Database,
): Promise<OrganizationPublicAdoption[]> {
  const query = buildOrganizationPublicAdoptionsQuery(organizationId);
  if (!query) return [];
  const result = await database.prepare(query.sql).bind(...query.bindings).all<OrganizationPublicAdoptionRow>();
  return result.results.map((row) => ({
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    status: row.status as AdoptionPublicStatus,
    organizationId: Number(row.organization_id),
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    city: row.city,
    mainImage: row.main_image,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }));
}
