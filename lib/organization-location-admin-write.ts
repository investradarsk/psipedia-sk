import { commitOrganizationLocationAdminEdit } from "./notion-organization-admin-receipts.ts";
import type { AdoptionD1Database } from "./adoption-store.ts";
import { prepareGoogleSourceGeoInvalidation, reconcileGeoAfterSourceMutation } from "./geo-store.ts";
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

export class OrganizationLocationMutationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationLocationMutationConflictError";
  }
}

export function isOrganizationLocationMutationConflict(error: unknown) {
  return error instanceof OrganizationLocationMutationConflictError;
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
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, 1, 0
    WHERE NOT EXISTS (
      SELECT 1 FROM organization_locations WHERE organization_id = ?
    )
  `).bind(
    organizationId,
    input.role,
    input.label,
    input.address,
    input.city,
    input.district,
    input.region,
    input.countryCode,
    organizationId,
  );
}

export async function createOrganizationLocationFromAdmin(
  organizationId: number,
  payload: unknown,
  database?: AdoptionD1Database,
  unifiedEditor?: string,
) {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return null;
  const db = requireOrganizationLocationD1(database);
  const organization = await requireMutableOrganization(organizationId, db);
  if (!organization) return null;
  const input = normalizeOrganizationLocationAdminInput(payload);

  const statement=insertStatement(db,organizationId,input);
  const insertResult = (unifiedEditor ? await commitOrganizationLocationAdminEdit(db,statement,organizationId,unifiedEditor) : await statement.run()) as RunResult;
  if (resultChanges(insertResult) < 1) {
    throw new OrganizationLocationMutationConflictError(
      "Organizácia už má adresu. Uprav existujúcu adresu namiesto pridania ďalšej.",
    );
  }

  const insertedId = resultInsertedId(insertResult);
  if (!Number.isSafeInteger(insertedId) || insertedId <= 0) {
    throw new Error("Lokalita sa zapísala, ale databáza nevrátila platné ID.");
  }
  await reconcileGeoAfterSourceMutation({
    targetType: "ORGANIZATION_LOCATION",
    targetId: insertedId,
    actorRef: "organization-location-admin",
    actorType: "SYSTEM",
  }, db as Parameters<typeof reconcileGeoAfterSourceMutation>[1]);
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
  unifiedEditor?: string,
) {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return null;
  if (!Number.isSafeInteger(locationId) || locationId <= 0) return null;
  const db = requireOrganizationLocationD1(database);
  const organization = await requireMutableOrganization(organizationId, db);
  if (!organization) return null;
  const existing = await getOrganizationLocationAdmin(organizationId, locationId, db);
  if (!existing) return null;
  const input = normalizeOrganizationLocationAdminInput(payload);

  let statement: ReturnType<AdoptionD1Database["prepare"]>;
  if (input.isPrimary) {
    statement = db.prepare(`
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
    );
  } else {
    statement = db.prepare(updateTargetSql()).bind(
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
    );
  }
  const result=(unifiedEditor ? await commitOrganizationLocationAdminEdit(db,statement,organizationId,unifiedEditor) : await statement.run()) as RunResult;

  if (resultChanges(result) < 1) return null;
  await reconcileGeoAfterSourceMutation({
    targetType: "ORGANIZATION_LOCATION",
    targetId: locationId,
    actorRef: "organization-location-admin",
    actorType: "SYSTEM",
  }, db as Parameters<typeof reconcileGeoAfterSourceMutation>[1]);
  return getOrganizationLocationAdmin(organizationId, locationId, db);
}

export async function updateOrganizationLocationFromGooglePlace(
  organizationId: number,
  locationId: number,
  place: {
    formattedAddress: string;
    address?: {
      locality?: string;
      sublocality?: string;
      district?: string;
      region?: string;
      countryCode?: string;
    };
  },
  actorRef: string,
  database?: AdoptionD1Database,
  expectedAddress?: { address: string; city: string; district: string; region: string; countryCode: string },
  expectedGeoRevision?: string | null,
) {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return null;
  if (!Number.isSafeInteger(locationId) || locationId <= 0) return null;
  const db = requireOrganizationLocationD1(database);
  const organization = await requireMutableOrganization(organizationId, db);
  if (!organization) return null;
  const existing = await getOrganizationLocationAdmin(organizationId, locationId, db);
  if (!existing) return null;
  const revision = expectedAddress ?? existing;
  if (["address", "city", "district", "region", "countryCode"].some((key) =>
    String(existing[key as keyof typeof existing] ?? "") !== String(revision[key as keyof typeof revision] ?? ""))) {
    throw new Error("GOOGLE_CONFIRMATION_CONFLICT");
  }

  // Google owns location only. Organization identity, contacts, website,
  // social links, descriptions and fundraising data live in other fields/tables
  // and are deliberately absent from this UPDATE.
  const nextAddress = place.formattedAddress.trim();
  const nextCity = place.address?.locality?.trim() || place.address?.sublocality?.trim() || existing.city;
  const nextDistrict = place.address?.district?.trim() || existing.district;
  const nextRegion = place.address?.region?.trim() || existing.region;
  const nextCountry = place.address?.countryCode?.trim().toUpperCase() || existing.countryCode || "SK";
  const atomicDb = db as unknown as Parameters<typeof prepareGoogleSourceGeoInvalidation>[2];
  const geo = await prepareGoogleSourceGeoInvalidation(
    "ORGANIZATION_LOCATION", locationId,
    atomicDb, expectedGeoRevision,
    { sql: "SELECT 1 FROM organization_locations WHERE id=? AND organization_id=? AND address IS ? AND city IS ? AND district IS ? AND region IS ? AND country_code IS ?",
      args: [locationId,organizationId,nextAddress,nextCity,nextDistrict,nextRegion,nextCountry] },
  );
  const sourceStatement = atomicDb.prepare(`
    UPDATE organization_locations
    SET address = ?, city = ?, district = ?, region = ?, country_code = ?
    WHERE id = ? AND organization_id = ?
      AND address IS ? AND city IS ? AND district IS ? AND region IS ? AND country_code IS ?
      AND ${geo.sourceGuard}
  `).bind(
    nextAddress, nextCity, nextDistrict, nextRegion, nextCountry,
    locationId,
    organizationId,
    revision.address, revision.city, revision.district, revision.region, revision.countryCode,
    ...geo.sourceGuardArgs,
  );
  const results = await atomicDb.batch([sourceStatement, ...(geo.invalidation ? [geo.invalidation] : [])]);
  if (resultChanges(results[0] as RunResult) < 1) throw new Error("GOOGLE_CONFIRMATION_CONFLICT");
  if (geo.invalidation && resultChanges(results[1] as RunResult) !== 1) throw new Error("GOOGLE_CONFIRMATION_REPAIR_REQUIRED");

  let googleConfirmationGeoRevision: string | null = null;
  try {
    const geoReconciliation = await reconcileGeoAfterSourceMutation({
      targetType: "ORGANIZATION_LOCATION", targetId: locationId, actorRef, actorType: "ADMIN", expectedGeoRevision: geo.current ? geo.now : null,
    }, db as Parameters<typeof reconcileGeoAfterSourceMutation>[1]);
    googleConfirmationGeoRevision = geoReconciliation.point?.updatedAt ?? null;
  } catch (cause) {
    throw Object.assign(new Error("GOOGLE_SOURCE_COMMITTED_GEO_FAILED", { cause }), { sourceCommitted: true });
  }
  const saved = await getOrganizationLocationAdmin(organizationId, locationId, db);
  return saved ? { ...saved, googleConfirmationGeoRevision } : null;
}

export async function deleteOrganizationLocationFromAdmin(
  organizationId: number,
  locationId: number,
  database?: AdoptionD1Database,
  unifiedEditor?: string,
) {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return false;
  if (!Number.isSafeInteger(locationId) || locationId <= 0) return false;
  const db = requireOrganizationLocationD1(database);
  const organization = await requireMutableOrganization(organizationId, db);
  if (!organization) return false;
  const existing = await getOrganizationLocationAdmin(organizationId, locationId, db);
  if (!existing) return false;

  const statement = db.prepare(`
    DELETE FROM organization_locations
    WHERE id = ? AND organization_id = ?
  `).bind(locationId, organizationId);
  const result=(unifiedEditor ? await commitOrganizationLocationAdminEdit(db,statement,organizationId,unifiedEditor) : await statement.run()) as RunResult;
  return resultChanges(result) >= 1;
}


/** Prepare an address-only mutation for the parent form transaction. Never
 * promote/demote another location or infer an address from the parent row.
 * Compare the actual submitted location snapshot, including Google edits
 * which may not have advanced the parent revision. */
export async function planCombinedOrganizationAddress(db:D1Database,organizationId:number,raw:unknown){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new OrganizationLocationMutationConflictError("Neplatná adresa.");
  const request=raw as {expected?:unknown;payload?:unknown};
  if(!request.payload||typeof request.payload!=="object"||Array.isArray(request.payload)||
    !["address","city","district","region","countryCode"].every(key=>Object.hasOwn(request.payload as object,key)&&typeof (request.payload as Record<string,unknown>)[key]==="string"))
    throw new OrganizationLocationMutationConflictError("Adresa nie je kompletným formulárom.");
  const input=normalizeOrganizationLocationAdminInput(request.payload);
  const guard=()=>db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('ORGANIZATION_ADDRESS_CAS_FAILED','$') END");
  if(request.expected===null){
    const statement=insertStatement(db,organizationId,input) as unknown as D1PreparedStatement;
    return {statements:[statement,guard()],locationId:null,geoRevision:undefined};
  }
  if(!request.expected||typeof request.expected!=="object")throw new OrganizationLocationMutationConflictError("Chýba pôvodná adresa.");
  const old=request.expected as import("./organization-location-admin-store.ts").OrganizationLocationAdminRecord;
  if(!Number.isSafeInteger(old.id)||old.id<1||old.organizationId!==organizationId||
    !["role","label","address","city","district","region","countryCode"].every(key=>typeof (old as unknown as Record<string,unknown>)[key]==="string")||
    typeof old.isPrimary!=="boolean"||!Number.isSafeInteger(old.sortOrder))
    throw new OrganizationLocationMutationConflictError("Neplatná pôvodná adresa.");
  const geo=await prepareGoogleSourceGeoInvalidation("ORGANIZATION_LOCATION",old.id,db as unknown as Parameters<typeof prepareGoogleSourceGeoInvalidation>[2],undefined,
    {sql:"SELECT 1 FROM organization_locations WHERE id=? AND organization_id=? AND address IS ? AND city IS ? AND district IS ? AND region IS ? AND country_code IS ?",
      args:[old.id,organizationId,input.address,input.city,input.district,input.region,input.countryCode]});
  const write=db.prepare("UPDATE organization_locations SET address=?,city=?,district=?,region=?,country_code=? "+
    "WHERE id=? AND organization_id=? AND role IS ? AND label IS ? AND address IS ? AND city IS ? AND district IS ? "+
    "AND region IS ? AND country_code IS ? AND is_primary=? AND sort_order=? "+
    "AND id=(SELECT id FROM organization_locations WHERE organization_id=? ORDER BY CASE WHEN role='SITE' THEN 0 ELSE 1 END,is_primary DESC,sort_order,id LIMIT 1) AND "+geo.sourceGuard)
    .bind(input.address,input.city,input.district,input.region,input.countryCode,old.id,organizationId,old.role,old.label,
      old.address,old.city,old.district,old.region,old.countryCode,old.isPrimary?1:0,old.sortOrder,organizationId,...geo.sourceGuardArgs);
  return {statements:[write,guard(),...(geo.invalidation?[geo.invalidation as unknown as D1PreparedStatement,guard()]:[])],
    locationId:old.id,geoRevision:geo.current?geo.now:null};
}
