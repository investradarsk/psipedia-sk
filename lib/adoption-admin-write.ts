import { env } from "cloudflare:workers";
import type { ManagedAdoptionInput } from "./adoption.ts";
import {
  createManagedAdoption,
  getAdoptionById,
  isAdoptionConflict,
  prepareAdoptionWritePayload,
  type AdoptionD1Database,
  type PreparedAdoptionWrite,
} from "./adoption-store.ts";

export type AdoptionAdminBreedOption = { id: number; name: string; slug: string };
type RuntimeBindings = { DB?: AdoptionD1Database };
type RunResult = { meta?: { changes?: number }; changes?: number };

const MUTABLE_COLUMNS = [
  "name", "slug", "status", "sex", "birth_date", "approximate_age_months", "size", "weight", "breed_id", "breed_name",
  "breed_mix", "color", "region", "district", "city", "organization_id", "organization_name", "organization_slug", "main_image",
  "gallery_json", "short_description", "description", "temperament", "activity_level", "suitable_for_children", "suitable_for_dogs",
  "suitable_for_cats", "suitable_for_other_animals", "apartment_suitable", "beginner_suitable", "needs_experienced_owner",
  "vaccination_status", "chipped", "neutered", "health_notes", "special_needs", "adoption_requirements", "external_source_url",
  "contact_email", "contact_phone", "contact_url", "search_text", "published_at", "last_verified_at", "updated_at", "updated_by",
] as const;

function requireD1Binding(database?: AdoptionD1Database) {
  const bound = (env as unknown as RuntimeBindings).DB;
  const resolved = database ?? (bound && typeof bound.prepare === "function" ? bound : null);
  if (!resolved) throw new Error("Databáza adopcií zatiaľ nie je pripojená.");
  return resolved;
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

export class AdoptionConcurrentEditError extends Error {
  constructor() {
    super("Profil bol medzitým zmenený iným používateľom. Obnov stránku a skontroluj novšiu verziu pred ďalším uložením.");
    this.name = "AdoptionConcurrentEditError";
  }
}

export function isAdoptionConcurrentEditError(error: unknown): error is AdoptionConcurrentEditError {
  return error instanceof AdoptionConcurrentEditError || (error instanceof Error && error.name === "AdoptionConcurrentEditError");
}

export function isAdoptionAdminConflict(error: unknown) {
  return isAdoptionConcurrentEditError(error) || isAdoptionConflict(error);
}

export async function listAdoptionAdminBreedOptions(database?: AdoptionD1Database) {
  const db = requireD1Binding(database);
  const result = await db.prepare("SELECT id, name, slug FROM managed_breeds ORDER BY name COLLATE NOCASE ASC").all<AdoptionAdminBreedOption>();
  return result.results.map((row) => ({ id: Number(row.id), name: row.name, slug: row.slug }));
}

export async function createAdoptionFromAdmin(payload: ManagedAdoptionInput, editorEmail: string, database?: AdoptionD1Database) {
  const db = requireD1Binding(database);
  const safePayload = payload.status === undefined || payload.status === null || payload.status === ""
    ? { ...payload, status: "DRAFT" }
    : payload;
  return createManagedAdoption(safePayload, editorEmail, db);
}

export async function updateAdoptionFromAdmin(
  id: number,
  payload: ManagedAdoptionInput,
  editorEmail: string,
  expectedUpdatedAt: string,
  database?: AdoptionD1Database,
) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (!expectedUpdatedAt?.trim()) throw new AdoptionConcurrentEditError();
  const db = requireD1Binding(database);
  const existing = await getAdoptionById(id, db);
  if (!existing) return null;
  if (existing.updatedAt !== expectedUpdatedAt) throw new AdoptionConcurrentEditError();

  const prepared = await prepareAdoptionWritePayload(db, payload, editorEmail, existing);
  const result = await db.prepare(
    `UPDATE adoption_dogs SET ${MUTABLE_COLUMNS.map((column) => `${column} = ?`).join(", ")} WHERE id = ? AND updated_at = ?`,
  ).bind(...writeValues(prepared), id, expectedUpdatedAt).run() as RunResult;
  const changes = Number(result.meta?.changes ?? result.changes ?? 0);
  if (changes !== 1) throw new AdoptionConcurrentEditError();
  return getAdoptionById(id, db);
}
