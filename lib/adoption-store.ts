import { env } from "cloudflare:workers";
import {
  ADOPTION_ADMIN_PAGE_SIZE,
  ADOPTION_PAGE_SIZE,
  ADOPTION_STALE_DAYS,
  adoptionActivityLevels,
  adoptionCompatibilityValues,
  adoptionPublicStatuses,
  adoptionRegions,
  adoptionSexes,
  adoptionSizes,
  adoptionStatuses,
  adoptionVaccinationStatuses,
  assertAdoptionStatusTransition,
  buildAdoptionSearchText,
  isAdoptionAgeCategory,
  isAdoptionSex,
  isAdoptionSize,
  isAdoptionSort,
  isAdoptionStatus,
  normalizeAdoptionInput,
  normalizeAdoptionSearchText,
  normalizeAdoptionText,
  normalizeOptionalPositiveId,
  type AdoptionActivityLevel,
  type AdoptionAdminFilters,
  type AdoptionCompatibility,
  type AdoptionDog,
  type AdoptionPublicFilters,
  type AdoptionPublicStatus,
  type AdoptionRegion,
  type AdoptionSex,
  type AdoptionSize,
  type AdoptionStatus,
  type AdoptionVaccinationStatus,
  type ManagedAdoptionInput,
  type NormalizedAdoptionInput,
} from "./adoption.ts";

export type AdoptionD1Statement = {
  bind(...values: unknown[]): AdoptionD1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};

export type AdoptionD1Database = { prepare(query: string): AdoptionD1Statement };
type RuntimeBindings = { DB?: AdoptionD1Database };
type ManagedBreedRow = { id: number; name: string; slug: string };
type ManagedOrganizationRow = { id: number; name: string; slug: string };

export type AdoptionBreedOption = ManagedBreedRow;
export type AdoptionOrganizationReference = { organizationId: number | null; organizationName: string; organizationSlug: string | null };
export type AdoptionPublicQueryFilters = AdoptionPublicFilters & {
  breedId?: number | null;
  status?: AdoptionPublicStatus | "";
};

type AdoptionDogRow = {
  id: number; name: string; slug: string; status: string; sex: string; birth_date: string | null;
  approximate_age_months: number | null; size: string; weight: number | null; breed_id: number | null;
  breed_name: string; breed_slug: string | null; breed_profile_name: string | null; breed_mix: number; color: string;
  region: string; district: string; city: string; organization_id: number | null; organization_name: string;
  organization_slug: string | null; canonical_organization_name: string | null; canonical_organization_slug: string | null;
  main_image: string | null; gallery_json: string; short_description: string;
  description: string; temperament: string; activity_level: string; suitable_for_children: string; suitable_for_dogs: string;
  suitable_for_cats: string; suitable_for_other_animals: string; apartment_suitable: number | null;
  beginner_suitable: number | null; needs_experienced_owner: number; vaccination_status: string; chipped: number | null;
  neutered: number | null; health_notes: string; special_needs: string; adoption_requirements: string;
  external_source_url: string | null; contact_email: string | null; contact_phone: string | null; contact_url: string | null;
  search_text: string; published_at: string | null; last_verified_at: string | null; created_at: string; updated_at: string;
  created_by: string; updated_by: string;
};

type AdoptionSummaryRow = Pick<AdoptionDogRow,
  "id" | "name" | "slug" | "status" | "sex" | "size" | "city" | "region" | "organization_name" | "main_image" | "last_verified_at" | "updated_at"
>;
type LifecycleCountRow = { status: string; count: number };

export type ManagedAdoptionSummary = {
  id: number; name: string; slug: string; status: AdoptionStatus; sex: AdoptionSex; size: AdoptionSize; city: string;
  region: AdoptionRegion | ""; organizationName: string; mainImage: string | null; lastVerifiedAt: string | null; updatedAt: string;
};

export type AdoptionPagination = { page: number; pageSize: number; total: number; totalPages: number };
export type AdoptionBreedReference = { breedId: number | null; breedName: string; breedSlug: string | null };
export type PreparedAdoptionWrite = NormalizedAdoptionInput & {
  breedSlug: string | null; publishedAt: string | null; updatedAt: string; updatedBy: string;
};

const PUBLIC_SELECT = `SELECT d.*, b.slug AS breed_slug, b.name AS breed_profile_name,
    o.name AS canonical_organization_name, o.slug AS canonical_organization_slug
  FROM adoption_dogs d
  LEFT JOIN managed_breeds b ON b.id = d.breed_id AND b.status = 'published'
  LEFT JOIN help_organizations o ON o.id = d.organization_id`;
const AGE_MONTHS_SQL = `COALESCE(d.approximate_age_months, CAST((julianday('now') - julianday(d.birth_date)) / 30.4375 AS INTEGER))`;
const MUTABLE_COLUMNS = [
  "name", "slug", "status", "sex", "birth_date", "approximate_age_months", "size", "weight", "breed_id", "breed_name",
  "breed_mix", "color", "region", "district", "city", "organization_id", "organization_name", "organization_slug", "main_image",
  "gallery_json", "short_description", "description", "temperament", "activity_level", "suitable_for_children", "suitable_for_dogs",
  "suitable_for_cats", "suitable_for_other_animals", "apartment_suitable", "beginner_suitable", "needs_experienced_owner",
  "vaccination_status", "chipped", "neutered", "health_notes", "special_needs", "adoption_requirements", "external_source_url",
  "contact_email", "contact_phone", "contact_url", "search_text", "published_at", "last_verified_at", "updated_at", "updated_by",
] as const;

function getD1Binding() {
  const database = (env as unknown as RuntimeBindings).DB;
  return database && typeof database.prepare === "function" ? database : null;
}
function requireD1Binding(database?: AdoptionD1Database) {
  const resolved = database ?? getD1Binding();
  if (!resolved) throw new Error("Databáza adopcií zatiaľ nie je pripojená.");
  return resolved;
}
function normalizeRowChoice<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? value as T : fallback;
}
function parseGallery(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 20) : [];
  } catch { return []; }
}
function rowToDog(row: AdoptionDogRow): AdoptionDog {
  const region = (adoptionRegions as readonly string[]).includes(row.region) ? row.region as AdoptionRegion : "";
  const linkedOrganization = row.organization_id !== null;
  const organizationName = linkedOrganization ? normalizeAdoptionText(row.canonical_organization_name) : row.organization_name;
  const organizationSlug = linkedOrganization ? normalizeAdoptionText(row.canonical_organization_slug) || null : row.organization_slug;
  return {
    id: Number(row.id), name: row.name, slug: row.slug, status: normalizeRowChoice(row.status, adoptionStatuses, "DRAFT"),
    sex: normalizeRowChoice(row.sex, adoptionSexes, "UNKNOWN"), birthDate: row.birth_date,
    approximateAgeMonths: row.approximate_age_months, size: normalizeRowChoice(row.size, adoptionSizes, "UNKNOWN"), weight: row.weight,
    breedId: row.breed_id, breedName: normalizeAdoptionText(row.breed_profile_name) || row.breed_name,
    breedSlug: normalizeAdoptionText(row.breed_slug) || null, breedMix: Boolean(row.breed_mix), color: row.color, region,
    district: row.district, city: row.city, organizationId: row.organization_id, organizationName,
    organizationSlug, mainImage: row.main_image, gallery: parseGallery(row.gallery_json),
    shortDescription: row.short_description, description: row.description, temperament: row.temperament,
    activityLevel: normalizeRowChoice(row.activity_level, adoptionActivityLevels, "UNKNOWN") as AdoptionActivityLevel,
    suitableForChildren: normalizeRowChoice(row.suitable_for_children, adoptionCompatibilityValues, "UNKNOWN") as AdoptionCompatibility,
    suitableForDogs: normalizeRowChoice(row.suitable_for_dogs, adoptionCompatibilityValues, "UNKNOWN") as AdoptionCompatibility,
    suitableForCats: normalizeRowChoice(row.suitable_for_cats, adoptionCompatibilityValues, "UNKNOWN") as AdoptionCompatibility,
    suitableForOtherAnimals: normalizeRowChoice(row.suitable_for_other_animals, adoptionCompatibilityValues, "UNKNOWN") as AdoptionCompatibility,
    apartmentSuitable: row.apartment_suitable === null ? null : Boolean(row.apartment_suitable),
    beginnerSuitable: row.beginner_suitable === null ? null : Boolean(row.beginner_suitable),
    needsExperiencedOwner: Boolean(row.needs_experienced_owner),
    vaccinationStatus: normalizeRowChoice(row.vaccination_status, adoptionVaccinationStatuses, "UNKNOWN") as AdoptionVaccinationStatus,
    chipped: row.chipped === null ? null : Boolean(row.chipped), neutered: row.neutered === null ? null : Boolean(row.neutered),
    healthNotes: row.health_notes, specialNeeds: row.special_needs, adoptionRequirements: row.adoption_requirements,
    externalSourceUrl: row.external_source_url, contactEmail: row.contact_email, contactPhone: row.contact_phone, contactUrl: row.contact_url,
    publishedAt: row.published_at, lastVerifiedAt: row.last_verified_at, createdAt: row.created_at, updatedAt: row.updated_at,
    createdBy: row.created_by, updatedBy: row.updated_by,
  };
}
function dogToInput(dog: AdoptionDog): ManagedAdoptionInput {
  return {
    name: dog.name, slug: dog.slug, status: dog.status, sex: dog.sex, birthDate: dog.birthDate,
    approximateAgeMonths: dog.approximateAgeMonths, size: dog.size, weight: dog.weight, breedId: dog.breedId,
    breedName: dog.breedName, breedMix: dog.breedMix, color: dog.color, region: dog.region, district: dog.district, city: dog.city,
    organizationId: dog.organizationId, organizationName: dog.organizationName, organizationSlug: dog.organizationSlug,
    mainImage: dog.mainImage, gallery: dog.gallery, shortDescription: dog.shortDescription, description: dog.description,
    temperament: dog.temperament, activityLevel: dog.activityLevel, suitableForChildren: dog.suitableForChildren,
    suitableForDogs: dog.suitableForDogs, suitableForCats: dog.suitableForCats, suitableForOtherAnimals: dog.suitableForOtherAnimals,
    apartmentSuitable: dog.apartmentSuitable, beginnerSuitable: dog.beginnerSuitable, needsExperiencedOwner: dog.needsExperiencedOwner,
    vaccinationStatus: dog.vaccinationStatus, chipped: dog.chipped, neutered: dog.neutered, healthNotes: dog.healthNotes,
    specialNeeds: dog.specialNeeds, adoptionRequirements: dog.adoptionRequirements, externalSourceUrl: dog.externalSourceUrl,
    contactEmail: dog.contactEmail, contactPhone: dog.contactPhone, contactUrl: dog.contactUrl, lastVerifiedAt: dog.lastVerifiedAt,
  };
}

export async function resolveBreed(database: AdoptionD1Database, breedId: unknown): Promise<AdoptionBreedReference> {
  const normalizedBreedId = normalizeOptionalPositiveId(breedId, "Plemeno");
  if (normalizedBreedId === null) return { breedId: null, breedName: "", breedSlug: null };
  const row = await database.prepare("SELECT id, name, slug FROM managed_breeds WHERE id = ? LIMIT 1").bind(normalizedBreedId).first<ManagedBreedRow>();
  if (!row) throw new Error("Vybrané plemeno neexistuje v managed_breeds.");
  return { breedId: row.id, breedName: row.name.trim(), breedSlug: row.slug.trim() || null };
}

export async function resolveOrganization(database: AdoptionD1Database, organizationId: unknown): Promise<AdoptionOrganizationReference> {
  const normalizedOrganizationId = normalizeOptionalPositiveId(organizationId, "Organizácia");
  if (normalizedOrganizationId === null) return { organizationId: null, organizationName: "", organizationSlug: null };
  const row = await database.prepare("SELECT id, name, slug FROM help_organizations WHERE id = ? LIMIT 1")
    .bind(normalizedOrganizationId).first<ManagedOrganizationRow>();
  if (!row) throw new Error("Vybraná organizácia neexistuje v help_organizations.");
  return {
    organizationId: Number(row.id),
    organizationName: normalizeAdoptionText(row.name),
    organizationSlug: normalizeAdoptionText(row.slug) || null,
  };
}

function writeValues(input: PreparedAdoptionWrite) {
  return [
    input.name, input.slug, input.status, input.sex, input.birthDate, input.approximateAgeMonths, input.size, input.weight,
    input.breedId, input.breedName, input.breedMix ? 1 : 0, input.color, input.region, input.district, input.city,
    input.organizationId, input.organizationName, input.organizationSlug, input.mainImage, JSON.stringify(input.gallery),
    input.shortDescription, input.description, input.temperament, input.activityLevel, input.suitableForChildren, input.suitableForDogs,
    input.suitableForCats, input.suitableForOtherAnimals, input.apartmentSuitable === null ? null : input.apartmentSuitable ? 1 : 0,
    input.beginnerSuitable === null ? null : input.beginnerSuitable ? 1 : 0, input.needsExperiencedOwner ? 1 : 0,
    input.vaccinationStatus, input.chipped === null ? null : input.chipped ? 1 : 0, input.neutered === null ? null : input.neutered ? 1 : 0,
    input.healthNotes, input.specialNeeds, input.adoptionRequirements, input.externalSourceUrl, input.contactEmail, input.contactPhone,
    input.contactUrl, input.searchText, input.publishedAt, input.lastVerifiedAt, input.updatedAt, input.updatedBy,
  ];
}

export async function prepareAdoptionWritePayload(
  database: AdoptionD1Database,
  payload: ManagedAdoptionInput,
  editorEmail: string,
  existing: AdoptionDog | null = null,
  now = new Date(),
): Promise<PreparedAdoptionWrite> {
  const mergedInput = existing ? { ...dogToInput(existing), ...payload } : payload;
  const organization = await resolveOrganization(database, mergedInput.organizationId);
  const canonicalInput = organization.organizationId === null
    ? mergedInput
    : {
        ...mergedInput,
        organizationId: organization.organizationId,
        organizationName: organization.organizationName,
        organizationSlug: organization.organizationSlug,
      };
  const normalized = normalizeAdoptionInput(canonicalInput);
  if (existing) assertAdoptionStatusTransition(existing.status, normalized.status);
  if (!existing && (normalized.status === "ADOPTED" || normalized.status === "ARCHIVED")) {
    throw new Error("Nový adopčný profil musí začať ako koncept alebo verejný stav.");
  }
  if ((adoptionPublicStatuses as readonly AdoptionStatus[]).includes(normalized.status) && organization.organizationId === null) {
    throw new Error("Verejný adopčný profil musí mať canonical organization_id.");
  }
  const breed = await resolveBreed(database, normalized.breedId);
  const breedName = breed.breedId === null ? normalized.breedName : breed.breedName;
  const preparedBase = {
    ...normalized,
    breedId: breed.breedId,
    breedName,
    organizationId: organization.organizationId,
    organizationName: organization.organizationId === null ? normalized.organizationName : organization.organizationName,
    organizationSlug: organization.organizationId === null ? normalized.organizationSlug : organization.organizationSlug,
  };
  const searchText = buildAdoptionSearchText(preparedBase);
  const timestamp = now.toISOString();
  const publishedAt = (adoptionPublicStatuses as readonly AdoptionStatus[]).includes(normalized.status)
    ? existing?.publishedAt ?? timestamp
    : existing?.publishedAt ?? null;
  return { ...preparedBase, breedSlug: breed.breedSlug, searchText, publishedAt, updatedAt: timestamp, updatedBy: normalizeAdoptionText(editorEmail).toLowerCase() };
}

export function buildPublicAdoptionQuery(filters: AdoptionPublicQueryFilters = {}) {
  const page = Math.max(1, Math.trunc(Number(filters.page) || 1));
  const bindings: unknown[] = [];
  const conditions: string[] = [];
  if (filters.status && (adoptionPublicStatuses as readonly string[]).includes(filters.status)) {
    conditions.push("d.status = ?");
    bindings.push(filters.status);
  } else {
    conditions.push("d.status IN ('ACTIVE','RESERVED')");
  }
  const q = normalizeAdoptionSearchText([filters.q]);
  if (q) { conditions.push("d.search_text LIKE ?"); bindings.push(`%${q}%`); }
  const breedId = Number(filters.breedId);
  if (Number.isSafeInteger(breedId) && breedId > 0) { conditions.push("d.breed_id = ?"); bindings.push(breedId); }
  const region = normalizeAdoptionText(filters.region);
  if ((adoptionRegions as readonly string[]).includes(region)) { conditions.push("d.region = ?"); bindings.push(region); }
  if (filters.sex && isAdoptionSex(filters.sex) && filters.sex !== "UNKNOWN") { conditions.push("d.sex = ?"); bindings.push(filters.sex); }
  if (filters.size && isAdoptionSize(filters.size) && filters.size !== "UNKNOWN") { conditions.push("d.size = ?"); bindings.push(filters.size); }
  if (filters.children) conditions.push("d.suitable_for_children = 'YES'");
  if (filters.dogs) conditions.push("d.suitable_for_dogs = 'YES'");
  if (filters.cats) conditions.push("d.suitable_for_cats = 'YES'");
  if (filters.age && isAdoptionAgeCategory(filters.age)) {
    if (filters.age === "PUPPY") conditions.push(`${AGE_MONTHS_SQL} < 12`);
    if (filters.age === "YOUNG") conditions.push(`${AGE_MONTHS_SQL} >= 12 AND ${AGE_MONTHS_SQL} < 36`);
    if (filters.age === "ADULT") conditions.push(`${AGE_MONTHS_SQL} >= 36 AND ${AGE_MONTHS_SQL} < 96`);
    if (filters.age === "SENIOR") conditions.push(`${AGE_MONTHS_SQL} >= 96`);
  }
  const sort = filters.sort && isAdoptionSort(filters.sort) ? filters.sort : "newest";
  const orderBy = sort === "verified" ? "d.last_verified_at DESC, d.updated_at DESC, d.id DESC"
    : sort === "youngest" ? `${AGE_MONTHS_SQL} ASC, d.updated_at DESC, d.id DESC`
      : sort === "oldest" ? `${AGE_MONTHS_SQL} DESC, d.updated_at DESC, d.id DESC`
        : "COALESCE(d.published_at, d.updated_at) DESC, d.id DESC";
  return { where: conditions.join(" AND "), bindings, orderBy, page, pageSize: ADOPTION_PAGE_SIZE, offset: (page - 1) * ADOPTION_PAGE_SIZE };
}

export function buildAdminAdoptionQuery(filters: AdoptionAdminFilters = {}, now = new Date()) {
  const page = Math.max(1, Math.trunc(Number(filters.page) || 1));
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  const q = normalizeAdoptionSearchText([filters.q]);
  if (q) { conditions.push("search_text LIKE ?"); bindings.push(`%${q}%`); }
  if (filters.status && isAdoptionStatus(filters.status)) { conditions.push("status = ?"); bindings.push(filters.status); }
  const threshold = new Date(now.getTime() - ADOPTION_STALE_DAYS * 86_400_000).toISOString();
  if (filters.stale === "stale") { conditions.push("status IN ('ACTIVE','RESERVED') AND (last_verified_at IS NULL OR last_verified_at < ?)"); bindings.push(threshold); }
  if (filters.stale === "fresh") { conditions.push("status IN ('ACTIVE','RESERVED') AND last_verified_at IS NOT NULL AND last_verified_at >= ?"); bindings.push(threshold); }
  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", bindings, page, pageSize: ADOPTION_ADMIN_PAGE_SIZE, offset: (page - 1) * ADOPTION_ADMIN_PAGE_SIZE };
}

export async function getAdoptionById(id: number, database?: AdoptionD1Database) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const db = requireD1Binding(database);
  const row = await db.prepare(`${PUBLIC_SELECT} WHERE d.id = ? LIMIT 1`).bind(id).first<AdoptionDogRow>();
  return row ? rowToDog(row) : null;
}
export async function getAdoptionBySlug(slug: string, database?: AdoptionD1Database) {
  const normalized = normalizeAdoptionText(slug);
  if (!normalized) return null;
  const db = requireD1Binding(database);
  const row = await db.prepare(`${PUBLIC_SELECT} WHERE d.slug = ? LIMIT 1`).bind(normalized).first<AdoptionDogRow>();
  return row ? rowToDog(row) : null;
}
export async function getPublicAdoptionBySlug(slug: string, database?: AdoptionD1Database) {
  const normalized = normalizeAdoptionText(slug);
  if (!normalized) return null;
  const db = database ?? getD1Binding();
  if (!db) return null;
  const row = await db.prepare(`${PUBLIC_SELECT} WHERE d.slug = ? AND d.status IN ('ACTIVE','RESERVED') LIMIT 1`).bind(normalized).first<AdoptionDogRow>();
  return row ? rowToDog(row) : null;
}

export async function listPublishedAdoptionBreedOptions(database?: AdoptionD1Database) {
  const db = database ?? getD1Binding();
  if (!db) return [] as AdoptionBreedOption[];
  const result = await db.prepare("SELECT id, name, slug FROM managed_breeds WHERE status = 'published' ORDER BY name ASC").all<ManagedBreedRow>();
  return result.results.map((row) => ({ id: Number(row.id), name: row.name, slug: row.slug }));
}

export async function listPublicAdoptions(filters: AdoptionPublicQueryFilters = {}, database?: AdoptionD1Database) {
  const query = buildPublicAdoptionQuery(filters);
  const db = database ?? getD1Binding();
  if (!db) return { items: [] as AdoptionDog[], pagination: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 } };
  const countRow = await db.prepare(`SELECT COUNT(*) AS count FROM adoption_dogs d WHERE ${query.where}`).bind(...query.bindings).first<{ count: number }>();
  const total = Number(countRow?.count ?? 0);
  const result = await db.prepare(`${PUBLIC_SELECT} WHERE ${query.where} ORDER BY ${query.orderBy} LIMIT ? OFFSET ?`)
    .bind(...query.bindings, query.pageSize, query.offset).all<AdoptionDogRow>();
  return { items: result.results.map(rowToDog), pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
}
export const getPublicAdoptions = listPublicAdoptions;

export async function listAllPublicAdoptions(database?: AdoptionD1Database) {
  const db = database ?? getD1Binding();
  if (!db) return [] as AdoptionDog[];
  const result = await db.prepare(`${PUBLIC_SELECT} WHERE d.status IN ('ACTIVE','RESERVED')
    ORDER BY COALESCE(d.published_at, d.updated_at) DESC, d.id DESC`).all<AdoptionDogRow>();
  return result.results.map(rowToDog);
}

export async function getAdoptionLifecycleCounts(database?: AdoptionD1Database) {
  const db = requireD1Binding(database);
  const result = await db.prepare("SELECT status, COUNT(*) AS count FROM adoption_dogs GROUP BY status").all<LifecycleCountRow>();
  const counts = Object.fromEntries(adoptionStatuses.map((status) => [status, 0])) as Record<AdoptionStatus, number>;
  for (const row of result.results) if (isAdoptionStatus(row.status)) counts[row.status] = Number(row.count);
  return counts;
}

export async function listManagedAdoptions(filters: AdoptionAdminFilters = {}, database?: AdoptionD1Database, now = new Date()) {
  const db = requireD1Binding(database);
  const query = buildAdminAdoptionQuery(filters, now);
  const countRow = await db.prepare(`SELECT COUNT(*) AS count FROM adoption_dogs ${query.where}`).bind(...query.bindings).first<{ count: number }>();
  const total = Number(countRow?.count ?? 0);
  const result = await db.prepare(`SELECT id, name, slug, status, sex, size, city, region, organization_name, main_image, last_verified_at, updated_at
      FROM adoption_dogs ${query.where} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`)
    .bind(...query.bindings, query.pageSize, query.offset).all<AdoptionSummaryRow>();
  const threshold = new Date(now.getTime() - ADOPTION_STALE_DAYS * 86_400_000).toISOString();
  const staleRow = await db.prepare("SELECT COUNT(*) AS count FROM adoption_dogs WHERE status IN ('ACTIVE','RESERVED') AND (last_verified_at IS NULL OR last_verified_at < ?)")
    .bind(threshold).first<{ count: number }>();
  const counts = await getAdoptionLifecycleCounts(db);
  const items: ManagedAdoptionSummary[] = result.results.map((row) => ({
    id: Number(row.id), name: row.name, slug: row.slug, status: normalizeRowChoice(row.status, adoptionStatuses, "DRAFT"),
    sex: normalizeRowChoice(row.sex, adoptionSexes, "UNKNOWN"), size: normalizeRowChoice(row.size, adoptionSizes, "UNKNOWN"),
    city: row.city, region: (adoptionRegions as readonly string[]).includes(row.region) ? row.region as AdoptionRegion : "",
    organizationName: row.organization_name, mainImage: row.main_image, lastVerifiedAt: row.last_verified_at, updatedAt: row.updated_at,
  }));
  return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } satisfies AdoptionPagination,
    counts, staleCount: Number(staleRow?.count ?? 0) };
}

async function writeAdoption(database: AdoptionD1Database, payload: ManagedAdoptionInput, editorEmail: string, existing: AdoptionDog | null) {
  const prepared = await prepareAdoptionWritePayload(database, payload, editorEmail, existing);
  const values = writeValues(prepared);
  if (!existing) {
    const columns = [...MUTABLE_COLUMNS, "created_at", "created_by"];
    const row = await database.prepare(`INSERT INTO adoption_dogs (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) RETURNING id`)
      .bind(...values, prepared.updatedAt, prepared.updatedBy).first<{ id: number }>();
    if (!row) throw new Error("Profil psa sa nepodarilo vytvoriť.");
    return getAdoptionById(Number(row.id), database);
  }
  await database.prepare(`UPDATE adoption_dogs SET ${MUTABLE_COLUMNS.map((column) => `${column} = ?`).join(", ")} WHERE id = ?`)
    .bind(...values, existing.id).run();
  return getAdoptionById(existing.id, database);
}

export async function createManagedAdoption(payload: ManagedAdoptionInput, editorEmail: string, database?: AdoptionD1Database) {
  return writeAdoption(requireD1Binding(database), payload, editorEmail, null);
}
export async function updateManagedAdoption(id: number, payload: ManagedAdoptionInput, editorEmail: string, database?: AdoptionD1Database) {
  const db = requireD1Binding(database);
  const existing = await getAdoptionById(id, db);
  if (!existing) return null;
  return writeAdoption(db, payload, editorEmail, existing);
}
export async function transitionManagedAdoptionStatus(id: number, nextStatus: AdoptionStatus, editorEmail: string, database?: AdoptionD1Database) {
  return updateManagedAdoption(id, { status: nextStatus }, editorEmail, database);
}
export function isAdoptionConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("UNIQUE constraint failed") || message.includes("adoption_dogs.slug");
}
