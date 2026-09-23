import { env } from "cloudflare:workers";
import type { AdoptionD1Database } from "./adoption-store.ts";
import { parseOrganizationAdminInput, type OrganizationAdminInput } from "./help-organization-admin-input.ts";
import { getOrganizationPublicationAdminById } from "./help-organization-admin-store.ts";
import type { OrganizationPublicationPreflight } from "./help-organization-publication.ts";
import { ensureResourceForHelpOrganization } from "./canonical-resource.ts";

type RuntimeBindings = { DB?: AdoptionD1Database };
type RunResult = { meta?: { changes?: number; last_row_id?: number }; changes?: number };

export type OrganizationPublicationAction = "publish" | "unpublish" | "archive" | "restore";

function requireD1Binding(database?: AdoptionD1Database) {
  const bound = (env as unknown as RuntimeBindings).DB;
  const resolved = database ?? (bound && typeof bound.prepare === "function" ? bound : null);
  if (!resolved) throw new Error("Databáza organizácií zatiaľ nie je pripojená.");
  return resolved;
}

export class OrganizationConcurrentEditError extends Error {
  constructor() {
    super("Organizácia bola medzitým zmenená. Obnov stránku a skontroluj aktuálny stav pred ďalšou zmenou.");
    this.name = "OrganizationConcurrentEditError";
  }
}

export class OrganizationSlugConflictError extends Error {
  constructor() {
    super("Organizácia s týmto slugom už existuje.");
    this.name = "OrganizationSlugConflictError";
  }
}

export class OrganizationPublicationBlockedError extends Error {
  preflight: OrganizationPublicationPreflight;

  constructor(preflight: OrganizationPublicationPreflight) {
    super("Organizácia nespĺňa publication preflight.");
    this.name = "OrganizationPublicationBlockedError";
    this.preflight = preflight;
  }
}

export class OrganizationPublicationTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationPublicationTransitionError";
  }
}

function isUniqueSlugError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /unique|constraint/i.test(message) && /help_organizations.*slug|slug/i.test(message);
}

export function isOrganizationPublicationConflict(error: unknown) {
  return error instanceof OrganizationConcurrentEditError
    || error instanceof OrganizationPublicationBlockedError
    || error instanceof OrganizationPublicationTransitionError;
}

export function isOrganizationAdminWriteConflict(error: unknown) {
  return error instanceof OrganizationConcurrentEditError
    || error instanceof OrganizationSlugConflictError
    || error instanceof OrganizationPublicationTransitionError;
}

export function buildOrganizationCreateStatement(
  database: AdoptionD1Database,
  input: OrganizationAdminInput,
  editorEmail: string,
  timestamp: string,
  guard?: { submissionId: string; actorRef: string },
) {
  const columns = `name, slug, legal_name, registration_number, type, status,
    short_description, description, public_email, public_phone,
    website_url, facebook_url, instagram_url,
    address, city, district, region, country_code,
    image_url, image_key, directory_profile_id, import_key, source_url,
    source_data_json, seo_json, published_at, last_verified_at, archived_at,
    created_at, updated_at, created_by, updated_by`;
  const beforeStatus = [
    input.name, input.slug, input.legalName, input.registrationNumber, input.type,
  ];
  const afterStatus = [
    input.shortDescription, input.description, input.publicEmail, input.publicPhone,
    input.websiteUrl, input.facebookUrl, input.instagramUrl,
    "", "", "", "", "SK",
    input.imageUrl, input.imageKey, null, null, input.sourceUrl,
    "{}", "{}", null, null, null,
    timestamp, timestamp, editorEmail, editorEmail,
  ];
  const values = [...beforeStatus, ...afterStatus];
  const createValuesSql = `${beforeStatus.map(() => "?").join(", ")}, 'DRAFT', ${afterStatus.map(() => "?").join(", ")}`;
  if (!guard) {
    return database.prepare(`INSERT INTO help_organizations (${columns}) VALUES (${createValuesSql})`).bind(...values);
  }
  return database.prepare(`INSERT INTO help_organizations (${columns})
    SELECT ${createValuesSql}
    WHERE EXISTS(
      SELECT 1 FROM moderation_submissions
      WHERE id=? AND status='APPROVED' AND reviewed_at=? AND reviewed_by=?
    )`).bind(...values, guard.submissionId, timestamp, guard.actorRef);
}

export async function createOrganizationFromAdmin(
  payload: unknown,
  editorEmail: string,
  database?: AdoptionD1Database,
  now = new Date(),
) {
  const input = parseOrganizationAdminInput(payload);
  const db = requireD1Binding(database);
  const timestamp = now.toISOString();
  try {
    const result = await buildOrganizationCreateStatement(db, input, editorEmail, timestamp).run() as RunResult;
    const id = Number(result.meta?.last_row_id ?? 0);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Databáza nevrátila ID novej organizácie.");
    await ensureResourceForHelpOrganization(id, db, now);
    return getOrganizationPublicationAdminById(id, db);
  } catch (error) {
    if (isUniqueSlugError(error)) throw new OrganizationSlugConflictError();
    throw error;
  }
}

export async function updateOrganizationFromAdmin(
  id: number,
  payload: unknown,
  editorEmail: string,
  expectedUpdatedAt: string,
  database?: AdoptionD1Database,
  now = new Date(),
) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (!expectedUpdatedAt?.trim()) throw new OrganizationConcurrentEditError();
  const input: OrganizationAdminInput = parseOrganizationAdminInput(payload);
  const db = requireD1Binding(database);
  const existing = await getOrganizationPublicationAdminById(id, db);
  if (!existing) return null;
  if (existing.updatedAt !== expectedUpdatedAt) throw new OrganizationConcurrentEditError();
  if (existing.status === "ARCHIVED" || existing.archivedAt) {
    throw new OrganizationPublicationTransitionError("Archivovaná organizácia je iba na čítanie. Najprv ju obnov do konceptu.");
  }
  const timestamp = now.toISOString();
  try {
    const result = await db.prepare(`
      UPDATE help_organizations
      SET name = ?, slug = ?, legal_name = ?, registration_number = ?, type = ?,
        short_description = ?, description = ?, public_email = ?, public_phone = ?,
        website_url = ?, facebook_url = ?, instagram_url = ?,
        image_url = ?, image_key = ?, source_url = ?,
        updated_at = ?, updated_by = ?
      WHERE id = ? AND updated_at = ? AND archived_at IS NULL
    `).bind(
      input.name, input.slug, input.legalName, input.registrationNumber, input.type,
      input.shortDescription, input.description, input.publicEmail, input.publicPhone,
      input.websiteUrl, input.facebookUrl, input.instagramUrl,
      input.imageUrl, input.imageKey, input.sourceUrl,
      timestamp, editorEmail, id, expectedUpdatedAt,
    ).run() as RunResult;
    const changes = Number(result.meta?.changes ?? result.changes ?? 0);
    if (changes !== 1) throw new OrganizationConcurrentEditError();
    return getOrganizationPublicationAdminById(id, db);
  } catch (error) {
    if (isUniqueSlugError(error)) throw new OrganizationSlugConflictError();
    throw error;
  }
}

export async function changeOrganizationPublicationFromAdmin(
  id: number,
  action: OrganizationPublicationAction,
  editorEmail: string,
  expectedUpdatedAt: string,
  database?: AdoptionD1Database,
  now = new Date(),
) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (!expectedUpdatedAt?.trim()) throw new OrganizationConcurrentEditError();
  const db = requireD1Binding(database);
  const existing = await getOrganizationPublicationAdminById(id, db);
  if (!existing) return null;
  if (existing.updatedAt !== expectedUpdatedAt) throw new OrganizationConcurrentEditError();

  const updatedAt = now.toISOString();
  let result: RunResult;

  if (action === "publish") {
    if (existing.status !== "DRAFT") {
      throw new OrganizationPublicationTransitionError("Publikovať možno iba organizáciu v stave DRAFT.");
    }
    if (!existing.preflight.ready) throw new OrganizationPublicationBlockedError(existing.preflight);
    result = await db.prepare(`
      UPDATE help_organizations
      SET status = 'PUBLISHED', published_at = ?, updated_at = ?, updated_by = ?
      WHERE id = ? AND updated_at = ? AND status = 'DRAFT' AND archived_at IS NULL
    `).bind(updatedAt, updatedAt, editorEmail, id, expectedUpdatedAt).run() as RunResult;
  } else if (action === "unpublish") {
    if (existing.status !== "PUBLISHED") {
      throw new OrganizationPublicationTransitionError("Do konceptu možno presunúť iba publikovanú organizáciu.");
    }
    result = await db.prepare(`
      UPDATE help_organizations
      SET status = 'DRAFT', published_at = NULL, updated_at = ?, updated_by = ?
      WHERE id = ? AND updated_at = ? AND status = 'PUBLISHED' AND archived_at IS NULL
    `).bind(updatedAt, editorEmail, id, expectedUpdatedAt).run() as RunResult;
  } else if (action === "archive") {
    if (existing.status === "ARCHIVED" || existing.archivedAt) {
      throw new OrganizationPublicationTransitionError("Organizácia už je archivovaná.");
    }
    result = await db.prepare(`
      UPDATE help_organizations
      SET status = 'ARCHIVED', published_at = NULL, archived_at = ?, updated_at = ?, updated_by = ?
      WHERE id = ? AND updated_at = ? AND status IN ('DRAFT', 'PUBLISHED') AND archived_at IS NULL
    `).bind(updatedAt, updatedAt, editorEmail, id, expectedUpdatedAt).run() as RunResult;
  } else {
    if (existing.status !== "ARCHIVED" || !existing.archivedAt) {
      throw new OrganizationPublicationTransitionError("Obnoviť možno iba archivovanú organizáciu.");
    }
    result = await db.prepare(`
      UPDATE help_organizations
      SET status = 'DRAFT', published_at = NULL, archived_at = NULL, updated_at = ?, updated_by = ?
      WHERE id = ? AND updated_at = ? AND status = 'ARCHIVED' AND archived_at IS NOT NULL
    `).bind(updatedAt, editorEmail, id, expectedUpdatedAt).run() as RunResult;
  }

  const changes = Number(result.meta?.changes ?? result.changes ?? 0);
  if (changes !== 1) throw new OrganizationConcurrentEditError();
  return getOrganizationPublicationAdminById(id, db);
}
