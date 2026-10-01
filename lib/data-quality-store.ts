import { env } from "cloudflare:workers";
import {
  readAdminAutomationData,
  summarizeAdminAutomationReads,
  type AdminAutomationReadAvailabilityStatus,
  type AdminAutomationReliabilitySummary,
} from "@/lib/admin-automation-reliability";
import {
  DIRECTORY_QUALITY_RECHECK_DAYS,
  directoryQualityCheckedAtSourceKey,
  directoryQualityResolutionStatuses,
  directoryQualityStatusSourceKey,
  isDirectoryQualityResolutionCurrent,
  readDirectoryPublicContacts,
  readDirectoryQualityMetadata,
  type DirectoryQualityField,
} from "@/lib/directory-profile-metadata";
import { directoryCategories } from "@/lib/directory";
import {
  listMediaSourceIssues,
  mediaSourceMonitorSchemaReady,
  type MediaSourceMonitor,
} from "@/lib/media-source-monitor";
import {
  listCanonicalAutomationUpdateSuggestionEntityIds,
  listCanonicalAutomationUpdateSuggestionsForEntities,
  type AutomationUpdateOrigin,
} from "@/lib/data-automation-update-review";

type RuntimeBindings = { DB?: D1Database };

type DirectoryQualityRow = {
  id: number;
  slug: string;
  name: string;
  category: string;
  status: string;
  description: string | null;
  website_url: string | null;
  image_url: string | null;
  image_key: string | null;
  address: string | null;
  online: number | null;
  city: string | null;
  district: string | null;
  region: string | null;
  service_address_confirmation: string | null;
  source_data_json: string | null;
  google_maps_not_required: number | null;
};

type ProfileSummaryRow = {
  total_profiles: number;
  profiles_with_issues: number;
  missing_description: number;
  missing_phone: number;
  missing_email: number;
  missing_website: number;
  missing_image: number;
  incomplete_address: number;
};

type MediaSummaryRow = {
  media_issues: number;
  changed_media: number;
  missing_media_source: number;
};

type EventNameRow = { id: number; title: string; slug: string };
type ProfileNameRow = { id: number; name: string; slug: string; category: string };

export const DATA_QUALITY_D1_MAX_BOUND_PARAMS = 100;
export const DATA_QUALITY_LOOKUP_CHUNK_SIZE = 90;
export const DATA_QUALITY_PROFILE_PAGE_SIZE = 50;
export const DATA_QUALITY_MEDIA_PAGE_SIZE = 50;

export const dataQualityCategoryOptions = [
  { value: "all", label: "Všetky kategórie" },
  ...directoryCategories.map((category) => ({ value: category.slug, label: category.label })),
  { value: "podujatia", label: "Podujatia" },
] as const;

export type DataQualityCategory = (typeof dataQualityCategoryOptions)[number]["value"];

export const dataQualityIssueOptions = [
  { value: "all", label: "Všetky problémy" },
  { value: "description", label: "Chýba popis" },
  { value: "phone", label: "Chýba telefón" },
  { value: "email", label: "Chýba e-mail" },
  { value: "website", label: "Chýba web" },
  { value: "image", label: "Chýba hlavný obrázok" },
  { value: "address", label: "Adresa nie je potvrdená" },
] as const;

export type DataQualityIssueFilter = (typeof dataQualityIssueOptions)[number]["value"];

export const dataQualityProfileStatusOptions = [
  { value: "all", label: "Všetky stavy" },
  { value: "published", label: "Publikované" },
  { value: "draft", label: "Koncepty" },
] as const;

export type DataQualityProfileStatus = (typeof dataQualityProfileStatusOptions)[number]["value"];

export const dataQualityPriorityOptions = [
  { value: "all", label: "Všetky priority" },
  { value: "critical", label: "Kritické" },
  { value: "important", label: "Dôležité" },
  { value: "supplement", label: "Doplniť" },
] as const;

export type DataQualityPriority = (typeof dataQualityPriorityOptions)[number]["value"];

export const dataQualitySolutionOptions = [
  { value: "all", label: "Všetky návrhy" },
  { value: "actionable", label: "Dá sa prevziať" },
  { value: "manual", label: "Vyžaduje kontrolu" },
  { value: "none", label: "Bez nájdeného návrhu" },
] as const;

export type DataQualitySolutionFilter = (typeof dataQualitySolutionOptions)[number]["value"];

export const dataQualityMediaStatusOptions = [
  { value: "all", label: "Všetky stavy obrázkov" },
  { value: "review", label: "Na schválenie" },
  { value: "candidate", label: "Nový obrázok" },
  { value: "changed", label: "Zmenený obrázok" },
  { value: "missing", label: "Zdroj chýba" },
  { value: "error", label: "Kontrola zlyhala" },
] as const;

export type DataQualityMediaStatus = (typeof dataQualityMediaStatusOptions)[number]["value"];

const VALID_SOURCE_DATA_SQL =
  "CASE WHEN json_valid(COALESCE(source_data_json, '')) THEN source_data_json ELSE '{}' END";
const MISSING_DESCRIPTION_SQL = "trim(COALESCE(description, '')) = ''";
const RAW_MISSING_PHONE_SQL = `trim(COALESCE(
  CAST(json_extract(${VALID_SOURCE_DATA_SQL}, '$."Telefón"') AS TEXT),
  CAST(json_extract(${VALID_SOURCE_DATA_SQL}, '$."Telefon"') AS TEXT),
  CAST(json_extract(${VALID_SOURCE_DATA_SQL}, '$."phone"') AS TEXT),
  ''
)) = ''`;
const RAW_MISSING_EMAIL_SQL = `trim(COALESCE(
  CAST(json_extract(${VALID_SOURCE_DATA_SQL}, '$."E-mail"') AS TEXT),
  CAST(json_extract(${VALID_SOURCE_DATA_SQL}, '$."Email"') AS TEXT),
  CAST(json_extract(${VALID_SOURCE_DATA_SQL}, '$."email"') AS TEXT),
  ''
)) = ''`;
const RAW_MISSING_WEBSITE_SQL = `trim(COALESCE(
  CAST(json_extract(${VALID_SOURCE_DATA_SQL}, '$."Web"') AS TEXT),
  CAST(json_extract(${VALID_SOURCE_DATA_SQL}, '$."Webstránka"') AS TEXT),
  website_url,
  ''
)) = ''`;
const RAW_MISSING_IMAGE_SQL = "trim(COALESCE(image_url, '')) = ''";
const GOOGLE_MAPS_NOT_REQUIRED_SQL = `EXISTS (
  SELECT 1
  FROM geo_points map_geo
  WHERE map_geo.directory_profile_id = directory_profiles.id
    AND map_geo.target_type = 'DIRECTORY_PROFILE'
    AND COALESCE((
      SELECT map_event.action
      FROM moderation_events map_event
      WHERE map_event.resource_type = 'GEO_POINT'
        AND map_event.subject_id = CAST(map_geo.id AS TEXT)
        AND map_event.action IN ('GOOGLE_MAPS_NOT_REQUIRED', 'GOOGLE_MAPS_REQUIRED_AGAIN')
      ORDER BY map_event.created_at DESC, map_event.id DESC
      LIMIT 1
    ), '') = 'GOOGLE_MAPS_NOT_REQUIRED'
)`;
const RAW_INCOMPLETE_ADDRESS_SQL = `COALESCE(online, 0) = 0 AND (
  trim(COALESCE(city, '')) = ''
  OR COALESCE(service_address_confirmation, '') <> 'CONFIRMED_SERVICE_LOCATION'
) AND NOT (
  trim(COALESCE(address, '')) <> ''
  AND ${GOOGLE_MAPS_NOT_REQUIRED_SQL}
)`;

function qualityResolutionCurrentSql(field: DirectoryQualityField) {
  const statusKey = directoryQualityStatusSourceKey(field).replaceAll('"', '""');
  const checkedAtKey = directoryQualityCheckedAtSourceKey(field).replaceAll('"', '""');
  const statuses = directoryQualityResolutionStatuses.map((status) => `'${status}'`).join(",");
  return `(
    COALESCE(
      CAST(json_extract(${VALID_SOURCE_DATA_SQL}, '$."${statusKey}"') AS TEXT) IN (${statuses})
      AND datetime(CAST(json_extract(${VALID_SOURCE_DATA_SQL}, '$."${checkedAtKey}"') AS TEXT))
        >= datetime('now', '-${DIRECTORY_QUALITY_RECHECK_DAYS} days'),
      0
    ) = 1
  )`;
}

const MISSING_PHONE_SQL = `(${RAW_MISSING_PHONE_SQL}) AND NOT ${qualityResolutionCurrentSql("phone")}`;
const MISSING_EMAIL_SQL = `(${RAW_MISSING_EMAIL_SQL}) AND NOT ${qualityResolutionCurrentSql("email")}`;
const MISSING_WEBSITE_SQL = `(${RAW_MISSING_WEBSITE_SQL}) AND NOT ${qualityResolutionCurrentSql("website")}`;
const MISSING_IMAGE_SQL = `(${RAW_MISSING_IMAGE_SQL}) AND NOT ${qualityResolutionCurrentSql("image")}`;
const INCOMPLETE_ADDRESS_SQL = `(${RAW_INCOMPLETE_ADDRESS_SQL}) AND NOT ${qualityResolutionCurrentSql("address")}`;
const PROFILE_ISSUE_SQL = `(
  ${MISSING_DESCRIPTION_SQL}
  OR ${MISSING_PHONE_SQL}
  OR ${MISSING_EMAIL_SQL}
  OR ${MISSING_WEBSITE_SQL}
  OR ${MISSING_IMAGE_SQL}
  OR (${INCOMPLETE_ADDRESS_SQL})
)`;

export type DataQualityIssueKey =
  | "description"
  | "phone"
  | "email"
  | "website"
  | "image"
  | "address"
  | "image-source";

export type DataQualityFieldSuggestion = {
  origin: AutomationUpdateOrigin;
  suggestionId: number;
  field:
    | "publicPhone"
    | "publicEmail"
    | "websiteUrl"
    | "description"
    | "address"
    | "city"
    | "district"
    | "region"
    | "postalCode"
    | "street"
    | "houseNumber"
    | "addressFormat"
    | "serviceAddressConfirmation";
  issueKey: "phone" | "email" | "website" | "description" | "address";
  label: string;
  proposed: string;
  reviewMode: "accept" | "manual";
  note: string | null;
  sourceUrl: string | null;
  sourceLabel: string;
  detectedAt: string;
  canonicalUpdatedAt: string;
  proposedValueHash: string;
};

export type DirectoryQualityItem = {
  id: number;
  name: string;
  slug: string;
  category: string;
  status: string;
  priority: Exclude<DataQualityPriority, "all">;
  issues: Array<{ key: DataQualityIssueKey; label: string }>;
  suggestions: DataQualityFieldSuggestion[];
  mediaMonitor: MediaSourceMonitor | null;
  href: string;
};

export type MediaQualityItem = {
  monitor: MediaSourceMonitor;
  label: string;
  href: string;
  category: string;
};

export type DataQualityPagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  from: number;
  to: number;
};

type NullableProfileSummary = {
  totalProfiles: number | null;
  profilesWithIssues: number | null;
  missingDescription: number | null;
  missingPhone: number | null;
  missingEmail: number | null;
  missingWebsite: number | null;
  missingImage: number | null;
  incompleteAddress: number | null;
};

type NullableMediaSummary = {
  mediaIssues: number | null;
  changedMedia: number | null;
  missingMediaSource: number | null;
};

type AvailabilitySection = {
  status: AdminAutomationReadAvailabilityStatus;
  errorRef: string | null;
};

export type DataQualityDashboard = {
  summary: NullableProfileSummary & NullableMediaSummary;
  profiles: DirectoryQualityItem[];
  media: MediaQualityItem[];
  monitorReady: boolean;
  profilePagination: DataQualityPagination;
  mediaPagination: DataQualityPagination;
  availability: AdminAutomationReliabilitySummary;
  category: DataQualityCategory;
  categoryOptions: typeof dataQualityCategoryOptions;
  issue: DataQualityIssueFilter;
  issueOptions: typeof dataQualityIssueOptions;
  profileStatus: DataQualityProfileStatus;
  profileStatusOptions: typeof dataQualityProfileStatusOptions;
  priority: DataQualityPriority;
  priorityOptions: typeof dataQualityPriorityOptions;
  solution: DataQualitySolutionFilter;
  solutionOptions: typeof dataQualitySolutionOptions;
  query: string;
  region: string;
  district: string;
  regionOptions: string[];
  districtOptions: string[];
  mediaStatus: DataQualityMediaStatus;
  mediaStatusOptions: typeof dataQualityMediaStatusOptions;
  sections: {
    profiles: AvailabilitySection;
    suggestions: AvailabilitySection;
    media: AvailabilitySection;
    lookups: AvailabilitySection;
  };
};

type ProfileReadData = {
  summary: ExcludeNulls<NullableProfileSummary>;
  profiles: DirectoryQualityItem[];
  pagination: DataQualityPagination;
  regionOptions: string[];
  districtOptions: string[];
};

type MediaReadData = {
  summary: ExcludeNulls<NullableMediaSummary>;
  monitors: MediaSourceMonitor[];
  pagination: DataQualityPagination;
  monitorReady: boolean;
};

type ExcludeNulls<T> = { [K in keyof T]: Exclude<T[K], null> };

function database() {
  const db = (env as unknown as RuntimeBindings).DB;
  if (!db || typeof db.prepare !== "function") throw new Error("Databáza zatiaľ nie je pripojená.");
  return db;
}

function parseImportData(value: string | null) {
  try {
    const parsed = JSON.parse(value ?? "");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, string | number | null>
      : null;
  } catch {
    return null;
  }
}

function safePage(value: number | undefined) {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : 1;
}

function pagination(page: number, pageSize: number, totalItems: number): DataQualityPagination {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const boundedPage = Math.min(Math.max(1, page), totalPages);
  const from = totalItems === 0 ? 0 : ((boundedPage - 1) * pageSize) + 1;
  const to = totalItems === 0 ? 0 : Math.min(totalItems, boundedPage * pageSize);
  return { page: boundedPage, pageSize, totalItems, totalPages, from, to };
}

function emptyPagination(page: number, pageSize: number) {
  return pagination(page, pageSize, 0);
}

function directoryIssues(row: DirectoryQualityRow) {
  const importData = parseImportData(row.source_data_json);
  const contacts = readDirectoryPublicContacts(importData, row.website_url ?? "");
  const quality = readDirectoryQualityMetadata(importData);
  const issues: DirectoryQualityItem["issues"] = [];
  if (!row.description?.trim()) issues.push({ key: "description", label: "Chýba popis" });
  if (!contacts.phone && !isDirectoryQualityResolutionCurrent(quality, "phone")) {
    issues.push({ key: "phone", label: "Chýba telefón" });
  }
  if (!contacts.email && !isDirectoryQualityResolutionCurrent(quality, "email")) {
    issues.push({ key: "email", label: "Chýba e-mail" });
  }
  if (!contacts.website && !isDirectoryQualityResolutionCurrent(quality, "website")) {
    issues.push({ key: "website", label: "Chýba web" });
  }
  if (!row.image_url?.trim() && !isDirectoryQualityResolutionCurrent(quality, "image")) {
    issues.push({ key: "image", label: "Chýba hlavný obrázok" });
  }
  const mapReviewClosedWithoutGoogle = Boolean(row.google_maps_not_required) && Boolean(row.address?.trim());
  if (
    !Boolean(row.online)
    && (!row.city?.trim() || row.service_address_confirmation !== "CONFIRMED_SERVICE_LOCATION")
    && !mapReviewClosedWithoutGoogle
    && !isDirectoryQualityResolutionCurrent(quality, "address")
  ) {
    issues.push({ key: "address", label: "Adresa nie je úplne potvrdená" });
  }
  return issues;
}

type ProfileQualityFilters = {
  category: DataQualityCategory;
  issue: DataQualityIssueFilter;
  status: DataQualityProfileStatus;
  priority: DataQualityPriority;
  query: string;
  region: string;
  district: string;
};

const issueSql: Record<Exclude<DataQualityIssueFilter, "all">, string> = {
  description: MISSING_DESCRIPTION_SQL,
  phone: MISSING_PHONE_SQL,
  email: MISSING_EMAIL_SQL,
  website: MISSING_WEBSITE_SQL,
  image: MISSING_IMAGE_SQL,
  address: INCOMPLETE_ADDRESS_SQL,
};

const IMPORTANT_PROFILE_ISSUE_SQL = `(${MISSING_PHONE_SQL} OR ${MISSING_EMAIL_SQL} OR ${MISSING_WEBSITE_SQL})`;
const SUPPLEMENT_PROFILE_ISSUE_SQL = `(${MISSING_DESCRIPTION_SQL} OR ${MISSING_IMAGE_SQL})`;

const prioritySql: Record<Exclude<DataQualityPriority, "all">, string> = {
  critical: `(${INCOMPLETE_ADDRESS_SQL})`,
  important: `NOT (${INCOMPLETE_ADDRESS_SQL}) AND ${IMPORTANT_PROFILE_ISSUE_SQL}`,
  supplement: `NOT (${INCOMPLETE_ADDRESS_SQL}) AND NOT ${IMPORTANT_PROFILE_ISSUE_SQL} AND ${SUPPLEMENT_PROFILE_ISSUE_SQL}`,
};

function profilePriority(issues: DirectoryQualityItem["issues"]): DirectoryQualityItem["priority"] {
  if (issues.some((issue) => issue.key === "address")) return "critical";
  if (issues.some((issue) => issue.key === "phone" || issue.key === "email" || issue.key === "website")) return "important";
  return "supplement";
}

function profileFilterSql(
  filters: ProfileQualityFilters,
  options: { includeIssue?: boolean; includePriority?: boolean } = {},
) {
  const clauses: string[] = [];
  const bindings: string[] = [];
  if (filters.category !== "all" && filters.category !== "podujatia") {
    clauses.push("category=?");
    bindings.push(filters.category);
  }
  if (filters.status !== "all") {
    clauses.push("status=?");
    bindings.push(filters.status);
  }
  if (filters.region) {
    clauses.push("region=?");
    bindings.push(filters.region);
  }
  if (filters.district) {
    clauses.push("district=?");
    bindings.push(filters.district);
  }
  if (filters.query) {
    const like = `%${filters.query}%`;
    clauses.push("(name LIKE ? COLLATE NOCASE OR city LIKE ? COLLATE NOCASE OR district LIKE ? COLLATE NOCASE OR region LIKE ? COLLATE NOCASE OR CAST(id AS TEXT)=?)");
    bindings.push(like, like, like, like, filters.query);
  }
  if (options.includeIssue !== false && filters.issue !== "all") {
    clauses.push(`(${issueSql[filters.issue]})`);
  }
  if (options.includePriority !== false && filters.priority !== "all") {
    clauses.push(`(${prioritySql[filters.priority]})`);
  }
  return {
    clause: clauses.length ? ` AND ${clauses.join(" AND ")}` : "",
    bindings,
  };
}

async function loadDirectoryLocationOptions(database: D1Database, filters: ProfileQualityFilters) {
  const categoryClause = filters.category !== "all" && filters.category !== "podujatia" ? " AND category=?" : "";
  const categoryBindings = categoryClause ? [filters.category] : [];
  const districtRegionClause = filters.region ? " AND region=?" : "";
  const [regions, districts] = await Promise.all([
    database.prepare(`
      SELECT DISTINCT region AS value
      FROM directory_profiles
      WHERE status <> 'archived' AND trim(COALESCE(region, '')) <> ''${categoryClause}
      ORDER BY region COLLATE NOCASE
    `).bind(...categoryBindings).all<{ value: string }>(),
    database.prepare(`
      SELECT DISTINCT district AS value
      FROM directory_profiles
      WHERE status <> 'archived' AND trim(COALESCE(district, '')) <> ''${categoryClause}${districtRegionClause}
      ORDER BY district COLLATE NOCASE
    `).bind(...categoryBindings, ...(filters.region ? [filters.region] : [])).all<{ value: string }>(),
  ]);
  const values = (rows: { results?: Array<{ value: string }> }) =>
    (rows.results ?? []).map((row) => row.value?.trim()).filter((value): value is string => Boolean(value));
  return { regionOptions: values(regions), districtOptions: values(districts) };
}

async function loadProfileQualityPage(
  requestedPage: number,
  filters: ProfileQualityFilters,
  loadAllMatches = false,
): Promise<ProfileReadData> {
  const db = database();
  const locationOptions = await loadDirectoryLocationOptions(db, filters);
  if (filters.category === "podujatia") {
    return {
      summary: {
        totalProfiles: 0,
        profilesWithIssues: 0,
        missingDescription: 0,
        missingPhone: 0,
        missingEmail: 0,
        missingWebsite: 0,
        missingImage: 0,
        incompleteAddress: 0,
      },
      profiles: [],
      pagination: emptyPagination(requestedPage, DATA_QUALITY_PROFILE_PAGE_SIZE),
      ...locationOptions,
    };
  }

  const baseFilter = profileFilterSql(filters, { includeIssue: false, includePriority: false });
  const resultFilter = profileFilterSql(filters);
  const summaryRow = await db.prepare(`
    SELECT
      COUNT(*) AS total_profiles,
      SUM(CASE WHEN ${PROFILE_ISSUE_SQL} THEN 1 ELSE 0 END) AS profiles_with_issues,
      SUM(CASE WHEN ${MISSING_DESCRIPTION_SQL} THEN 1 ELSE 0 END) AS missing_description,
      SUM(CASE WHEN ${MISSING_PHONE_SQL} THEN 1 ELSE 0 END) AS missing_phone,
      SUM(CASE WHEN ${MISSING_EMAIL_SQL} THEN 1 ELSE 0 END) AS missing_email,
      SUM(CASE WHEN ${MISSING_WEBSITE_SQL} THEN 1 ELSE 0 END) AS missing_website,
      SUM(CASE WHEN ${MISSING_IMAGE_SQL} THEN 1 ELSE 0 END) AS missing_image,
      SUM(CASE WHEN ${INCOMPLETE_ADDRESS_SQL} THEN 1 ELSE 0 END) AS incomplete_address
    FROM directory_profiles
    WHERE status <> 'archived'${baseFilter.clause}
  `).bind(...baseFilter.bindings).first<ProfileSummaryRow>();

  const summary = {
    totalProfiles: Number(summaryRow?.total_profiles ?? 0),
    profilesWithIssues: Number(summaryRow?.profiles_with_issues ?? 0),
    missingDescription: Number(summaryRow?.missing_description ?? 0),
    missingPhone: Number(summaryRow?.missing_phone ?? 0),
    missingEmail: Number(summaryRow?.missing_email ?? 0),
    missingWebsite: Number(summaryRow?.missing_website ?? 0),
    missingImage: Number(summaryRow?.missing_image ?? 0),
    incompleteAddress: Number(summaryRow?.incomplete_address ?? 0),
  };

  const countRow = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM directory_profiles
    WHERE status <> 'archived'${resultFilter.clause}
      AND ${PROFILE_ISSUE_SQL}
  `).bind(...resultFilter.bindings).first<{ count: number }>();
  const resultCount = Number(countRow?.count ?? 0);
  const paging = pagination(requestedPage, DATA_QUALITY_PROFILE_PAGE_SIZE, resultCount);
  const rows: DirectoryQualityRow[] = [];
  const pageSize = loadAllMatches ? 500 : paging.pageSize;
  const firstOffset = loadAllMatches ? 0 : (paging.page - 1) * paging.pageSize;
  const pageCount = loadAllMatches ? Math.max(1, Math.ceil(resultCount / pageSize)) : 1;
  for (let index = 0; index < pageCount; index += 1) {
    const offset = firstOffset + (index * pageSize);
    const result = await db.prepare(`
      SELECT id, slug, name, category, status, description, website_url, image_url, image_key,
             address, online, city, district, region, service_address_confirmation, source_data_json,
             CASE WHEN ${GOOGLE_MAPS_NOT_REQUIRED_SQL} THEN 1 ELSE 0 END AS google_maps_not_required
      FROM directory_profiles
      WHERE status <> 'archived'${resultFilter.clause}
        AND ${PROFILE_ISSUE_SQL}
      ORDER BY name COLLATE NOCASE ASC, id ASC
      LIMIT ? OFFSET ?
    `).bind(...resultFilter.bindings, pageSize, offset).all<DirectoryQualityRow>();
    rows.push(...(result.results ?? []));
    if (!loadAllMatches || (result.results ?? []).length < pageSize) break;
  }

  const profiles = rows.map((row) => {
    const issues = directoryIssues(row);
    return {
      id: Number(row.id),
      name: row.name || `Profil #${row.id}`,
      slug: row.slug ?? "",
      category: row.category ?? "",
      status: row.status ?? "",
      priority: profilePriority(issues),
      issues,
      suggestions: [],
      mediaMonitor: null,
      href: `/admin/adresar/${row.id}`,
    };
  });

  return { summary, profiles, pagination: paging, ...locationOptions };
}

const qualitySuggestionField = {
  publicPhone: { issueKey: "phone", label: "Telefón", reviewMode: "accept" },
  publicEmail: { issueKey: "email", label: "E-mail", reviewMode: "accept" },
  websiteUrl: { issueKey: "website", label: "Web", reviewMode: "accept" },
  description: { issueKey: "description", label: "Popis", reviewMode: "accept" },
  address: { issueKey: "address", label: "Adresa", reviewMode: "manual" },
  city: { issueKey: "address", label: "Mesto / obec", reviewMode: "manual" },
  district: { issueKey: "address", label: "Okres", reviewMode: "manual" },
  region: { issueKey: "address", label: "Kraj", reviewMode: "manual" },
  postalCode: { issueKey: "address", label: "PSČ", reviewMode: "manual" },
  street: { issueKey: "address", label: "Ulica", reviewMode: "manual" },
  houseNumber: { issueKey: "address", label: "Číslo domu", reviewMode: "manual" },
  addressFormat: { issueKey: "address", label: "Formát adresy", reviewMode: "manual" },
  serviceAddressConfirmation: { issueKey: "address", label: "Potvrdenie adresy", reviewMode: "manual" },
} as const;

async function loadQualitySuggestionsForProfiles(
  profiles: readonly DirectoryQualityItem[],
  db: D1Database,
  issue: DataQualityIssueFilter,
) {
  if (!profiles.length) return [] as Array<{ profileId: number; suggestion: DataQualityFieldSuggestion }>;
  const candidateIds = new Set(await listCanonicalAutomationUpdateSuggestionEntityIds({ entityType: "DIRECTORY" }, db));
  const profileIdSet = new Set(profiles.map((profile) => profile.id));
  const relevantIds = [...candidateIds].filter((id) => profileIdSet.has(id));
  if (!relevantIds.length) return [] as Array<{ profileId: number; suggestion: DataQualityFieldSuggestion }>;

  const suggestions = [];
  for (const batch of chunks(relevantIds, 40)) {
    suggestions.push(...await listCanonicalAutomationUpdateSuggestionsForEntities({
      entityType: "DIRECTORY",
      canonicalEntityIds: batch,
    }, db));
  }

  const profileIssues = new Map(
    profiles.map((profile) => [profile.id, new Set(profile.issues.map((issue) => issue.key))]),
  );
  return suggestions.flatMap((suggestion) =>
    suggestion.fields.flatMap((field) => {
      if (!(field.field in qualitySuggestionField)) return [];
      const typedField = field.field as keyof typeof qualitySuggestionField;
      const meta = qualitySuggestionField[typedField];
      if (issue !== "all" && meta.issueKey !== issue) return [];
      const canAccept = meta.reviewMode === "accept" && field.reviewable && field.state === "OPEN";
      const canReviewManually = meta.reviewMode === "manual" && field.state === "UNSUPPORTED";
      if (!canAccept && !canReviewManually) return [];
      if (!profileIssues.get(suggestion.canonicalEntityId)?.has(meta.issueKey)) return [];
      const proposed = field.proposed === null || field.proposed === undefined ? "" : String(field.proposed).trim();
      if (!proposed) return [];
      return [{
        profileId: suggestion.canonicalEntityId,
        suggestion: {
          origin: suggestion.origin,
          suggestionId: suggestion.id,
          field: typedField,
          issueKey: meta.issueKey,
          label: meta.label,
          proposed,
          reviewMode: meta.reviewMode,
          note: meta.reviewMode === "manual"
            ? "Adresu treba pred uložením skontrolovať v profile."
            : field.note,
          sourceUrl: suggestion.sourceUrl,
          sourceLabel: suggestion.sourceLabel,
          detectedAt: suggestion.detectedAt,
          canonicalUpdatedAt: suggestion.canonicalUpdatedAt,
          proposedValueHash: field.proposedValueHash,
        } satisfies DataQualityFieldSuggestion,
      }];
    }),
  );
}

function profileMatchesSolution(profile: DirectoryQualityItem, solution: DataQualitySolutionFilter) {
  if (solution === "all") return true;
  if (solution === "actionable") return profile.suggestions.some((suggestion) => suggestion.reviewMode === "accept");
  if (solution === "manual") return profile.suggestions.some((suggestion) => suggestion.reviewMode === "manual");
  return profile.suggestions.length === 0;
}

function mediaCategorySql(category: DataQualityCategory) {
  if (category === "all") return { clause: "", bindings: [] as string[] };
  if (category === "podujatia") return { clause: " AND entity_type='MANAGED_EVENT'", bindings: [] as string[] };
  return {
    clause: " AND entity_type='DIRECTORY_PROFILE' AND entity_id IN (SELECT id FROM directory_profiles WHERE category=?)",
    bindings: [category],
  };
}

function mediaStatusSql(status: DataQualityMediaStatus) {
  if (status === "review") return " AND status IN ('CANDIDATE','CHANGED')";
  if (status === "candidate") return " AND status='CANDIDATE'";
  if (status === "changed") return " AND status='CHANGED'";
  if (status === "missing") return " AND status='MISSING'";
  if (status === "error") return " AND status='ERROR'";
  return "";
}

async function loadMediaQualityPage(
  requestedPage: number,
  category: DataQualityCategory,
  mediaStatus: DataQualityMediaStatus,
): Promise<MediaReadData> {
  const db = database();
  if (!await mediaSourceMonitorSchemaReady(db)) {
    const error = new Error("Voliteľný monitoring obrázkov nie je v tejto schéme dostupný.");
    error.name = "OptionalDataQualitySourceUnavailable";
    throw error;
  }

  const mediaCategory = mediaCategorySql(category);
  const summaryRow = await db.prepare(`
    SELECT
      COUNT(*) AS media_issues,
      SUM(CASE WHEN status IN ('CHANGED','CANDIDATE') THEN 1 ELSE 0 END) AS changed_media,
      SUM(CASE WHEN status IN ('MISSING','ERROR') THEN 1 ELSE 0 END) AS missing_media_source
    FROM media_source_monitors
    WHERE status IN ('CANDIDATE','CHANGED','MISSING','ERROR')${mediaCategory.clause}
  `).bind(...mediaCategory.bindings).first<MediaSummaryRow>();
  const summary = {
    mediaIssues: Number(summaryRow?.media_issues ?? 0),
    changedMedia: Number(summaryRow?.changed_media ?? 0),
    missingMediaSource: Number(summaryRow?.missing_media_source ?? 0),
  };
  const statusClause = mediaStatusSql(mediaStatus);
  const countRow = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM media_source_monitors
    WHERE status IN ('CANDIDATE','CHANGED','MISSING','ERROR')${mediaCategory.clause}${statusClause}
  `).bind(...mediaCategory.bindings).first<{ count: number }>();
  const resultCount = Number(countRow?.count ?? 0);
  const paging = pagination(requestedPage, DATA_QUALITY_MEDIA_PAGE_SIZE, resultCount);
  const offset = (paging.page - 1) * paging.pageSize;
  const monitors = await listMediaSourceIssues(db, paging.pageSize, offset, category, mediaStatus);
  return { summary, monitors, pagination: paging, monitorReady: true };
}

function uniqueIds(monitors: readonly MediaSourceMonitor[], entityType: MediaSourceMonitor["entityType"]) {
  return [...new Set(
    monitors
      .filter((item) => item.entityType === entityType)
      .map((item) => Number(item.entityId))
      .filter((id) => Number.isSafeInteger(id) && id > 0),
  )].sort((a, b) => a - b);
}

function chunks<T>(values: readonly T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function loadProfileNames(db: D1Database, ids: readonly number[]) {
  const rows: ProfileNameRow[] = [];
  for (const batch of chunks(ids, DATA_QUALITY_LOOKUP_CHUNK_SIZE)) {
    if (!batch.length) continue;
    const placeholders = batch.map(() => "?").join(",");
    const result = await db.prepare(
      `SELECT id, name, slug, category FROM directory_profiles WHERE id IN (${placeholders}) ORDER BY id ASC`,
    ).bind(...batch).all<ProfileNameRow>();
    rows.push(...(result.results ?? []));
  }
  return rows;
}

async function loadEventNames(db: D1Database, ids: readonly number[]) {
  const rows: EventNameRow[] = [];
  for (const batch of chunks(ids, DATA_QUALITY_LOOKUP_CHUNK_SIZE)) {
    if (!batch.length) continue;
    const placeholders = batch.map(() => "?").join(",");
    const result = await db.prepare(
      `SELECT id, title, slug FROM managed_events WHERE id IN (${placeholders}) ORDER BY id ASC`,
    ).bind(...batch).all<EventNameRow>();
    rows.push(...(result.results ?? []));
  }
  return rows;
}

function fallbackMediaItems(monitors: readonly MediaSourceMonitor[]): MediaQualityItem[] {
  return monitors.map((monitor) => ({
    monitor,
    label: monitor.entityType === "DIRECTORY_PROFILE"
      ? `Profil #${monitor.entityId}`
      : `Podujatie #${monitor.entityId}`,
    href: monitor.entityType === "DIRECTORY_PROFILE"
      ? `/admin/adresar/${monitor.entityId}`
      : `/admin/podujatia/${monitor.entityId}`,
    category: monitor.entityType === "MANAGED_EVENT" ? "podujatia" : "",
  }));
}

export async function resolveDataQualityMediaItems(
  db: D1Database,
  monitors: readonly MediaSourceMonitor[],
): Promise<MediaQualityItem[]> {
  const profileIds = uniqueIds(monitors, "DIRECTORY_PROFILE");
  const eventIds = uniqueIds(monitors, "MANAGED_EVENT");
  const profileNames = await loadProfileNames(db, profileIds);
  const eventNames = await loadEventNames(db, eventIds);
  const profileNameMap = new Map(profileNames.map((item) => [Number(item.id), item]));
  const eventNameMap = new Map(eventNames.map((item) => [Number(item.id), item]));

  return monitors.map((monitor) => {
    if (monitor.entityType === "DIRECTORY_PROFILE") {
      const profile = profileNameMap.get(monitor.entityId);
      return {
        monitor,
        label: profile?.name ?? `Profil #${monitor.entityId}`,
        href: `/admin/adresar/${monitor.entityId}`,
        category: profile?.category ?? "",
      };
    }
    const event = eventNameMap.get(monitor.entityId);
    return {
      monitor,
      label: event?.title ?? `Podujatie #${monitor.entityId}`,
      href: `/admin/podujatia/${monitor.entityId}`,
      category: "podujatia",
    };
  });
}

const unavailableProfileSummary: NullableProfileSummary = {
  totalProfiles: null,
  profilesWithIssues: null,
  missingDescription: null,
  missingPhone: null,
  missingEmail: null,
  missingWebsite: null,
  missingImage: null,
  incompleteAddress: null,
};

const unavailableMediaSummary: NullableMediaSummary = {
  mediaIssues: null,
  changedMedia: null,
  missingMediaSource: null,
};

export async function loadDataQualityDashboard(input: {
  profilePage?: number;
  mediaPage?: number;
  category?: string;
  issue?: string;
  profileStatus?: string;
  priority?: string;
  solution?: string;
  query?: string;
  region?: string;
  district?: string;
  mediaStatus?: string;
} = {}): Promise<DataQualityDashboard> {
  const requestedProfilePage = safePage(input.profilePage);
  const requestedMediaPage = safePage(input.mediaPage);
  const category = dataQualityCategoryOptions.some((option) => option.value === input.category)
    ? input.category as DataQualityCategory
    : "all";
  const issue = dataQualityIssueOptions.some((option) => option.value === input.issue)
    ? input.issue as DataQualityIssueFilter
    : "all";
  const profileStatus = dataQualityProfileStatusOptions.some((option) => option.value === input.profileStatus)
    ? input.profileStatus as DataQualityProfileStatus
    : "all";
  const priority = dataQualityPriorityOptions.some((option) => option.value === input.priority)
    ? input.priority as DataQualityPriority
    : "all";
  const solution = dataQualitySolutionOptions.some((option) => option.value === input.solution)
    ? input.solution as DataQualitySolutionFilter
    : "all";
  const mediaStatus = dataQualityMediaStatusOptions.some((option) => option.value === input.mediaStatus)
    ? input.mediaStatus as DataQualityMediaStatus
    : "all";
  const query = input.query?.trim().slice(0, 100) ?? "";
  const region = input.region?.trim().slice(0, 80) ?? "";
  const district = input.district?.trim().slice(0, 100) ?? "";
  const profileFilters: ProfileQualityFilters = {
    category,
    issue,
    status: profileStatus,
    priority,
    query,
    region,
    district,
  };

  const profileRead = await readAdminAutomationData({
    key: "data-quality:profiles",
    load: () => loadProfileQualityPage(requestedProfilePage, profileFilters, solution !== "all"),
    fallback: {
      summary: {
        totalProfiles: 0,
        profilesWithIssues: 0,
        missingDescription: 0,
        missingPhone: 0,
        missingEmail: 0,
        missingWebsite: 0,
        missingImage: 0,
        incompleteAddress: 0,
      },
      profiles: [],
      pagination: emptyPagination(requestedProfilePage, DATA_QUALITY_PROFILE_PAGE_SIZE),
      regionOptions: [],
      districtOptions: [],
    },
    empty: (value) => value.summary.totalProfiles === 0,
  });

  const suggestionRead = await readAdminAutomationData({
    key: "data-quality:profile-suggestions",
    load: () => loadQualitySuggestionsForProfiles(profileRead.data.profiles, database(), issue),
    fallback: [],
    empty: (value) => value.length === 0,
  });

  const mediaRead = await readAdminAutomationData({
    key: "data-quality:media",
    load: () => loadMediaQualityPage(requestedMediaPage, category, mediaStatus),
    fallback: {
      summary: { mediaIssues: 0, changedMedia: 0, missingMediaSource: 0 },
      monitors: [],
      pagination: emptyPagination(requestedMediaPage, DATA_QUALITY_MEDIA_PAGE_SIZE),
      monitorReady: false,
    },
    empty: (value) => value.summary.mediaIssues === 0,
  });

  const lookupRead = await readAdminAutomationData({
    key: "data-quality:entity-lookups",
    load: async () => {
      if (mediaRead.status === "UNAVAILABLE") {
        const error = new Error("Media údaje pre lookup nie sú dostupné.");
        error.name = "DataQualityLookupDependencyUnavailable";
        throw error;
      }
      if (!mediaRead.data.monitors.length) return [];
      return resolveDataQualityMediaItems(database(), mediaRead.data.monitors);
    },
    fallback: fallbackMediaItems(mediaRead.data.monitors),
    empty: (value) => value.length === 0,
  });

  const suggestionsByProfile = new Map<number, DataQualityFieldSuggestion[]>();
  for (const item of suggestionRead.data) {
    const current = suggestionsByProfile.get(item.profileId) ?? [];
    current.push(item.suggestion);
    suggestionsByProfile.set(item.profileId, current);
  }
  const profilesWithSuggestions = profileRead.data.profiles.map((profile) => ({
    ...profile,
    suggestions: suggestionsByProfile.get(profile.id) ?? [],
  }));
  const solutionFilteredProfiles = solution === "all"
    ? profilesWithSuggestions
    : suggestionRead.status === "UNAVAILABLE"
      ? []
      : profilesWithSuggestions.filter((profile) => profileMatchesSolution(profile, solution));
  const solutionPagination = solution === "all"
    ? profileRead.data.pagination
    : pagination(requestedProfilePage, DATA_QUALITY_PROFILE_PAGE_SIZE, solutionFilteredProfiles.length);
  const profiles = solution === "all"
    ? solutionFilteredProfiles
    : solutionFilteredProfiles.slice(
        (solutionPagination.page - 1) * solutionPagination.pageSize,
        solutionPagination.page * solutionPagination.pageSize,
      );

  const availability = summarizeAdminAutomationReads([profileRead, suggestionRead, mediaRead, lookupRead]);
  return {
    summary: {
      ...(profileRead.status === "UNAVAILABLE" ? unavailableProfileSummary : profileRead.data.summary),
      ...(mediaRead.status === "UNAVAILABLE" ? unavailableMediaSummary : mediaRead.data.summary),
    },
    profiles,
    media: lookupRead.data,
    monitorReady: mediaRead.data.monitorReady,
    profilePagination: solutionPagination,
    mediaPagination: mediaRead.data.pagination,
    category,
    categoryOptions: dataQualityCategoryOptions,
    issue,
    issueOptions: dataQualityIssueOptions,
    profileStatus,
    profileStatusOptions: dataQualityProfileStatusOptions,
    priority,
    priorityOptions: dataQualityPriorityOptions,
    solution,
    solutionOptions: dataQualitySolutionOptions,
    query,
    region,
    district,
    regionOptions: profileRead.data.regionOptions,
    districtOptions: profileRead.data.districtOptions,
    mediaStatus,
    mediaStatusOptions: dataQualityMediaStatusOptions,
    availability,
    sections: {
      profiles: { status: profileRead.status, errorRef: profileRead.errorRef },
      suggestions: { status: suggestionRead.status, errorRef: suggestionRead.errorRef },
      media: { status: mediaRead.status, errorRef: mediaRead.errorRef },
      lookups: { status: lookupRead.status, errorRef: lookupRead.errorRef },
    },
  };
}
