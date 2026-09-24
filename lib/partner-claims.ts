import { getPartnerAccountById, getPartnerDatabase } from "./partner-auth-store";
import { queuePartnerLifecycleNotification } from "./partner-email";
import { appendPartnerAuditEvent, type PartnerRole } from "./partner-platform";

export const partnerClaimableResourceTypes = ["DIRECTORY_PROFILE", "HELP_ORGANIZATION"] as const;
export type PartnerClaimableResourceType = (typeof partnerClaimableResourceTypes)[number];
export const partnerClaimStatuses = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type PartnerClaimStatus = (typeof partnerClaimStatuses)[number];
export const partnerVerificationStates = ["UNVERIFIED", "PENDING_VERIFICATION", "VERIFIED", "REJECTED"] as const;
export type PartnerVerificationState = (typeof partnerVerificationStates)[number];
export const PARTNER_CLAIM_MESSAGE_MAX = 1000;
export const PARTNER_VERIFICATION_NOTE_MAX = 1000;

export class PartnerClaimError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function isPartnerClaimableResourceType(value: unknown): value is PartnerClaimableResourceType {
  return typeof value === "string" && (partnerClaimableResourceTypes as readonly string[]).includes(value);
}
export function isPartnerClaimStatus(value: unknown): value is PartnerClaimStatus {
  return typeof value === "string" && (partnerClaimStatuses as readonly string[]).includes(value);
}

export function normalizePartnerClaimText(value: unknown, max = PARTNER_CLAIM_MESSAGE_MAX) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new PartnerClaimError("Poznámka musí byť text.");
  const clean = value.replace(/\r\n?/g, "\n").trim();
  if (clean.length > max) throw new PartnerClaimError(`Text môže mať najviac ${max} znakov.`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(clean) || /<\/?[A-Za-z][^>]*>/.test(clean)) {
    throw new PartnerClaimError("Použite iba obyčajný text bez HTML.");
  }
  return clean || null;
}

function canonicalId(value: unknown) {
  const id = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(id) || id < 1) throw new PartnerClaimError("Neplatný profil.");
  return id;
}

export type PartnerClaimableResourcePreview = {
  entityType: PartnerClaimableResourceType;
  canonicalId: number;
  name: string;
  slug: string;
  publicHref: string;
};

export async function getClaimablePartnerResourcePreview(
  entityTypeValue: unknown,
  canonicalIdValue: unknown,
  database?: D1Database,
): Promise<PartnerClaimableResourcePreview | null> {
  if (!isPartnerClaimableResourceType(entityTypeValue)) return null;
  const id = canonicalId(canonicalIdValue);
  const db = getPartnerDatabase(database);
  if (entityTypeValue === "DIRECTORY_PROFILE") {
    const row = await db.prepare(
      "SELECT id,name,slug,category FROM directory_profiles WHERE id=?1 AND status='published' LIMIT 1",
    ).bind(id).first<{ id: number; name: string; slug: string; category: string }>();
    return row ? {
      entityType: entityTypeValue,
      canonicalId: Number(row.id),
      name: row.name,
      slug: row.slug,
      publicHref: `/adresar/${row.category}/${row.slug}`,
    } : null;
  }
  const row = await db.prepare(
    "SELECT id,name,slug FROM help_organizations WHERE id=?1 AND status='PUBLISHED' AND published_at IS NOT NULL AND archived_at IS NULL LIMIT 1",
  ).bind(id).first<{ id: number; name: string; slug: string }>();
  return row ? {
    entityType: entityTypeValue,
    canonicalId: Number(row.id),
    name: row.name,
    slug: row.slug,
    publicHref: `/organizacie/${row.slug}`,
  } : null;
}

async function getOrCreateResourceAnchor(
  entityType: PartnerClaimableResourceType,
  id: number,
  database: D1Database,
  now: Date,
) {
  const column = entityType === "DIRECTORY_PROFILE" ? "directory_profile_id" : "help_organization_id";
  let resource = await database.prepare(
    `SELECT id FROM partner_resources WHERE ${column}=?1 LIMIT 1`,
  ).bind(id).first<{ id: string }>();
  if (resource) return resource.id;

  const resourceId = crypto.randomUUID();
  const iso = now.toISOString();
  await database.prepare(
    `INSERT OR IGNORE INTO partner_resources(id,entity_type,${column},created_at,updated_at) VALUES(?1,?2,?3,?4,?4)`,
  ).bind(resourceId, entityType, id, iso).run();
  resource = await database.prepare(
    `SELECT id FROM partner_resources WHERE ${column}=?1 LIMIT 1`,
  ).bind(id).first<{ id: string }>();
  if (!resource) throw new PartnerClaimError("Profil sa nepodarilo pripraviť na prevzatie.", 503);
  return resource.id;
}

async function activeMembership(database: D1Database, accountId: string, resourceId: string) {
  return database.prepare(
    "SELECT id,role FROM partner_memberships WHERE account_id=?1 AND resource_id=?2 AND revoked_at IS NULL LIMIT 1",
  ).bind(accountId, resourceId).first<{ id: string; role: PartnerRole }>();
}

async function activeAccount(accountId: string, database: D1Database) {
  const account = await getPartnerAccountById(accountId, database);
  if (!account || account.status !== "ACTIVE") throw new PartnerClaimError("Aktívny Partner účet je potrebný.", 403);
  return account;
}

async function pendingClaim(database: D1Database, accountId: string, resourceId: string) {
  return database.prepare(
    "SELECT id FROM partner_claims WHERE account_id=?1 AND resource_id=?2 AND status='PENDING' LIMIT 1",
  ).bind(accountId, resourceId).first<{ id: string }>();
}

export async function createPartnerClaim(input: {
  accountId: string;
  entityType: unknown;
  canonicalId: unknown;
  requestMessage?: unknown;
  database?: D1Database;
  now?: Date;
}) {
  const database = getPartnerDatabase(input.database);
  await activeAccount(input.accountId, database);
  if (!isPartnerClaimableResourceType(input.entityType)) {
    throw new PartnerClaimError("Tento typ profilu zatiaľ nie je možné prevziať.");
  }
  const preview = await getClaimablePartnerResourcePreview(input.entityType, input.canonicalId, database);
  if (!preview) throw new PartnerClaimError("Verejný profil neexistuje alebo ho nemožno prevziať.", 404);
  const now = input.now ?? new Date();
  const resourceId = await getOrCreateResourceAnchor(preview.entityType, preview.canonicalId, database, now);
  const membership = await activeMembership(database, input.accountId, resourceId);
  if (membership) throw new PartnerClaimError("Tento profil už spravujete cez Partner účet.", 409);

  const existing = await pendingClaim(database, input.accountId, resourceId);
  if (existing) {
    await queuePartnerLifecycleNotification({
      accountId: input.accountId,
      notificationType: "CLAIM_SUBMITTED",
      dedupeKey: `partner-claim-submitted/${existing.id}`,
      database,
      now,
    });
    return { id: existing.id, resourceId, deduplicated: true };
  }

  const threshold = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const recent = await database.prepare(
    "SELECT COUNT(*) count FROM partner_claims WHERE account_id=?1 AND created_at>=?2",
  ).bind(input.accountId, threshold).first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= 10) {
    throw new PartnerClaimError("Za krátky čas bolo odoslaných priveľa žiadostí. Skúste to neskôr.", 429);
  }

  const message = normalizePartnerClaimText(input.requestMessage);
  const id = crypto.randomUUID();
  const iso = now.toISOString();
  await database.prepare(
    "INSERT OR IGNORE INTO partner_claims(id,account_id,resource_id,status,request_message,created_at,updated_at) " +
    "VALUES(?1,?2,?3,'PENDING',?4,?5,?5)",
  ).bind(id, input.accountId, resourceId, message, iso).run();
  const current = await pendingClaim(database, input.accountId, resourceId);
  if (!current) throw new PartnerClaimError("Žiadosť sa nepodarilo uložiť.", 503);

  if (current.id === id) {
    await appendPartnerAuditEvent({
      actorType: "PARTNER",
      actorRef: `partner:${input.accountId}`,
      action: "CLAIM_SUBMITTED",
      targetType: "PARTNER_CLAIM",
      targetId: id,
      metadata: { resourceId, entityType: preview.entityType, canonicalId: preview.canonicalId },
      database,
      now,
    });
  }
  await queuePartnerLifecycleNotification({
    accountId: input.accountId,
    notificationType: "CLAIM_SUBMITTED",
    dedupeKey: `partner-claim-submitted/${current.id}`,
    database,
    now,
  });
  return { id: current.id, resourceId, deduplicated: current.id !== id };
}

export async function cancelPartnerClaim(input: {
  accountId: string;
  claimId: string;
  database?: D1Database;
  now?: Date;
}) {
  const database = getPartnerDatabase(input.database);
  await activeAccount(input.accountId, database);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.claimId)) throw new PartnerClaimError("Neplatná žiadosť.");
  const claim = await database.prepare(
    "SELECT id,status FROM partner_claims WHERE id=?1 AND account_id=?2 LIMIT 1",
  ).bind(input.claimId, input.accountId).first<{ id: string; status: PartnerClaimStatus }>();
  if (!claim) throw new PartnerClaimError("Žiadosť neexistuje.", 404);
  if (claim.status !== "PENDING") throw new PartnerClaimError("Zrušiť možno iba žiadosť, ktorá čaká na kontrolu.", 409);
  const now = input.now ?? new Date();
  const iso = now.toISOString();
  await database.prepare(
    "UPDATE partner_claims SET status='CANCELLED',cancelled_at=?3,updated_at=?3 WHERE id=?1 AND account_id=?2 AND status='PENDING'",
  ).bind(input.claimId, input.accountId, iso).run();
  await appendPartnerAuditEvent({
    actorType: "PARTNER",
    actorRef: `partner:${input.accountId}`,
    action: "CLAIM_CANCELLED",
    targetType: "PARTNER_CLAIM",
    targetId: input.claimId,
    database,
    now,
  });
  return { id: input.claimId, status: "CANCELLED" as const };
}

type ClaimHistoryRow = {
  id: string;
  resourceId: string;
  entityType: PartnerClaimableResourceType;
  status: PartnerClaimStatus;
  requestMessage: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  canonicalId: number;
  name: string;
  slug: string;
  directoryCategory: string | null;
  verificationStatus: "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED" | null;
};

function historyHref(row: ClaimHistoryRow) {
  return row.entityType === "DIRECTORY_PROFILE"
    ? `/adresar/${row.directoryCategory}/${row.slug}`
    : `/organizacie/${row.slug}`;
}

export async function listPartnerClaims(accountId: string, database?: D1Database) {
  const rows = (await getPartnerDatabase(database).prepare(`
    SELECT c.id,c.resource_id resourceId,r.entity_type entityType,c.status,c.request_message requestMessage,
      c.created_at createdAt,c.updated_at updatedAt,c.reviewed_at reviewedAt,
      COALESCE(d.id,o.id) canonicalId,COALESCE(d.name,o.name) name,COALESCE(d.slug,o.slug) slug,
      d.category directoryCategory,v.status verificationStatus
    FROM partner_claims c
    JOIN partner_resources r ON r.id=c.resource_id
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
    LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    LEFT JOIN partner_resource_verifications v ON v.account_id=c.account_id AND v.resource_id=c.resource_id
    WHERE c.account_id=?1
    ORDER BY c.created_at DESC,c.id DESC
    LIMIT 150
  `).bind(accountId).all<ClaimHistoryRow>()).results;
  return rows.map((row) => ({
    ...row,
    publicHref: historyHref(row),
    verificationState: (row.verificationStatus ?? "UNVERIFIED") as PartnerVerificationState,
  }));
}

export async function getPartnerResourceVerificationState(
  accountId: string,
  resourceId: string,
  database?: D1Database,
): Promise<PartnerVerificationState> {
  const row = await getPartnerDatabase(database).prepare(
    "SELECT status FROM partner_resource_verifications WHERE account_id=?1 AND resource_id=?2 LIMIT 1",
  ).bind(accountId, resourceId).first<{ status: Exclude<PartnerVerificationState, "UNVERIFIED"> }>();
  return row?.status ?? "UNVERIFIED";
}

export async function listPartnerVerificationResources(accountId: string, database?: D1Database) {
  const rows = (await getPartnerDatabase(database).prepare(`
    SELECT r.id resourceId,r.entity_type entityType,COALESCE(d.name,o.name) name,
      COALESCE(d.slug,o.slug) slug,d.category directoryCategory,
      COALESCE(v.status,'UNVERIFIED') verificationState,v.request_note requestNote,
      v.submitted_at submittedAt,v.updated_at verificationUpdatedAt
    FROM partner_memberships m
    JOIN partner_accounts a ON a.id=m.account_id AND a.status='ACTIVE'
    JOIN partner_resources r ON r.id=m.resource_id
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
    LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    LEFT JOIN partner_resource_verifications v ON v.account_id=m.account_id AND v.resource_id=m.resource_id
    WHERE m.account_id=?1 AND m.revoked_at IS NULL AND m.role='OWNER'
      AND r.entity_type IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION')
    ORDER BY name COLLATE NOCASE,r.id
  `).bind(accountId).all<{
    resourceId: string; entityType: PartnerClaimableResourceType; name: string; slug: string;
    directoryCategory: string | null; verificationState: PartnerVerificationState;
    requestNote: string | null; submittedAt: string | null; verificationUpdatedAt: string | null;
  }>()).results;
  return rows.map((row) => ({
    ...row,
    publicHref: row.entityType === "DIRECTORY_PROFILE"
      ? `/adresar/${row.directoryCategory}/${row.slug}`
      : `/organizacie/${row.slug}`,
  }));
}

export async function requestPartnerVerification(input: {
  accountId: string;
  resourceId: unknown;
  requestNote?: unknown;
  database?: D1Database;
  now?: Date;
}) {
  const database = getPartnerDatabase(input.database);
  await activeAccount(input.accountId, database);
  if (typeof input.resourceId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(input.resourceId)) {
    throw new PartnerClaimError("Neplatný Partner resource.");
  }
  const membership = await activeMembership(database, input.accountId, input.resourceId);
  if (!membership || membership.role !== "OWNER") {
    throw new PartnerClaimError("O overenie môže požiadať iba OWNER tohto profilu.", 403);
  }
  const resource = await database.prepare(
    "SELECT entity_type entityType FROM partner_resources WHERE id=?1 AND entity_type IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION') LIMIT 1",
  ).bind(input.resourceId).first<{ entityType: PartnerClaimableResourceType }>();
  if (!resource) throw new PartnerClaimError("Tento resource nie je možné v PARTNER-2 overiť.", 400);

  const note = normalizePartnerClaimText(input.requestNote, PARTNER_VERIFICATION_NOTE_MAX);
  const existing = await database.prepare(
    "SELECT id,status FROM partner_resource_verifications WHERE account_id=?1 AND resource_id=?2 LIMIT 1",
  ).bind(input.accountId, input.resourceId).first<{ id: string; status: Exclude<PartnerVerificationState, "UNVERIFIED"> }>();
  if (existing?.status === "VERIFIED") throw new PartnerClaimError("Správca tohto profilu je už overený.", 409);
  if (existing?.status === "PENDING_VERIFICATION") return { id: existing.id, deduplicated: true };

  const now = input.now ?? new Date();
  const iso = now.toISOString();
  const id = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await database.prepare(
      "UPDATE partner_resource_verifications SET status='PENDING_VERIFICATION',request_note=?3,submitted_at=?4," +
      "reviewed_at=NULL,reviewed_by=NULL,review_note=NULL,updated_at=?4 WHERE id=?1 AND account_id=?2 AND status='REJECTED'",
    ).bind(id, input.accountId, note, iso).run();
  } else {
    await database.prepare(
      "INSERT INTO partner_resource_verifications(id,account_id,resource_id,status,request_note,created_at,updated_at,submitted_at) " +
      "VALUES(?1,?2,?3,'PENDING_VERIFICATION',?4,?5,?5,?5)",
    ).bind(id, input.accountId, input.resourceId, note, iso).run();
  }
  await appendPartnerAuditEvent({
    actorType: "PARTNER",
    actorRef: `partner:${input.accountId}`,
    action: "VERIFICATION_REQUESTED",
    targetType: "PARTNER_RESOURCE_VERIFICATION",
    targetId: id,
    metadata: { resourceId: input.resourceId, entityType: resource.entityType, reRequest: Boolean(existing) },
    database,
    now,
  });
  return { id, deduplicated: false };
}

export async function isPublicPartnerResourceVerified(
  entityType: PartnerClaimableResourceType,
  canonicalIdValue: number,
  database?: D1Database,
) {
  const id = canonicalId(canonicalIdValue);
  const column = entityType === "DIRECTORY_PROFILE" ? "directory_profile_id" : "help_organization_id";
  try {
    const databaseResolved = getPartnerDatabase(database);
    const row = await databaseResolved.prepare(`
      SELECT 1 ok
      FROM partner_resources r
      JOIN partner_memberships m ON m.resource_id=r.id AND m.revoked_at IS NULL
      JOIN partner_accounts a ON a.id=m.account_id AND a.status='ACTIVE'
      JOIN partner_resource_verifications v ON v.resource_id=r.id AND v.account_id=m.account_id AND v.status='VERIFIED'
      WHERE r.entity_type=?1 AND r.${column}=?2
      LIMIT 1
    `).bind(entityType, id).first<{ ok: number }>();
    return Boolean(row);
  } catch {
    return false;
  }
}
