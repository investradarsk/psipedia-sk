import { env } from "cloudflare:workers";
import { decryptPii, hashPii, normalizeEmail } from "./pii-crypto";
import { ensurePartnerOwnerMembershipAdmin } from "./partner-admin-store";
import { getPartnerAccountById, getPartnerDatabase } from "./partner-auth-store";
import {
  isPartnerClaimStatus,
  normalizePartnerClaimText,
  partnerClaimStatuses,
  type PartnerClaimStatus,
  type PartnerClaimableResourceType,
  type PartnerVerificationState,
} from "./partner-claims";
import { queuePartnerLifecycleNotification } from "./partner-email";
import { appendPartnerAuditEvent } from "./partner-platform";

type Bindings = { DB?: D1Database; PII_ENCRYPTION_KEY?: string; PII_HASH_KEY?: string };
function db(database?: D1Database) {
  return getPartnerDatabase(database ?? (env as unknown as Bindings).DB);
}
function piiKey(value?: string) {
  const key = value ?? (env as unknown as Bindings).PII_ENCRYPTION_KEY;
  if (!key) throw new Error("PII_ENCRYPTION_KEY nie je nakonfigurovaný.");
  return key;
}
function adminActor(email: string) {
  return `admin:${email.trim().toLowerCase()}`;
}
function piiHashKey(value?: string) {
  const hashKey = value ?? (env as unknown as Bindings).PII_HASH_KEY;
  if (!hashKey) throw new PartnerClaimAdminError("PII_HASH_KEY nie je nakonfigurovaný.", 503);
  return hashKey;
}
async function assertIndependentOwnershipApprover(input: {
  adminEmail: string;
  accountId: string;
  resourceId: string;
  database: D1Database;
  hashKey?: string;
}) {
  const emailHash = await hashPii(normalizeEmail(input.adminEmail), piiHashKey(input.hashKey));
  const mapped = await input.database.prepare(`
    SELECT a.id accountId,
      EXISTS(
        SELECT 1 FROM partner_memberships m
        WHERE m.account_id=a.id AND m.resource_id=?2 AND m.revoked_at IS NULL
      ) resourceMember
    FROM partner_accounts a
    WHERE a.email_hash=?1 AND a.status='ACTIVE'
    LIMIT 1
  `).bind(emailHash, input.resourceId).first<{ accountId: string; resourceMember: number }>();
  if (mapped && (mapped.accountId === input.accountId || Boolean(mapped.resourceMember))) {
    throw new PartnerClaimAdminError(
      "Vlastnú žiadosť o správu profilu musí schváliť iný administrátor.",
      403,
    );
  }
}
function safeId(value: string) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export class PartnerClaimAdminError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type ClaimAdminRow = {
  id: string;
  accountId: string;
  emailCiphertext: string;
  resourceId: string;
  entityType: PartnerClaimableResourceType;
  status: PartnerClaimStatus;
  requestMessage: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  decisionNote: string | null;
  canonicalId: number;
  resourceName: string;
  slug: string;
  directoryCategory: string | null;
  conflict: number;
};

const CLAIM_BASE = `
  SELECT c.id,c.account_id accountId,a.email_ciphertext emailCiphertext,c.resource_id resourceId,
    r.entity_type entityType,c.status,c.request_message requestMessage,c.created_at createdAt,
    c.updated_at updatedAt,c.reviewed_at reviewedAt,c.reviewed_by reviewedBy,c.decision_note decisionNote,
    COALESCE(d.id,o.id) canonicalId,COALESCE(d.name,o.name) resourceName,COALESCE(d.slug,o.slug) slug,
    d.category directoryCategory,
    CASE WHEN
      EXISTS(
        SELECT 1 FROM partner_memberships om
        JOIN partner_accounts oa ON oa.id=om.account_id AND oa.status='ACTIVE'
        WHERE om.resource_id=c.resource_id AND om.revoked_at IS NULL AND om.role='OWNER' AND om.account_id<>c.account_id
      )
      OR EXISTS(
        SELECT 1 FROM partner_claims oc
        WHERE oc.resource_id=c.resource_id AND oc.status='PENDING' AND oc.account_id<>c.account_id
      )
    THEN 1 ELSE 0 END conflict
  FROM partner_claims c
  JOIN partner_accounts a ON a.id=c.account_id
  JOIN partner_resources r ON r.id=c.resource_id
  LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
  LEFT JOIN help_organizations o ON o.id=r.help_organization_id
`;

function publicHref(row: ClaimAdminRow) {
  return row.entityType === "DIRECTORY_PROFILE"
    ? `/adresar/${row.directoryCategory}/${row.slug}`
    : `/organizacie/${row.slug}`;
}
async function hydrateClaims(rows: ClaimAdminRow[], encryptionKey: string) {
  return Promise.all(rows.map(async (row) => ({
    ...row,
    conflict: Boolean(row.conflict),
    email: await decryptPii(row.emailCiphertext, encryptionKey),
    publicHref: publicHref(row),
  })));
}

export async function listPartnerClaimsAdmin(input: {
  status?: string;
  entityType?: string;
  q?: string;
  database?: D1Database;
  encryptionKey?: string;
} = {}) {
  if (input.status && input.status !== "all" && !isPartnerClaimStatus(input.status)) {
    throw new PartnerClaimAdminError("Neplatný filter claim statusu.");
  }
  if (input.entityType && input.entityType !== "all" && !["DIRECTORY_PROFILE", "HELP_ORGANIZATION"].includes(input.entityType)) {
    throw new PartnerClaimAdminError("Neplatný typ resource.");
  }
  const rows = (await db(input.database).prepare(
    CLAIM_BASE + " ORDER BY CASE WHEN c.status='PENDING' THEN 0 ELSE 1 END,c.created_at ASC LIMIT 300",
  ).all<ClaimAdminRow>()).results;
  let items = await hydrateClaims(rows, piiKey(input.encryptionKey));
  if (input.status && input.status !== "all") items = items.filter((item) => item.status === input.status);
  if (input.entityType && input.entityType !== "all") items = items.filter((item) => item.entityType === input.entityType);
  const q = (input.q ?? "").trim().toLocaleLowerCase("sk");
  if (q) {
    items = items.filter((item) =>
      [item.email, item.accountId, item.resourceName, item.requestMessage ?? "", item.id]
        .some((value) => value.toLocaleLowerCase("sk").includes(q)));
  }
  return items;
}

export async function getPartnerClaimAdmin(id: string, input: { database?: D1Database; encryptionKey?: string } = {}) {
  if (!safeId(id)) return null;
  const database = db(input.database);
  const row = await database.prepare(CLAIM_BASE + " WHERE c.id=?1 LIMIT 1").bind(id).first<ClaimAdminRow>();
  if (!row) return null;
  const [claim] = await hydrateClaims([row], piiKey(input.encryptionKey));
  const [memberships, otherClaims, verification, audit] = await Promise.all([
    database.prepare(`
      SELECT m.id,m.account_id accountId,m.role,m.created_at createdAt,a.status accountStatus
      FROM partner_memberships m JOIN partner_accounts a ON a.id=m.account_id
      WHERE m.resource_id=?1 AND m.revoked_at IS NULL
      ORDER BY CASE m.role WHEN 'OWNER' THEN 0 WHEN 'MANAGER' THEN 1 ELSE 2 END,m.created_at
    `).bind(row.resourceId).all(),
    database.prepare(`
      SELECT id,account_id accountId,status,created_at createdAt
      FROM partner_claims
      WHERE resource_id=?1 AND id<>?2 AND status='PENDING'
      ORDER BY created_at
    `).bind(row.resourceId, id).all(),
    database.prepare(`
      SELECT id,status,submitted_at submittedAt,reviewed_at reviewedAt,reviewed_by reviewedBy
      FROM partner_resource_verifications WHERE account_id=?1 AND resource_id=?2 LIMIT 1
    `).bind(row.accountId, row.resourceId).first(),
    database.prepare(`
      SELECT id,actor_type actorType,actor_ref actorRef,action,metadata_json metadataJson,created_at createdAt
      FROM partner_audit_events
      WHERE target_type='PARTNER_CLAIM' AND target_id=?1
      ORDER BY created_at DESC LIMIT 100
    `).bind(id).all(),
  ]);
  return {
    ...claim,
    memberships: memberships.results,
    otherPendingClaims: otherClaims.results,
    verification: verification ?? { status: "UNVERIFIED" },
    audit: audit.results,
  };
}

async function claimForDecision(id: string, database: D1Database) {
  const claim = await database.prepare(`
    SELECT c.id,c.account_id accountId,c.resource_id resourceId,c.status,r.entity_type entityType
    FROM partner_claims c JOIN partner_resources r ON r.id=c.resource_id
    WHERE c.id=?1 LIMIT 1
  `).bind(id).first<{
    id: string; accountId: string; resourceId: string; status: PartnerClaimStatus; entityType: string;
  }>();
  if (!claim) throw new PartnerClaimAdminError("Claim neexistuje.", 404);
  if (claim.status !== "PENDING") throw new PartnerClaimAdminError("Rozhodnúť možno iba PENDING claim.", 409);
  if (!["DIRECTORY_PROFILE", "HELP_ORGANIZATION"].includes(claim.entityType)) {
    throw new PartnerClaimAdminError("Tento resource nie je claimable v PARTNER-2.", 400);
  }
  const account = await getPartnerAccountById(claim.accountId, database);
  if (!account || account.status !== "ACTIVE") throw new PartnerClaimAdminError("Partner účet už nie je aktívny.", 409);
  return claim;
}

async function ensurePendingVerification(input: {
  accountId: string;
  resourceId: string;
  adminEmail: string;
  database: D1Database;
  now: Date;
}) {
  const current = await input.database.prepare(
    "SELECT id,status FROM partner_resource_verifications WHERE account_id=?1 AND resource_id=?2 LIMIT 1",
  ).bind(input.accountId, input.resourceId).first<{
    id: string; status: Exclude<PartnerVerificationState, "UNVERIFIED">;
  }>();
  if (current?.status === "VERIFIED") return current;
  const iso = input.now.toISOString();
  const id = current?.id ?? crypto.randomUUID();
  if (current) {
    await input.database.prepare(
      "UPDATE partner_resource_verifications SET status='PENDING_VERIFICATION',submitted_at=?2,updated_at=?2," +
      "reviewed_at=NULL,reviewed_by=NULL,review_note=NULL WHERE id=?1",
    ).bind(id, iso).run();
  } else {
    await input.database.prepare(
      "INSERT INTO partner_resource_verifications(id,account_id,resource_id,status,created_at,updated_at,submitted_at) " +
      "VALUES(?1,?2,?3,'PENDING_VERIFICATION',?4,?4,?4)",
    ).bind(id, input.accountId, input.resourceId, iso).run();
  }
  await appendPartnerAuditEvent({
    actorType: "ADMIN",
    actorRef: adminActor(input.adminEmail),
    action: "VERIFICATION_REQUESTED",
    targetType: "PARTNER_RESOURCE_VERIFICATION",
    targetId: id,
    metadata: { resourceId: input.resourceId, source: "claim_approval" },
    database: input.database,
    now: input.now,
  });
  return { id, status: "PENDING_VERIFICATION" as const };
}

export async function approvePartnerClaimAdmin(input: {
  id: string;
  adminEmail: string;
  database?: D1Database;
  now?: Date;
  hashKey?: string;
}) {
  if (!safeId(input.id)) throw new PartnerClaimAdminError("Neplatný claim.");
  const database = db(input.database);
  const claim = await claimForDecision(input.id, database);
  await assertIndependentOwnershipApprover({
    adminEmail: input.adminEmail,
    accountId: claim.accountId,
    resourceId: claim.resourceId,
    database,
    hashKey: input.hashKey,
  });
  const now = input.now ?? new Date();
  await ensurePartnerOwnerMembershipAdmin({
    accountId: claim.accountId,
    resourceId: claim.resourceId,
    adminEmail: input.adminEmail,
    database,
    now,
  });
  await ensurePendingVerification({
    accountId: claim.accountId,
    resourceId: claim.resourceId,
    adminEmail: input.adminEmail,
    database,
    now,
  });
  const iso = now.toISOString();
  await database.prepare(
    "UPDATE partner_claims SET status='APPROVED',reviewed_at=?2,reviewed_by=?3,updated_at=?2 " +
    "WHERE id=?1 AND status='PENDING'",
  ).bind(input.id, iso, adminActor(input.adminEmail)).run();
  await appendPartnerAuditEvent({
    actorType: "ADMIN",
    actorRef: adminActor(input.adminEmail),
    action: "CLAIM_APPROVED",
    targetType: "PARTNER_CLAIM",
    targetId: input.id,
    metadata: { resourceId: claim.resourceId, accountId: claim.accountId },
    database,
    now,
  });
  await queuePartnerLifecycleNotification({
    accountId: claim.accountId,
    notificationType: "CLAIM_APPROVED",
    dedupeKey: `partner-claim-approved/${input.id}`,
    database,
    now,
  });
  return getPartnerClaimAdmin(input.id, { database });
}

export async function rejectPartnerClaimAdmin(input: {
  id: string;
  decisionNote?: unknown;
  adminEmail: string;
  database?: D1Database;
  now?: Date;
}) {
  if (!safeId(input.id)) throw new PartnerClaimAdminError("Neplatný claim.");
  const database = db(input.database);
  const claim = await claimForDecision(input.id, database);
  const note = normalizePartnerClaimText(input.decisionNote, 2000);
  const now = input.now ?? new Date();
  const iso = now.toISOString();
  await database.prepare(
    "UPDATE partner_claims SET status='REJECTED',decision_note=?2,reviewed_at=?3,reviewed_by=?4,updated_at=?3 " +
    "WHERE id=?1 AND status='PENDING'",
  ).bind(input.id, note, iso, adminActor(input.adminEmail)).run();
  await appendPartnerAuditEvent({
    actorType: "ADMIN",
    actorRef: adminActor(input.adminEmail),
    action: "CLAIM_REJECTED",
    targetType: "PARTNER_CLAIM",
    targetId: input.id,
    metadata: { resourceId: claim.resourceId, accountId: claim.accountId },
    database,
    now,
  });
  await queuePartnerLifecycleNotification({
    accountId: claim.accountId,
    notificationType: "CLAIM_REJECTED",
    dedupeKey: `partner-claim-rejected/${input.id}`,
    database,
    now,
  });
  return getPartnerClaimAdmin(input.id, { database });
}

type VerificationAdminRow = {
  id: string;
  accountId: string;
  emailCiphertext: string;
  resourceId: string;
  entityType: PartnerClaimableResourceType;
  status: Exclude<PartnerVerificationState, "UNVERIFIED">;
  requestNote: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  resourceName: string;
  slug: string;
  directoryCategory: string | null;
  membershipRole: string | null;
  websiteUrl: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  conflict: number;
};

const VERIFICATION_BASE = `
  SELECT v.id,v.account_id accountId,a.email_ciphertext emailCiphertext,v.resource_id resourceId,
    r.entity_type entityType,v.status,v.request_note requestNote,v.created_at createdAt,v.updated_at updatedAt,
    v.submitted_at submittedAt,v.reviewed_at reviewedAt,v.reviewed_by reviewedBy,v.review_note reviewNote,
    COALESCE(d.name,o.name) resourceName,COALESCE(d.slug,o.slug) slug,d.category directoryCategory,
    m.role membershipRole,COALESCE(d.website_url,o.website_url) websiteUrl,
    o.public_email publicEmail,o.public_phone publicPhone,
    CASE WHEN
      EXISTS(
        SELECT 1 FROM partner_memberships om
        JOIN partner_accounts oa ON oa.id=om.account_id AND oa.status='ACTIVE'
        WHERE om.resource_id=v.resource_id AND om.revoked_at IS NULL AND om.role='OWNER' AND om.account_id<>v.account_id
      )
      OR EXISTS(
        SELECT 1 FROM partner_claims pc
        WHERE pc.resource_id=v.resource_id AND pc.status='PENDING' AND pc.account_id<>v.account_id
      )
    THEN 1 ELSE 0 END conflict
  FROM partner_resource_verifications v
  JOIN partner_accounts a ON a.id=v.account_id
  JOIN partner_resources r ON r.id=v.resource_id
  LEFT JOIN partner_memberships m ON m.account_id=v.account_id AND m.resource_id=v.resource_id AND m.revoked_at IS NULL
  LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
  LEFT JOIN help_organizations o ON o.id=r.help_organization_id
`;

function verificationHref(row: VerificationAdminRow) {
  return row.entityType === "DIRECTORY_PROFILE"
    ? `/adresar/${row.directoryCategory}/${row.slug}`
    : `/organizacie/${row.slug}`;
}
async function hydrateVerifications(rows: VerificationAdminRow[], encryptionKey: string) {
  return Promise.all(rows.map(async (row) => ({
    ...row,
    conflict: Boolean(row.conflict),
    email: await decryptPii(row.emailCiphertext, encryptionKey),
    publicHref: verificationHref(row),
  })));
}

export async function listPartnerVerificationsAdmin(input: {
  status?: string;
  q?: string;
  database?: D1Database;
  encryptionKey?: string;
} = {}) {
  const allowed = ["PENDING_VERIFICATION", "VERIFIED", "REJECTED"];
  if (input.status && input.status !== "all" && !allowed.includes(input.status)) {
    throw new PartnerClaimAdminError("Neplatný filter overenia.");
  }
  const rows = (await db(input.database).prepare(
    VERIFICATION_BASE + " ORDER BY CASE WHEN v.status='PENDING_VERIFICATION' THEN 0 ELSE 1 END,COALESCE(v.submitted_at,v.created_at) ASC LIMIT 300",
  ).all<VerificationAdminRow>()).results;
  let items = await hydrateVerifications(rows, piiKey(input.encryptionKey));
  if (input.status && input.status !== "all") items = items.filter((item) => item.status === input.status);
  const q = (input.q ?? "").trim().toLocaleLowerCase("sk");
  if (q) items = items.filter((item) => [item.email, item.resourceName, item.accountId, item.id].some((x) => x.toLocaleLowerCase("sk").includes(q)));
  return items;
}

export async function getPartnerVerificationAdmin(id: string, input: { database?: D1Database; encryptionKey?: string } = {}) {
  if (!safeId(id)) return null;
  const database = db(input.database);
  const row = await database.prepare(VERIFICATION_BASE + " WHERE v.id=?1 LIMIT 1").bind(id).first<VerificationAdminRow>();
  if (!row) return null;
  const [verification] = await hydrateVerifications([row], piiKey(input.encryptionKey));
  const [claim, audit] = await Promise.all([
    database.prepare(`
      SELECT id,status,created_at createdAt,reviewed_at reviewedAt
      FROM partner_claims
      WHERE account_id=?1 AND resource_id=?2
      ORDER BY created_at DESC LIMIT 1
    `).bind(row.accountId, row.resourceId).first(),
    database.prepare(`
      SELECT id,actor_type actorType,actor_ref actorRef,action,metadata_json metadataJson,created_at createdAt
      FROM partner_audit_events
      WHERE target_type='PARTNER_RESOURCE_VERIFICATION' AND target_id=?1
      ORDER BY created_at DESC LIMIT 100
    `).bind(id).all(),
  ]);
  return { ...verification, claim: claim ?? null, audit: audit.results };
}

async function pendingVerificationForDecision(id: string, database: D1Database) {
  const verification = await database.prepare(`
    SELECT v.id,v.account_id accountId,v.resource_id resourceId,v.status,a.status accountStatus,
      m.role membershipRole,m.revoked_at membershipRevokedAt
    FROM partner_resource_verifications v
    JOIN partner_accounts a ON a.id=v.account_id
    LEFT JOIN partner_memberships m ON m.account_id=v.account_id AND m.resource_id=v.resource_id AND m.revoked_at IS NULL
    WHERE v.id=?1 LIMIT 1
  `).bind(id).first<{
    id: string; accountId: string; resourceId: string; status: string; accountStatus: string;
    membershipRole: string | null; membershipRevokedAt: string | null;
  }>();
  if (!verification) throw new PartnerClaimAdminError("Overenie neexistuje.", 404);
  if (verification.status !== "PENDING_VERIFICATION") throw new PartnerClaimAdminError("Rozhodnúť možno iba čakajúce overenie.", 409);
  if (verification.accountStatus !== "ACTIVE" || verification.membershipRole !== "OWNER") {
    throw new PartnerClaimAdminError("Overenie už nemá platný ACTIVE OWNER základ.", 409);
  }
  return verification;
}

export async function decidePartnerVerificationAdmin(input: {
  id: string;
  action: "VERIFY" | "REJECT";
  reviewNote?: unknown;
  adminEmail: string;
  database?: D1Database;
  now?: Date;
  hashKey?: string;
}) {
  if (!safeId(input.id)) throw new PartnerClaimAdminError("Neplatné overenie.");
  const database = db(input.database);
  const verification = await pendingVerificationForDecision(input.id, database);
  if (input.action === "VERIFY") {
    await assertIndependentOwnershipApprover({
      adminEmail: input.adminEmail,
      accountId: verification.accountId,
      resourceId: verification.resourceId,
      database,
      hashKey: input.hashKey,
    });
  }
  const note = normalizePartnerClaimText(input.reviewNote, 2000);
  const now = input.now ?? new Date();
  const iso = now.toISOString();
  const status = input.action === "VERIFY" ? "VERIFIED" : "REJECTED";
  await database.prepare(
    "UPDATE partner_resource_verifications SET status=?2,review_note=?3,reviewed_at=?4,reviewed_by=?5,updated_at=?4 " +
    "WHERE id=?1 AND status='PENDING_VERIFICATION'",
  ).bind(input.id, status, note, iso, adminActor(input.adminEmail)).run();
  await appendPartnerAuditEvent({
    actorType: "ADMIN",
    actorRef: adminActor(input.adminEmail),
    action: input.action === "VERIFY" ? "VERIFICATION_VERIFIED" : "VERIFICATION_REJECTED",
    targetType: "PARTNER_RESOURCE_VERIFICATION",
    targetId: input.id,
    metadata: { resourceId: verification.resourceId, accountId: verification.accountId },
    database,
    now,
  });
  await queuePartnerLifecycleNotification({
    accountId: verification.accountId,
    notificationType: input.action === "VERIFY" ? "VERIFICATION_APPROVED" : "VERIFICATION_REJECTED",
    dedupeKey: `partner-verification-${status.toLowerCase()}/${input.id}/${iso}`,
    database,
    now,
  });
  return getPartnerVerificationAdmin(input.id, { database });
}

export { partnerClaimStatuses };
