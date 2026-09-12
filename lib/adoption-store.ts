import { env } from "cloudflare:workers";
import { cache } from "react";
import { slugifyArticleTitle } from "@/lib/article-store";
import { slovakRegions, type SlovakRegion } from "@/lib/events";
import {
  ADOPTION_ADMIN_PAGE_SIZE,
  ADOPTION_NOINDEX_STALE_DAYS,
  ADOPTION_PAGE_SIZE,
  ADOPTION_STALE_DAYS,
  adoptionActivityLevels,
  adoptionCompatibilityValues,
  adoptionSexes,
  adoptionSizes,
  adoptionStatuses,
  adoptionVaccinationStatuses,
  isAdoptionSort,
  type AdoptionActivityLevel,
  type AdoptionAdminFilters,
  type AdoptionCompatibility,
  type AdoptionDog,
  type AdoptionPublicFilters,
  type AdoptionSex,
  type AdoptionSize,
  type AdoptionStatus,
  type AdoptionVaccinationStatus,
} from "@/lib/adoption";

type RuntimeBindings = { DB?: D1Database };

type AdoptionDogRow = {
  id: number; name: string; slug: string; status: string; sex: string; birth_date: string | null;
  approximate_age_months: number | null; size: string; weight: number | null; breed_id: number | null;
  breed_name: string; breed_slug: string | null; breed_profile_name: string | null; breed_mix: number; color: string;
  region: string; district: string; city: string; organization_id: number | null; organization_name: string;
  organization_slug: string | null; main_image: string | null; gallery_json: string; short_description: string;
  description: string; temperament: string; activity_level: string; suitable_for_children: string;
  suitable_for_dogs: string; suitable_for_cats: string; suitable_for_other_animals: string;
  apartment_suitable: number | null; beginner_suitable: number | null; needs_experienced_owner: number;
  vaccination_status: string; chipped: number | null; neutered: number | null; health_notes: string;
  special_needs: string; adoption_requirements: string; external_source_url: string | null; contact_email: string | null;
  contact_phone: string | null; contact_url: string | null; published_at: string | null; last_verified_at: string | null;
  created_at: string; updated_at: string; created_by: string; updated_by: string;
};

type AdoptionSummaryRow = {
  id: number; name: string; slug: string; status: string; sex: string; size: string; city: string; region: string;
  organization_name: string; main_image: string | null; last_verified_at: string | null; updated_at: string;
};

export type ManagedAdoptionInput = Partial<{
  name: string; slug: string; status: string; sex: string; birthDate: string | null; approximateAgeMonths: number | string | null;
  size: string; weight: number | string | null; breedId: number | string | null; breedName: string; breedMix: boolean; color: string;
  region: string; district: string; city: string; organizationId: number | string | null; organizationName: string; organizationSlug: string | null;
  mainImage: string | null; gallery: string[] | string; shortDescription: string; description: string; temperament: string;
  activityLevel: string; suitableForChildren: string; suitableForDogs: string; suitableForCats: string; suitableForOtherAnimals: string;
  apartmentSuitable: boolean | null; beginnerSuitable: boolean | null; needsExperiencedOwner: boolean;
  vaccinationStatus: string; chipped: boolean | null; neutered: boolean | null; healthNotes: string; specialNeeds: string;
  adoptionRequirements: string; externalSourceUrl: string | null; contactEmail: string | null; contactPhone: string | null;
  contactUrl: string | null; lastVerifiedAt: string | null;
}>;

export type ManagedAdoptionSummary = {
  id: number; name: string; slug: string; status: AdoptionStatus; sex: AdoptionSex; size: AdoptionSize; city: string; region: string;
  organizationName: string; mainImage: string | null; lastVerifiedAt: string | null; updatedAt: string;
};

export type BreedOption = { id: number; name: string; slug: string };

function getD1Binding() {
  const database = (env as unknown as RuntimeBindings).DB;
  return database && typeof database.prepare === "function" ? database : null;
}

function requireD1Binding() {
  const database = getD1Binding();
  if (!database) throw new Error("Databáza adopcií zatiaľ nie je pripojená.");
  return database;
}

function oneOf<T extends string>(value: string | undefined, values: readonly T[], fallback: T): T {
  return value && (values as readonly string[]).includes(value) ? value as T : fallback;
}

function parseGallery(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 20) : [];
  } catch { return []; }
}

function rowToDog(row: AdoptionDogRow): AdoptionDog {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: oneOf(row.status, adoptionStatuses, "DRAFT"),
    sex: oneOf(row.sex, adoptionSexes, "UNKNOWN"),
    birthDate: row.birth_date,
    approximateAgeMonths: row.approximate_age_months,
    size: oneOf(row.size, adoptionSizes, "UNKNOWN"),
    weight: row.weight,
    breedId: row.breed_id,
    breedName: row.breed_name || row.breed_profile_name || "",
    breedSlug: row.breed_slug,
    breedMix: Boolean(row.breed_mix),
    color: row.color,
    region: ((slovakRegions as readonly string[]).includes(row.region) && row.region !== "Online" ? row.region : "") as SlovakRegion | "",
    district: row.district,
    city: row.city,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    mainImage: row.main_image,
    gallery: parseGallery(row.gallery_json),
    shortDescription: row.short_description,
    description: row.description,
    temperament: row.temperament,
    activityLevel: oneOf(row.activity_level, adoptionActivityLevels, "UNKNOWN"),
    suitableForChildren: oneOf(row.suitable_for_children, adoptionCompatibilityValues, "UNKNOWN"),
    suitableForDogs: oneOf(row.suitable_for_dogs, adoptionCompatibilityValues, "UNKNOWN"),
    suitableForCats: oneOf(row.suitable_for_cats, adoptionCompatibilityValues, "UNKNOWN"),
    suitableForOtherAnimals: oneOf(row.suitable_for_other_animals, adoptionCompatibilityValues, "UNKNOWN"),
    apartmentSuitable: row.apartment_suitable === null ? null : Boolean(row.apartment_suitable),
    beginnerSuitable: row.beginner_suitable === null ? null : Boolean(row.beginner_suitable),
    needsExperiencedOwner: Boolean(row.needs_experienced_owner),
    vaccinationStatus: oneOf(row.vaccination_status, adoptionVaccinationStatuses, "UNKNOWN"),
    chipped: row.chipped === null ? null : Boolean(row.chipped),
    neutered: row.neutered === null ? null : Boolean(row.neutered),
    healthNotes: row.health_notes,
    specialNeeds: row.special_needs,
    adoptionRequirements: row.adoption_requirements,
    externalSourceUrl: row.external_source_url,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    contactUrl: row.contact_url,
    publishedAt: row.published_at,
    lastVerifiedAt: row.last_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function normalizeText(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function normalizeNullableText(value: unknown) { const text = normalizeText(value); return text || null; }
function normalizeInteger(value: unknown, label: string, min = 0, max = 1_000_000) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${label} nie je platné celé číslo.`);
  return number;
}
function normalizeDecimal(value: unknown, label: string, min = 0, max = 500) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label} nie je platné číslo.`);
  return Math.round(number * 10) / 10;
}
function normalizeDate(value: unknown, label: string) {
  const text = normalizeText(value);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T12:00:00Z`).getTime())) throw new Error(`${label} nie je platný dátum.`);
  return text;
}
function normalizeDateTime(value: unknown, label: string) {
  const text = normalizeText(value);
  if (!text) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00Z`) : new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} nie je platný dátum.`);
  return date.toISOString();
}
function normalizeUrl(value: unknown, label: string) {
  const text = normalizeText(value);
  if (!text) return null;
  if (text.startsWith("/media/") || text.startsWith("/images/")) return text;
  let url: URL;
  try { url = new URL(text); } catch { throw new Error(`${label} nie je platná URL.`); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`${label} musí používať http:// alebo https://.`);
  return text;
}
function normalizeEmail(value: unknown) {
  const text = normalizeText(value);
  if (!text) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error("Kontaktný e-mail nie je platný.");
  return text;
}
function normalizeGallery(value: unknown) {
  const entries = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : [];
  return entries.map((entry) => normalizeUrl(entry, "Adresa fotografie")).filter((entry): entry is string => Boolean(entry)).slice(0, 20);
}
function normalizeBoolean(value: unknown) { return typeof value === "boolean" ? value : null; }
function searchText(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("sk").replace(/\s+/g, " ").trim();
}

function normalizeInput(payload: ManagedAdoptionInput) {
  const name = normalizeText(payload.name);
  const slug = slugifyArticleTitle(normalizeText(payload.slug) || name);
  const status = oneOf(normalizeText(payload.status), adoptionStatuses, "DRAFT");
  const sex = oneOf(normalizeText(payload.sex), adoptionSexes, "UNKNOWN");
  const size = oneOf(normalizeText(payload.size), adoptionSizes, "UNKNOWN");
  const activityLevel = oneOf(normalizeText(payload.activityLevel), adoptionActivityLevels, "UNKNOWN");
  const suitableForChildren = oneOf(normalizeText(payload.suitableForChildren), adoptionCompatibilityValues, "UNKNOWN");
  const suitableForDogs = oneOf(normalizeText(payload.suitableForDogs), adoptionCompatibilityValues, "UNKNOWN");
  const suitableForCats = oneOf(normalizeText(payload.suitableForCats), adoptionCompatibilityValues, "UNKNOWN");
  const suitableForOtherAnimals = oneOf(normalizeText(payload.suitableForOtherAnimals), adoptionCompatibilityValues, "UNKNOWN");
  const vaccinationStatus = oneOf(normalizeText(payload.vaccinationStatus), adoptionVaccinationStatuses, "UNKNOWN");
  const birthDate = normalizeDate(payload.birthDate, "Dátum narodenia");
  const approximateAgeMonths = normalizeInteger(payload.approximateAgeMonths, "Približný vek", 0, 360);
  const weight = normalizeDecimal(payload.weight, "Hmotnosť");
  const breedId = normalizeInteger(payload.breedId, "Plemeno", 1);
  const organizationId = normalizeInteger(payload.organizationId, "Organizácia", 1);
  const breedName = normalizeText(payload.breedName);
  const color = normalizeText(payload.color);
  const regionValue = normalizeText(payload.region);
  const region = (slovakRegions as readonly string[]).includes(regionValue) && regionValue !== "Online" ? regionValue as SlovakRegion : "";
  const district = normalizeText(payload.district);
  const city = normalizeText(payload.city);
  const organizationName = normalizeText(payload.organizationName);
  const organizationSlug = normalizeNullableText(payload.organizationSlug);
  const mainImage = normalizeUrl(payload.mainImage, "Hlavná fotografia");
  const gallery = normalizeGallery(payload.gallery);
  const shortDescription = normalizeText(payload.shortDescription);
  const description = normalizeText(payload.description);
  const temperament = normalizeText(payload.temperament);
  const healthNotes = normalizeText(payload.healthNotes);
  const specialNeeds = normalizeText(payload.specialNeeds);
  const adoptionRequirements = normalizeText(payload.adoptionRequirements);
  const externalSourceUrl = normalizeUrl(payload.externalSourceUrl, "Externý zdroj");
  const contactUrl = normalizeUrl(payload.contactUrl, "Kontaktný odkaz");
  const contactEmail = normalizeEmail(payload.contactEmail);
  const contactPhone = normalizeNullableText(payload.contactPhone);
  const lastVerifiedAt = normalizeDateTime(payload.lastVerifiedAt, "Posledné overenie");

  if (!name) throw new Error("Doplň meno psa.");
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Adresa profilu nie je platná.");
  if (birthDate && approximateAgeMonths !== null) throw new Error("Použi dátum narodenia alebo približný vek, nie oboje naraz.");
  if ((status === "ACTIVE" || status === "RESERVED") && (!birthDate && approximateAgeMonths === null)) throw new Error("Pred zverejnením doplň dátum narodenia alebo približný vek.");
  if ((status === "ACTIVE" || status === "RESERVED") && sex === "UNKNOWN") throw new Error("Pred zverejnením doplň pohlavie.");
  if ((status === "ACTIVE" || status === "RESERVED") && size === "UNKNOWN") throw new Error("Pred zverejnením doplň veľkosť.");
  if ((status === "ACTIVE" || status === "RESERVED") && (!region || !city)) throw new Error("Pred zverejnením doplň kraj a mesto.");
  if ((status === "ACTIVE" || status === "RESERVED") && !organizationName) throw new Error("Pred zverejnením doplň organizáciu alebo zodpovednú osobu.");
  if ((status === "ACTIVE" || status === "RESERVED") && !mainImage) throw new Error("Pred zverejnením doplň hlavnú fotografiu.");
  if ((status === "ACTIVE" || status === "RESERVED") && shortDescription.length < 30) throw new Error("Krátky popis musí mať pred zverejnením aspoň 30 znakov.");
  if ((status === "ACTIVE" || status === "RESERVED") && description.length < 80) throw new Error("Príbeh psa musí mať pred zverejnením aspoň 80 znakov.");
  if (status === "ACTIVE" && !lastVerifiedAt) throw new Error("Aktívny profil musí mať dátum posledného overenia.");

  return {
    name, slug, status, sex, birthDate, approximateAgeMonths, size, weight, breedId, breedName,
    breedMix: Boolean(payload.breedMix), color, region, district, city, organizationId, organizationName,
    organizationSlug, mainImage, gallery, shortDescription, description, temperament, activityLevel,
    suitableForChildren, suitableForDogs, suitableForCats, suitableForOtherAnimals,
    apartmentSuitable: normalizeBoolean(payload.apartmentSuitable), beginnerSuitable: normalizeBoolean(payload.beginnerSuitable),
    needsExperiencedOwner: Boolean(payload.needsExperiencedOwner), vaccinationStatus,
    chipped: normalizeBoolean(payload.chipped), neutered: normalizeBoolean(payload.neutered), healthNotes, specialNeeds,
    adoptionRequirements, externalSourceUrl, contactEmail, contactPhone, contactUrl, lastVerifiedAt,
    searchText: searchText([name, breedName, color, region, district, city, organizationName, shortDescription, temperament]),
  };
}

const PUBLIC_SELECT = `SELECT d.*, b.slug AS breed_slug, b.name AS breed_profile_name
  FROM adoption_dogs d
  LEFT JOIN managed_breeds b ON b.id = d.breed_id AND b.status = 'published'`;
const AGE_MONTHS_SQL = `COALESCE(d.approximate_age_months, CAST((julianday('now') - julianday(d.birth_date)) / 30.4375 AS INTEGER))`;

export async function getPublicAdoptions(filters: AdoptionPublicFilters = {}) {
  const database = getD1Binding();
  const page = Math.max(1, Math.trunc(filters.page || 1));
  if (!database) return { items: [] as AdoptionDog[], pagination: { page, pageSize: ADOPTION_PAGE_SIZE, total: 0, totalPages: 0 } };
  const status = filters.status && ["ACTIVE", "RESERVED", "ADOPTED"].includes(filters.status) ? filters.status : "ACTIVE";
  const conditions = ["d.status = ?"];
  const bindings: unknown[] = [status];
  const q = normalizeText(filters.q);
  if (q) { conditions.push("d.search_text LIKE ?"); bindings.push(`%${searchText([q])}%`); }
  if (filters.region) { conditions.push("d.region = ?"); bindings.push(filters.region); }
  if (filters.sex && filters.sex !== "UNKNOWN") { conditions.push("d.sex = ?"); bindings.push(filters.sex); }
  if (filters.size && filters.size !== "UNKNOWN") { conditions.push("d.size = ?"); bindings.push(filters.size); }
  if (filters.children) conditions.push("d.suitable_for_children = 'YES'");
  if (filters.dogs) conditions.push("d.suitable_for_dogs = 'YES'");
  if (filters.cats) conditions.push("d.suitable_for_cats = 'YES'");
  if (filters.age === "PUPPY") conditions.push(`${AGE_MONTHS_SQL} < 12`);
  if (filters.age === "YOUNG") conditions.push(`${AGE_MONTHS_SQL} >= 12 AND ${AGE_MONTHS_SQL} < 36`);
  if (filters.age === "ADULT") conditions.push(`${AGE_MONTHS_SQL} >= 36 AND ${AGE_MONTHS_SQL} < 96`);
  if (filters.age === "SENIOR") conditions.push(`${AGE_MONTHS_SQL} >= 96`);
  const where = conditions.join(" AND ");
  const sort = filters.sort && isAdoptionSort(filters.sort) ? filters.sort : "newest";
  const order = sort === "verified" ? "d.last_verified_at DESC, d.updated_at DESC, d.id DESC"
    : sort === "youngest" ? `${AGE_MONTHS_SQL} ASC, d.updated_at DESC`
      : sort === "oldest" ? `${AGE_MONTHS_SQL} DESC, d.updated_at DESC`
        : "COALESCE(d.published_at, d.updated_at) DESC, d.id DESC";
  const totalRow = await database.prepare(`SELECT COUNT(*) AS count FROM adoption_dogs d WHERE ${where}`).bind(...bindings).first<{ count: number }>();
  const total = Number(totalRow?.count || 0);
  const totalPages = Math.ceil(total / ADOPTION_PAGE_SIZE);
  const offset = (page - 1) * ADOPTION_PAGE_SIZE;
  const result = await database.prepare(`${PUBLIC_SELECT} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...bindings, ADOPTION_PAGE_SIZE, offset).all<AdoptionDogRow>();
  return { items: result.results.map(rowToDog), pagination: { page, pageSize: ADOPTION_PAGE_SIZE, total, totalPages } };
}

const getPublicAdoptionBySlugUncached = async (slug: string) => {
  const database = getD1Binding();
  if (!database) return null;
  const row = await database.prepare(`${PUBLIC_SELECT} WHERE d.slug = ? AND d.status <> 'DRAFT' LIMIT 1`).bind(slug).first<AdoptionDogRow>();
  return row ? rowToDog(row) : null;
};
export const getPublicAdoptionBySlug = cache(getPublicAdoptionBySlugUncached);

export async function listIndexableAdoptions(limit = 2000) {
  const database = getD1Binding();
  if (!database) return [] as Array<{ slug: string; updatedAt: string; mainImage: string | null }>;
  const safeLimit = Math.max(1, Math.min(5000, Math.trunc(limit)));
  const threshold = new Date(Date.now() - ADOPTION_NOINDEX_STALE_DAYS * 86400000).toISOString();
  const result = await database.prepare(`SELECT slug, updated_at, main_image FROM adoption_dogs
    WHERE status = 'ACTIVE' AND main_image IS NOT NULL AND LENGTH(TRIM(description)) >= 80
      AND last_verified_at IS NOT NULL AND last_verified_at >= ?
    ORDER BY updated_at DESC LIMIT ?`).bind(threshold, safeLimit).all<{ slug: string; updated_at: string; main_image: string | null }>();
  return result.results.map((row) => ({ slug: row.slug, updatedAt: row.updated_at, mainImage: row.main_image }));
}

export async function listManagedAdoptions(filters: AdoptionAdminFilters = {}) {
  const database = requireD1Binding();
  const page = Math.max(1, Math.trunc(filters.page || 1));
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  const q = normalizeText(filters.q);
  if (q) { conditions.push("search_text LIKE ?"); bindings.push(`%${searchText([q])}%`); }
  if (filters.status && (adoptionStatuses as readonly string[]).includes(filters.status)) { conditions.push("status = ?"); bindings.push(filters.status); }
  const staleThreshold = new Date(Date.now() - ADOPTION_STALE_DAYS * 86400000).toISOString();
  if (filters.stale === "stale") { conditions.push("status IN ('ACTIVE','RESERVED') AND (last_verified_at IS NULL OR last_verified_at < ?)"); bindings.push(staleThreshold); }
  if (filters.stale === "fresh") { conditions.push("last_verified_at IS NOT NULL AND last_verified_at >= ?"); bindings.push(staleThreshold); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const countRow = await database.prepare(`SELECT COUNT(*) AS count FROM adoption_dogs ${where}`).bind(...bindings).first<{ count: number }>();
  const total = Number(countRow?.count || 0);
  const totalPages = Math.ceil(total / ADOPTION_ADMIN_PAGE_SIZE);
  const offset = (page - 1) * ADOPTION_ADMIN_PAGE_SIZE;
  const result = await database.prepare(`SELECT id, name, slug, status, sex, size, city, region, organization_name, main_image, last_verified_at, updated_at
    FROM adoption_dogs ${where} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`)
    .bind(...bindings, ADOPTION_ADMIN_PAGE_SIZE, offset).all<AdoptionSummaryRow>();
  const countsRows = await database.prepare("SELECT status, COUNT(*) AS count FROM adoption_dogs GROUP BY status").all<{ status: string; count: number }>();
  const counts = Object.fromEntries(adoptionStatuses.map((status) => [status, 0])) as Record<AdoptionStatus, number>;
  for (const row of countsRows.results) if ((adoptionStatuses as readonly string[]).includes(row.status)) counts[row.status as AdoptionStatus] = Number(row.count);
  const staleRow = await database.prepare("SELECT COUNT(*) AS count FROM adoption_dogs WHERE status IN ('ACTIVE','RESERVED') AND (last_verified_at IS NULL OR last_verified_at < ?)")
    .bind(staleThreshold).first<{ count: number }>();
  const items: ManagedAdoptionSummary[] = result.results.map((row) => ({
    id: row.id, name: row.name, slug: row.slug, status: oneOf(row.status, adoptionStatuses, "DRAFT"),
    sex: oneOf(row.sex, adoptionSexes, "UNKNOWN"), size: oneOf(row.size, adoptionSizes, "UNKNOWN"), city: row.city,
    region: row.region, organizationName: row.organization_name, mainImage: row.main_image,
    lastVerifiedAt: row.last_verified_at, updatedAt: row.updated_at,
  }));
  return { items, pagination: { page, pageSize: ADOPTION_ADMIN_PAGE_SIZE, total, totalPages }, counts, staleCount: Number(staleRow?.count || 0) };
}

export async function getManagedAdoptionById(id: number) {
  const database = requireD1Binding();
  const row = await database.prepare(`${PUBLIC_SELECT} WHERE d.id = ? LIMIT 1`).bind(id).first<AdoptionDogRow>();
  return row ? rowToDog(row) : null;
}

export async function listAdoptionBreedOptions() {
  const database = requireD1Binding();
  const result = await database.prepare("SELECT id, name, slug FROM managed_breeds WHERE status = 'published' ORDER BY name ASC").all<BreedOption>();
  return result.results;
}

async function writeAdoption(database: D1Database, payload: ManagedAdoptionInput, editorEmail: string, existing?: AdoptionDog | null) {
  const input = normalizeInput(payload);
  const now = new Date().toISOString();
  const publishedAt = input.status === "DRAFT" ? existing?.publishedAt ?? null : existing?.publishedAt ?? now;
  const values = [
    input.name, input.slug, input.status, input.sex, input.birthDate, input.approximateAgeMonths, input.size, input.weight,
    input.breedId, input.breedName, input.breedMix ? 1 : 0, input.color, input.region, input.district, input.city,
    input.organizationId, input.organizationName, input.organizationSlug, input.mainImage, JSON.stringify(input.gallery),
    input.shortDescription, input.description, input.temperament, input.activityLevel, input.suitableForChildren, input.suitableForDogs,
    input.suitableForCats, input.suitableForOtherAnimals, input.apartmentSuitable === null ? null : input.apartmentSuitable ? 1 : 0,
    input.beginnerSuitable === null ? null : input.beginnerSuitable ? 1 : 0, input.needsExperiencedOwner ? 1 : 0,
    input.vaccinationStatus, input.chipped === null ? null : input.chipped ? 1 : 0, input.neutered === null ? null : input.neutered ? 1 : 0,
    input.healthNotes, input.specialNeeds, input.adoptionRequirements, input.externalSourceUrl, input.contactEmail, input.contactPhone,
    input.contactUrl, input.searchText, publishedAt, input.lastVerifiedAt, now, editorEmail,
  ];
  if (!existing) {
    const row = await database.prepare(`INSERT INTO adoption_dogs (
      name, slug, status, sex, birth_date, approximate_age_months, size, weight, breed_id, breed_name, breed_mix, color,
      region, district, city, organization_id, organization_name, organization_slug, main_image, gallery_json,
      short_description, description, temperament, activity_level, suitable_for_children, suitable_for_dogs, suitable_for_cats,
      suitable_for_other_animals, apartment_suitable, beginner_suitable, needs_experienced_owner, vaccination_status, chipped,
      neutered, health_notes, special_needs, adoption_requirements, external_source_url, contact_email, contact_phone, contact_url,
      search_text, published_at, last_verified_at, created_at, updated_at, created_by, updated_by
    ) VALUES (${Array.from({ length: 48 }, () => "?").join(", ")}) RETURNING id`)
      .bind(...values.slice(0, 44), now, now, editorEmail, editorEmail).first<{ id: number }>();
    if (!row) throw new Error("Profil psa sa nepodarilo vytvoriť.");
    return getManagedAdoptionById(row.id);
  }
  await database.prepare(`UPDATE adoption_dogs SET
    name=?, slug=?, status=?, sex=?, birth_date=?, approximate_age_months=?, size=?, weight=?, breed_id=?, breed_name=?, breed_mix=?, color=?,
    region=?, district=?, city=?, organization_id=?, organization_name=?, organization_slug=?, main_image=?, gallery_json=?, short_description=?,
    description=?, temperament=?, activity_level=?, suitable_for_children=?, suitable_for_dogs=?, suitable_for_cats=?, suitable_for_other_animals=?,
    apartment_suitable=?, beginner_suitable=?, needs_experienced_owner=?, vaccination_status=?, chipped=?, neutered=?, health_notes=?, special_needs=?,
    adoption_requirements=?, external_source_url=?, contact_email=?, contact_phone=?, contact_url=?, search_text=?, published_at=?, last_verified_at=?,
    updated_at=?, updated_by=? WHERE id=?`)
    .bind(...values, existing.id).run();
  return getManagedAdoptionById(existing.id);
}

export async function createManagedAdoption(payload: ManagedAdoptionInput, editorEmail: string) {
  return writeAdoption(requireD1Binding(), payload, editorEmail);
}

export async function updateManagedAdoption(id: number, payload: ManagedAdoptionInput, editorEmail: string) {
  const existing = await getManagedAdoptionById(id);
  if (!existing) return null;
  return writeAdoption(requireD1Binding(), payload, editorEmail, existing);
}

export function isAdoptionConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("UNIQUE constraint failed") || message.includes("adoption_dogs.slug");
}
