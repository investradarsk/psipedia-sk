import type { AdoptionDog } from "./adoption.ts";
import { adoptionRegions, normalizeAdoptionText } from "./adoption.ts";
import type { HelpCase } from "./help.ts";
import { slovakRegions } from "./events.ts";
import { getD1Binding } from "./help-store.ts";
import { PUBLIC_ORGANIZATION_PREDICATE } from "./help-organization-store.ts";
import { cleanPublicOrganizationCopy } from "./public-integrity.ts";
import { readImageDisplayConfig } from "./image-display.ts";
import type { PublicDogReport } from "./lost-found-dogs.ts";

/**
 * Read-only, route-specific snapshot for /pomoc-psom.
 * Dedicated listing/detail stores retain their existing paging and publication contracts.
 * Each query returns at most six rows per category plus exact public active counts.
 * The count is supplied by a window function on the same published row set.
 */
export type HelpLandingGenericItem = Pick<
  HelpCase,
  "id" | "slug" | "title" | "category" | "excerpt" | "organization" | "city" | "region" |
  "imageUrl" | "thumbnailImageDisplay" | "urgent"
>;
export type HelpLandingAdoptionItem = Pick<
  AdoptionDog,
  "id" | "slug" | "name" | "status" | "mainImage" | "thumbnailImageDisplay" |
  "organizationName" | "city" | "region" | "shortDescription"
>;
export type HelpLandingReportItem = Pick<
  PublicDogReport,
  "id" | "type" | "slug" | "dogName" | "breed" | "city" | "region" | "description" |
  "mainImage" | "thumbnailImageDisplay" | "eventDate"
>;

type GenericCategory = "docasna-opatera" | "zbierky" | "dobrovolnictvo";
type ReportType = "LOST" | "FOUND";

export type HelpLandingSnapshot = {
  generic: { items: HelpLandingGenericItem[]; counts: Record<GenericCategory, number> };
  organizations: { items: HelpLandingGenericItem[]; count: number };
  adoptions: { items: HelpLandingAdoptionItem[]; count: number };
  reports: { items: HelpLandingReportItem[]; counts: Record<ReportType, number> };
};

type GenericRow = {
  id: number; slug: string; title: string; category: GenericCategory;
  excerpt: string; organization: string; city: string; region: string;
  image_url: string | null; thumbnail_display_json: string | null; urgent: number;
  category_total: number; preview_rank: number;
};
type OrganizationRow = {
  id: number; slug: string; name: string; short_description: string;
  city: string; region: string; image_url: string | null;
  category_total: number; preview_rank: number;
};
type AdoptionRow = {
  id: number; slug: string; name: string; status: "ACTIVE" | "RESERVED";
  main_image: string | null; thumbnail_display_json: string | null;
  organization_id: number | null; organization_name: string;
  canonical_organization_name: string | null;
  city: string; region: string; short_description: string;
  category_total: number; preview_rank: number;
};
type ReportRow = {
  id: number; type: ReportType; slug: string; dog_name: string | null;
  breed: string; city: string; region: string; description: string;
  main_image: string | null; thumbnail_display_json: string | null;
  event_date: string; category_total: number; preview_rank: number;
};

const PREVIEW_SIZE = 6;

// Only three canonical generic categories appear in the overview. Resolved and
// unpublished rows are excluded before ranking AND before counting.
export const HELP_LANDING_GENERIC_SQL = [
  "WITH ranked AS (",
  "  SELECT h.id, h.slug, h.title, h.category, h.excerpt, h.organization, h.city, h.region,",
  "    h.image_url, h.thumbnail_display_json, h.urgent,",
  "    COUNT(*) OVER (PARTITION BY h.category) AS category_total,",
  "    ROW_NUMBER() OVER (PARTITION BY h.category",
  "      ORDER BY h.urgent DESC, h.verified DESC, h.updated_at DESC, h.id DESC) AS preview_rank",
  "  FROM help_cases h",
  "  WHERE h.status = 'published' AND h.resolved = 0",
  "    AND h.category IN ('docasna-opatera', 'zbierky', 'dobrovolnictvo')",
  ")",
  "SELECT * FROM ranked WHERE preview_rank <= ? ORDER BY category ASC, preview_rank ASC",
].join("\n");

// Canonical organization publication predicate, location precedence, verification
// priority and newest-first ordering match the existing public help conversion.
export const HELP_LANDING_ORGANIZATIONS_SQL = [
  "WITH ranked AS (",
  " SELECT o.id, COUNT(*) OVER () AS category_total,",
  " ROW_NUMBER() OVER (ORDER BY",
  " CASE WHEN o.last_verified_at IS NOT NULL AND o.last_verified_at <> '' THEN 1 ELSE 0 END DESC,",
  " o.updated_at DESC, o.id DESC) AS preview_rank",
  " FROM help_organizations o",
  " WHERE " + PUBLIC_ORGANIZATION_PREDICATE,
  ")",
  "SELECT o.id, o.slug, o.name, o.short_description,",
  " COALESCE((SELECT l.city FROM organization_locations l WHERE l.organization_id = o.id",
  " ORDER BY CASE WHEN l.role = 'SITE' THEN 0 ELSE 1 END,",
  " l.is_primary DESC, l.sort_order ASC, l.id ASC LIMIT 1), o.city) AS city,",
  " COALESCE((SELECT l.region FROM organization_locations l WHERE l.organization_id = o.id",
  " ORDER BY CASE WHEN l.role = 'SITE' THEN 0 ELSE 1 END,",
  " l.is_primary DESC, l.sort_order ASC, l.id ASC LIMIT 1), o.region) AS region,",
  " o.image_url, ranked.category_total, ranked.preview_rank",
  " FROM ranked JOIN help_organizations o ON o.id = ranked.id",
  " WHERE ranked.preview_rank <= ? ORDER BY ranked.preview_rank ASC",
].join("\n");

// Same public ACTIVE/RESERVED statuses, fallback publication timestamp, and tie
// breaker as getPublicAdoptions({ page: 1 }), without loading full dog profiles.
export const HELP_LANDING_ADOPTIONS_SQL = [
  "WITH ranked AS (",
  " SELECT d.id, COUNT(*) OVER () AS category_total,",
  " ROW_NUMBER() OVER (ORDER BY COALESCE(d.published_at, d.updated_at) DESC, d.id DESC) AS preview_rank",
  " FROM adoption_dogs d WHERE d.status IN ('ACTIVE','RESERVED')",
  ")",
  "SELECT d.id, d.slug, d.name, d.status, d.main_image, d.thumbnail_display_json,",
  " d.organization_id, d.organization_name, o.name AS canonical_organization_name,",
  " d.city, d.region, d.short_description, ranked.category_total, ranked.preview_rank",
  " FROM ranked JOIN adoption_dogs d ON d.id = ranked.id",
  " LEFT JOIN help_organizations o ON o.id = d.organization_id",
  " WHERE ranked.preview_rank <= ? ORDER BY ranked.preview_rank ASC",
].join("\n");

// Match listPublicDogReports for each type, using one shared as-of timestamp;
// never join private contact/moderation tables and never update lifecycle state.
export const HELP_LANDING_REPORTS_SQL = [
  "WITH ranked AS (",
  " SELECT r.id, r.type, COUNT(*) OVER (PARTITION BY r.type) AS category_total,",
  " ROW_NUMBER() OVER (PARTITION BY r.type",
  " ORDER BY r.event_date DESC, r.published_at DESC, r.id DESC) AS preview_rank",
  " FROM lost_found_dog_reports r",
  " WHERE r.type IN ('LOST','FOUND') AND r.status = 'ACTIVE'",
  " AND r.published_at IS NOT NULL AND (r.expires_at IS NULL OR r.expires_at > ?)",
  ")",
  "SELECT r.id, r.type, r.slug, r.dog_name, r.breed, r.city, r.region,",
  " r.description, r.main_image, r.thumbnail_display_json, r.event_date,",
  " ranked.category_total, ranked.preview_rank",
  " FROM ranked JOIN lost_found_dog_reports r ON r.id = ranked.id",
  " WHERE ranked.preview_rank <= ? ORDER BY r.type ASC, ranked.preview_rank ASC",
].join("\n");

type ReadDatabase = Pick<D1Database, "prepare">;

export async function getHelpLandingSnapshot(
  databaseInput?: ReadDatabase,
  now = new Date(),
): Promise<HelpLandingSnapshot> {
  const empty: HelpLandingSnapshot = {
    generic: { items: [], counts: { "docasna-opatera": 0, zbierky: 0, dobrovolnictvo: 0 } },
    organizations: { items: [], count: 0 },
    adoptions: { items: [], count: 0 },
    reports: { items: [], counts: { LOST: 0, FOUND: 0 } },
  };
  const db = databaseInput ?? getD1Binding();
  if (!db) return empty;

  const [generic, organizations, adoptions, reports] = await Promise.all([
    db.prepare(HELP_LANDING_GENERIC_SQL).bind(PREVIEW_SIZE).all<GenericRow>(),
    db.prepare(HELP_LANDING_ORGANIZATIONS_SQL).bind(PREVIEW_SIZE).all<OrganizationRow>(),
    db.prepare(HELP_LANDING_ADOPTIONS_SQL).bind(PREVIEW_SIZE).all<AdoptionRow>(),
    db.prepare(HELP_LANDING_REPORTS_SQL).bind(now.toISOString(), PREVIEW_SIZE).all<ReportRow>(),
  ]);

  for (const row of generic.results ?? []) {
    if (!(row.category in empty.generic.counts)) continue;
    empty.generic.counts[row.category] = Number(row.category_total);
    empty.generic.items.push({
      id: row.id, slug: row.slug, title: row.title, category: row.category,
      excerpt: row.excerpt, organization: row.organization, city: row.city,
      region: (slovakRegions as readonly string[]).includes(row.region)
        ? row.region as HelpCase["region"] : "Online", imageUrl: row.image_url,
      thumbnailImageDisplay: readImageDisplayConfig(row.thumbnail_display_json, "thumbnail"),
      urgent: Boolean(row.urgent),
    });
  }
  for (const row of organizations.results ?? []) {
    empty.organizations.count = Number(row.category_total);
    empty.organizations.items.push({
      id: row.id, slug: row.slug, title: row.name, category: "utulky",
      excerpt: cleanPublicOrganizationCopy(row.short_description),
      organization: row.name, city: row.city,
      region: (slovakRegions as readonly string[]).includes(row.region)
        ? row.region as HelpCase["region"] : "Online", imageUrl: row.image_url,
      urgent: false,
    });
  }
  for (const row of adoptions.results ?? []) {
    empty.adoptions.count = Number(row.category_total);
    empty.adoptions.items.push({
      id: row.id, slug: row.slug, name: row.name, status: row.status,
      mainImage: row.main_image,
      thumbnailImageDisplay: readImageDisplayConfig(row.thumbnail_display_json, "thumbnail"),
      organizationName: row.organization_id === null
        ? row.organization_name : normalizeAdoptionText(row.canonical_organization_name),
      city: row.city, region: (adoptionRegions as readonly string[]).includes(row.region)
        ? row.region as AdoptionDog["region"] : "",
      shortDescription: row.short_description,
    });
  }
  for (const row of reports.results ?? []) {
    empty.reports.counts[row.type] = Number(row.category_total);
    empty.reports.items.push({
      id: row.id, type: row.type, slug: row.slug,
      dogName: row.dog_name, breed: row.breed, city: row.city,
      region: row.region, description: row.description,
      mainImage: row.main_image,
      thumbnailImageDisplay: readImageDisplayConfig(row.thumbnail_display_json, "thumbnail"),
      eventDate: row.event_date,
    });
  }
  return empty;
}
