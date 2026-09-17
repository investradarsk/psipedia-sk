import { env } from "cloudflare:workers";
import type { AdoptionD1Database } from "./adoption-store.ts";
import { getOrganizationPublicationAdminById } from "./help-organization-admin-store.ts";
import type { OrganizationPublicationPreflight } from "./help-organization-publication.ts";

type RuntimeBindings = { DB?: AdoptionD1Database };
type RunResult = { meta?: { changes?: number }; changes?: number };

export type OrganizationPublicationAction = "publish" | "unpublish";

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

export function isOrganizationPublicationConflict(error: unknown) {
  return error instanceof OrganizationConcurrentEditError
    || error instanceof OrganizationPublicationBlockedError
    || error instanceof OrganizationPublicationTransitionError;
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
  } else {
    if (existing.status !== "PUBLISHED") {
      throw new OrganizationPublicationTransitionError("Do konceptu možno presunúť iba publikovanú organizáciu.");
    }
    result = await db.prepare(`
      UPDATE help_organizations
      SET status = 'DRAFT', published_at = NULL, updated_at = ?, updated_by = ?
      WHERE id = ? AND updated_at = ? AND status = 'PUBLISHED'
    `).bind(updatedAt, editorEmail, id, expectedUpdatedAt).run() as RunResult;
  }

  const changes = Number(result.meta?.changes ?? result.changes ?? 0);
  if (changes !== 1) throw new OrganizationConcurrentEditError();
  return getOrganizationPublicationAdminById(id, db);
}
