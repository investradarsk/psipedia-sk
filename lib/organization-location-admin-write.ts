import type { AdoptionD1Database, AdoptionD1Statement } from "./adoption-store.ts";
import {
  normalizeOrganizationLocationAdminInput,
  type OrganizationLocationAdminInput,
} from "./organization-location-admin.ts";
import {
  getOrganizationLocationAdmin,
  getOrganizationLocationAdminOrganization,
  requireOrganizationLocationD1,
} from "./organization-location-admin-store.ts";

type RunResult = {
  meta?: { changes?: number; last_row_id?: number | bigint };
  changes?: number;
  lastRowId?: number | bigint;
};

type BatchCapableDatabase = AdoptionD1Database & {
  batch(statements: AdoptionD1Statement[]): Promise<RunResult[]>;
};

export class OrganizationLocationMutationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationLocationMutationConflictError";
  }
}

export function isOrganizationLocationMutationConflict(error: unknown) {
  return error instanceof OrganizationLocationMutationConflictError;
}

function isBatchCapable(database: AdoptionD1Database): database is BatchCapableDatabase {
  return typeof (database as Partial<BatchCapableDatabase>).batch === "function";
}

function resultChanges(result: RunResult) {
  return Number(result.meta?.changes ?? result.changes ?? 0);
}

function resultInsertedId(result: RunResult) {
  return Number(result.meta?.last_row_id ?? result.lastRowId ?? 0);
}

async function requireMutableOrganization(organizationId: number, database: AdoptionD1Database) {
  const organization = await getOrganizationLocationAdminOrganization(organizationId, database);
  if (!organization) return null;
  if (organization.status === "ARCHIVED" || organization.archivedAt) {
    throw new OrganizationLocationMutationConflictError("Archivovanej organizácii nemožno meniť lokality.");
  }
  return organization;
}

function insertStatement(database: AdoptionD1Database, organizationId: number, input: OrganizationLocationAdminInput) {
  return database.prepare(`
    INSERT INTO organization_locations (
      organization_id, role, label, address, city, district, region, country_code, is_primary, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    organizationId,
    input.role,
    input.label,
    input.address,
    input.city,
    input.district,
    input.region,
    input.countryCode,
    input.isPrimary ? 1 : 0,
    input.sortOrder,
  );
}

export async function createOrganizationLocationFromAdmin(
  organizationId: number,
  payload: unknown,
  database?: AdoptionD1Database,
) {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return null;
  const db = requireOrganizationLocationD1(database);
  const organization = await requireMutableOrganization(organizationId, db);
  if (!organization) return null;
  const input = normalizeOrganizationLocationAdminInput(payload);

  let insertResult: RunResult;
  if (input.isPrimary) {
    if (!isBatchCapable(db)) {
      throw new OrganizationLocationMutationConflictError("Databáza nepodporuje bezpečnú atomickú zmenu primary lokality.");
    }
    const results = await db.batch([
      db.prepare("UPDATE organization_locations SET is_primary = 0 WHERE organization_id = ?").bind(organizationId),
      insertStatement(db, organizationId, input),
    ]);
    insertResult = results[1] ?? {};
  } else {
    insertResult = await insertStatement(db, organizationId, input).run() as RunResult;
  }

  const insertedId = resultInsertedId(insertResult);
  if (!Number.isSafeInteger(insertedId) || insertedId <= 0) {
    throw new Error("Lokalita sa zapísala, ale databáza nevrátila platné ID.");
  }
  return getOrganizationLocationAdmin(organizationId, insertedId, db);
}

function updateTargetSql() {
  return `
    UPDATE organization_locations
    SET role = ?, label = ?, address = ?, city = ?, district = ?, region = ?, country_code = ?,
      is_primary = 0, sort_order = ?
    WHERE id = ? AND organization_id = ?
  `;
}

export async function updateOrganizationLocationFromAdmin(
  organizationId: number,
  locationId: number,
  payload: unknown,
  database?: AdoptionD1Database,
) {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return null;
  if (!Number.isSafeInteger(locationId) || locationId <= 0) return null;
  const db = requireOrganizationLocationD1(database);
  const organization = await requireMutableOrganization(organizationId, db);
  if (!organization) return null;
  const existing = await getOrganizationLocationAdmin(organizationId, locationId, db);
  if (!existing) return null;
  const input = normalizeOrganizationLocationAdminInput(payload);

  let result: RunResult;
  if (input.isPrimary) {
    result = await db.prepare(`
      UPDATE organization_locations
      SET
        role = CASE WHEN id = ? THEN ? ELSE role END,
        label = CASE WHEN id = ? THEN ? ELSE label END,
        address = CASE WHEN id = ? THEN ? ELSE address END,
        city = CASE WHEN id = ? THEN ? ELSE city END,
        district = CASE WHEN id = ? THEN ? ELSE district END,
        region = CASE WHEN id = ? THEN ? ELSE region END,
        country_code = CASE WHEN id = ? THEN ? ELSE country_code END,
        sort_order = CASE WHEN id = ? THEN ? ELSE sort_order END,
        is_primary = CASE WHEN id = ? THEN 1 ELSE 0 END
      WHERE organization_id = ?
        AND EXISTS (
          SELECT 1 FROM organization_locations target
          WHERE target.id = ? AND target.organization_id = ?
        )
    `).bind(
      locationId, input.role,
      locationId, input.label,
      locationId, input.address,
      locationId, input.city,
      locationId, input.district,
      locationId, input.region,
      locationId, input.countryCode,
      locationId, input.sortOrder,
      locationId,
      organizationId,
      locationId, organizationId,
    ).run() as RunResult;
  } else {
    result = await db.prepare(updateTargetSql()).bind(
      input.role,
      input.label,
      input.address,
      input.city,
      input.district,
      input.region,
      input.countryCode,
      input.sortOrder,
      locationId,
      organizationId,
    ).run() as RunResult;
  }

  if (resultChanges(result) < 1) return null;
  return getOrganizationLocationAdmin(organizationId, locationId, db);
}

export async function deleteOrganizationLocationFromAdmin(
  organizationId: number,
  locationId: number,
  database?: AdoptionD1Database,
) {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return false;
  if (!Number.isSafeInteger(locationId) || locationId <= 0) return false;
  const db = requireOrganizationLocationD1(database);
  const organization = await requireMutableOrganization(organizationId, db);
  if (!organization) return false;
  const existing = await getOrganizationLocationAdmin(organizationId, locationId, db);
  if (!existing) return false;

  const result = await db.prepare(`
    DELETE FROM organization_locations
    WHERE id = ? AND organization_id = ?
  `).bind(locationId, organizationId).run() as RunResult;
  return resultChanges(result) === 1;
}
