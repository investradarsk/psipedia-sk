import { env } from "cloudflare:workers";
import {
  ADOPTION_ADMIN_PAGE_SIZE,
  ADOPTION_STALE_DAYS,
  adoptionIsIndexable,
  adoptionIsStale,
  adoptionRegions,
  adoptionStatuses,
  isAdoptionStatus,
  normalizeAdoptionSearchText,
  normalizeAdoptionText,
  type AdoptionRegion,
  type AdoptionStatus,
} from "./adoption.ts";
import type { AdoptionD1Database } from "./adoption-store.ts";

import { adoptionAdminSorts, type AdoptionAdminSort } from "./adoption-admin-sorts.ts";
export { adoptionAdminSorts };
export type { AdoptionAdminSort };

export type AdoptionAdminListFilters = {
  q?: string;
  status?: AdoptionStatus | "";
  freshness?: "all" | "stale" | "fresh";
  breed?: string;
  region?: string;
  locality?: string;
  sort?: AdoptionAdminSort;
  page?: number;
};

export type AdoptionAdminSummary = {
  id: number;
  name: string;
  slug: string;
  status: AdoptionStatus;
  breedName: string;
  organizationName: string;
  city: string;
  district: string;
  region: AdoptionRegion | "";
  lastVerifiedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  indexable: boolean;
  stale: boolean;
};

export type AdoptionAdminCounts = Record<AdoptionStatus, number> & {
  total: number;
  stale: number;
};

export type AdoptionAdminListResult = {
  items: AdoptionAdminSummary[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  counts: AdoptionAdminCounts;
};

type RuntimeBindings = { DB?: AdoptionD1Database };
type CountRow = { count: number };
type AdoptionAdminRow = {
  id: number;
  name: string;
  slug: string;
  status: string;
  breed_name: string;
  organization_name: string;
  city: string;
  district: string;
  region: string;
  main_image: string | null;
  description: string;
  last_verified_at: string | null;
  published_at: string | null;
  updated_at: string;
};

function getD1Binding() {
  const database = (env as unknown as RuntimeBindings).DB;
  return database && typeof database.prepare === "function" ? database : null;
}

function requireD1Binding(database?: AdoptionD1Database) {
  const resolved = database ?? getD1Binding();
  if (!resolved) throw new Error("Databáza adopcií zatiaľ nie je pripojená.");
  return resolved;
}

export function isAdoptionAdminSort(value: string): value is AdoptionAdminSort {
  return (adoptionAdminSorts as readonly string[]).includes(value);
}

export function buildAdoptionAdminListQuery(filters: AdoptionAdminListFilters = {}, now = new Date()) {
  const page = Math.max(1, Math.trunc(Number(filters.page) || 1));
  const conditions: string[] = [];
  const bindings: unknown[] = [];

  const idMatch = /^#?([1-9]\d*)$/.exec(filters.q?.trim() ?? "");
  const q = idMatch ? "" : normalizeAdoptionSearchText([filters.q]);
  if (idMatch) {
    conditions.push("id = ?");
    bindings.push(Number(idMatch[1]));
  } else if (q) {
    conditions.push("search_text LIKE ?");
    bindings.push(`%${q}%`);
  }

  if (filters.status && isAdoptionStatus(filters.status)) {
    conditions.push("status = ?");
    bindings.push(filters.status);
  }

  const threshold = new Date(now.getTime() - ADOPTION_STALE_DAYS * 86_400_000).toISOString();
  if (filters.freshness === "stale") {
    conditions.push("status IN ('ACTIVE','RESERVED') AND (last_verified_at IS NULL OR last_verified_at < ?)");
    bindings.push(threshold);
  } else if (filters.freshness === "fresh") {
    conditions.push("status IN ('ACTIVE','RESERVED') AND last_verified_at IS NOT NULL AND last_verified_at >= ?");
    bindings.push(threshold);
  }

  const breed = normalizeAdoptionText(filters.breed);
  if (breed) {
    conditions.push("breed_name LIKE ? COLLATE NOCASE");
    bindings.push(`%${breed}%`);
  }

  const region = normalizeAdoptionText(filters.region);
  if ((adoptionRegions as readonly string[]).includes(region)) {
    conditions.push("region = ?");
    bindings.push(region);
  }

  const locality = normalizeAdoptionText(filters.locality);
  if (locality) {
    conditions.push("(city LIKE ? COLLATE NOCASE OR district LIKE ? COLLATE NOCASE)");
    bindings.push(`%${locality}%`, `%${locality}%`);
  }

  const sort: AdoptionAdminSort = filters.sort && isAdoptionAdminSort(filters.sort) ? filters.sort : "updated-desc";
  const orderBy = sort === "updated-asc"
    ? "updated_at ASC, id ASC"
    : sort === "verified-desc"
      ? "last_verified_at DESC, updated_at DESC, id DESC"
      : sort === "verified-asc"
        ? "last_verified_at ASC, updated_at ASC, id ASC"
        : sort === "name-asc"
          ? "name COLLATE NOCASE ASC, id ASC"
          : sort === "name-desc"
            ? "name COLLATE NOCASE DESC, id DESC"
            : "updated_at DESC, id DESC";

  return {
    where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    bindings,
    orderBy,
    page,
    pageSize: ADOPTION_ADMIN_PAGE_SIZE,
    offset: (page - 1) * ADOPTION_ADMIN_PAGE_SIZE,
  };
}

export async function listAdoptionAdminDashboard(
  filters: AdoptionAdminListFilters = {},
  database?: AdoptionD1Database,
  now = new Date(),
): Promise<AdoptionAdminListResult> {
  const db = requireD1Binding(database);
  const query = buildAdoptionAdminListQuery(filters, now);

  // A single grouped scan provides lifecycle and stale counts; the filtered
  // count and bounded page are independent. Three concurrent reads replace
  // four serialized round trips without adding schema/index assumptions.
  const threshold = new Date(now.getTime() - ADOPTION_STALE_DAYS * 86_400_000).toISOString();
  const [countRow, result, statusRows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS count FROM adoption_dogs ${query.where}`)
      .bind(...query.bindings).first<CountRow>(),
    db.prepare(`
      SELECT id, name, slug, status, breed_name, organization_name, city, district, region,
        main_image, description, last_verified_at, published_at, updated_at
      FROM adoption_dogs
      ${query.where}
      ORDER BY ${query.orderBy}
      LIMIT ? OFFSET ?
    `).bind(...query.bindings, query.pageSize, query.offset).all<AdoptionAdminRow>(),
    db.prepare(`SELECT status, COUNT(*) AS count,
      COALESCE(SUM(CASE WHEN status IN ('ACTIVE','RESERVED')
        AND (last_verified_at IS NULL OR last_verified_at < ?)
        THEN 1 ELSE 0 END),0) AS staleCount
      FROM adoption_dogs GROUP BY status`)
      .bind(threshold).all<{ status: string; count: number; staleCount: number }>(),
  ]);
  const total = Number(countRow?.count ?? 0);
  const lifecycle = Object.fromEntries(adoptionStatuses.map((status) => [status, 0])) as Record<AdoptionStatus, number>;
  let staleCount = 0;
  for (const row of statusRows.results) {
    if (!isAdoptionStatus(row.status)) continue;
    lifecycle[row.status] = Number(row.count ?? 0);
    staleCount += Number(row.staleCount ?? 0);
  }
  const lifecycleTotal = adoptionStatuses.reduce((sum, status) => sum + lifecycle[status], 0);

  const items = result.results.map((row): AdoptionAdminSummary => {
    const status: AdoptionStatus = isAdoptionStatus(row.status) ? row.status : "DRAFT";
    const region = (adoptionRegions as readonly string[]).includes(row.region) ? row.region as AdoptionRegion : "";
    const publicStatus = status === "ACTIVE" || status === "RESERVED";
    return {
      id: Number(row.id),
      name: row.name,
      slug: row.slug,
      status,
      breedName: row.breed_name,
      organizationName: row.organization_name,
      city: row.city,
      district: row.district,
      region,
      lastVerifiedAt: row.last_verified_at,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
      indexable: adoptionIsIndexable({ status, mainImage: row.main_image, description: row.description, lastVerifiedAt: row.last_verified_at }, now),
      stale: publicStatus && adoptionIsStale(row.last_verified_at, now),
    };
  });

  return {
    items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
    counts: {
      ...lifecycle,
      total: lifecycleTotal,
      stale: staleCount,
    },
  };
}
