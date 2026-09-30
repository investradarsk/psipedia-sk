import { env } from "cloudflare:workers";
import { allDirectoryCategories, isDirectoryCategory } from "@/lib/directory";
import {
  queryDirectoryAdmin,
  type DirectoryAdminFilters,
} from "@/lib/directory-admin-query";
import type { ManagedDirectoryProfileSummary } from "@/lib/directory-store";

type RuntimeBindings = { DB?: D1Database };
type DirectoryAdminRow = {
  id: number;
  slug: string;
  name: string;
  category: string;
  status: string;
  services_json: string;
  city: string;
  district: string;
  region: string;
  image_url: string | null;
  verified: number;
  featured: number;
  updated_at: string;
};

export type ManagedDirectoryAdminPage = {
  profiles: ManagedDirectoryProfileSummary[];
  counts: { total: number; published: number; draft: number; archived: number };
  resultCount: number;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  options: { regions: string[]; districts: string[]; cities: string[] };
};

function requireD1Binding() {
  const database = (env as unknown as RuntimeBindings).DB;
  if (!database || typeof database.prepare !== "function") throw new Error("Databáza adresára zatiaľ nie je pripojená.");
  return database;
}

function safeServices(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

function rowToSummary(row: DirectoryAdminRow, reviewedAt = ""): ManagedDirectoryProfileSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: isDirectoryCategory(row.category) ? row.category : "dalsie-sluzby",
    status: row.status === "published" ? "published" : row.status === "archived" ? "archived" : "draft",
    services: safeServices(row.services_json),
    city: row.city,
    district: row.district,
    region: row.region,
    imageUrl: row.image_url,
    reviewed: Boolean(reviewedAt),
    reviewedAt,
    verified: Boolean(row.verified),
    featured: Boolean(row.featured),
    updatedAt: row.updated_at,
  };
}

export async function getManagedDirectoryAdminPage(filters: DirectoryAdminFilters): Promise<ManagedDirectoryAdminPage> {
  const database = requireD1Binding();
  const result = await queryDirectoryAdmin<DirectoryAdminRow>(database, filters, allDirectoryCategories);
  const reviewedAtById = new Map<number, string>();
  if (result.items.length) {
    const placeholders = result.items.map(() => "?").join(",");
    const reviewRows = await database.prepare(`
      SELECT id,
        COALESCE(json_extract(source_data_json, '$._psipedia_profile_review_reviewed_at'), '') AS reviewed_at
      FROM directory_profiles
      WHERE id IN (${placeholders})
    `).bind(...result.items.map((profile) => profile.id)).all<{ id: number; reviewed_at: string }>();
    for (const row of reviewRows.results) reviewedAtById.set(row.id, row.reviewed_at?.trim() ?? "");
  }
  return {
    profiles: result.items.map((row) => rowToSummary(row, reviewedAtById.get(row.id) ?? "")),
    counts: result.counts,
    resultCount: result.resultCount,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.resultCount,
      totalPages: result.pages,
    },
    options: result.options,
  };
}
