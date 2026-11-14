import { env } from "cloudflare:workers";

/**
 * Two-profile D1 preflight. Read-only by design: no migration writes, no
 * archive, no delete, no Notion mutation, no review ownership change.
 */
export type DirectoryMergePreflightRow = {
  id: number;
  name: string;
  category: string;
  slug: string;
  status: string;
  city: string;
  address: string;
  website_url: string | null;
  image_url: string | null;
  excerpt: string;
  description: string;
  source_data_json: string;
  updated_at: string;
  partner_resources: number;
  reviews: number;
  memberships: number;
  claims: number;
  verifications: number;
  entitlements: number;
  commercial_interests: number;
  commercial_agreements: number;
  partner_change_requests: number;
  notion_links: number;
  geo_points: number;
  service_choices: number;
  service_properties: number;
  breed_links: number;
  help_links: number;
  inquiries: number;
  profile_change_requests: number;
};
export type DirectoryMergePreflightProfile = Omit<DirectoryMergePreflightRow,"source_data_json"|"description"|"excerpt"> & {
  phone: string;
  email: string;
  excerptLength: number;
  descriptionLength: number;
  additionalCategories: string[];
};
export type DirectoryMergePreflight = {
  canonical: DirectoryMergePreflightProfile;
  duplicate: DirectoryMergePreflightProfile;
  blockingReasons: string[];
};
export const MERGE_DEPENDENCY_FIELDS = [
  "partner_resources", "reviews", "memberships", "claims", "verifications",
  "entitlements", "commercial_interests", "commercial_agreements",
  "partner_change_requests", "notion_links", "geo_points", "service_choices",
  "service_properties", "breed_links", "help_links", "inquiries",
  "profile_change_requests",
] as const;

export function parseMergeProfileId(raw: string): number | null {
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function metadata(source: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(source);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}
function firstText(source: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = source[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
function profile(row: DirectoryMergePreflightRow): DirectoryMergePreflightProfile {
  const { source_data_json, description, excerpt, ...rest } = row;
  const source = metadata(source_data_json);
  let extra: unknown = [];
  try { extra = JSON.parse(firstText(source, ["_psipedia_additional_categories"]) || "[]"); }
  catch { extra = []; }
  return {
    ...rest,
    phone: firstText(source, ["Telefón", "Telefon", "phone"]),
    email: firstText(source, ["E-mail", "Email", "email"]),
    excerptLength: excerpt.length,
    descriptionLength: description.length,
    additionalCategories: Array.isArray(extra)
      ? extra.filter((item): item is string => typeof item === "string") : [],
  };
}

export function buildDirectoryMergePreflight(
  rows: DirectoryMergePreflightRow[],
  canonicalId: number,
  duplicateId: number,
): DirectoryMergePreflight | null {
  if (canonicalId === duplicateId) return null;
  const a = rows.find(row => row.id === canonicalId);
  const b = rows.find(row => row.id === duplicateId);
  if (!a || !b) return null;
  const canonical = profile(a), duplicate = profile(b);
  const blockingReasons: string[] = [
    "Migrácia recenzií a partnerských väzieb musí byť pripravená pred archiváciou.",
    "Presmerovanie pôvodnej URL a zosúladenie dvoch Notion stránok zatiaľ nie sú zapnuté.",
  ];
  if (canonical.status !== "published" || duplicate.status !== "published")
    blockingReasons.push("Profily nemajú oba stav published.");
  if (canonical.category !== duplicate.category)
    blockingReasons.push("Rôzne kategórie: treba doplniť sekundárne zaradenie na kanonickom profile.");
  if (canonical.city && duplicate.city &&
      canonical.city.trim().toLocaleLowerCase("sk") !== duplicate.city.trim().toLocaleLowerCase("sk"))
    blockingReasons.push("Rôzne mestá alebo pobočky: vyžaduje sa manuálne overenie.");
  for (const field of MERGE_DEPENDENCY_FIELDS) {
    const count = Number(duplicate[field]);
    if (!Number.isFinite(count) || count < 0)
      blockingReasons.push(`Neznámy počet závislostí: ${field}.`);
  }
  return { canonical, duplicate, blockingReasons };
}

// All joins are scoped to exactly these two IDs. The resource-specific counts
// remain attached to their original resource_id and cannot be silently moved:
// profile_reviews_resource_immutable prevents an unsafe direct reassignment.
const PREFLIGHT_SQL = `
SELECT d.id,d.name,d.category,d.slug,d.status,d.city,d.address,
       d.website_url,d.image_url,d.excerpt,d.description,d.source_data_json,d.updated_at,
       (SELECT COUNT(*) FROM partner_resources r WHERE r.directory_profile_id=d.id) AS partner_resources,
       (SELECT COUNT(*) FROM profile_reviews v WHERE v.resource_id IN
         (SELECT r.id FROM partner_resources r WHERE r.directory_profile_id=d.id)) AS reviews,
       (SELECT COUNT(*) FROM partner_memberships m WHERE m.resource_id IN
         (SELECT r.id FROM partner_resources r WHERE r.directory_profile_id=d.id)) AS memberships,
       (SELECT COUNT(*) FROM partner_claims c WHERE c.resource_id IN
         (SELECT r.id FROM partner_resources r WHERE r.directory_profile_id=d.id)) AS claims,
       (SELECT COUNT(*) FROM partner_resource_verifications x WHERE x.resource_id IN
         (SELECT r.id FROM partner_resources r WHERE r.directory_profile_id=d.id)) AS verifications,
       (SELECT COUNT(*) FROM partner_entitlements x WHERE x.resource_id IN
         (SELECT r.id FROM partner_resources r WHERE r.directory_profile_id=d.id)) AS entitlements,
       (SELECT COUNT(*) FROM partner_commercial_interests x WHERE x.resource_id IN
         (SELECT r.id FROM partner_resources r WHERE r.directory_profile_id=d.id)) AS commercial_interests,
       (SELECT COUNT(*) FROM partner_commercial_agreements x WHERE x.resource_id IN
         (SELECT r.id FROM partner_resources r WHERE r.directory_profile_id=d.id)) AS commercial_agreements,
       (SELECT COUNT(*) FROM partner_profile_change_metadata x WHERE x.partner_resource_id IN
         (SELECT r.id FROM partner_resources r WHERE r.directory_profile_id=d.id)) AS partner_change_requests,
       (SELECT COUNT(*) FROM directory_notion_sync x WHERE x.directory_profile_id=d.id) AS notion_links,
       (SELECT COUNT(*) FROM geo_points x WHERE x.directory_profile_id=d.id) AS geo_points,
       (SELECT COUNT(*) FROM service_profile_option_choices x WHERE x.profile_id=d.id) AS service_choices,
       (SELECT COUNT(*) FROM service_profile_property_values x WHERE x.profile_id=d.id) AS service_properties,
       (SELECT COUNT(*) FROM breed_directory_relations x WHERE x.profile_id=d.id) AS breed_links,
       (SELECT COUNT(*) FROM help_organizations x WHERE x.directory_profile_id=d.id) AS help_links,
       (SELECT COUNT(*) FROM directory_inquiries x WHERE x.profile_id=d.id) AS inquiries,
       (SELECT COUNT(*) FROM directory_profile_change_requests x WHERE x.profile_id=d.id) AS profile_change_requests
FROM directory_profiles d
WHERE d.id IN (?1,?2)
ORDER BY d.id
LIMIT 2`;

export async function getDirectoryMergePreflight(canonicalId: number, duplicateId: number) {
  if (!Number.isSafeInteger(canonicalId) || canonicalId < 1 ||
      !Number.isSafeInteger(duplicateId) || duplicateId < 1 ||
      canonicalId === duplicateId) return null;
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error("Databáza D1 nie je pripojená.");
  const rows = await db.prepare(PREFLIGHT_SQL).bind(canonicalId, duplicateId)
    .all<DirectoryMergePreflightRow>();
  return buildDirectoryMergePreflight(rows.results, canonicalId, duplicateId);
}
