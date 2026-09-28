import type { AdoptionD1Database } from "./adoption-store.ts";
import {
  normalizeOrganizationFundraisingAdminInput,
  type OrganizationFundraisingAdminEditableInput,
} from "./organization-fundraising-admin.ts";
import { shouldResetOrganizationFundraisingVerification } from "./organization-fundraising-contract.ts";
import {
  getOrganizationFundraisingAdminOrganization,
  getOrganizationFundraisingMethodAdmin,
  requireOrganizationFundraisingD1,
} from "./organization-fundraising-admin-store.ts";

type RunResult = {
  meta?: { changes?: number; last_row_id?: number | bigint };
  changes?: number;
  lastRowId?: number | bigint;
};

export class OrganizationFundraisingConcurrentEditError extends Error {
  constructor() {
    super("Fundraising metóda bola medzitým zmenená. Obnov stránku a skontroluj aktuálnu verziu.");
    this.name = "OrganizationFundraisingConcurrentEditError";
  }
}

export class OrganizationFundraisingLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationFundraisingLifecycleError";
  }
}

export function isOrganizationFundraisingAdminConflict(error: unknown) {
  return error instanceof OrganizationFundraisingConcurrentEditError
    || error instanceof OrganizationFundraisingLifecycleError;
}

function editorRef(editorEmail: string) {
  const normalized = editorEmail.trim().toLowerCase();
  if (!normalized) throw new Error("Chýba audit identita administrátora.");
  return normalized;
}

async function requireMutableOrganization(organizationId: number, database: AdoptionD1Database) {
  const organization = await getOrganizationFundraisingAdminOrganization(organizationId, database);
  if (!organization) return null;
  if (organization.status === "ARCHIVED" || organization.archivedAt) {
    throw new OrganizationFundraisingLifecycleError("Archivovanej organizácii nemožno meniť fundraising metódy.");
  }
  return organization;
}

function writeBindings(input: OrganizationFundraisingAdminEditableInput) {
  return [
    input.type,
    input.label,
    input.url,
    input.value,
    input.instructions,
    input.beneficiaryIdentity,
    input.ownership,
    input.sortOrder,
    input.isActive ? 1 : 0,
  ];
}

export async function createOrganizationFundraisingMethodFromAdmin(
  organizationId: number,
  payload: unknown,
  editorEmail: string,
  database?: AdoptionD1Database,
  now = new Date(),
) {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return null;
  const db = requireOrganizationFundraisingD1(database);
  const organization = await requireMutableOrganization(organizationId, db);
  if (!organization) return null;
  const input = normalizeOrganizationFundraisingAdminInput(payload, "create");
  const timestamp = now.toISOString();
  const actor = editorRef(editorEmail);
  const result = await db.prepare(`
    INSERT INTO organization_fundraising_methods (
      organization_id, type, label, url, value, instructions, beneficiary_identity, ownership, sort_order,
      is_active, verification_status, version, created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'UNVERIFIED', 1, ?, ?, ?, ?)
  `).bind(
    organizationId,
    input.type,
    input.label,
    input.url,
    input.value,
    input.instructions,
    input.beneficiaryIdentity,
    input.ownership,
    input.sortOrder,
    timestamp,
    timestamp,
    actor,
    actor,
  ).run() as RunResult;

  const insertedId = Number(result.meta?.last_row_id ?? result.lastRowId ?? 0);
  if (!Number.isSafeInteger(insertedId) || insertedId <= 0) {
    throw new Error("Fundraising metóda sa síce zapísala, ale databáza nevrátila platné ID.");
  }
  return getOrganizationFundraisingMethodAdmin(organizationId, insertedId, db);
}

export async function updateOrganizationFundraisingMethodFromAdmin(
  organizationId: number,
  methodId: number,
  payload: unknown,
  editorEmail: string,
  expectedVersion: number,
  database?: AdoptionD1Database,
  now = new Date(),
) {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return null;
  if (!Number.isSafeInteger(methodId) || methodId <= 0) return null;
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion <= 0) {
    throw new OrganizationFundraisingConcurrentEditError();
  }
  const db = requireOrganizationFundraisingD1(database);
  const organization = await requireMutableOrganization(organizationId, db);
  if (!organization) return null;
  const existing = await getOrganizationFundraisingMethodAdmin(organizationId, methodId, db);
  if (!existing) return null;
  if (existing.archivedAt) {
    throw new OrganizationFundraisingLifecycleError("Archivovanú fundraising metódu už nemožno upravovať.");
  }
  if (existing.version !== expectedVersion) throw new OrganizationFundraisingConcurrentEditError();

  const input = normalizeOrganizationFundraisingAdminInput(payload, "update");
  const resetVerification = shouldResetOrganizationFundraisingVerification(existing, input);
  const timestamp = now.toISOString();
  const actor = editorRef(editorEmail);
  const resetSql = resetVerification
    ? ", verification_status = 'UNVERIFIED', verified_at = NULL, verified_by = NULL, verification_source_url = NULL, verification_expires_at = NULL"
    : "";
  const result = await db.prepare(`
    UPDATE organization_fundraising_methods
    SET type = ?, label = ?, url = ?, value = ?, instructions = ?, beneficiary_identity = ?, ownership = ?,
      sort_order = ?, is_active = ?${resetSql}, version = version + 1, updated_at = ?, updated_by = ?
    WHERE id = ? AND organization_id = ? AND version = ? AND archived_at IS NULL
  `).bind(
    ...writeBindings(input),
    timestamp,
    actor,
    methodId,
    organizationId,
    expectedVersion,
  ).run() as RunResult;
  const changes = Number(result.meta?.changes ?? result.changes ?? 0);
  if (changes !== 1) throw new OrganizationFundraisingConcurrentEditError();
  return getOrganizationFundraisingMethodAdmin(organizationId, methodId, db);
}

export async function archiveOrganizationFundraisingMethodFromAdmin(
  organizationId: number,
  methodId: number,
  editorEmail: string,
  expectedVersion: number,
  database?: AdoptionD1Database,
  now = new Date(),
) {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return null;
  if (!Number.isSafeInteger(methodId) || methodId <= 0) return null;
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion <= 0) {
    throw new OrganizationFundraisingConcurrentEditError();
  }
  const db = requireOrganizationFundraisingD1(database);
  const organization = await getOrganizationFundraisingAdminOrganization(organizationId, db);
  if (!organization) return null;
  const existing = await getOrganizationFundraisingMethodAdmin(organizationId, methodId, db);
  if (!existing) return null;
  if (existing.archivedAt) {
    throw new OrganizationFundraisingLifecycleError("Fundraising metóda je už archivovaná.");
  }
  if (existing.version !== expectedVersion) throw new OrganizationFundraisingConcurrentEditError();

  const timestamp = now.toISOString();
  const actor = editorRef(editorEmail);
  const result = await db.prepare(`
    UPDATE organization_fundraising_methods
    SET archived_at = ?, is_active = 0, version = version + 1, updated_at = ?, updated_by = ?
    WHERE id = ? AND organization_id = ? AND version = ? AND archived_at IS NULL
  `).bind(timestamp, timestamp, actor, methodId, organizationId, expectedVersion).run() as RunResult;
  const changes = Number(result.meta?.changes ?? result.changes ?? 0);
  if (changes !== 1) throw new OrganizationFundraisingConcurrentEditError();
  return getOrganizationFundraisingMethodAdmin(organizationId, methodId, db);
}
