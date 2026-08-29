import { env } from "cloudflare:workers";
import { slugifyArticleTitle } from "@/lib/article-store";
import {
  allDirectoryCategories,
  isDirectoryCategory,
  type DirectoryCategorySlug,
  type DirectoryInquiry,
  type DirectoryInquiryStatus,
  type DirectoryProfileChangeRequest,
  type DirectoryProfileChangeRequestStatus,
  type DirectoryProfileEditableData,
  type DirectoryProfileStatus,
  type ManagedDirectoryProfile,
  type PublicDirectoryProfile,
} from "@/lib/directory";
import { editableDirectoryProfileData, specializedChangeRequestFields } from "@/lib/directory-change-request";
import { slovakRegions, type SlovakRegion } from "@/lib/events";
import { cleanEditableSeo, type EditableSeo } from "@/lib/content-seo";

export type ManagedDirectoryProfileInput = {
  slug?: string;
  name?: string;
  category?: string;
  status?: string;
  excerpt?: string;
  description?: string;
  services?: string[];
  qualifications?: string[];
  city?: string;
  district?: string;
  region?: string;
  address?: string;
  online?: boolean;
  priceNote?: string;
  websiteUrl?: string | null;
  internalEmail?: string | null;
  imageUrl?: string | null;
  imageKey?: string | null;
  verified?: boolean;
  featured?: boolean;
  seo?: EditableSeo;
};

export type ManagedDirectoryProfileSummary = Pick<
  ManagedDirectoryProfile,
  | "id"
  | "slug"
  | "name"
  | "category"
  | "status"
  | "services"
  | "city"
  | "district"
  | "region"
  | "imageUrl"
  | "verified"
  | "featured"
>;

export type ManagedDirectoryProfileSummaryPage = {
  profiles: ManagedDirectoryProfileSummary[];
  counts: {
    total: number;
    published: number;
    draft: number;
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

export type DirectoryProfileChangeRequestInput = {
  profileId?: number;
  requesterName?: string;
  requesterEmail?: string;
  requesterPhone?: string;
  requesterRole?: string;
  proposedData?: Partial<DirectoryProfileEditableData>;
  note?: string;
  authorized?: boolean;
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
  online: number;
  price_note: string;
  website_url: string | null;
  internal_email: string | null;
  image_url: string | null;
  image_key: string | null;
  import_key: string | null;
  source_data_json: string;
  search_text: string;
  verified: number;
  featured: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
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

type DirectoryProfileChangeRequestRow = {
  id: number;
  profile_id: number;
  profile_name: string;
  profile_slug: string;
  profile_category: string;
  requester_name: string;
  requester_email: string;
  requester_phone: string;
  requester_role: string;
  proposed_data_json: string;
  note: string;
  authorized: number;
  consent: number;
  status: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
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
};

type DirectoryProfileCountRow = {
  total: number;
  published: number;
  draft: number;
};

export type DirectorySort = "recommended" | "name-asc" | "name-desc" | "newest";

export type DirectoryFilters = {
  query: string;
  category: "" | DirectoryCategorySlug;
  region: string;
  district: string;
  city: string;
  service: string;
  breed: string;
  fciGroup: string;
  organization: string;
  profileType: string;
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

export function parseDirectoryFilters(params: DirectorySearchParams): DirectoryFilters {
  const rawSort = firstParam(params.sort);
  const rawCategory = firstParam(params.category);
  const sort: DirectorySort = ["recommended", "name-asc", "name-desc", "newest"].includes(rawSort) ? rawSort as DirectorySort : "recommended";
  return {
    query: firstParam(params.q).slice(0, 100),
    category: isDirectoryCategory(rawCategory) && rawCategory !== "psie-skoly" && rawCategory !== "utulky-a-zachrana" ? rawCategory : "",
    region: normalizeDirectoryRegion(firstParam(params.region)) ?? "",
    district: firstParam(params.district).slice(0, 100),
    city: firstParam(params.city).slice(0, 120),
    service: firstParam(params.service).slice(0, 160),
    breed: firstParam(params.breed).slice(0, 160),
    fciGroup: firstParam(params.fci).slice(0, 80),
    organization: firstParam(params.organization).slice(0, 160),
    profileType: firstParam(params.type).slice(0, 160),
    sort,
    page: Math.max(1, Number.parseInt(firstParam(params.page) || "1", 10) || 1),
  };
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
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 20) : [];
  } catch {
    return [];
  }
}

function safePublicList(value: string) {
  return safeList(value).filter((item) => !/^(?:stav overenia|(?:čiastočne\s+)?overené(?:\s+psipediou)?|neoverené|overenie údajov|zdroj(?: overenia)?|dátum (?:kontroly|overenia)|import[_ ]?key|source_data_json)\s*:?/i.test(item));
}

function safeImportData(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return Object.fromEntries(Object.entries(parsed).filter(([, item]) => item === null || typeof item === "string" || typeof item === "number"));
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
  if (clean === "Online") return "Online";
  const withSuffix = clean.endsWith(" kraj") ? clean : `${clean} kraj`;
  return (slovakRegions as readonly string[]).includes(withSuffix) ? withSuffix as SlovakRegion : null;
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
}) {
  return normalizeDirectorySearchText([
    input.name, input.excerpt, input.description, input.services.join(" "),
    input.qualifications.join(" "), input.city, input.district, input.region, input.address,
  ].join(" "));
}

const DIRECTORY_PROFILE_COLUMNS = `
  id, slug, name, category, status, excerpt, description, services_json, qualifications_json,
  city, district, region, address, online, price_note, website_url, internal_email, image_url,
  image_key, import_key, source_data_json, search_text, verified, featured, seo_json,
  created_at, updated_at, published_at, created_by, updated_by
`;

const DIRECTORY_CARD_COLUMNS = `
  id, slug, name, category, status, excerpt, '' AS description, services_json,
  '[]' AS qualifications_json, city, district, region, '' AS address, online,
  price_note, website_url, NULL AS internal_email, image_url, NULL AS image_key,
  import_key, '{}' AS source_data_json, search_text, verified, featured, '{}' AS seo_json,
  created_at, updated_at, published_at, created_by, updated_by
`;

const DIRECTORY_SOURCE_FACETS = {
  breed: `COALESCE(NULLIF(json_extract(source_data_json, '$."Plemeno"'), ''), NULLIF(json_extract(source_data_json, '$."Plemená"'), ''), '')`,
  fciGroup: `COALESCE(NULLIF(json_extract(source_data_json, '$."FCI skupina"'), ''), NULLIF(json_extract(source_data_json, '$."FCI"'), ''), '')`,
  organization: `COALESCE(NULLIF(json_extract(source_data_json, '$."Organizácia"'), ''), NULLIF(json_extract(source_data_json, '$."Zastrešujúca organizácia"'), ''), '')`,
  profileType: `COALESCE(NULLIF(json_extract(source_data_json, '$."Typ služby"'), ''), NULLIF(json_extract(source_data_json, '$."Typ poskytovateľa"'), ''), NULLIF(json_extract(source_data_json, '$."Typ klubu"'), ''), '')`,
} as const;

function sqlNormalizedExpression(columnExpression: string) {
  const replacements: Array<[string, string]> = [
    ["á", "a"], ["ä", "a"], ["č", "c"], ["ď", "d"], ["é", "e"], ["í", "i"],
    ["ĺ", "l"], ["ľ", "l"], ["ň", "n"], ["ó", "o"], ["ô", "o"], ["ŕ", "r"],
    ["š", "s"], ["ť", "t"], ["ú", "u"], ["ý", "y"], ["ž", "z"],
    ["Á", "a"], ["Ä", "a"], ["Č", "c"], ["Ď", "d"], ["É", "e"], ["Í", "i"],
    ["Ĺ", "l"], ["Ľ", "l"], ["Ň", "n"], ["Ó", "o"], ["Ô", "o"], ["Ŕ", "r"],
    ["Š", "s"], ["Ť", "t"], ["Ú", "u"], ["Ý", "y"], ["Ž", "z"],
  ];
  return replacements.reduce((expression, [from, to]) => `replace(${expression}, '${from}', '${to}')`, `lower(${columnExpression})`);
}

const LEGACY_DIRECTORY_SEARCH = sqlNormalizedExpression(`
  coalesce(name, '') || ' ' || coalesce(excerpt, '') || ' ' || coalesce(description, '') || ' ' ||
  coalesce(city, '') || ' ' || coalesce(district, '') || ' ' || coalesce(region, '') || ' ' ||
  coalesce(address, '') || ' ' || coalesce(services_json, '') || ' ' || coalesce(qualifications_json, '') || ' ' ||
  coalesce(json_extract(source_data_json, '$."Okres"'), '')
`);

const DIRECTORY_PUBLIC_FACET_SEARCH = sqlNormalizedExpression(`
  ${DIRECTORY_SOURCE_FACETS.breed} || ' ' || ${DIRECTORY_SOURCE_FACETS.fciGroup} || ' ' ||
  ${DIRECTORY_SOURCE_FACETS.organization} || ' ' || ${DIRECTORY_SOURCE_FACETS.profileType}
`);

function rowToPublicProfile(row: DirectoryProfileRow): PublicDirectoryProfile {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: isDirectoryCategory(row.category) ? row.category : "salony-a-sluzby",
    excerpt: row.excerpt,
    description: row.description,
    services: safePublicList(row.services_json),
    qualifications: safePublicList(row.qualifications_json),
    city: row.city,
    district: row.district || String(safeImportData(row.source_data_json)?.["Okres"] ?? ""),
    region: normalizeDirectoryRegion(row.region) ?? "Online",
    address: row.address,
    online: Boolean(row.online),
    priceNote: row.price_note,
    websiteUrl: row.website_url,
    imageUrl: row.image_url,
    verified: Boolean(row.verified),
    featured: Boolean(row.featured),
    updatedAt: row.updated_at,
    importData: safeImportData(row.source_data_json),
    seo: parseSeo(row.seo_json),
  };
}

function parseSeo(value: string): EditableSeo { try { return cleanEditableSeo(JSON.parse(value) as EditableSeo); } catch { return {}; } }

function rowToManagedProfile(row: DirectoryProfileRow): ManagedDirectoryProfile {
  return {
    ...rowToPublicProfile(row),
    services: safeList(row.services_json),
    qualifications: safeList(row.qualifications_json),
    status: row.status === "published" ? "published" : "draft",
    internalEmail: row.internal_email,
    imageKey: row.image_key,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function rowToManagedProfileSummary(row: DirectoryProfileSummaryRow): ManagedDirectoryProfileSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: isDirectoryCategory(row.category) ? row.category : "salony-a-sluzby",
    status: row.status === "published" ? "published" : "draft",
    services: safeList(row.services_json),
    city: row.city,
    district: row.district,
    region: normalizeDirectoryRegion(row.region) ?? "Online",
    imageUrl: row.image_url,
    verified: Boolean(row.verified),
    featured: Boolean(row.featured),
  };
}

function rowToInquiry(row: DirectoryInquiryRow): DirectoryInquiry {
  return {
    id: row.id,
    profileId: row.profile_id,
    profileName: row.profile_name,
    profileSlug: row.profile_slug,
    profileCategory: isDirectoryCategory(row.profile_category) ? row.profile_category : "salony-a-sluzby",
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

function parseProposedData(value: string): DirectoryProfileEditableData {
  try {
    return JSON.parse(value) as DirectoryProfileEditableData;
  } catch {
    return {
      name: "", serviceType: "", city: "", district: "", region: "", address: "", phone: "", email: "",
      website: "", facebook: "", instagram: "", description: "", services: [], priceNote: "", coverage: "", online: false, specialized: {},
    };
  }
}

function rowToChangeRequest(row: DirectoryProfileChangeRequestRow, currentData: DirectoryProfileEditableData | null = null): DirectoryProfileChangeRequest {
  return {
    id: row.id,
    profileId: row.profile_id,
    profileName: row.profile_name,
    profileSlug: row.profile_slug,
    profileCategory: isDirectoryCategory(row.profile_category) ? row.profile_category : "salony-a-sluzby",
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    requesterPhone: row.requester_phone,
    requesterRole: row.requester_role,
    proposedData: parseProposedData(row.proposed_data_json),
    currentData,
    note: row.note,
    authorized: Boolean(row.authorized),
    consent: Boolean(row.consent),
    status: row.status === "approved" ? "approved" : row.status === "rejected" ? "rejected" : "new",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
  };
}

function normalizeUrl(value: string | null | undefined) {
  const clean = value?.trim() || null;
  if (!clean) return null;
  let parsed: URL;
  try { parsed = new URL(clean); } catch { throw new Error("Webová adresa nie je platná."); }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Webová adresa musí začínať http:// alebo https://.");
  return clean;
}

function normalizeEmail(value: string | null | undefined, required = false) {
  const clean = value?.trim().toLowerCase() || null;
  if (!clean && !required) return null;
  if (!clean || clean.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("E-mailová adresa nie je platná.");
  return clean;
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

function normalizeOptionalUrl(value: unknown, label: string) {
  const clean = cleanText(value, 500);
  if (!clean) return "";
  try {
    const parsed = new URL(clean);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    return parsed.toString();
  } catch {
    throw new Error(`${label} musí byť platná adresa začínajúca http:// alebo https://.`);
  }
}

function normalizeChangeRequestData(value: Partial<DirectoryProfileEditableData> | undefined, category: DirectoryCategorySlug) {
  const name = cleanText(value?.name, 180);
  const region = normalizeDirectoryRegion(cleanText(value?.region, 80));
  const email = normalizeEmail(cleanText(value?.email, 180)) ?? "";
  if (name.length < 2) throw new Error("Doplň názov služby alebo firmy.");
  if (!region) throw new Error("Vyber platný kraj alebo možnosť Online.");
  const services = normalizeStringList(value?.services).map((item) => cleanText(item, 160)).filter(Boolean).slice(0, 30);
  const allowedSpecialized = new Set(specializedChangeRequestFields[category] ?? []);
  const rawSpecialized = value?.specialized && typeof value.specialized === "object" && !Array.isArray(value.specialized) ? value.specialized : {};
  const specialized = Object.fromEntries(Object.entries(rawSpecialized)
    .filter(([key]) => allowedSpecialized.has(key))
    .map(([key, item]) => [key, cleanText(item, 500)]));
  return {
    name,
    serviceType: cleanText(value?.serviceType, 160),
    city: cleanText(value?.city, 120),
    district: cleanText(value?.district, 120),
    region,
    address: cleanText(value?.address, 300),
    phone: cleanText(value?.phone, 50),
    email,
    website: normalizeOptionalUrl(value?.website, "Webová adresa"),
    facebook: normalizeOptionalUrl(value?.facebook, "Facebook"),
    instagram: normalizeOptionalUrl(value?.instagram, "Instagram"),
    description: cleanText(value?.description, 10_000),
    services,
    priceNote: cleanText(value?.priceNote, 1000),
    coverage: cleanText(value?.coverage, 1000),
    online: value?.online === true,
    specialized,
  } satisfies DirectoryProfileEditableData;
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 20);
}

function normalizeProfileInput(payload: ManagedDirectoryProfileInput) {
  const name = payload.name?.trim() ?? "";
  const slug = slugifyArticleTitle(payload.slug?.trim() || name);
  const category = payload.category && isDirectoryCategory(payload.category) ? payload.category : null;
  const status: DirectoryProfileStatus = payload.status === "published" ? "published" : "draft";
  const excerpt = payload.excerpt?.trim() ?? "";
  const description = payload.description?.trim() ?? "";
  const city = payload.city?.trim() ?? "";
  const district = payload.district?.trim() ?? "";
  const region = normalizeDirectoryRegion(payload.region);
  const imageUrl = payload.imageUrl?.trim() || null;

  if (!name) throw new Error("Doplň názov profilu.");
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Adresa profilu nie je platná.");
  if (!category) throw new Error("Vyber kategóriu adresára.");
  if (allDirectoryCategories.some((item) => item.slug === slug)) throw new Error("Túto adresu používa kategória. Uprav adresu profilu.");
  if (excerpt.length < 20) throw new Error("Krátky popis by mal mať aspoň 20 znakov.");
  if (description.length < 40) throw new Error("Podrobný popis by mal mať aspoň 40 znakov.");
  if (!city) throw new Error("Doplň mesto alebo uveď Online.");
  if (!region) throw new Error("Vyber kraj.");
  if (imageUrl && !imageUrl.startsWith("/media/") && !imageUrl.startsWith("/images/") && !/^https:\/\//i.test(imageUrl)) throw new Error("Adresa obrázka nie je platná.");

  const services = normalizeStringList(payload.services);
  const qualifications = normalizeStringList(payload.qualifications);
  const address = payload.address?.trim() ?? "";
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
    region,
    address,
    online: Boolean(payload.online),
    priceNote: payload.priceNote?.trim() ?? "",
    websiteUrl: normalizeUrl(payload.websiteUrl),
    internalEmail: normalizeEmail(payload.internalEmail),
    imageUrl,
    imageKey: payload.imageKey?.trim() || null,
    verified: Boolean(payload.verified),
    featured: Boolean(payload.featured),
    seo: cleanEditableSeo(payload.seo),
    searchText: directorySearchText({ name, excerpt, description, services, qualifications, city, district, region, address }),
  };
}

export async function getPublishedDirectoryProfiles(category?: DirectoryCategorySlug) {
  const database = getD1Binding();
  if (!database) return [] as PublicDirectoryProfile[];
  const result = category
    ? await database.prepare(`SELECT ${DIRECTORY_PROFILE_COLUMNS} FROM directory_profiles WHERE status = 'published' AND category = ? ORDER BY featured DESC, name ASC`).bind(category).all<DirectoryProfileRow>()
    : await database.prepare(`SELECT ${DIRECTORY_PROFILE_COLUMNS} FROM directory_profiles WHERE status = 'published' ORDER BY featured DESC, name ASC`).all<DirectoryProfileRow>();
  return result.results.map(rowToPublicProfile);
}

export async function listPublishedDirectoryProfiles(options: {
  category?: DirectoryCategorySlug;
  filters: DirectoryFilters;
  pageSize?: number;
}): Promise<PublicDirectoryProfilePage> {
  const database = getD1Binding();
  const pageSize = Math.max(1, Math.min(48, Math.trunc(options.pageSize ?? 24)));
  const emptyOptions = { regions: [], districts: [], cities: [], services: [], breeds: [], fciGroups: [], organizations: [], profileTypes: [] };
  if (!database) return { profiles: [], total: 0, page: 1, pageSize, totalPages: 1, options: emptyOptions };

  const category = (options.category ?? options.filters.category) || undefined;
  const baseClauses = ["status = 'published'"];
  const baseBindings: unknown[] = [];
  if (category) { baseClauses.push("category = ?"); baseBindings.push(category); }
  if (options.filters.query) {
    const needle = `%${normalizeDirectorySearchText(options.filters.query)}%`;
    baseClauses.push(`(search_text LIKE ? OR ${DIRECTORY_PUBLIC_FACET_SEARCH} LIKE ? OR (search_text = '' AND ${LEGACY_DIRECTORY_SEARCH} LIKE ?))`);
    baseBindings.push(needle, needle, needle);
  }
  if (options.filters.service) {
    baseClauses.push("EXISTS (SELECT 1 FROM json_each(directory_profiles.services_json) service_item WHERE trim(CAST(service_item.value AS TEXT)) = ?)");
    baseBindings.push(options.filters.service);
  }
  const addSourceFacet = (value: string, expression: string) => {
    if (!value) return;
    baseClauses.push(`${expression} = ?`);
    baseBindings.push(value);
  };
  addSourceFacet(options.filters.breed, DIRECTORY_SOURCE_FACETS.breed);
  addSourceFacet(options.filters.fciGroup, DIRECTORY_SOURCE_FACETS.fciGroup);
  addSourceFacet(options.filters.organization, DIRECTORY_SOURCE_FACETS.organization);
  addSourceFacet(options.filters.profileType, DIRECTORY_SOURCE_FACETS.profileType);

  const locationWhere = (level: "region" | "district" | "city") => {
    const clauses = [...baseClauses];
    const bindings = [...baseBindings];
    if ((level === "district" || level === "city") && options.filters.region) {
      clauses.push("(region = ? OR region = ?)");
      bindings.push(options.filters.region, options.filters.region.replace(/ kraj$/, ""));
    }
    if (level === "city" && options.filters.district) {
      clauses.push(`COALESCE(NULLIF(district, ''), json_extract(source_data_json, '$."Okres"'), '') = ?`);
      bindings.push(options.filters.district);
    }
    return { sql: clauses.join(" AND "), bindings };
  };
  const regionWhere = locationWhere("region");
  const districtWhere = locationWhere("district");
  const cityWhere = locationWhere("city");
  const facetWhere = category ? "status = 'published' AND category = ?" : "status = 'published'";
  const facetBindings = category ? [category] : [];
  const facetQuery = (expression: string) => database.prepare(`SELECT DISTINCT trim(CAST(${expression} AS TEXT)) AS value FROM directory_profiles WHERE ${facetWhere} AND trim(CAST(${expression} AS TEXT)) <> '' ORDER BY value`).bind(...facetBindings);
  const serviceQuery = database.prepare(`
    SELECT DISTINCT trim(CAST(service_item.value AS TEXT)) AS value
    FROM directory_profiles, json_each(directory_profiles.services_json) service_item
    WHERE ${facetWhere} AND trim(CAST(service_item.value AS TEXT)) <> ''
    ORDER BY value
  `).bind(...facetBindings);
  const optionResults = await database.batch([
    database.prepare(`SELECT DISTINCT region AS value FROM directory_profiles WHERE ${regionWhere.sql} AND region <> '' ORDER BY region`).bind(...regionWhere.bindings),
    database.prepare(`SELECT DISTINCT COALESCE(NULLIF(district, ''), json_extract(source_data_json, '$."Okres"'), '') AS value FROM directory_profiles WHERE ${districtWhere.sql} AND COALESCE(NULLIF(district, ''), json_extract(source_data_json, '$."Okres"'), '') <> '' ORDER BY value`).bind(...districtWhere.bindings),
    database.prepare(`SELECT DISTINCT city AS value FROM directory_profiles WHERE ${cityWhere.sql} AND city <> '' ORDER BY city`).bind(...cityWhere.bindings),
    serviceQuery,
    facetQuery(DIRECTORY_SOURCE_FACETS.breed),
    facetQuery(DIRECTORY_SOURCE_FACETS.fciGroup),
    facetQuery(DIRECTORY_SOURCE_FACETS.organization),
    facetQuery(DIRECTORY_SOURCE_FACETS.profileType),
  ]);
  const values = (result: D1Result<unknown>) => (result.results as Array<{ value?: string }>).map((row) => row.value?.trim() ?? "").filter(Boolean);
  const regions = [...new Set(values(optionResults[0]).map((region) => normalizeDirectoryRegion(region)).filter((region): region is SlovakRegion => Boolean(region)))];
  const districts = values(optionResults[1]);
  const cities = values(optionResults[2]);
  const region = regions.includes(options.filters.region as SlovakRegion) ? options.filters.region : "";
  const district = (!options.filters.region || region) && districts.includes(options.filters.district) ? options.filters.district : "";
  const city = (!options.filters.district || district) && cities.includes(options.filters.city) ? options.filters.city : "";

  const clauses = [...baseClauses];
  const bindings = [...baseBindings];
  if (region) { clauses.push("(region = ? OR region = ?)"); bindings.push(region, region.replace(/ kraj$/, "")); }
  if (district) { clauses.push(`COALESCE(NULLIF(district, ''), json_extract(source_data_json, '$."Okres"'), '') = ?`); bindings.push(district); }
  if (city) { clauses.push("city = ?"); bindings.push(city); }
  const where = clauses.join(" AND ");
  const orderBy = options.filters.sort === "name-desc" ? "name DESC, id DESC"
    : options.filters.sort === "newest" ? "published_at DESC, id DESC"
      : options.filters.sort === "name-asc" ? "name ASC, id ASC"
        : "featured DESC, name ASC, id ASC";
  const requestedPage = Math.max(1, Math.trunc(options.filters.page));
  const countStatement = database.prepare(`SELECT COUNT(*) AS total FROM directory_profiles WHERE ${where}`).bind(...bindings);
  const count = await countStatement.first<{ total: number }>();
  const total = Number(count?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const listStatement = database.prepare(`
    SELECT ${DIRECTORY_CARD_COLUMNS.replace("city, district, region", "city, COALESCE(NULLIF(district, ''), json_extract(source_data_json, '$.\"Okres\"'), '') AS district, region")}
    FROM directory_profiles WHERE ${where}
    ORDER BY ${orderBy} LIMIT ? OFFSET ?
  `).bind(...bindings, pageSize, (page - 1) * pageSize);

  const listResult = await listStatement.all<DirectoryProfileRow>();
  return {
    profiles: (listResult.results as unknown as DirectoryProfileRow[]).map(rowToPublicProfile),
    total, page, pageSize, totalPages,
    options: {
      regions,
      districts,
      cities,
      services: values(optionResults[3]),
      breeds: values(optionResults[4]),
      fciGroups: values(optionResults[5]),
      organizations: values(optionResults[6]),
      profileTypes: values(optionResults[7]),
    },
  };
}

export async function getDirectoryCategoryCounts() {
  const database = getD1Binding();
  if (!database) return {} as Partial<Record<DirectoryCategorySlug, number>>;
  const result = await database.prepare("SELECT category, COUNT(*) AS total FROM directory_profiles WHERE status = 'published' GROUP BY category").all<{ category: string; total: number }>();
  return Object.fromEntries(result.results.filter((row) => isDirectoryCategory(row.category)).map((row) => [row.category, Number(row.total)])) as Partial<Record<DirectoryCategorySlug, number>>;
}

export async function getFeaturedDirectoryProfiles(limit = 2) {
  const database = getD1Binding();
  if (!database) return [] as PublicDirectoryProfile[];
  const safeLimit = Math.max(1, Math.min(12, Math.trunc(limit)));
  const result = await database
    .prepare(`SELECT ${DIRECTORY_PROFILE_COLUMNS} FROM directory_profiles WHERE status = 'published' ORDER BY featured DESC, name ASC LIMIT ?`)
    .bind(safeLimit)
    .all<DirectoryProfileRow>();
  return result.results.map(rowToPublicProfile);
}

export async function getPublishedDirectoryProfile(category: string, slug: string) {
  const database = getD1Binding();
  if (!database || !isDirectoryCategory(category)) return null;
  const row = await database.prepare(`SELECT ${DIRECTORY_PROFILE_COLUMNS} FROM directory_profiles WHERE status = 'published' AND category = ? AND slug = ? LIMIT 1`).bind(category, slug).first<DirectoryProfileRow>();
  return row ? rowToPublicProfile(row) : null;
}

export async function listManagedDirectoryProfileSummaries(options: {
  page?: number;
  pageSize?: number;
} = {}): Promise<ManagedDirectoryProfileSummaryPage> {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.max(1, Math.min(100, Math.trunc(options.pageSize ?? 50)));
  const listStatement = database.prepare(`
    SELECT id, slug, name, category, status, services_json, city, district, region, image_url, verified, featured
    FROM directory_profiles
    ORDER BY updated_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).bind(pageSize, (page - 1) * pageSize);
  const countStatement = database.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END), 0) AS published,
      COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) AS draft
    FROM directory_profiles
  `);
  const [listResult, countResult] = await database.batch([listStatement, countStatement]);
  const rows = (listResult.results ?? []) as unknown as DirectoryProfileSummaryRow[];
  const rawCounts = (countResult.results?.[0] ?? null) as unknown as DirectoryProfileCountRow | null;
  const counts = {
    total: Number(rawCounts?.total ?? 0),
    published: Number(rawCounts?.published ?? 0),
    draft: Number(rawCounts?.draft ?? 0),
  };
  return {
    profiles: rows.map(rowToManagedProfileSummary),
    counts,
    pagination: {
      page,
      pageSize,
      total: counts.total,
      totalPages: Math.max(1, Math.ceil(counts.total / pageSize)),
    },
  };
}

export async function getManagedDirectoryProfileById(id: number) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const row = await database.prepare(`SELECT ${DIRECTORY_PROFILE_COLUMNS} FROM directory_profiles WHERE id = ? LIMIT 1`).bind(id).first<DirectoryProfileRow>();
  return row ? rowToManagedProfile(row) : null;
}

export async function createManagedDirectoryProfile(payload: ManagedDirectoryProfileInput, editorEmail: string) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const input = normalizeProfileInput(payload);
  const now = new Date().toISOString();
  const row = await database.prepare(`
    INSERT INTO directory_profiles (
      slug, name, category, status, excerpt, description, services_json, qualifications_json,
      city, district, region, address, online, price_note, website_url, internal_email, image_url, image_key,
      verified, featured, seo_json, search_text, created_at, updated_at, published_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${DIRECTORY_PROFILE_COLUMNS}
  `).bind(
    input.slug, input.name, input.category, input.status, input.excerpt, input.description,
    JSON.stringify(input.services), JSON.stringify(input.qualifications), input.city, input.district, input.region,
    input.address, input.online ? 1 : 0, input.priceNote, input.websiteUrl, input.internalEmail,
    input.imageUrl, input.imageKey, input.verified ? 1 : 0, input.featured ? 1 : 0, JSON.stringify(input.seo), input.searchText,
    now, now, input.status === "published" ? now : null, editorEmail, editorEmail,
  ).first<DirectoryProfileRow>();
  if (!row) throw new Error("Profil sa nepodarilo vytvoriť.");
  return rowToManagedProfile(row);
}

export async function updateManagedDirectoryProfile(id: number, payload: ManagedDirectoryProfileInput, editorEmail: string, existingProfile?: ManagedDirectoryProfile) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const existing = existingProfile ?? await getManagedDirectoryProfileById(id);
  if (!existing) return null;
  const input = normalizeProfileInput(payload);
  const now = new Date().toISOString();
  const publishedAt = input.status === "published" ? existing.publishedAt ?? now : existing.publishedAt;
  const row = await database.prepare(`
    UPDATE directory_profiles SET
      slug = ?, name = ?, category = ?, status = ?, excerpt = ?, description = ?, services_json = ?,
      qualifications_json = ?, city = ?, district = ?, region = ?, address = ?, online = ?, price_note = ?, website_url = ?,
      internal_email = ?, image_url = ?, image_key = ?, verified = ?, featured = ?, seo_json = ?, search_text = ?, updated_at = ?, published_at = ?, updated_by = ?
    WHERE id = ? RETURNING ${DIRECTORY_PROFILE_COLUMNS}
  `).bind(
    input.slug, input.name, input.category, input.status, input.excerpt, input.description,
    JSON.stringify(input.services), JSON.stringify(input.qualifications), input.city, input.district, input.region,
    input.address, input.online ? 1 : 0, input.priceNote, input.websiteUrl, input.internalEmail,
    input.imageUrl, input.imageKey, input.verified ? 1 : 0, input.featured ? 1 : 0, JSON.stringify(input.seo), input.searchText,
    now, publishedAt, editorEmail, id,
  ).first<DirectoryProfileRow>();
  return row ? rowToManagedProfile(row) : null;
}

export async function deleteManagedDirectoryProfile(id: number) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const row = await database.prepare(`DELETE FROM directory_profiles WHERE id = ? RETURNING ${DIRECTORY_PROFILE_COLUMNS}`).bind(id).first<DirectoryProfileRow>();
  return row ? rowToManagedProfile(row) : null;
}

export function isDirectoryProfileConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("UNIQUE constraint failed") || message.includes("directory_profiles.category, directory_profiles.slug");
}

export class DirectoryRateLimitError extends Error {}

async function purgeExpiredDirectoryInquiries(database: D1Database) {
  const resolvedBefore = new Date(Date.now() - 180 * 24 * 60 * 60 * 1_000).toISOString();
  const absoluteBefore = new Date(Date.now() - 365 * 24 * 60 * 60 * 1_000).toISOString();
  await database.prepare("DELETE FROM directory_inquiries WHERE (status = 'resolved' AND updated_at < ?) OR created_at < ?")
    .bind(resolvedBefore, absoluteBefore).run();
}

export async function createDirectoryInquiry(payload: DirectoryInquiryInput) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  await purgeExpiredDirectoryInquiries(database);
  const profileId = Number(payload.profileId);
  if (!Number.isSafeInteger(profileId) || profileId < 1) throw new Error("Profil sa nenašiel.");
  const profile = await database.prepare(`SELECT ${DIRECTORY_PROFILE_COLUMNS} FROM directory_profiles WHERE id = ? AND status = 'published' LIMIT 1`).bind(profileId).first<DirectoryProfileRow>();
  if (!profile) throw new Error("Profil sa nenašiel alebo už nie je verejný.");

  const senderName = payload.senderName?.trim() ?? "";
  const senderEmail = normalizeEmail(payload.senderEmail, true) as string;
  const senderPhone = payload.senderPhone?.trim() ?? "";
  const dogInfo = payload.dogInfo?.trim() ?? "";
  const message = payload.message?.trim() ?? "";
  if (senderName.length < 2 || senderName.length > 100) throw new Error("Doplň svoje meno.");
  if (senderPhone.length > 40) throw new Error("Telefónne číslo je príliš dlhé.");
  if (dogInfo.length > 300) throw new Error("Informácie o psovi sú príliš dlhé.");
  if (message.length < 20 || message.length > 3000) throw new Error("Správa musí mať 20 až 3 000 znakov.");
  if (!payload.consent) throw new Error("Pred odoslaním potvrď oboznámenie sa so spracúvaním údajov.");

  const limitSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recent = await database.prepare("SELECT COUNT(*) AS count FROM directory_inquiries WHERE sender_email = ? AND created_at >= ?").bind(senderEmail, limitSince).first<{ count: number }>();
  if ((recent?.count ?? 0) >= 3) throw new DirectoryRateLimitError("Za krátky čas bolo odoslaných príliš veľa správ. Skús to neskôr.");

  const now = new Date().toISOString();
  const row = await database.prepare(`
    INSERT INTO directory_inquiries (
      profile_id, profile_name, profile_slug, profile_category, recipient_email, sender_name, sender_email,
      sender_phone, dog_info, message, status, consent, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 1, ?, ?) RETURNING *
  `).bind(
    profile.id, profile.name, profile.slug, profile.category, profile.internal_email, senderName, senderEmail,
    senderPhone, dogInfo, message, now, now,
  ).first<DirectoryInquiryRow>();
  if (!row) throw new Error("Dopyt sa nepodarilo uložiť.");
  return rowToInquiry(row);
}

export async function listDirectoryInquiries() {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const result = await database.prepare(`
    SELECT id, profile_id, profile_name, profile_slug, profile_category, recipient_email,
      sender_name, sender_email, sender_phone, dog_info, message, status, consent, created_at, updated_at
    FROM directory_inquiries
    ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'read' THEN 1 ELSE 2 END, created_at DESC
    LIMIT 200
  `).all<DirectoryInquiryRow>();
  return result.results.map(rowToInquiry);
}

export async function updateDirectoryInquiryStatus(id: number, status: DirectoryInquiryStatus) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const now = new Date().toISOString();
  const row = await database.prepare("UPDATE directory_inquiries SET status = ?, updated_at = ? WHERE id = ? RETURNING *").bind(status, now, id).first<DirectoryInquiryRow>();
  return row ? rowToInquiry(row) : null;
}

export async function deleteDirectoryInquiry(id: number) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const row = await database.prepare("DELETE FROM directory_inquiries WHERE id = ? RETURNING *").bind(id).first<DirectoryInquiryRow>();
  return row ? rowToInquiry(row) : null;
}

const DIRECTORY_CHANGE_REQUEST_COLUMNS = `
  id, profile_id, profile_name, profile_slug, profile_category, requester_name, requester_email,
  requester_phone, requester_role, proposed_data_json, note, authorized, consent, status,
  created_at, updated_at, reviewed_at, reviewed_by
`;

export async function createDirectoryProfileChangeRequest(payload: DirectoryProfileChangeRequestInput) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const profileId = Number(payload.profileId);
  if (!Number.isSafeInteger(profileId) || profileId < 1) throw new Error("Profil sa nenašiel.");
  const profileRow = await database.prepare(`SELECT ${DIRECTORY_PROFILE_COLUMNS} FROM directory_profiles WHERE id = ? AND status = 'published' LIMIT 1`).bind(profileId).first<DirectoryProfileRow>();
  if (!profileRow) throw new Error("Profil sa nenašiel alebo už nie je verejný.");
  const profile = rowToPublicProfile(profileRow);

  const requesterName = cleanText(payload.requesterName, 120);
  const requesterEmail = normalizeEmail(payload.requesterEmail, true) as string;
  const requesterPhone = cleanText(payload.requesterPhone, 50);
  const requesterRole = cleanText(payload.requesterRole, 80);
  const note = cleanText(payload.note, 3000);
  if (requesterName.length < 2) throw new Error("Doplň meno a priezvisko.");
  if (!payload.authorized) throw new Error("Potvrď, že si oprávnený/á navrhnúť úpravu profilu.");
  if (!payload.consent) throw new Error("Potvrď súhlas so spracovaním údajov na vybavenie návrhu.");
  const proposedData = normalizeChangeRequestData(payload.proposedData, profile.category);

  const limitSince = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await database.prepare(`
    SELECT COUNT(*) AS count FROM directory_profile_change_requests
    WHERE requester_email = ? AND created_at >= ?
  `).bind(requesterEmail, limitSince).first<{ count: number }>();
  if ((recent?.count ?? 0) >= 3) throw new DirectoryRateLimitError("Za krátky čas bolo odoslaných príliš veľa návrhov. Skús to neskôr.");

  const now = new Date().toISOString();
  const row = await database.prepare(`
    INSERT INTO directory_profile_change_requests (
      profile_id, profile_name, profile_slug, profile_category, requester_name, requester_email,
      requester_phone, requester_role, proposed_data_json, note, authorized, consent, status,
      created_at, updated_at, reviewed_at, reviewed_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'new', ?, ?, NULL, NULL)
    RETURNING ${DIRECTORY_CHANGE_REQUEST_COLUMNS}
  `).bind(
    profile.id, profile.name, profile.slug, profile.category, requesterName, requesterEmail,
    requesterPhone, requesterRole, JSON.stringify(proposedData), note, now, now,
  ).first<DirectoryProfileChangeRequestRow>();
  if (!row) throw new Error("Návrh úpravy sa nepodarilo uložiť.");
  return rowToChangeRequest(row, editableDirectoryProfileData(profile));
}

export async function listDirectoryProfileChangeRequests() {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const result = await database.prepare(`
    SELECT ${DIRECTORY_CHANGE_REQUEST_COLUMNS}
    FROM directory_profile_change_requests
    ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC
    LIMIT 200
  `).all<DirectoryProfileChangeRequestRow>();
  const rows = result.results;
  const ids = [...new Set(rows.map((row) => row.profile_id))];
  const currentById = new Map<number, DirectoryProfileEditableData>();
  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(", ");
    const profiles = await database.prepare(`SELECT ${DIRECTORY_PROFILE_COLUMNS} FROM directory_profiles WHERE id IN (${placeholders})`).bind(...ids).all<DirectoryProfileRow>();
    for (const row of profiles.results) currentById.set(row.id, editableDirectoryProfileData(rowToPublicProfile(row)));
  }
  return rows.map((row) => rowToChangeRequest(row, currentById.get(row.profile_id) ?? null));
}

export async function reviewDirectoryProfileChangeRequest(id: number, status: Exclude<DirectoryProfileChangeRequestStatus, "new">, reviewerEmail: string) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const now = new Date().toISOString();
  const row = await database.prepare(`
    UPDATE directory_profile_change_requests
    SET status = ?, updated_at = ?, reviewed_at = ?, reviewed_by = ?
    WHERE id = ? AND status = 'new'
    RETURNING ${DIRECTORY_CHANGE_REQUEST_COLUMNS}
  `).bind(status, now, now, reviewerEmail, id).first<DirectoryProfileChangeRequestRow>();
  if (!row) return null;
  const profile = await database.prepare(`SELECT ${DIRECTORY_PROFILE_COLUMNS} FROM directory_profiles WHERE id = ? LIMIT 1`).bind(row.profile_id).first<DirectoryProfileRow>();
  return rowToChangeRequest(row, profile ? editableDirectoryProfileData(rowToPublicProfile(profile)) : null);
}
