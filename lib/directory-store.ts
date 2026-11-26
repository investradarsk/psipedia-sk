import { planDirectoryAdminReceipts } from "./notion-directory-admin-receipts.ts";
import type { BreederEditorialField } from "./notion-breeder-field-events.ts";
import { retryTransientPublicRead } from "@/lib/public-read-retry";
import { overlayDirectorySqlContacts } from "./directory-sql-contacts";
import { planDirectory0173EditorialSqlMirror } from "./directory-0173-editorial-sql-mirror";
import { planDirectoryStep3PresentationSqlMirror } from "./directory-sql-step3-live-mirror";
import { planDirectoryExtraSqlTextMirror } from "./directory-extra-sql-mirror";
import {
  directoryServicesSqlExpression,
  directoryImageSqlExpression,
  readDirectoryPresentationSql,
} from "./directory-presentation-sql-read";
import { readDirectory0170EditorialFields, withoutLegacyDirectoryFacetValues } from "./directory-0170-editorial-read";
import {
  directory0173QualificationsSqlExpression,
  directory0173SeoSqlExpression,
  readDirectory0173EditorialSql,
} from "./directory-0173-editorial-sql-read";
import { env } from "cloudflare:workers";
import {
  directoryLocationFacetStatement,
  directorySourceFacetStatement,
  directoryCanonicalBreedFacetSql,
  parseDirectoryFacetValues,
} from "@/lib/directory-read-facets";
import {
  DIRECTORY_PUBLIC_SOURCE_FACETS,
  directoryEffectiveDistrictSql,
  directoryEffectiveDistrictValue,
  directoryLegacyDistrictSql,
} from "./directory-public-source-contract";
import { cache } from "react";
import { DIRECTORY_ADDITIONAL_CATEGORIES_SQL_CONFIRMED_KEY, directoryAdditionalCategoryJsonSql, directoryCategoryMembershipSql, mergeAdditionalDirectoryCategories, normalizeAdditionalDirectoryCategories, readAdditionalDirectoryCategories } from "./directory-multi-category";
import { planDirectorySecondaryCategorySqlMirror, planDirectorySecondaryCategoryCreateSqlMirror } from "./directory-secondary-category-sql";
import { directoryCatalogFilters } from "./directory-query.ts";
import { mergeDirectoryBreederGallery, readDirectoryBreederGallery } from "./directory-breeder-gallery.ts";
import { readProfileGallery } from "./partner-profile-gallery";
import { attachBreederCardBreeds, breederBreedSourceLabel } from "./directory-breeder-card";
import { readCanonicalBreedIds } from "./breed-canonical";
import { readNonemptyD1Page } from "@/lib/perf-d1-page-read";
import {
  parsePublicDirectoryFacets,
  directoryPublicFacetSql,
  type DirectoryPublicFacets,
} from "@/lib/directory-public-filters";
import { serviceFilterCategories } from "@/lib/directory-filter-contract";
import {loadResolvedServiceDefinitions} from "./service-catalog-resolved";
import {canonicalPublicProfileServices,type PublicServiceChoice} from "./service-catalog-public-profile-services";
import {loadServiceProfileMembership} from "./service-catalog-profile-membership";
import {
  canonicalPublicServiceWhere,
  canonicalPublicServiceOptions,
  type CanonicalPublicServiceRow,
  type CanonicalPublicServiceOption,
} from "@/lib/service-catalog-public-service-filter";
import { slugifyArticleTitle } from "@/lib/article-store";
import {
  allDirectoryCategories,
  directoryCategories,
  isDirectoryCategory,
  type DirectoryCategorySlug,
  type DirectoryInquiry,
  type DirectoryInquiryStatus,
  type DirectoryProfileStatus,
  type ManagedDirectoryProfile,
  type PublicDirectoryProfile,
} from "@/lib/directory";

import { bratislavaDateKey, slovakRegions, type SlovakRegion } from "@/lib/events";
import {
  getSlovakDistricts,
  getSlovakMunicipalities,
  normalizeSlovakLocationSearch,
  resolveSlovakLocation,
} from "@/lib/slovakia-locations";
import type { GooglePlaceCandidate } from "@/lib/google-place-matching";
import type { EditableSeo } from "@/lib/content-seo";
import {
  isDirectoryInternalMetadataKey,
  TRAINER_SERVICES_TEXT_METADATA_KEY,
  mergeDirectoryPublicContactData,
  omitDirectorySqlContactAliases,
  mergeDirectoryQualityMetadata,
  directoryQualityFields,
  readDirectoryProfileReviewMetadata,
  readDirectoryPublicContacts,
  readDirectoryQualityMetadata,
  directoryQualityStatusSourceKey,
  directoryQualityCheckedAtSourceKey,
  type DirectoryQualityResolutionInput,
} from "@/lib/directory-profile-metadata";
import { directory0173ReviewCasGuardStatement } from "./directory-0173-review-state-sql";
import { directoryQualificationSections } from "./directory-public-copy.ts";
import { ensureResourceForDirectoryProfile } from "@/lib/canonical-resource";
import { HOMEPAGE_REAL_IMAGE_SQL } from "@/lib/homepage-media";
import { homepageRotationOffset } from "@/lib/homepage-rotation";
import { homepageDirectoryGroupedSql } from "@/lib/homepage-directory-query";
import {
  normalizeImageDisplayConfig,
  readImageDisplayConfig,
  type ImageDisplayConfig,
} from "@/lib/image-display";
import {
  prepareGoogleSourceGeoInvalidation,
  reconcileGeoAfterSourceMutation,
} from "@/lib/geo-store";
import {
  directoryAddressFormats,
  evaluateDirectoryServiceAddress,
  normalizeSlovakPostalCode,
  type DirectoryAddressFormat,
  type DirectoryServiceAddressConfirmation,
} from "@/lib/directory-service-address";

export type ManagedDirectoryProfileInput = {
  slug?: string;
  name?: string;
  category?: string;
  /** Secondary category listings only. The primary category stays canonical. */
  additionalCategories?: DirectoryCategorySlug[];
  status?: string;
  excerpt?: string;
  description?: string;
  services?: string[];
  /** Separate prose mirrored to Notion; never mutates trainer Services V3. */
  trainerServicesText?: string;
  qualifications?: string[];
  city?: string;
  district?: string;
  region?: string;
  address?: string;
  postalCode?: string;
  street?: string;
  houseNumber?: string;
  addressFormat?: string;
  confirmServiceAddress?: boolean;
  clearServiceAddressConfirmation?: boolean;
  addressProviderResultId?: string;
  priceNote?: string;
  websiteUrl?: string | null;
  publicPhone?: string;
  publicEmail?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  internalEmail?: string | null;
  imageUrl?: string | null;
  imageKey?: string | null;
  galleryUrls?: string[];
  thumbnailImageDisplay?: ImageDisplayConfig | null;
  detailImageDisplay?: ImageDisplayConfig | null;
  qualityResolutions?: DirectoryQualityResolutionInput;
  qualityCheckedAt?: string;
  verified?: boolean;
  featured?: boolean;
  seo?: EditableSeo;
};

export type ManagedDirectoryProfileSummary = Pick<
  ManagedDirectoryProfile,
  | "id"
  | "slug"
  | "name"
  | "excerpt"
  | "category"
  | "status"
  | "services"
  | "city"
  | "district"
  | "region"
  | "imageUrl"
  | "reviewed"
  | "reviewedAt"
  | "verified"
  | "featured"
  | "updatedAt"
>;

export type ManagedDirectoryProfileSummaryPage = {
  profiles: ManagedDirectoryProfileSummary[];
  counts: {
    total: number;
    published: number;
    draft: number;
    archived: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type DirectoryInquiryInput = {
  profileId?: number;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  dogInfo?: string;
  message?: string;
  consent?: boolean;
};

type DirectoryProfileRow = {
  id: number;
  slug: string;
  name: string;
  category: string;
  status: string;
  excerpt: string;
  description: string;
  services_json: string;
  qualifications_json: string;
  city: string;
  district: string;
  region: string;
  address: string;
  postal_code?: string;
  street?: string;
  house_number?: string;
  address_format?: string;
  service_address_confirmation?: string;
  online: number;
  price_note: string;
  website_url: string | null;
  public_phone?: string | null;
  public_email?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  internal_email: string | null;
  image_url: string | null;
  image_key: string | null;
  thumbnail_display_json?: string | null;
  detail_display_json?: string | null;
  import_key: string | null;
  source_data_json: string;
  breeder_breed_source?: string | null;
  search_text: string;
  verified: number;
  featured: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  archived_at: string | null;
  created_by: string;
  updated_by: string;
  seo_json: string;
};

type DirectoryInquiryRow = {
  id: number;
  profile_id: number | null;
  profile_name: string;
  profile_slug: string;
  profile_category: string;
  recipient_email: string | null;
  sender_name: string;
  sender_email: string;
  sender_phone: string;
  dog_info: string;
  message: string;
  status: string;
  consent: number;
  created_at: string;
  updated_at: string;
};

type DirectoryProfileSummaryRow = {
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

/** Read-model for homepage veterinarian cards; do not load complete profiles. */
type HomepageDirectoryRow = Pick<
  DirectoryProfileRow,
  "id" | "slug" | "name" | "category" | "city" | "district" | "image_url" | "thumbnail_display_json"
> & { fallback_district: string | null };
export type HomepageDirectoryCard = Pick<
  PublicDirectoryProfile,
  "id" | "slug" | "name" | "category" | "city" | "district" | "imageUrl" | "thumbnailImageDisplay"
>;

type DirectoryProfileCountRow = {
  total: number;
  published: number;
  draft: number;
  archived: number;
};

export type DirectorySort = "recommended" | "name-asc" | "name-desc" | "newest";

export type DirectoryFilters = {
  query: string;
  category: "" | DirectoryCategorySlug;
  region: string;
  district: string;
  city: string;
  service: string;
  canonicalService?: string;
  breed: string;
  fciGroup: string;
  organization: string;
  profileType: string;
  facets?: DirectoryPublicFacets;
  sort: DirectorySort;
  page: number;
};

export type PublicDirectoryProfilePage = {
  profiles: PublicDirectoryProfile[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  options: {
    regions: string[];
    districts: string[];
    cities: string[];
    services: string[];
    canonicalServices: CanonicalPublicServiceOption[];
    breeds: string[];
    fciGroups: string[];
    organizations: string[];
    profileTypes: string[];
  };
};

type DirectorySearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function parseDirectoryFilters(
  params: DirectorySearchParams,
  pathCategory?: DirectoryCategorySlug,
): DirectoryFilters {
  const rawSort = firstParam(params.sort);
  const rawCategory = firstParam(params.category);
  const sort: DirectorySort = ["recommended", "name-asc", "name-desc", "newest"].includes(rawSort)
    ? (rawSort as DirectorySort)
    : "recommended";
  return directoryCatalogFilters({
    query: firstParam(params.q).slice(0, 100),
    category:
      isDirectoryCategory(rawCategory) &&
      rawCategory !== "psie-skoly" &&
      rawCategory !== "utulky-a-zachrana"
        ? rawCategory
        : "",
    region: normalizeDirectoryRegion(firstParam(params.region)) ?? "",
    district: firstParam(params.district).slice(0, 100),
    city: firstParam(params.city).slice(0, 120),
    service: firstParam(params.service).slice(0, 160),
    // Repeated canonical filter parameters must fail closed, not silently select one.
    canonicalService: Array.isArray(params.svc)
      ? "__invalid__"
      : firstParam(params.svc).slice(0, 101),
    breed: firstParam(params.breed).slice(0, 160),
    fciGroup: firstParam(params.fci).slice(0, 80),
    organization: firstParam(params.organization).slice(0, 160),
    profileType: firstParam(params.type).slice(0, 160),
    facets: parsePublicDirectoryFacets(
      params,
      pathCategory ?? (isDirectoryCategory(rawCategory) ? rawCategory : ""),
    ),
    sort,
    page: Math.max(1, Number.parseInt(firstParam(params.page) || "1", 10) || 1),
  });
}

type RuntimeBindings = { DB?: D1Database };

function getD1Binding() {
  const database = (env as unknown as RuntimeBindings).DB;
  return database && typeof database.prepare === "function" ? database : null;
}

function requireD1Binding() {
  const database = getD1Binding();
  if (!database) throw new Error("Databáza adresára zatiaľ nie je pripojená.");
  return database;
}

async function ensureDirectoryStore(database: D1Database) {
  void database;
  // The deployed migrations own the schema. Admin requests must never run DDL,
  // PRAGMA probes or index creation before reading a list or saving a profile.
}

function safeList(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim())
          .slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

function safePublicList(value: string) {
  return safeList(value).filter(
    (item) =>
      !/^(?:stav overenia|(?:čiastočne\s+)?overené(?:\s+psipediou)?|neoverené|overenie údajov|zdroj(?: overenia)?|dátum (?:kontroly|overenia)|import[_ ]?key|source_data_json)\s*:?/i.test(
        item,
      ),
  );
}

function safeImportData(value: string, includeInternal = false) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, item]) =>
          (includeInternal || key === TRAINER_SERVICES_TEXT_METADATA_KEY || !isDirectoryInternalMetadataKey(key)) &&
          (item === null || typeof item === "string" || typeof item === "number"),
      ),
    );
  } catch {
    return null;
  }
}

export function normalizeDirectorySearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sk")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeDirectoryRegion(value: string | null | undefined): SlovakRegion | null {
  const clean = value?.trim() ?? "";
  if (!clean) return null;
  const withSuffix = clean.endsWith(" kraj") ? clean : `${clean} kraj`;
  return (slovakRegions as readonly string[]).includes(withSuffix)
    ? (withSuffix as SlovakRegion)
    : null;
}

function runtimeDirectoryLocationText(value: string | null | undefined) {
  const clean = value?.trim() ?? "";
  return /^(?:online|slovensko|slovenská republika)$/iu.test(clean) ? "" : clean;
}

function googlePlaceDirectoryLocation(
  existing: ManagedDirectoryProfile,
  place: GooglePlaceCandidate,
) {
  const current = resolveSlovakLocation({
    region: existing.region,
    district: existing.district,
    city: existing.city,
  });
  const googleRegion = normalizeDirectoryRegion(place.address?.region);
  const region = googleRegion ?? normalizeDirectoryRegion(existing.region);
  const locality = place.address?.locality?.trim() ?? "";
  const sublocality = place.address?.sublocality?.trim() ?? "";
  const candidates = [
    locality && sublocality ? `${locality} - ${sublocality}` : "",
    sublocality,
    locality,
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  // A confirmed Google locality wins even if the old canonical locality was
  // valid. Only fall back to the original locality when Google supplies none.
  if (!candidates.length) return current ?? { region: region ?? "", district: "", city: "" };
  if (!region) return { region: "", district: "", city: candidates[0] };

  const needles = [...new Set(candidates.map(normalizeSlovakLocationSearch).filter(Boolean))];
  const matches: Array<{ region: string; district: string; city: string }> = [];
  for (const district of getSlovakDistricts(region)) {
    for (const municipality of getSlovakMunicipalities(district)) {
      const normalized = normalizeSlovakLocationSearch(municipality);
      if (
        needles.some(
          (needle) =>
            normalized === needle ||
            normalized.endsWith(` ${needle}`) ||
            normalized.endsWith(`-${needle}`),
        )
      ) {
        matches.push({ region, district, city: municipality });
      }
    }
  }

  const unique = matches.filter(
    (item, index, list) =>
      list.findIndex((other) => other.district === item.district && other.city === item.city) ===
      index,
  );
  if (unique.length === 1) return unique[0];

  return {
    region,
    district: "",
    city: candidates[0] ?? "",
  };
}

function directorySearchText(input: {
  name: string;
  excerpt: string;
  description: string;
  services: string[];
  qualifications: string[];
  city: string;
  district: string;
  region: string;
  address: string;
  postalCode?: string;
  street?: string;
  houseNumber?: string;
}) {
  return normalizeDirectorySearchText(
    [
      input.name,
      input.excerpt,
      input.description,
      input.services.join(" "),
      input.qualifications.join(" "),
      input.city,
      input.district,
      input.region,
      input.address,
      input.postalCode ?? "",
      input.street ?? "",
      input.houseNumber ?? "",
    ].join(" "),
  );
}

const DIRECTORY_PROFILE_COLUMNS = `
  id, slug, name, category, status, excerpt, description,
  ${directoryServicesSqlExpression()} AS services_json,
  ${directory0173QualificationsSqlExpression()} AS qualifications_json,
  city, district, region, address, postal_code, street, house_number,
  address_format, service_address_confirmation, online, price_note, website_url,
  public_phone, public_email, facebook_url, instagram_url, internal_email, image_url,
  image_key,
  ${directoryImageSqlExpression("thumbnail")} AS thumbnail_display_json,
  ${directoryImageSqlExpression("detail")} AS detail_display_json, import_key,
  json_object('_psipedia_additional_categories', (${directoryAdditionalCategoryJsonSql()}) || '') AS source_data_json,
  search_text, verified, featured,
  COALESCE(${directory0173SeoSqlExpression()}, '{}') AS seo_json,
  created_at, updated_at, published_at, archived_at, created_by, updated_by
`;

const DIRECTORY_CARD_COLUMNS = `
  id, slug, name, category, status, excerpt, '' AS description,
  ${directoryServicesSqlExpression()} AS services_json,
  '[]' AS qualifications_json, city, district, region, '' AS address, online,
  price_note, website_url,
  NULL AS public_phone, NULL AS public_email, NULL AS facebook_url, NULL AS instagram_url,
  NULL AS internal_email, image_url, NULL AS image_key,
  ${directoryImageSqlExpression("thumbnail")} AS thumbnail_display_json,
  ${directoryImageSqlExpression("detail")} AS detail_display_json,
  import_key,
  -- Breeder card names are resolved from the published SQL breed relations.
  -- Historic source_data_json names are not a public fallback.
  '' AS breeder_breed_source,
  -- Listing cards need only category membership, not the entire editorial/source payload.
  -- Preserve a minimal, valid JSON shape for rowToPublicProfile on both paged
  -- results and category previews (and never expose private source metadata).
  json_object('_psipedia_additional_categories', (${directoryAdditionalCategoryJsonSql()}) || '') AS source_data_json,
  search_text, verified, featured, '{}' AS seo_json,
  created_at, updated_at, published_at, archived_at, created_by, updated_by
`;

// A confirmed published breed relation supersedes imported prose in the public
// directory. Preserve the shared legacy JSON read rules for unlinked profiles.
const DIRECTORY_LEGACY_BREED = DIRECTORY_PUBLIC_SOURCE_FACETS.breed;
const DIRECTORY_HAS_CANONICAL_BREEDS = `EXISTS (
  SELECT 1 FROM breed_directory_relations linked
  JOIN managed_breeds linked_breed ON linked_breed.id = linked.breed_id
  WHERE linked.profile_id = directory_profiles.id
    AND linked_breed.id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))
)`;
const DIRECTORY_SOURCE_FACETS = {
  ...DIRECTORY_PUBLIC_SOURCE_FACETS,
  breed: `CASE WHEN directory_profiles.category IN ('chovatelske-stanice','chovatelske-kluby')
    AND ${DIRECTORY_HAS_CANONICAL_BREEDS} THEN ''
    ELSE ${DIRECTORY_LEGACY_BREED} END`,
};

// Directory facet options are computed on every public listing. Do not rerun
// the full canonical window query for every row in directory_profiles: use one
// small authoritative eligibility projection and pass its winner IDs as JSON.
const DIRECTORY_CANONICAL_BREED_FACET = directoryCanonicalBreedFacetSql(DIRECTORY_LEGACY_BREED);

export function sqlNormalizedExpression(columnExpression: string) {
  const replacements: Array<[string, string]> = [
    ["á", "a"],
    ["ä", "a"],
    ["č", "c"],
    ["ď", "d"],
    ["é", "e"],
    ["í", "i"],
    ["ĺ", "l"],
    ["ľ", "l"],
    ["ň", "n"],
    ["ó", "o"],
    ["ô", "o"],
    ["ŕ", "r"],
    ["š", "s"],
    ["ť", "t"],
    ["ú", "u"],
    ["ý", "y"],
    ["ž", "z"],
    ["Á", "a"],
    ["Ä", "a"],
    ["Č", "c"],
    ["Ď", "d"],
    ["É", "e"],
    ["Í", "i"],
    ["Ĺ", "l"],
    ["Ľ", "l"],
    ["Ň", "n"],
    ["Ó", "o"],
    ["Ô", "o"],
    ["Ŕ", "r"],
    ["Š", "s"],
    ["Ť", "t"],
    ["Ú", "u"],
    ["Ý", "y"],
    ["Ž", "z"],
  ];
  return replacements.reduce(
    (expression, [from, to]) => `replace(${expression}, '${from}', '${to}')`,
    `lower(${columnExpression})`,
  );
}

const LEGACY_DIRECTORY_SEARCH = sqlNormalizedExpression(`
  coalesce(name, '') || ' ' || coalesce(excerpt, '') || ' ' || coalesce(description, '') || ' ' ||
  coalesce(city, '') || ' ' || coalesce(district, '') || ' ' || coalesce(region, '') || ' ' ||
  coalesce(address, '') || ' ' || coalesce(${directoryServicesSqlExpression()}, '') || ' ' || coalesce(${directory0173QualificationsSqlExpression()}, '') || ' ' ||
  ${directoryEffectiveDistrictSql()}
`);

const DIRECTORY_PUBLIC_FACET_SEARCH = sqlNormalizedExpression(`
  ${DIRECTORY_SOURCE_FACETS.breed} || ' ' || ${DIRECTORY_SOURCE_FACETS.fciGroup} || ' ' ||
  ${DIRECTORY_SOURCE_FACETS.organization} || ' ' || ${DIRECTORY_SOURCE_FACETS.profileType}
`);
const DIRECTORY_LEGACY_PUBLIC_FACET_SEARCH = sqlNormalizedExpression(`
  ${DIRECTORY_LEGACY_BREED} || ' ' || ${DIRECTORY_SOURCE_FACETS.fciGroup} || ' ' ||
  ${DIRECTORY_SOURCE_FACETS.organization} || ' ' || ${DIRECTORY_SOURCE_FACETS.profileType}
`);

function rowToPublicProfile(row: DirectoryProfileRow): PublicDirectoryProfile {
  const addressFormat = directoryAddressFormats.includes(
    row.address_format as DirectoryAddressFormat,
  )
    ? (row.address_format as DirectoryAddressFormat)
    : "";
  const serviceAddressConfirmation: DirectoryServiceAddressConfirmation =
    row.service_address_confirmation === "CONFIRMED_SERVICE_LOCATION"
      ? "CONFIRMED_SERVICE_LOCATION"
      : "LEGACY_UNCONFIRMED";
  const city = runtimeDirectoryLocationText(row.city);
  const importData = overlayDirectorySqlContacts(safeImportData(row.source_data_json), row);
  const internalImportData = overlayDirectorySqlContacts(safeImportData(row.source_data_json, true), row);
  const breedSummary = row.category === "chovatelske-stanice"
    ? breederBreedSourceLabel(row.breeder_breed_source || importData?.["Plemená"] || importData?.["Plemeno"])
    : "";
  const district = runtimeDirectoryLocationText(row.district);
  const region = runtimeDirectoryLocationText(row.region);
  const serviceAddress = evaluateDirectoryServiceAddress({
    region,
    district,
    city,
    postalCode: row.postal_code ?? "",
    street: runtimeDirectoryLocationText(row.street),
    houseNumber: runtimeDirectoryLocationText(row.house_number),
    addressFormat,
    serviceAddressConfirmation,
  });
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: isDirectoryCategory(row.category) ? row.category : "salony-a-sluzby",
    additionalCategories: readAdditionalDirectoryCategories(internalImportData, row.category),
    excerpt: row.excerpt,
    description: row.description,
    services: safePublicList(row.services_json),
    ...directoryQualificationSections(safeList(row.qualifications_json)),
    city,
    district: directoryEffectiveDistrictValue(
      district,
      importData?.["Okres"],
    ),
    region: normalizeDirectoryRegion(region) ?? region,
    address: row.address,
    postalCode: row.postal_code ?? "",
    street: row.street ?? "",
    houseNumber: row.house_number ?? "",
    addressFormat,
    serviceAddressConfirmation,
    formattedServiceAddress:
      serviceAddress.state === "COMPLETE" ? serviceAddress.formattedAddress : null,
    priceNote: row.price_note,
    websiteUrl: row.website_url,
    imageUrl: row.image_url,
    ...(breedSummary ? { breedSummary } : {}),
    galleryUrls: readProfileGallery(internalImportData, row.category),
    thumbnailImageDisplay: readImageDisplayConfig(row.thumbnail_display_json, "thumbnail"),
    detailImageDisplay: readImageDisplayConfig(row.detail_display_json, "detail"),
    verified: Boolean(row.verified),
    featured: Boolean(row.featured),
    updatedAt: row.updated_at,
    importData,
    seo: parseSeo(row.seo_json),
  };
}

function parseSeo(value: string): EditableSeo {
  try {
    const raw = JSON.parse(value) as EditableSeo;
    // Editable Directory SEO is unvalidated editorial text in every category.
    // Rendering canonical URLs and social assets validates their targets later.
    // Returning content from D1 must never silently remove an arbitrary SEO
    // string by attempting to validate its format on read.
    const text = (value: unknown) => typeof value === "string" ? value : "";
    return {
      title: text(raw?.title),
      focusKeyword: text(raw?.focusKeyword),
      description: text(raw?.description),
      canonicalUrl: text(raw?.canonicalUrl),
      ogTitle: text(raw?.ogTitle),
      ogDescription: text(raw?.ogDescription),
      ogImage: text(raw?.ogImage),
      noindex: raw?.noindex === true || Number(raw?.noindex) === 1,
    };
  } catch {
    return {};
  }
}

/**
 * Use the new D1 relational owner for detail/editor projections. This is a
 * read model only; it neither changes the old JSON payload nor writes Notion.
 * Missing SEO/qualification rows mean empty canonical data, not a legacy fallback.
 */
async function withDirectory0173SqlPublic(
  db: D1Database,
  profile: PublicDirectoryProfile,
): Promise<PublicDirectoryProfile> {
  const [sql,presentation]=await Promise.all([
    readDirectory0173EditorialSql(db,profile.id),
    readDirectoryPresentationSql(db,profile.id),
  ]);
  const qualifications = directoryQualificationSections(sql.qualifications ?? []);
  const importData={
    ...(withoutLegacyDirectoryFacetValues(profile.importData)??{}),
    ...(sql.hoursText!==null?{"Ordinačné hodiny":sql.hoursText}:{}),
    ...(presentation.trainerServicesText!==null?{[TRAINER_SERVICES_TEXT_METADATA_KEY]:presentation.trainerServicesText}:{}),
  };
  return {
    ...profile,importData,
    services:presentation.services,
    thumbnailImageDisplay:presentation.thumbnailImageDisplay,
    detailImageDisplay:presentation.detailImageDisplay,
    // A confirmed SQL membership (even []) supersedes stale JSON. Notion's
    // one-time import confirmed secondary categories for eligible profiles.
    ...(sql.sqlCategoriesConfirmed?{
      additionalCategories:normalizeAdditionalDirectoryCategories(
        sql.additionalCategories,profile.category,
      ),
    }:{}),
    ...qualifications,
    seo: sql.seo ?? {},
    ...(sql.galleryUrls?{galleryUrls:sql.galleryUrls}:{}),
  };
}

async function withDirectory0173SqlManaged(
  db:D1Database,
  profile:ManagedDirectoryProfile,
):Promise<ManagedDirectoryProfile> {
  const [sql,presentation,metadata]=await Promise.all([
    readDirectory0173EditorialSql(db,profile.id),
    readDirectoryPresentationSql(db,profile.id),
    readDirectory0170EditorialFields(db,{
      profileId:profile.id,category:profile.category,
      source:null,audience:"admin",
    }),
  ]);
  const qualityMetadata={...profile.qualityMetadata};
  for(const entry of sql.quality){
    qualityMetadata[entry.field]={status:entry.status,checkedAt:entry.checkedAt};
  }
  const sqlReviewedAt=sql.review?.reviewedAt?.trim()??"";
  // The SQL review row is authoritative, including an explicit owner uncheck.
  const reviewedAt=sqlReviewedAt;
  return {
    ...profile,
    services:presentation.services,
    thumbnailImageDisplay:presentation.thumbnailImageDisplay,
    detailImageDisplay:presentation.detailImageDisplay,
    importData:{
      ...(withoutLegacyDirectoryFacetValues(profile.importData)??{}),
      ...(metadata??{}),
      ...(sql.hoursText!==null?{"Ordinačné hodiny":sql.hoursText}:{}),
      ...(presentation.trainerServicesText!==null?{[TRAINER_SERVICES_TEXT_METADATA_KEY]:presentation.trainerServicesText}:{}),
    },
    qualityMetadata,
    ...(sql.sqlCategoriesConfirmed?{
      additionalCategories:normalizeAdditionalDirectoryCategories(
        sql.additionalCategories,profile.category,
      ),
    }:{}),
    reviewed:Boolean(reviewedAt),
    reviewedAt,
    reviewedBy:sqlReviewedAt?(sql.review?.reviewedBy??""):"",
    qualifications: sql.qualifications ?? [],
    seo: sql.seo ?? {},
    ...(sql.galleryUrls?{galleryUrls:sql.galleryUrls}:{}),
  };
}

function rowToManagedProfile(row: DirectoryProfileRow): ManagedDirectoryProfile {
  const importData = overlayDirectorySqlContacts(safeImportData(row.source_data_json, true), row);
  const reviewMetadata = readDirectoryProfileReviewMetadata(importData);
  return {
    ...rowToPublicProfile(row),
    importData,
    qualityMetadata: readDirectoryQualityMetadata(importData),
    reviewed: reviewMetadata.reviewed,
    reviewedAt: reviewMetadata.reviewedAt,
    reviewedBy: reviewMetadata.reviewedBy,
    services: safeList(row.services_json),
    qualifications: safeList(row.qualifications_json),
    status:
      row.status === "published" ? "published" : row.status === "archived" ? "archived" : "draft",
    internalEmail: row.internal_email,
    imageKey: row.image_key,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function rowToManagedProfileSummary(
  row: DirectoryProfileSummaryRow,
  reviewedAt = "",
): ManagedDirectoryProfileSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: isDirectoryCategory(row.category) ? row.category : "salony-a-sluzby",
    status:
      row.status === "published" ? "published" : row.status === "archived" ? "archived" : "draft",
    services: safeList(row.services_json),
    city: runtimeDirectoryLocationText(row.city),
    district: runtimeDirectoryLocationText(row.district),
    region: normalizeDirectoryRegion(runtimeDirectoryLocationText(row.region)) ?? "",
    imageUrl: row.image_url,
    reviewed: Boolean(reviewedAt),
    reviewedAt,
    verified: Boolean(row.verified),
    featured: Boolean(row.featured),
    updatedAt: row.updated_at,
  };
}

function rowToInquiry(row: DirectoryInquiryRow): DirectoryInquiry {
  return {
    id: row.id,
    profileId: row.profile_id,
    profileName: row.profile_name,
    profileSlug: row.profile_slug,
    profileCategory: isDirectoryCategory(row.profile_category)
      ? row.profile_category
      : "salony-a-sluzby",
    recipientEmail: row.recipient_email,
    senderName: row.sender_name,
    senderEmail: row.sender_email,
    senderPhone: row.sender_phone,
    dogInfo: row.dog_info,
    message: row.message,
    status: row.status === "resolved" ? "resolved" : row.status === "read" ? "read" : "new",
    consent: Boolean(row.consent),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeEmail(value: string | null | undefined, required = false) {
  const clean = value?.trim().toLowerCase() || null;
  if (!clean && !required) return null;
  if (!clean || clean.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean))
    throw new Error("E-mailová adresa nie je platná.");
  return clean;
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function normalizeQualityCheckedAt(value: string | undefined) {
  if (value === undefined) return null;
  const clean = value.trim();
  if (!clean) return null;
  const timestamp = Date.parse(clean);
  if (!Number.isFinite(timestamp)) throw new Error("Dátum kontroly kvality nie je platný.");
  return new Date(Math.min(timestamp, Date.now())).toISOString();
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20);
}

export function normalizeManagedDirectoryProfileInput(
  payload: ManagedDirectoryProfileInput,
  currentImportData: Record<string, string | number | null> | null = null,
  options: {
    descriptionOptional?: boolean;
    currentServiceAddressConfirmation?: DirectoryServiceAddressConfirmation;
    legacyAddress?: string;
  } = {},
) {
  const name = payload.name?.trim() ?? "";
  const slug = slugifyArticleTitle(payload.slug?.trim() || name);
  const category =
    payload.category && isDirectoryCategory(payload.category) ? payload.category : null;
  const status: DirectoryProfileStatus = payload.status === "published" ? "published" : "draft";
  const excerpt = payload.excerpt?.trim() ?? "";
  const description = payload.description?.trim() ?? "";
  // Directory editor values are raw editorial text across all ten categories.
  // Typed data (profile ID, category, publication status, actual GEO/API keys)
  // keeps separate structural validation below.
  const editorialAddressText = (value: string | undefined, _max: number, _label: string) =>
    value ?? "";
  const city = editorialAddressText(payload.city, 120, "Mesto / obec");
  const district = editorialAddressText(payload.district, 120, "Okres");
  const rawRegion = editorialAddressText(payload.region, 80, "Kraj");
  const region = rawRegion ? normalizeDirectoryRegion(rawRegion) : null;
  const imageUrl = payload.imageUrl?.trim() || null;

  if (!name) throw new Error("Doplň názov profilu.");
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new Error("Adresa profilu nie je platná.");
  if (!category) throw new Error("Vyber kategóriu adresára.");
  if (allDirectoryCategories.some((item) => item.slug === slug))
    throw new Error("Túto adresu používa kategória. Uprav adresu profilu.");
  if (
    imageUrl &&
    !imageUrl.startsWith("/media/") &&
    !imageUrl.startsWith("/images/") &&
    !/^https:\/\//i.test(imageUrl)
  )
    throw new Error("Adresa obrázka nie je platná.");

  const addressFormat = directoryAddressFormats.includes(
    payload.addressFormat as DirectoryAddressFormat,
  )
    ? (payload.addressFormat as DirectoryAddressFormat)
    : "";
  if (payload.addressFormat && !addressFormat) throw new Error("Neplatný formát adresy prevádzky.");

  const postalCode = payload.postalCode ?? "";
  const street = editorialAddressText(payload.street, 180, "Ulica");
  const houseNumber = editorialAddressText(payload.houseNumber, 40, "Číslo domu");
  const serviceAddressConfirmation: DirectoryServiceAddressConfirmation =
    payload.confirmServiceAddress === true
      ? "CONFIRMED_SERVICE_LOCATION"
      : payload.clearServiceAddressConfirmation === true
        ? "LEGACY_UNCONFIRMED"
        : (options.currentServiceAddressConfirmation ?? "LEGACY_UNCONFIRMED");
  const publicAddress = editorialAddressText(
    payload.address === undefined ? (options.legacyAddress ?? "") : payload.address,
    500,
    "Verejná adresa",
  );

  const serviceAddress = evaluateDirectoryServiceAddress({
    region: region ?? rawRegion,
    district,
    city,
    postalCode,
    street,
    houseNumber,
    addressFormat,
    serviceAddressConfirmation,
  });
  // Address-quality findings are review signals only. They must never veto
  // saving or publishing an otherwise safe directory payload.
  const authoritativeAddressText = publicAddress || serviceAddress.formattedAddress || "";

  // Breeder editorial content is stored literally. Validation of clickable
  // links happens on the public page, not when saving free-form text.
  const rawContact = (value: string | null | undefined) => value ?? "";
  // A text field is never rejected or silently shortened because its content
  // looks like a bad phone, email, URL or number. Lists retain every entered
  // nonempty line; the Services V3 relation catalog remains independent.
  const editorialLines = (value: unknown) => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
  const services = editorialLines(payload.services);
  const qualifications = editorialLines(payload.qualifications);
  const websiteUrl = rawContact(payload.websiteUrl) || null;
  const publicPhone = payload.publicPhone === undefined ? undefined : rawContact(payload.publicPhone);
  const publicEmail = payload.publicEmail === undefined ? undefined : rawContact(payload.publicEmail);
  const facebookUrl = payload.facebookUrl === undefined ? undefined : rawContact(payload.facebookUrl);
  const instagramUrl = payload.instagramUrl === undefined ? undefined : rawContact(payload.instagramUrl);
  const contactSourceData = mergeDirectoryPublicContactData(currentImportData, {
    publicPhone,
    publicEmail,
    websiteUrl: payload.websiteUrl === undefined ? undefined : websiteUrl,
    facebookUrl,
    instagramUrl,
  });
  const publicContacts = readDirectoryPublicContacts(contactSourceData, websiteUrl ?? "");
  const qualityCheckedAt = normalizeQualityCheckedAt(payload.qualityCheckedAt);
  const qualitySourceData = mergeDirectoryQualityMetadata(
    contactSourceData,
    payload.qualityResolutions,
    {
      phone: Boolean(publicContacts.phone),
      email: Boolean(publicContacts.email),
      website: Boolean(publicContacts.website),
      image: Boolean(imageUrl),
      address:
        serviceAddress.state === "COMPLETE" ||
        (serviceAddressConfirmation === "CONFIRMED_SERVICE_LOCATION" && Boolean(publicAddress)),
    },
    qualityCheckedAt ?? undefined,
    { refreshCheckedAt: Boolean(qualityCheckedAt) },
  );
  const sourceData = mergeAdditionalDirectoryCategories(
    mergeDirectoryBreederGallery(qualitySourceData, category, payload.galleryUrls),
    payload.additionalCategories, category,
  );
  if (category === "treneri" && typeof payload.trainerServicesText === "string") {
    sourceData[TRAINER_SERVICES_TEXT_METADATA_KEY] = payload.trainerServicesText;
  }
  return {
    slug,
    name,
    category,
    status,
    excerpt,
    description,
    services,
    qualifications,
    city,
    district,
    region: region ?? rawRegion,
    address: publicAddress,
    postalCode,
    street,
    houseNumber,
    addressFormat,
    serviceAddressConfirmation,
    serviceAddressState: serviceAddress.state,
    formattedServiceAddress: serviceAddress.formattedAddress,
    priceNote: payload.priceNote?.trim() ?? "",
    websiteUrl,
    publicPhone,
    publicEmail,
    facebookUrl,
    instagramUrl,
    sourceData,
    internalEmail: rawContact(payload.internalEmail) || null,
    imageUrl,
    imageKey: payload.imageKey?.trim() || null,
    thumbnailImageDisplay: normalizeImageDisplayConfig(payload.thumbnailImageDisplay, "thumbnail"),
    detailImageDisplay: normalizeImageDisplayConfig(payload.detailImageDisplay, "detail"),
    verified: Boolean(payload.verified),
    featured: Boolean(payload.featured),
    seo: {
      title: payload.seo?.title ?? "",
      focusKeyword: payload.seo?.focusKeyword ?? "",
      description: payload.seo?.description ?? "",
      canonicalUrl: payload.seo?.canonicalUrl ?? "",
      ogTitle: payload.seo?.ogTitle ?? "",
      ogDescription: payload.seo?.ogDescription ?? "",
      ogImage: payload.seo?.ogImage ?? "",
      noindex: Boolean(payload.seo?.noindex),
    },
    searchText: directorySearchText({
      name,
      excerpt,
      description,
      services,
      qualifications,
      city,
      district,
      region: region ?? rawRegion,
      address: authoritativeAddressText,
      postalCode,
      street,
      houseNumber,
    }),
  };
}

export function buildManagedDirectoryProfileCreateStatement(
  database: D1Database,
  input: ReturnType<typeof normalizeManagedDirectoryProfileInput>,
  editorEmail: string,
  nowIso: string,
  guard?: { submissionId: string; actorRef: string },
) {
  // New public fields are written exclusively to SQL owners and sidecar tables.
  // A retired directory JSON column must not be required to create profiles.
  const columns = `slug, name, category, status, excerpt, description,
    city, district, region, address, postal_code, street, house_number, address_format, service_address_confirmation,
    online, price_note, website_url, public_phone, public_email, facebook_url, instagram_url,
    internal_email, image_url, image_key,
    verified, featured, search_text, created_at, updated_at, published_at, created_by, updated_by`;
  const commonValues = [
    input.slug,
    input.name,
    input.category,
    input.excerpt,
    input.description,
    input.city,
    input.district,
    input.region,
    input.address,
    input.postalCode,
    input.street,
    input.houseNumber,
    input.addressFormat,
    input.serviceAddressConfirmation,
    0,
    input.priceNote,
    input.websiteUrl,
    input.publicPhone ?? null,
    input.publicEmail ?? null,
    input.facebookUrl ?? null,
    input.instagramUrl ?? null,
    input.internalEmail,
    input.imageUrl,
    input.imageKey,
    input.verified ? 1 : 0,
    input.featured ? 1 : 0,
    input.searchText,
  ];
  if (!guard) {
    const values = [
      input.slug,
      input.name,
      input.category,
      input.status,
      input.excerpt,
      input.description,
      input.city,
      input.district,
      input.region,
      input.address,
      input.postalCode,
      input.street,
      input.houseNumber,
      input.addressFormat,
      input.serviceAddressConfirmation,
      0,
      input.priceNote,
      input.websiteUrl,
      input.publicPhone ?? null,
      input.publicEmail ?? null,
      input.facebookUrl ?? null,
      input.instagramUrl ?? null,
      input.internalEmail,
      input.imageUrl,
      input.imageKey,
      input.verified ? 1 : 0,
      input.featured ? 1 : 0,
      input.searchText,
      nowIso,
      nowIso,
      input.status === "published" ? nowIso : null,
      editorEmail,
      editorEmail,
    ];
    return database
      .prepare(
        `INSERT INTO directory_profiles (${columns})
      VALUES (${values.map(() => "?").join(",")}) RETURNING *`,
      )
      .bind(...values);
  }
  const guardedValues = [...commonValues, nowIso, nowIso, editorEmail, editorEmail];
  const guardedSelectValues = [
    "?",
    "?",
    "?",
    "'draft'",
    ...Array.from({ length: commonValues.length - 1 }, () => "?"),
    "NULL",
    "?",
    "?",
  ].join(", ");
  return database
    .prepare(
      `INSERT INTO directory_profiles (${columns})
    SELECT ${guardedSelectValues}
    WHERE EXISTS(
      SELECT 1 FROM moderation_submissions
      WHERE id=? AND status='APPROVED' AND reviewed_at=? AND reviewed_by=?
    )
    RETURNING *`,
    )
    .bind(...guardedValues, guard.submissionId, nowIso, guard.actorRef);
}

export async function getPublishedDirectoryProfiles(category?: DirectoryCategorySlug, limit = 500) {
  const database = getD1Binding();
  if (!database) return [] as PublicDirectoryProfile[];
  const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));
  const result = category
    ? await database
        .prepare(
          `SELECT ${DIRECTORY_PROFILE_COLUMNS} FROM directory_profiles WHERE status = 'published' AND ${directoryCategoryMembershipSql()} ORDER BY featured DESC, name ASC LIMIT ?`,
        )
        .bind(category, category, safeLimit)
        .all<DirectoryProfileRow>()
    : await database
        .prepare(
          `SELECT ${DIRECTORY_PROFILE_COLUMNS} FROM directory_profiles WHERE status = 'published' ORDER BY featured DESC, name ASC LIMIT ?`,
        )
        .bind(safeLimit)
        .all<DirectoryProfileRow>();
  return attachBreederCardBreeds(database, result.results.map(rowToPublicProfile));
}

/** Homepage-only image cards: filter at the database, not after the bounded LIMIT. */
export async function getHomepageDirectoryProfilesWithImages(
  category: DirectoryCategorySlug,
  limit = 3,
): Promise<HomepageDirectoryCard[]> {
  const database = getD1Binding();
  if (!database) return [];
  const safeLimit = Math.max(1, Math.min(12, Math.trunc(limit)));
  const rotationOffset = homepageRotationOffset(bratislavaDateKey(), safeLimit);
  const result = await database
    .prepare(
      `WITH candidates AS (
        SELECT id, slug, name, category, city, district, image_url,
          ${directoryImageSqlExpression("thumbnail")} AS thumbnail_display_json,
          featured,
          ${directoryLegacyDistrictSql()} AS fallback_district,
          ROW_NUMBER() OVER (PARTITION BY featured ORDER BY name ASC, id ASC) - 1 AS rotation_index,
          COUNT(*) OVER (PARTITION BY featured) AS rotation_count
        FROM directory_profiles
        WHERE status = 'published' AND ${directoryCategoryMembershipSql()} AND ${HOMEPAGE_REAL_IMAGE_SQL}
      )
      SELECT id, slug, name, category, city, district, image_url, thumbnail_display_json,
        fallback_district
      FROM candidates
      ORDER BY featured DESC,
        ((rotation_index - (? % rotation_count) + rotation_count) % rotation_count) ASC
      LIMIT ?`,
    )
    .bind(category, category, rotationOffset, safeLimit)
    .all<HomepageDirectoryRow>();
  return result.results.map(
    (row): HomepageDirectoryCard => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: isDirectoryCategory(row.category) ? row.category : "salony-a-sluzby",
      city: runtimeDirectoryLocationText(row.city),
      district:
        directoryEffectiveDistrictValue(row.district, row.fallback_district),
      imageUrl: row.image_url,
      thumbnailImageDisplay: readImageDisplayConfig(row.thumbnail_display_json, "thumbnail"),
    }),
  );
}


/**
 * Homepage calls veterinarians and trainers together. Rank each category
 * independently in one D1 statement instead of two network roundtrips.
 * The single-category public helper above remains available to other callers.
 */
export async function getHomepageDirectoryProfilesByCategoriesWithImages(
  categories: readonly DirectoryCategorySlug[],
  limit = 3,
): Promise<Partial<Record<DirectoryCategorySlug, HomepageDirectoryCard[]>>> {
  const selected = [...new Set(categories)].filter(isDirectoryCategory).slice(0, 12);
  const groups = Object.fromEntries(
    selected.map((category) => [category, [] as HomepageDirectoryCard[]]),
  ) as Partial<Record<DirectoryCategorySlug, HomepageDirectoryCard[]>>;
  const database = getD1Binding();
  if (!database || !selected.length) return groups;

  const safeLimit = Math.max(1, Math.min(12, Math.trunc(limit)));
  const rotationOffset = homepageRotationOffset(bratislavaDateKey(), safeLimit);
  const rows = await database
    .prepare(homepageDirectoryGroupedSql(selected.length))
    .bind(...selected, rotationOffset, safeLimit)
    .all<HomepageDirectoryRow>();
  for (const row of rows.results) {
    if (!isDirectoryCategory(row.category)) continue;
    const destination = groups[row.category];
    if (!destination) continue;
    destination.push({
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: row.category,
      city: runtimeDirectoryLocationText(row.city),
      district:
        directoryEffectiveDistrictValue(row.district, row.fallback_district),
      imageUrl: row.image_url,
      thumbnailImageDisplay: readImageDisplayConfig(row.thumbnail_display_json, "thumbnail"),
    });
  }
  return groups;
}

export async function listPublishedDirectoryProfiles(options: {
  category?: DirectoryCategorySlug;
  filters: DirectoryFilters;
  pageSize?: number;
}): Promise<PublicDirectoryProfilePage> {
  const database = getD1Binding();
  const pageSize = Math.max(1, Math.min(48, Math.trunc(options.pageSize ?? 24)));
  const emptyOptions = {
    regions: [],
    districts: [],
    cities: [],
    services: [],
    canonicalServices: [],
    breeds: [],
    fciGroups: [],
    organizations: [],
    profileTypes: [],
  };
  if (!database)
    return { profiles: [], total: 0, page: 1, pageSize, totalPages: 1, options: emptyOptions };

  const category = (options.category ?? options.filters.category) || undefined;
  const canonicalPublicEnabled =
    (env as unknown as { SERVICE_CATALOG_PUBLIC_FILTERS_ENABLED?: string })
      .SERVICE_CATALOG_PUBLIC_FILTERS_ENABLED === "true";
  // Older D1 snapshots can lack optional breed relation migrations. Guard
  // every composed public listing query before referencing either table.
  const breedRelationTables = await database
    .prepare("SELECT COUNT(*) AS total FROM sqlite_schema WHERE type='table' AND name IN ('breed_directory_relations','managed_breeds')")
    .first<{ total: number }>();
  const breedRelationsReady = Number(breedRelationTables?.total ?? 0) === 2;
  const canonicalBreedIds = breedRelationsReady ? await readCanonicalBreedIds(database) : [];
  const canonicalBreedIdsJson = JSON.stringify(canonicalBreedIds);
  const baseClauses = ["status = 'published'"];
  const baseBindings: unknown[] = [];
  if (category) {
    baseClauses.push(directoryCategoryMembershipSql());
    baseBindings.push(category, category);
  }
  if (options.filters.query) {
    const needle = `%${normalizeDirectorySearchText(options.filters.query)}%`;
    baseClauses.push(
      `(search_text LIKE ? OR ${breedRelationsReady ? DIRECTORY_PUBLIC_FACET_SEARCH : DIRECTORY_LEGACY_PUBLIC_FACET_SEARCH} LIKE ? OR (search_text = '' AND ${LEGACY_DIRECTORY_SEARCH} LIKE ?))`,
    );
    baseBindings.push(needle, ...(breedRelationsReady ? [canonicalBreedIdsJson] : []), needle, needle);
  }
  if (options.filters.service) {
    baseClauses.push(
      "EXISTS (SELECT 1 FROM directory_profile_service_texts svc " +
      "WHERE svc.profile_id=directory_profiles.id AND trim(svc.service_text)=?)",
    );
    baseBindings.push(options.filters.service);
  }
  const addSourceFacet = (value: string, expression: string) => {
    if (!value) return;
    baseClauses.push(`${expression} = ?`);
    baseBindings.push(value);
  };
  if (options.filters.breed) {
    // One canonical breed may belong to many stations, and one station may
    // have many canonical breeds. Filter by existence, not a comma-joined
    // text value; fall back to import text only with no public canonical links.
    if (!breedRelationsReady) {
      addSourceFacet(options.filters.breed, DIRECTORY_LEGACY_BREED);
    } else {
      baseClauses.push(`(
      (directory_profiles.category IN ('chovatelske-stanice','chovatelske-kluby') AND EXISTS (
        SELECT 1 FROM breed_directory_relations linked
        JOIN managed_breeds linked_breed ON linked_breed.id = linked.breed_id
        WHERE linked.profile_id = directory_profiles.id
          AND linked_breed.id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))
          AND linked_breed.name = ?
      )) OR (
        (directory_profiles.category NOT IN ('chovatelske-stanice','chovatelske-kluby') OR NOT ${DIRECTORY_HAS_CANONICAL_BREEDS})
        AND ${DIRECTORY_LEGACY_BREED} = ?
      )
    )`);
      baseBindings.push(canonicalBreedIdsJson, options.filters.breed, canonicalBreedIdsJson, options.filters.breed);
    }
  }
  addSourceFacet(options.filters.fciGroup, DIRECTORY_SOURCE_FACETS.fciGroup);
  addSourceFacet(options.filters.organization, DIRECTORY_SOURCE_FACETS.organization);
  addSourceFacet(options.filters.profileType, DIRECTORY_SOURCE_FACETS.profileType);
  const publicFacets = directoryPublicFacetSql(category ?? "", options.filters.facets);
  baseClauses.push(...publicFacets.clauses);
  baseBindings.push(...publicFacets.bindings);
  // Cloudflare Workers Builds may deploy before the explicitly authorized
  // production D1 migration. Keep legacy read behavior until 0149 exists.
  const builtinOverridesReady =
    canonicalPublicEnabled &&
    (serviceFilterCategories as readonly string[]).includes(category ?? "") &&
    Boolean(
      await database
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type='table' AND name='service_catalog_builtin_overrides' LIMIT 1",
        )
        .first<{ name: string }>(),
    );
  const canonicalService = canonicalPublicServiceWhere(
    category ?? "",
    options.filters.canonicalService ?? "",
    canonicalPublicEnabled,
    "directory_profiles",
    builtinOverridesReady,
  );
  baseClauses.push(...canonicalService.clauses);
  baseBindings.push(...canonicalService.bindings);

  // The three location options share the active non-location WHERE, but
  // their cascading region/district scopes remain independent.
  const locationStatement = directoryLocationFacetStatement(
    database,
    baseClauses.join(" AND "),
    baseBindings,
    options.filters.region,
    options.filters.district,
  );
  const facetWhere = category ? `status = 'published' AND ${directoryCategoryMembershipSql()}` : "status = 'published'";
  const facetBindings = category ? [category, category] : [];
  const sourceStatement = directorySourceFacetStatement(database, facetWhere, facetBindings, {
    breeds: breedRelationsReady ? DIRECTORY_CANONICAL_BREED_FACET : DIRECTORY_LEGACY_BREED,
    fciGroups: DIRECTORY_SOURCE_FACETS.fciGroup,
    organizations: DIRECTORY_SOURCE_FACETS.organization,
  }, breedRelationsReady ? [canonicalBreedIdsJson] : []);

  // Keep the location/source facet reads in one D1 batch; legacy service/type option scans are no longer needed.
  // The canonical service-option lookup is independent: start it in parallel
  // instead of serializing a separate network roundtrip after the batch.
  // Never reference canonical tables when the feature flag is disabled.
  const canonicalServicesEnabled =
    canonicalPublicEnabled &&
    Boolean(category) &&
    (serviceFilterCategories as readonly string[]).includes(category ?? "");
  const loadCanonicalBreedOptions = async (): Promise<string[]> => {
    if (!breedRelationsReady) return [];
    // A category can also contain a breeder through additional membership.
    // Match the same category membership rule as the public result list.
    const categoryWhere = category
      ? `AND ${directoryCategoryMembershipSql("linked_profile")}` : "";
    const rows = await database.prepare(`
      SELECT DISTINCT linked_breed.name AS name
      FROM breed_directory_relations linked
      JOIN managed_breeds linked_breed ON linked_breed.id=linked.breed_id
      JOIN directory_profiles linked_profile ON linked_profile.id=linked.profile_id
      WHERE linked_profile.status='published' AND linked_profile.category IN ('chovatelske-stanice','chovatelske-kluby')
        AND linked_breed.id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))
        ${categoryWhere}
      ORDER BY linked_breed.name COLLATE NOCASE LIMIT 500
    `).bind(canonicalBreedIdsJson, ...(category ? [category, category] : [])).all<{ name: string }>();
    return (rows.results ?? []).map(row => row.name.trim()).filter(Boolean);
  };
  const loadCanonicalServices = async (): Promise<CanonicalPublicServiceOption[]> => {
    if (!canonicalServicesEnabled || !category) return [];
    const builtinFields = builtinOverridesReady
      ? "builtin.label AS builtinLabel,builtin.categories_json AS builtinCategoriesJson"
      : "NULL AS builtinLabel,NULL AS builtinCategoriesJson";
    const builtinJoin = builtinOverridesReady
      ? "LEFT JOIN service_catalog_builtin_overrides AS builtin ON builtin.option_id=choice.option_id"
      : "";
    const canonicalRows = await database
      .prepare(
        `
      SELECT DISTINCT choice.option_id AS optionId,
        opt.label AS label,opt.kind AS kind,opt.status AS status,
        opt.notion_mirror_status AS mirrorStatus,opt.categories_json AS categoriesJson,
        ${builtinFields}
      FROM service_profile_option_choices AS choice
      JOIN directory_profiles AS profile ON profile.id=choice.profile_id
      LEFT JOIN service_catalog_admin_options AS opt ON opt.id=choice.option_id
      ${builtinJoin}
      WHERE profile.status='published' AND ${directoryCategoryMembershipSql("profile")} AND choice.choice='yes'
      ORDER BY choice.option_id
    `,
      )
      .bind(category, category)
      .all<CanonicalPublicServiceRow>();
    return canonicalPublicServiceOptions(category, canonicalRows.results);
  };
  // When no location filter is active, the COUNT uses exactly baseClauses:
  // start it together with the facet batch instead of waiting for the options
  // round-trip. Location-filtered requests still validate facets first.
  // This does not add a SQL statement or change page clamping.
  const canCountWithFacets =
    !options.filters.region && !options.filters.district && !options.filters.city;
  const earlyCount = canCountWithFacets
    ? database
        .prepare(
          `SELECT COUNT(*) AS total FROM directory_profiles WHERE ${baseClauses.join(" AND ")}`,
        )
        .bind(...baseBindings)
        .first<{ total: number }>()
    : Promise.resolve(null);
  const [optionResults, canonicalServices, canonicalBreedOptions, preloadedCount] = await Promise.all([
    database.batch([locationStatement, sourceStatement]),
    loadCanonicalServices(),
    loadCanonicalBreedOptions(),
    earlyCount,
  ]);
  const locationFacets = (
    optionResults[0].results as Array<{
      regions: string;
      districts: string;
      cities: string;
    }>
  )[0];
  const sourceFacets = (
    optionResults[1].results as Array<{
      breeds: string;
      fciGroups: string;
      organizations: string;
      profileTypes: string;
    }>
  )[0];
  const regions = [
    ...new Set(
      parseDirectoryFacetValues(locationFacets?.regions)
        .map((region) => normalizeDirectoryRegion(region))
        .filter((region): region is SlovakRegion => Boolean(region)),
    ),
  ];
  const districts = parseDirectoryFacetValues(locationFacets?.districts);
  const cities = parseDirectoryFacetValues(locationFacets?.cities);
  const region = regions.includes(options.filters.region as SlovakRegion)
    ? options.filters.region
    : "";
  const district =
    (!options.filters.region || region) && districts.includes(options.filters.district)
      ? options.filters.district
      : "";
  const city =
    (!options.filters.district || district) && cities.includes(options.filters.city)
      ? options.filters.city
      : "";

  const clauses = [...baseClauses];
  const bindings = [...baseBindings];
  if (region) {
    clauses.push("(region = ? OR region = ?)");
    bindings.push(region, region.replace(/ kraj$/, ""));
  }
  if (district) {
    clauses.push(
      directoryEffectiveDistrictSql() + " = ?",
    );
    bindings.push(district);
  }
  if (city) {
    clauses.push("city = ?");
    bindings.push(city);
  }
  const where = clauses.join(" AND ");
  const orderBy =
    options.filters.sort === "name-desc"
      ? "name DESC, id DESC"
      : options.filters.sort === "newest"
        ? "published_at DESC, id DESC"
        : options.filters.sort === "name-asc"
          ? "name ASC, id ASC"
          : "featured DESC, name ASC, id ASC";
  const requestedPage = Math.max(1, Math.trunc(options.filters.page));
  const countStatement = database
    .prepare(`SELECT COUNT(*) AS total FROM directory_profiles WHERE ${where}`)
    .bind(...bindings);
  const count = preloadedCount ?? (await countStatement.first<{ total: number }>());
  const total = Number(count?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const listStatement = database
    .prepare(
      `
    SELECT ${DIRECTORY_CARD_COLUMNS.replace("city, district, region", "city, " + directoryEffectiveDistrictSql() + " AS district, region")}
    FROM directory_profiles WHERE ${where}
    ORDER BY ${orderBy} LIMIT ? OFFSET ?
  `,
    )
    .bind(...bindings, pageSize, (page - 1) * pageSize);

  // A verified zero-count listing has no rows: avoid an unnecessary D1 page read.
  const listResult = await readNonemptyD1Page(total, () =>
    listStatement.all<DirectoryProfileRow>(),
  );
  return {
    profiles: await attachBreederCardBreeds(
      database,
      (listResult.results as unknown as DirectoryProfileRow[]).map(rowToPublicProfile),
      canonicalBreedIds,
    ),
    total,
    page,
    pageSize,
    totalPages,
    options: {
      regions,
      districts,
      cities,
      services: [],
      canonicalServices,
      breeds: [...new Set([
        ...parseDirectoryFacetValues(sourceFacets?.breeds),
        ...canonicalBreedOptions,
      ])].sort((a, b) => a.localeCompare(b, "sk")),
      fciGroups: parseDirectoryFacetValues(sourceFacets?.fciGroups),
      organizations: parseDirectoryFacetValues(sourceFacets?.organizations),
      profileTypes: [],
    },
  };
}

export async function getDirectoryCategoryCounts() {
  const database = getD1Binding();
  if (!database) return {} as Partial<Record<DirectoryCategorySlug, number>>;
  const result = await database
    .prepare(
      `SELECT category, COUNT(DISTINCT id) AS total FROM (
        SELECT id, category FROM directory_profiles WHERE status = 'published'
        UNION ALL
        SELECT profile.id, extra.value AS category FROM directory_profiles AS profile,
          json_each(${directoryAdditionalCategoryJsonSql("profile")}) AS extra
        WHERE profile.status = 'published' AND extra.value <> profile.category
      ) GROUP BY category`,
    )
    .all<{ category: string; total: number }>();
  const counts = Object.fromEntries(
    directoryCategories.map((category) => [category.slug, 0]),
  ) as Partial<Record<DirectoryCategorySlug, number>>;
  for (const row of result.results) {
    if (isDirectoryCategory(row.category)) counts[row.category] = Number(row.total);
  }
  return counts;
}

export async function getDirectoryCategoryPreviews(limit = 3) {
  const database = getD1Binding();
  if (!database) return {} as Partial<Record<DirectoryCategorySlug, PublicDirectoryProfile[]>>;
  const safeLimit = Math.max(1, Math.min(7, Math.trunc(limit)));
  const statements = directoryCategories.map((category) =>
    database
      .prepare(
        `
    SELECT ${DIRECTORY_CARD_COLUMNS.replace("city, district, region", "city, " + directoryEffectiveDistrictSql() + " AS district, region")}
    FROM directory_profiles
    WHERE status = 'published' AND ${directoryCategoryMembershipSql()}
    ORDER BY featured DESC, name ASC, id ASC
    LIMIT ?
  `,
      )
      .bind(category.slug, category.slug, safeLimit),
  );
  const results = await database.batch(statements);
  const previews = Object.fromEntries(
    directoryCategories.map((category, index) => [
      category.slug,
      ((results[index]?.results ?? []) as unknown as DirectoryProfileRow[]).map(rowToPublicProfile),
    ]),
  ) as Partial<Record<DirectoryCategorySlug, PublicDirectoryProfile[]>>;
  previews["chovatelske-stanice"] = await attachBreederCardBreeds(
    database, previews["chovatelske-stanice"] ?? [],
  );
  return previews;
}

export async function getFeaturedDirectoryProfiles(limit = 2) {
  const database = getD1Binding();
  if (!database) return [] as PublicDirectoryProfile[];
  const safeLimit = Math.max(1, Math.min(12, Math.trunc(limit)));
  const result = await database
    .prepare(
      `SELECT ${DIRECTORY_PROFILE_COLUMNS} FROM directory_profiles WHERE status = 'published' ORDER BY featured DESC, name ASC LIMIT ?`,
    )
    .bind(safeLimit)
    .all<DirectoryProfileRow>();
  return result.results.map(rowToPublicProfile);
}

const getPublishedDirectoryProfileUncached = async (category: string, slug: string) => {
  const database = getD1Binding();
  if (!database || !isDirectoryCategory(category)) return null;
  const row = await retryTransientPublicRead(() => database
    .prepare(
      `SELECT ${DIRECTORY_PROFILE_COLUMNS} FROM directory_profiles WHERE status = 'published' AND category = ? AND slug = ? LIMIT 1`,
    )
    .bind(category, slug)
    .first<DirectoryProfileRow>(), { stage: "directory_detail" });
  if(!row)return null;
  let profile=rowToPublicProfile(row);
  try {
    // A confirmed 0170 SQL fact row wins, including explicit empty values.
    // For untouched historical fields we keep the same JSON presentation.
    // Fail-open for a public read: an optional projection outage must not 500.
    const importData=await readDirectory0170EditorialFields(database,{
      profileId:profile.id,category:profile.category,
      source:profile.importData,audience:"public",
    });
    profile={...profile,importData};
  } catch (error) {
    console.error("Public directory SQL 0170 detail projection unavailable",{
      profileId:profile.id,
      error:error instanceof Error?error.name:"UNKNOWN",
    });
  }
  try {
    profile=await withDirectory0173SqlPublic(database,profile);
  } catch (error) {
    // Never turn a public detail into HTTP 500 because a supplemental SQL
    // projection is temporarily unavailable. Keep the existing presentation.
    console.error("Public directory SQL 0173 detail projection unavailable",{
      profileId:profile.id,error:error instanceof Error?error.name:"UNKNOWN",
    });
  }
  // The detail page and its JSON-LD must reflect confirmed D1 choices even
  // when an earlier text/Notion projection failed. Keep old unmatched prose.
  // This optional read only runs for a published profile on a V3-enabled site.
  if((env as unknown as {SERVICE_CATALOG_PUBLIC_FILTERS_ENABLED?:string})
      .SERVICE_CATALOG_PUBLIC_FILTERS_ENABLED!=="true")return profile;
  try{
    const records=await database.prepare(
      "SELECT option_id,choice FROM service_profile_option_choices WHERE profile_id=?1"
    ).bind(profile.id).all<PublicServiceChoice>();
    if(!records.results?.length)return profile;
    const [catalog,membership]=await Promise.all([
      loadResolvedServiceDefinitions(database),loadServiceProfileMembership(database,profile.id),
    ]);
    if(!membership||membership.status!=="published"||membership.primary!==profile.category)
      return profile;
    return {...profile,services:canonicalPublicProfileServices(
      profile.services,membership.categories,records.results,catalog,
    )};
  }catch(error){
    // An optional service-catalog read must not make a published profile 500.
    // Keep existing editorial text, without incorrectly claiming V3 parity.
    console.error("Public directory Services V3 projection unavailable",{
      profileId:profile.id,error:error instanceof Error?error.message:String(error),
    });
    return profile;
  }
};
export const getPublishedDirectoryProfile = cache(getPublishedDirectoryProfileUncached);

export async function listManagedDirectoryProfileSummaries(
  options: {
    page?: number;
    pageSize?: number;
    category?: DirectoryCategorySlug;
  } = {},
): Promise<ManagedDirectoryProfileSummaryPage> {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.max(1, Math.min(100, Math.trunc(options.pageSize ?? 50)));
  const category =
    options.category && isDirectoryCategory(options.category) ? options.category : null;
  const where = category ? `WHERE ${directoryCategoryMembershipSql()}` : "";
  const listStatement = database
    .prepare(
      `
    SELECT id, slug, name, category, status,
      ${directoryServicesSqlExpression()} AS services_json,
      city, district, region, image_url, verified, featured, updated_at
    FROM directory_profiles
    ${where}
    ORDER BY updated_at DESC, id DESC
    LIMIT ? OFFSET ?
  `,
    )
    .bind(
      ...(category
        ? [category, category, pageSize, (page - 1) * pageSize]
        : [pageSize, (page - 1) * pageSize]),
    );
  const countStatement = database
    .prepare(
      `
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END), 0) AS published,
      COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) AS draft,
      COALESCE(SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END), 0) AS archived
    FROM directory_profiles
    ${where}
  `,
    )
    .bind(...(category ? [category, category] : []));
  const [listResult, countResult] = await database.batch([listStatement, countStatement]);
  const rows = (listResult.results ?? []) as unknown as DirectoryProfileSummaryRow[];
  const reviewedAtById = new Map<number, string>();
  if (rows.length) {
    const placeholders = rows.map(() => "?").join(",");
    const reviewRows = await database
      .prepare(
        `
      SELECT p.id,
        COALESCE(NULLIF(TRIM(s.reviewed_at),''),'') AS reviewed_at
      FROM directory_profiles p
      LEFT JOIN directory_profile_review_state s ON s.profile_id=p.id
      WHERE p.id IN (${placeholders})
    `,
      )
      .bind(...rows.map((row) => row.id))
      .all<{ id: number; reviewed_at: string }>();
    for (const row of reviewRows.results) reviewedAtById.set(row.id, row.reviewed_at?.trim() ?? "");
  }
  const rawCounts = (countResult.results?.[0] ??
    null) as unknown as DirectoryProfileCountRow | null;
  const counts = {
    total: Number(rawCounts?.total ?? 0),
    published: Number(rawCounts?.published ?? 0),
    draft: Number(rawCounts?.draft ?? 0),
  };
  return {
    profiles: rows.map((row) => rowToManagedProfileSummary(row, reviewedAtById.get(row.id) ?? "")),
    counts,
    pagination: {
      page,
      pageSize,
      total: counts.total,
      totalPages: Math.max(1, Math.ceil(counts.total / pageSize)),
    },
  };
}

export async function getManagedDirectoryProfileById(id: number, databaseInput?: D1Database) {
  const database = databaseInput ?? requireD1Binding();
  await ensureDirectoryStore(database);
  const row = await database
    .prepare(`SELECT ${DIRECTORY_PROFILE_COLUMNS} FROM directory_profiles WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<DirectoryProfileRow>();
  return row ? withDirectory0173SqlManaged(database,rowToManagedProfile(row)) : null;
}

export async function getManagedDirectoryProfileByCategorySlug(
  category: DirectoryCategorySlug,
  slug: string,
) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const row = await database
    .prepare(`SELECT ${DIRECTORY_PROFILE_COLUMNS} FROM directory_profiles WHERE category = ? AND slug = ? LIMIT 1`)
    .bind(category, slug)
    .first<DirectoryProfileRow>();
  return row ? withDirectory0173SqlManaged(database,rowToManagedProfile(row)) : null;
}

/**
 * Quality fields whose SQL row may change during this explicit save.
 * Their statuses come from the normalized in-memory patch and the current SQL
 * quality state; neither the physical JSON column nor its old values are read.
 */
function directoryQualityMirrorFields(payload: ManagedDirectoryProfileInput) {
  return directoryQualityFields.filter(field => {
    if (Object.hasOwn(payload.qualityResolutions ?? {}, field) ||
        payload.qualityCheckedAt !== undefined) return true;
    if (field === "phone") return payload.publicPhone !== undefined;
    if (field === "email") return payload.publicEmail !== undefined;
    if (field === "website") return payload.websiteUrl !== undefined;
    if (field === "image") return payload.imageUrl !== undefined;
    return ["region", "district", "city", "address", "postalCode",
      "street", "houseNumber", "addressFormat", "confirmServiceAddress",
      "clearServiceAddressConfirmation"].some(key => Object.hasOwn(payload, key));
  });
}

/** Rehydrate the normalizer exclusively from the authoritative SQL quality rows. */
function directoryQualitySqlSource(profile: ManagedDirectoryProfile) {
  const source = { ...(profile.importData ?? {}) };
  for (const field of directoryQualityFields) {
    const statusKey = directoryQualityStatusSourceKey(field);
    const checkedAtKey = directoryQualityCheckedAtSourceKey(field);
    delete source[statusKey];
    delete source[checkedAtKey];
    const saved = profile.qualityMetadata?.[field];
    if (saved) {
      source[statusKey] = saved.status;
      source[checkedAtKey] = saved.checkedAt;
    }
  }
  return source;
}

function directoryQualitySqlPatch(
  payload: ManagedDirectoryProfileInput,
  sourceData: Record<string, string | number | null>,
) {
  const normalized = readDirectoryQualityMetadata(sourceData);
  return Object.fromEntries(directoryQualityMirrorFields(payload).map(field => {
    const value = normalized[field];
    return [field, value?.checkedAt?.trim() ? value : null];
  }));
}

export async function createManagedDirectoryProfile(
  payload: ManagedDirectoryProfileInput,
  editorEmail: string,
  databaseInput?: D1Database,
) {
  const database = databaseInput ?? requireD1Binding();
  await ensureDirectoryStore(database);
  const input = normalizeManagedDirectoryProfileInput(payload);
  const now = new Date().toISOString();
  const secondary = readAdditionalDirectoryCategories(input.sourceData, input.category);
  // Explicit nonempty selections on newly created profiles belong to SQL
  // immediately; create and relation writes must either all commit or all fail.
  // A new profile without secondary categories is already unambiguous (JSON []).
  const sqlCategoryCreate = secondary.length > 0;
  if (sqlCategoryCreate)
    input.sourceData[DIRECTORY_ADDITIONAL_CATEGORIES_SQL_CONFIRMED_KEY] = "1";
  const canonical = buildManagedDirectoryProfileCreateStatement(
    database, input, editorEmail, now,
  );
  // Keep 0173 SEO and qualifications in the same transaction as the INSERT.
  // Canonical (category,slug) is unique and the updated-at/actor guard binds
  // the SQL companions to this exact newly created profile.
  const editorialMirror = planDirectory0173EditorialSqlMirror({
    identity: { kind: "category-slug", category: input.category, slug: input.slug,
      updatedAt: now, actor: editorEmail },
    qualifications: input.qualifications,
    seo: input.seo,
    qualityResolutions: directoryQualitySqlPatch(payload, input.sourceData),
    ...(payload.galleryUrls !== undefined && input.category === "chovatelske-stanice"
      ? { galleryUrls: readDirectoryBreederGallery(input.sourceData) } : {}),
  });
  // Mirror new SQL owners alongside the canonical INSERT; no orphan or stale
  // sidecar values if another writer claims the same category/slug.
  const presentationMirror = [
    ...planDirectoryStep3PresentationSqlMirror({
    identity: { kind: "category-slug", category: input.category, slug: input.slug,
      updatedAt: now, actor: editorEmail },
    services: input.services,
    thumbnailImageDisplay: input.thumbnailImageDisplay,
    detailImageDisplay: input.detailImageDisplay,
    }),
    ...planDirectoryExtraSqlTextMirror({
      identity:{kind:"category-slug",category:input.category,slug:input.slug,updatedAt:now,actor:editorEmail},
      fieldKey:TRAINER_SERVICES_TEXT_METADATA_KEY,
      value:payload.trainerServicesText,
    }),
  ];
  let row: DirectoryProfileRow | null;
  if (sqlCategoryCreate) {
    const mirror = planDirectorySecondaryCategoryCreateSqlMirror({
      slug: input.slug, category: input.category,
      submitted: secondary, createdAt: now, actor: editorEmail,
    });
    const responses = await database.batch([
      canonical,
      ...mirror.map(item => database.prepare(item.sql).bind(...item.bindings)),
      ...editorialMirror.map(item => database.prepare(item.sql).bind(...item.bindings)),
      ...presentationMirror.map(item => database.prepare(item.sql).bind(...item.bindings)),
    ]);
    row = (responses[0]?.results?.[0] ?? null) as DirectoryProfileRow | null;
  } else {
    const responses = await database.batch([
      canonical,
      ...editorialMirror.map(item => database.prepare(item.sql).bind(...item.bindings)),
      ...presentationMirror.map(item => database.prepare(item.sql).bind(...item.bindings)),
    ]);
    row = (responses[0]?.results?.[0] ?? null) as DirectoryProfileRow | null;
  }
  if (!row) throw new Error("Profil sa nepodarilo vytvoriť.");
  await ensureResourceForDirectoryProfile(row.id, database, new Date(now));
  await reconcileGeoAfterSourceMutation(
    {
      targetType: "DIRECTORY_PROFILE",
      targetId: row.id,
      actorRef: editorEmail,
      actorType: "ADMIN",
    },
    database,
  );
  // Return the relational SQL projection, including secondary memberships and
  // structured editorial fields created in the same transaction.
  const created = await getManagedDirectoryProfileById(row.id, database);
  if (!created) throw new Error("DIRECTORY_CREATE_SQL_RELOAD_FAILED");
  return created;
}

export function buildManagedDirectoryProfileUpdateStatement(
  database: D1Database,
  id: number,
  payload: ManagedDirectoryProfileInput,
  editorEmail: string,
  existing: ManagedDirectoryProfile,
  now: string,
  guard?: {
    expectedUpdatedAt?: string;
    automationAddressReview?: { id: number; fingerprint: string };
    restoreArchived?: boolean;
  },
  sqlCategoriesConfirmed = false,
) {
  if (existing.status === "archived" && !guard?.restoreArchived)
    throw new Error("Archivovaný profil je iba na čítanie. Najprv ho obnov do konceptu.");
  const input = normalizeManagedDirectoryProfileInput(payload, existing.importData, {
    currentServiceAddressConfirmation: existing.serviceAddressConfirmation,
    legacyAddress: existing.address,
  });
  // Only callers that atomically mirror categories to SQL may set the marker.
  // Direct Notion/address/other canonical SQL writers leave it unchanged.
  if (sqlCategoriesConfirmed)
    input.sourceData[DIRECTORY_ADDITIONAL_CATEGORIES_SQL_CONFIRMED_KEY] = "1";
  const publishedAt =
    input.status === "published" ? (existing.publishedAt ?? now) : existing.publishedAt;
  const updatedAtGuard = guard?.expectedUpdatedAt ? " AND updated_at = ?" : "";
  const reviewGuard = guard?.automationAddressReview
    ? " AND EXISTS (SELECT 1 FROM automation_address_review_cases WHERE id=? AND status='OPEN' AND fingerprint=?) AND NOT EXISTS (SELECT 1 FROM geo_points WHERE directory_profile_id=directory_profiles.id AND manual_override=1)"
    : "";
  const bindings = [
    input.slug,
    input.name,
    input.category,
    input.status,
    input.excerpt,
    input.description,
    input.city,
    input.district,
    input.region,
    input.address,
    input.postalCode,
    input.street,
    input.houseNumber,
    input.addressFormat,
    input.serviceAddressConfirmation,
    0,
    input.priceNote,
    input.websiteUrl,
    payload.publicPhone === undefined ? 0 : 1, input.publicPhone ?? null,
    payload.publicEmail === undefined ? 0 : 1, input.publicEmail ?? null,
    payload.facebookUrl === undefined ? 0 : 1, input.facebookUrl ?? null,
    payload.instagramUrl === undefined ? 0 : 1, input.instagramUrl ?? null,
    input.internalEmail,
    input.imageUrl,
    input.imageKey,
    input.verified ? 1 : 0,
    input.featured ? 1 : 0,
    input.searchText,
    now,
    publishedAt,
    guard?.restoreArchived ? 1 : 0,
    editorEmail,
    id,
    ...(guard?.expectedUpdatedAt ? [guard.expectedUpdatedAt] : []),
    ...(guard?.automationAddressReview
      ? [guard.automationAddressReview.id, guard.automationAddressReview.fingerprint]
      : []),
  ];
  return database
    .prepare(
      `
    UPDATE directory_profiles SET
      slug = ?, name = ?, category = ?, status = ?, excerpt = ?, description = ?,
      city = ?, district = ?, region = ?, address = ?, postal_code = ?, street = ?, house_number = ?,
      address_format = ?, service_address_confirmation = ?, online = ?, price_note = ?, website_url = ?,
      public_phone = CASE WHEN ?=1 THEN ? ELSE public_phone END,
      public_email = CASE WHEN ?=1 THEN ? ELSE public_email END,
      facebook_url = CASE WHEN ?=1 THEN ? ELSE facebook_url END,
      instagram_url = CASE WHEN ?=1 THEN ? ELSE instagram_url END,
      internal_email = ?, image_url = ?, image_key = ?, verified = ?, featured = ?, search_text = ?, updated_at = ?, published_at = ?, archived_at = CASE WHEN ?=1 THEN NULL ELSE archived_at END, updated_by = ?
    WHERE id = ?${updatedAtGuard}${reviewGuard} RETURNING *
  `,
    )
    .bind(...bindings);
}

export async function updateManagedDirectoryProfile(
  id: number,
  payload: ManagedDirectoryProfileInput,
  editorEmail: string,
  existingProfile?: ManagedDirectoryProfile,
  databaseInput?: D1Database,
  guard?: { expectedUpdatedAt?: string; restoreArchived?: boolean; unifiedEditFields?: readonly BreederEditorialField[] },
) {
  const database = databaseInput ?? requireD1Binding();
  await ensureDirectoryStore(database);
  const existing = existingProfile ?? (await getManagedDirectoryProfileById(id, database));
  if (!existing) return null;
  const previousTime = Date.parse(existing.updatedAt);
  const now = new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
  const normalizedForMirrors = normalizeManagedDirectoryProfileInput(payload, directoryQualitySqlSource(existing), {
    currentServiceAddressConfirmation: existing.serviceAddressConfirmation,
    legacyAddress: existing.address,
  });
  const canonicalStatement = buildManagedDirectoryProfileUpdateStatement(
    database,
    id,
    payload,
    editorEmail,
    existing,
    now,
    guard,
    payload.additionalCategories !== undefined,
  );
  // The exact same guarded canonical update is called by Admin and Notion.
  // Mirror only explicitly provided fields, never infer an empty edit.
  const editorialMirror = planDirectory0173EditorialSqlMirror({
    identity: { kind: "id", profileId: id, updatedAt: now, actor: editorEmail },
    ...(payload.qualifications !== undefined ? {
      qualifications: normalizedForMirrors.qualifications,
    } : {}),
    ...(payload.seo !== undefined ? { seo: payload.seo } : {}),
    qualityResolutions: directoryQualitySqlPatch(payload, normalizedForMirrors.sourceData),
    ...(payload.galleryUrls !== undefined &&
      (payload.category ?? existing.category) === "chovatelske-stanice"
      ? { galleryUrls: readDirectoryBreederGallery(
          mergeDirectoryBreederGallery(existing.importData,
            "chovatelske-stanice", payload.galleryUrls),
        ) } : {}),
  });
  // An unrelated Admin/Notion event must never clear sidecar values.
  // Changing the primary image resets saved crop settings only when that
  // image was explicitly supplied and actually differs from the old image.
  const imageChanged = payload.imageUrl !== undefined &&
    normalizedForMirrors.imageUrl !== existing.imageUrl;
  const presentationMirror = [
    ...planDirectoryStep3PresentationSqlMirror({
    identity: { kind: "id", profileId: id, updatedAt: now, actor: editorEmail },
    services: payload.services !== undefined ? normalizedForMirrors.services : undefined,
    thumbnailImageDisplay: payload.thumbnailImageDisplay !== undefined
      ? normalizedForMirrors.thumbnailImageDisplay : imageChanged ? null : undefined,
    detailImageDisplay: payload.detailImageDisplay !== undefined
      ? normalizedForMirrors.detailImageDisplay : imageChanged ? null : undefined,
    }),
    ...planDirectoryExtraSqlTextMirror({
      identity:{kind:"id",profileId:id,updatedAt:now,actor:editorEmail},
      fieldKey:TRAINER_SERVICES_TEXT_METADATA_KEY,
      value:payload.trainerServicesText,
    }),
  ];
  const receipt = guard?.unifiedEditFields && guard.expectedUpdatedAt
    ? planDirectoryAdminReceipts(database, { id, expectedRevision: guard.expectedUpdatedAt, nextRevision: now, editor: editorEmail, fields: [...guard.unifiedEditFields, ...(payload.additionalCategories !== undefined ? ["additionalCategories" as const] : [])] })
    : { before: [], after: [] };
  let row: DirectoryProfileRow | null;
  if (payload.additionalCategories !== undefined || editorialMirror.length > 0 || presentationMirror.length > 0 || receipt.before.length > 0) {
    // Owner-submitted category changes commit relational SQL in the SAME
    // D1 transaction. An omitted field must never clear SQL membership.
    // The initial UPDATE is the authority/CAS and the planner fails closed
    // if it affected no row. Old source JSON is never rewritten.
    const mirror = payload.additionalCategories === undefined ? [] :
      planDirectorySecondaryCategorySqlMirror({
        profileId: id,
        primaryCategory: payload.category ?? existing.category,
        submitted: payload.additionalCategories,
        updatedAt: now,
        actor: editorEmail,
      });
    const responses = await database.batch([
      ...receipt.before,
      canonicalStatement,
      ...mirror.map(item => database.prepare(item.sql).bind(...item.bindings)),
      ...editorialMirror.map(item => database.prepare(item.sql).bind(...item.bindings)),
      ...presentationMirror.map(item => database.prepare(item.sql).bind(...item.bindings)),
      ...receipt.after,
    ]);
    row = (responses[receipt.before.length]?.results?.[0] ?? null) as DirectoryProfileRow | null;
  } else {
    row = await canonicalStatement.first<DirectoryProfileRow>();
  }
  if (!row) return null;
  await reconcileGeoAfterSourceMutation(
    {
      targetType: "DIRECTORY_PROFILE",
      targetId: row.id,
      actorRef: editorEmail,
      actorType: "ADMIN",
    },
    database,
  );
  // Return the SQL-authoritative detail after the relational writes committed.
  return getManagedDirectoryProfileById(row.id, database);
}

export async function updateManagedDirectoryProfileLocationFromGooglePlace(
  id: number,
  place: GooglePlaceCandidate,
  editorEmail: string,
  databaseInput?: D1Database,
  expectedUpdatedAt?: string,
  expectedGeoRevision?: string | null,
) {
  const database = databaseInput ?? requireD1Binding();
  const existing = await getManagedDirectoryProfileById(id, database);
  if (!existing) return null;

  if (expectedUpdatedAt !== undefined && existing.updatedAt !== expectedUpdatedAt)
    throw new Error("GOOGLE_CONFIRMATION_CONFLICT");
  const location = googlePlaceDirectoryLocation(existing, place);
  // An explicit Google selection replaces the *location* fields. Do not mix
  // an old street, house number or postcode with a different Google place.
  // A Google place can be valid even with an incomplete structured address.
  const street = place.address?.street?.trim() ?? "";
  const houseNumber = place.address?.houseNumber?.trim() ?? "";
  const postalCode = normalizeSlovakPostalCode(place.address?.postalCode?.trim() ?? "");
  const addressFormat: DirectoryAddressFormat | "" = street
    ? "STREET"
    : houseNumber
      ? "MUNICIPALITY_NUMBER"
      : "";
  const formattedAddress = place.formattedAddress.trim() || existing.address;
  const searchText = directorySearchText({
    name: existing.name,
    excerpt: existing.excerpt,
    description: existing.description,
    services: existing.services,
    qualifications: existing.qualifications,
    region: location.region,
    district: location.district,
    city: location.city,
    address: formattedAddress,
    postalCode,
    street,
    houseNumber,
  });
  const now = new Date().toISOString();

  // Location-only Google write contract. Contact, website, social, content,
  // pricing, media and SEO fields are intentionally absent from this UPDATE.
  const geo = await prepareGoogleSourceGeoInvalidation(
    "DIRECTORY_PROFILE",
    id,
    database,
    expectedGeoRevision,
    { sql: "SELECT 1 FROM directory_profiles WHERE id=? AND updated_at=?", args: [id, now] },
  );
  const sourceStatement = database
    .prepare(
      `
    UPDATE directory_profiles
    SET region = ?, district = ?, city = ?, address = ?, postal_code = ?, street = ?, house_number = ?,
      address_format = ?, service_address_confirmation = 'CONFIRMED_SERVICE_LOCATION',
      search_text = ?, updated_at = ?, updated_by = ?
    WHERE id = ? AND updated_at = ? AND ${geo.sourceGuard}
    RETURNING *
  `,
    )
    .bind(
      location.region,
      location.district,
      location.city,
      formattedAddress,
      postalCode,
      street,
      houseNumber,
      addressFormat,
      searchText,
      now,
      editorEmail,
      id,
      expectedUpdatedAt ?? existing.updatedAt,
      ...geo.sourceGuardArgs,
    );
  const results = await database.batch([
    sourceStatement,
    ...(geo.invalidation ? [geo.invalidation] : []),
  ]);
  const row = results[0]?.results?.[0] as DirectoryProfileRow | undefined;
  if (!row) throw new Error("GOOGLE_CONFIRMATION_CONFLICT");
  if (geo.invalidation && results[1]?.meta?.changes !== 1)
    throw new Error("GOOGLE_CONFIRMATION_REPAIR_REQUIRED");

  try {
    const geoReconciliation = await reconcileGeoAfterSourceMutation(
      {
        targetType: "DIRECTORY_PROFILE",
        targetId: row.id,
        actorRef: editorEmail,
        actorType: "ADMIN",
        expectedGeoRevision: geo.current ? geo.now : null,
      },
      database,
    );
    const canonical = await getManagedDirectoryProfileById(row.id, database);
    if (!canonical) throw new Error("GOOGLE_SQL_PROFILE_RELOAD_FAILED");
    return {
      ...canonical,
      googleConfirmationGeoRevision: geoReconciliation.point?.updatedAt ?? null,
    };
  } catch (cause) {
    throw Object.assign(new Error("GOOGLE_SOURCE_COMMITTED_GEO_FAILED", { cause }), {
      sourceCommitted: true,
    });
  }
}

export async function setManagedDirectoryProfileReviewed(
  id: number,
  reviewed: boolean,
  editorEmail: string,
  now = new Date(),
  databaseInput?: D1Database,
) {
  const database = databaseInput ?? requireD1Binding();
  await ensureDirectoryStore(database);
  const row = await database.prepare(
    "SELECT p.id,p.updated_at,s.reviewed_at,s.unlock_pending " +
    "FROM directory_profiles p LEFT JOIN directory_profile_review_state s ON s.profile_id=p.id " +
    "WHERE p.id=? LIMIT 1",
  ).bind(id).first<{ id: number; updated_at: string; reviewed_at: string | null; unlock_pending: number | null }>();
  if (!row) return null;
  // A previously reviewed profile must remain locked while its current SQL
  // snapshot is being exported to the mapped Notion page. Retries stay pending.
  const pendingUnlock = !reviewed &&
    (Boolean(row.reviewed_at?.trim()) || Number(row.unlock_pending) === 1);
  if (!reviewed) {
    const manager = await database.prepare(`
      SELECT 1 AS active FROM partner_resources r
      JOIN partner_memberships m ON m.resource_id=r.id
      WHERE r.entity_type='DIRECTORY_PROFILE' AND r.directory_profile_id=?1
        AND m.revoked_at IS NULL LIMIT 1
    `).bind(id).first<{ active: number }>();
    if (manager) throw new Error("DIRECTORY_PARTNER_MANAGED_REVIEW_LOCK");
  }
  const timestamp = now.toISOString();
  // Only the review state changes: never copy contact aliases or old JSON.
  // D1.batch commits the profile revision and SQL review row atomically.
  const canonical = database.prepare(
    "UPDATE directory_profiles SET updated_at=?, updated_by=? " +
    "WHERE id=? AND updated_at=? " +
    "AND (?=1 OR NOT EXISTS (SELECT 1 FROM partner_resources r " +
    "JOIN partner_memberships m ON m.resource_id=r.id " +
    "WHERE r.entity_type='DIRECTORY_PROFILE' AND r.directory_profile_id=directory_profiles.id " +
    "AND m.revoked_at IS NULL)) RETURNING id",
  ).bind(timestamp, editorEmail, id, row.updated_at, reviewed ? 1 : 0);
  const sqlReview = database.prepare(`
    INSERT INTO directory_profile_review_state
      (profile_id,reviewed_at,reviewed_by,unlock_pending,
       unlock_requested_at,unlock_requested_by,updated_at,updated_by)
    SELECT p.id,?,?,?,?,?,?,?
    FROM directory_profiles p WHERE p.id=? AND p.updated_at=?
    ON CONFLICT(profile_id) DO UPDATE SET
      reviewed_at=excluded.reviewed_at,
      reviewed_by=excluded.reviewed_by,
      unlock_pending=excluded.unlock_pending,
      unlock_requested_at=excluded.unlock_requested_at,
      unlock_requested_by=excluded.unlock_requested_by,
      updated_at=excluded.updated_at,
      updated_by=excluded.updated_by
  `).bind(
    reviewed ? timestamp : null, reviewed ? editorEmail : null,
    pendingUnlock ? 1 : 0,
    pendingUnlock ? timestamp : null, pendingUnlock ? editorEmail : null,
    timestamp, editorEmail, id, timestamp,
  );
  const responses = await database.batch([
    canonical, directory0173ReviewCasGuardStatement(database), sqlReview,
  ]);
  if (!(responses[0]?.results?.[0] as { id?: number } | undefined)?.id) {
    throw new Error("DIRECTORY_REVIEW_CONCURRENT_CHANGE");
  }
  return getManagedDirectoryProfileById(id, database);
}

export async function archiveManagedDirectoryProfile(
  id: number,
  editorEmail: string,
  now = new Date(),
  databaseInput?: D1Database,
  options: { draftOnly?: boolean } = {},
) {
  const database = databaseInput ?? requireD1Binding();
  await ensureDirectoryStore(database);
  const existing = await getManagedDirectoryProfileById(id, database);
  if (!existing) return null;
  if (existing.status === "archived") return existing;
  if (options.draftOnly && existing.status !== "draft")
    throw new Error("GEMINI_DIRECTORY_DRAFT_ONLY");
  await ensureResourceForDirectoryProfile(id, database, now);
  const timestamp = now.toISOString();
  const row = await database
    .prepare(
      `
    UPDATE directory_profiles
    SET status='archived', published_at=NULL, archived_at=?, updated_at=?, updated_by=?
    WHERE id=? AND status IN ('draft','published') AND (?=0 OR status='draft')
    RETURNING *
  `,
    )
    .bind(timestamp, timestamp, editorEmail, id, options.draftOnly ? 1 : 0)
    .first<DirectoryProfileRow>();
  if (!row)
    throw new Error(
      options.draftOnly ? "GEMINI_DIRECTORY_DRAFT_ONLY" : "Profil sa nepodarilo archivovať.",
    );
  await reconcileGeoAfterSourceMutation(
    {
      targetType: "DIRECTORY_PROFILE",
      targetId: row.id,
      actorRef: editorEmail,
      actorType: "ADMIN",
    },
    database,
  );
  return getManagedDirectoryProfileById(row.id, database);
}

export async function restoreManagedDirectoryProfile(
  id: number,
  editorEmail: string,
  now = new Date(),
  databaseInput?: D1Database,
) {
  const database = databaseInput ?? requireD1Binding();
  await ensureDirectoryStore(database);
  const existing = await getManagedDirectoryProfileById(id, database);
  if (!existing) return null;
  if (existing.status !== "archived") throw new Error("Obnoviť možno iba archivovaný profil.");
  await ensureResourceForDirectoryProfile(id, database, now);
  const timestamp = now.toISOString();
  const row = await database
    .prepare(
      `
    UPDATE directory_profiles
    SET status='draft', published_at=NULL, archived_at=NULL, updated_at=?, updated_by=?
    WHERE id=? AND status='archived'
    RETURNING *
  `,
    )
    .bind(timestamp, editorEmail, id)
    .first<DirectoryProfileRow>();
  if (!row) throw new Error("Profil sa nepodarilo obnoviť.");
  await reconcileGeoAfterSourceMutation(
    {
      targetType: "DIRECTORY_PROFILE",
      targetId: row.id,
      actorRef: editorEmail,
      actorType: "ADMIN",
    },
    database,
  );
  return getManagedDirectoryProfileById(row.id, database);
}

export function isDirectoryProfileConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("UNIQUE constraint failed") ||
    message.includes("directory_profiles.category, directory_profiles.slug")
  );
}

export class DirectoryRateLimitError extends Error {}

async function purgeExpiredDirectoryInquiries(database: D1Database) {
  const resolvedBefore = new Date(Date.now() - 180 * 24 * 60 * 60 * 1_000).toISOString();
  const absoluteBefore = new Date(Date.now() - 365 * 24 * 60 * 60 * 1_000).toISOString();
  await database
    .prepare(
      "DELETE FROM directory_inquiries WHERE (status = 'resolved' AND updated_at < ?) OR created_at < ?",
    )
    .bind(resolvedBefore, absoluteBefore)
    .run();
}

export async function createDirectoryInquiry(payload: DirectoryInquiryInput) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  await purgeExpiredDirectoryInquiries(database);
  const profileId = Number(payload.profileId);
  if (!Number.isSafeInteger(profileId) || profileId < 1) throw new Error("Profil sa nenašiel.");
  const profile = await database
    .prepare(
      `SELECT ${DIRECTORY_PROFILE_COLUMNS} FROM directory_profiles WHERE id = ? AND status = 'published' LIMIT 1`,
    )
    .bind(profileId)
    .first<DirectoryProfileRow>();
  if (!profile) throw new Error("Profil sa nenašiel alebo už nie je verejný.");

  const senderName = payload.senderName?.trim() ?? "";
  const senderEmail = normalizeEmail(payload.senderEmail, true) as string;
  const senderPhone = payload.senderPhone?.trim() ?? "";
  const dogInfo = payload.dogInfo?.trim() ?? "";
  const message = payload.message?.trim() ?? "";
  if (senderName.length < 2 || senderName.length > 100) throw new Error("Doplň svoje meno.");
  if (senderPhone.length > 40) throw new Error("Telefónne číslo je príliš dlhé.");
  if (dogInfo.length > 300) throw new Error("Informácie o psovi sú príliš dlhé.");
  if (message.length < 20 || message.length > 3000)
    throw new Error("Správa musí mať 20 až 3 000 znakov.");
  if (!payload.consent)
    throw new Error("Pred odoslaním potvrď oboznámenie sa so spracúvaním údajov.");

  const limitSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recent = await database
    .prepare(
      "SELECT COUNT(*) AS count FROM directory_inquiries WHERE sender_email = ? AND created_at >= ?",
    )
    .bind(senderEmail, limitSince)
    .first<{ count: number }>();
  if ((recent?.count ?? 0) >= 3)
    throw new DirectoryRateLimitError(
      "Za krátky čas bolo odoslaných príliš veľa správ. Skús to neskôr.",
    );

  const now = new Date().toISOString();
  const row = await database
    .prepare(
      `
    INSERT INTO directory_inquiries (
      profile_id, profile_name, profile_slug, profile_category, recipient_email, sender_name, sender_email,
      sender_phone, dog_info, message, status, consent, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 1, ?, ?) RETURNING *
  `,
    )
    .bind(
      profile.id,
      profile.name,
      profile.slug,
      profile.category,
      profile.internal_email,
      senderName,
      senderEmail,
      senderPhone,
      dogInfo,
      message,
      now,
      now,
    )
    .first<DirectoryInquiryRow>();
  if (!row) throw new Error("Dopyt sa nepodarilo uložiť.");
  return rowToInquiry(row);
}

export async function listDirectoryInquiries() {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const result = await database
    .prepare(
      `
    SELECT id, profile_id, profile_name, profile_slug, profile_category, recipient_email,
      sender_name, sender_email, sender_phone, dog_info, message, status, consent, created_at, updated_at
    FROM directory_inquiries
    ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'read' THEN 1 ELSE 2 END, created_at DESC, id DESC
    -- Admin searches the entire mailbox before client pagination.
  `,
    )
    .all<DirectoryInquiryRow>();
  return result.results.map(rowToInquiry);
}

export async function updateDirectoryInquiryStatus(
  id: number,
  status: DirectoryInquiryStatus,
  expectedUpdatedAt?: string,
) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const now = new Date();
  const nextVersion = new Date(Date.parse(expectedUpdatedAt ?? "") + 1);
  const updatedAt = (nextVersion > now ? nextVersion : now).toISOString();
  const row = await database
    .prepare(`UPDATE directory_inquiries SET status = ?1, updated_at = ?2
      WHERE id = ?3 AND (?4 IS NULL OR updated_at = ?4) RETURNING *`)
    .bind(status, updatedAt, id, expectedUpdatedAt ?? null)
    .first<DirectoryInquiryRow>();
  if (row) return { status: "updated" as const, inquiry: rowToInquiry(row) };

  const exists = expectedUpdatedAt && await database.prepare("SELECT id FROM directory_inquiries WHERE id = ?")
    .bind(id).first<{ id: number }>();
  return { status: exists ? "conflict" as const : "missing" as const };
}

export async function deleteDirectoryInquiry(id: number) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const row = await database
    .prepare("DELETE FROM directory_inquiries WHERE id = ? RETURNING *")
    .bind(id)
    .first<DirectoryInquiryRow>();
  return row ? rowToInquiry(row) : null;
}

