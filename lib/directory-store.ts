import { env } from "cloudflare:workers";
import { slugifyArticleTitle } from "@/lib/article-store";
import {
  allDirectoryCategories,
  isDirectoryCategory,
  type DirectoryCategorySlug,
  type DirectoryInquiry,
  type DirectoryInquiryStatus,
  type DirectoryProfileStatus,
  type ManagedDirectoryProfile,
  type PublicDirectoryProfile,
} from "@/lib/directory";
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
  region: string;
  district: string;
  city: string;
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
  };
};

type DirectorySearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function parseDirectoryFilters(params: DirectorySearchParams): DirectoryFilters {
  const rawSort = firstParam(params.sort);
  const sort: DirectorySort = ["recommended", "name-asc", "name-desc", "newest"].includes(rawSort) ? rawSort as DirectorySort : "recommended";
  return {
    query: firstParam(params.q).slice(0, 100),
    region: normalizeDirectoryRegion(firstParam(params.region)) ?? "",
    district: firstParam(params.district).slice(0, 100),
    city: firstParam(params.city).slice(0, 120),
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
  '' AS price_note, website_url, NULL AS internal_email, image_url, NULL AS image_key,
  import_key, '{}' AS source_data_json, search_text, verified, featured, '{}' AS seo_json,
  created_at, updated_at, published_at, created_by, updated_by
`;

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

function rowToPublicProfile(row: DirectoryProfileRow): PublicDirectoryProfile {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: isDirectoryCategory(row.category) ? row.category : "salony-a-sluzby",
    excerpt: row.excerpt,
    description: row.description,
    services: safeList(row.services_json),
    qualifications: safeList(row.qualifications_json),
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
  if (!database) return { profiles: [], total: 0, page: 1, pageSize, totalPages: 1, options: { regions: [], districts: [], cities: [] } };

  const clauses = ["status = 'published'"];
  const bindings: unknown[] = [];
  if (options.category) { clauses.push("category = ?"); bindings.push(options.category); }
  if (options.filters.query) {
    const needle = `%${normalizeDirectorySearchText(options.filters.query)}%`;
    clauses.push(`(search_text LIKE ? OR (search_text = '' AND ${LEGACY_DIRECTORY_SEARCH} LIKE ?))`);
    bindings.push(needle, needle);
  }
  if (options.filters.region) {
    clauses.push("(region = ? OR region = ?)");
    bindings.push(options.filters.region, options.filters.region.replace(/ kraj$/, ""));
  }
  if (options.filters.district) {
    clauses.push(`(district = ? OR (district = '' AND json_extract(source_data_json, '$."Okres"') = ?))`);
    bindings.push(options.filters.district, options.filters.district);
  }
  if (options.filters.city) { clauses.push("city = ?"); bindings.push(options.filters.city); }

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

  const optionClause = options.category ? "status = 'published' AND category = ?" : "status = 'published'";
  const optionBindings = options.category ? [options.category] : [];
  const [listResult, regionResult, districtResult, cityResult] = await database.batch([
    listStatement,
    database.prepare(`SELECT DISTINCT region AS value FROM directory_profiles WHERE ${optionClause} AND region <> '' ORDER BY region`).bind(...optionBindings),
    database.prepare(`SELECT DISTINCT COALESCE(NULLIF(district, ''), json_extract(source_data_json, '$."Okres"')) AS value FROM directory_profiles WHERE ${optionClause} AND COALESCE(NULLIF(district, ''), json_extract(source_data_json, '$."Okres"')) <> '' ORDER BY value`).bind(...optionBindings),
    database.prepare(`SELECT DISTINCT city AS value FROM directory_profiles WHERE ${optionClause} AND city <> '' ORDER BY city`).bind(...optionBindings),
  ]);
  const values = (result: D1Result<unknown>) => (result.results as Array<{ value?: string }>).map((row) => row.value?.trim() ?? "").filter(Boolean);
  return {
    profiles: (listResult.results as unknown as DirectoryProfileRow[]).map(rowToPublicProfile),
    total, page, pageSize, totalPages,
    options: {
      regions: [...new Set(values(regionResult).map((region) => normalizeDirectoryRegion(region)).filter((region): region is SlovakRegion => Boolean(region)))],
      districts: values(districtResult),
      cities: values(cityResult),
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
