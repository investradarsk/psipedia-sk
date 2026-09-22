import { getPartnerDatabase, type PartnerAccountStatus } from "./partner-auth-store";

export const partnerResourceTypes = ["DIRECTORY_PROFILE", "HELP_ORGANIZATION", "MANAGED_EVENT"] as const;
export type PartnerResourceType = (typeof partnerResourceTypes)[number];
export const partnerRoles = ["OWNER", "MANAGER", "EDITOR"] as const;
export type PartnerRole = (typeof partnerRoles)[number];
export const partnerPermissions = ["RESOURCE_VIEW", "MEMBERSHIP_VIEW", "PROFILE_SUBMIT_CHANGE", "EVENT_SUBMIT", "COMMERCIAL_INTEREST_CREATE", "MEMBERSHIP_MANAGE"] as const;
export type PartnerPermission = (typeof partnerPermissions)[number];

const ROLE_PERMISSIONS: Record<PartnerRole, ReadonlySet<PartnerPermission>> = {
  OWNER: new Set(partnerPermissions),
  MANAGER: new Set(["RESOURCE_VIEW", "MEMBERSHIP_VIEW", "PROFILE_SUBMIT_CHANGE", "EVENT_SUBMIT", "COMMERCIAL_INTEREST_CREATE"]),
  EDITOR: new Set(["RESOURCE_VIEW", "MEMBERSHIP_VIEW", "PROFILE_SUBMIT_CHANGE", "EVENT_SUBMIT"]),
};

export class PartnerAuthorizationError extends Error {
  readonly status: number;
  constructor(message = "K tomuto Partner zdroju nemáte prístup.", status = 403) { super(message); this.status=status; }
}

export type PartnerManagedResource = {
  resourceId: string; entityType: PartnerResourceType; canonicalId: number; role: PartnerRole;
  name: string; status: string; slug: string; publicHref: string | null;
  verificationStatus: "UNVERIFIED"|"PENDING_VERIFICATION"|"VERIFIED"|"REJECTED";
};

type MembershipRow = { membershipId: string; accountId: string; resourceId: string; role: string; accountStatus: string; revokedAt: string | null };
function role(value: string): PartnerRole {
  if (!(partnerRoles as readonly string[]).includes(value)) throw new Error("Neplatná Partner rola v databáze.");
  return value as PartnerRole;
}

export async function getPartnerMembership(accountId: string, resourceId: string, database?: D1Database) {
  const row = await getPartnerDatabase(database).prepare(`
    SELECT m.id membershipId,m.account_id accountId,m.resource_id resourceId,m.role,
      a.status accountStatus,m.revoked_at revokedAt
    FROM partner_memberships m JOIN partner_accounts a ON a.id=m.account_id
    WHERE m.account_id=?1 AND m.resource_id=?2 AND m.revoked_at IS NULL LIMIT 1
  `).bind(accountId, resourceId).first<MembershipRow>();
  if (!row || row.accountStatus !== "ACTIVE") return null;
  return { ...row, role: role(row.role) };
}

export async function requirePartnerMembership(accountId: string, resourceId: string, database?: D1Database) {
  const membership = await getPartnerMembership(accountId, resourceId, database);
  if (!membership) throw new PartnerAuthorizationError();
  return membership;
}

export async function requirePartnerRole(accountId: string, resourceId: string, allowed: readonly PartnerRole[], database?: D1Database) {
  const membership = await requirePartnerMembership(accountId, resourceId, database);
  if (!allowed.includes(membership.role)) throw new PartnerAuthorizationError();
  return membership;
}

export async function requirePartnerPermission(accountId: string, resourceId: string, permission: PartnerPermission, database?: D1Database) {
  const membership = await requirePartnerMembership(accountId, resourceId, database);
  if (!ROLE_PERMISSIONS[membership.role].has(permission)) throw new PartnerAuthorizationError();
  return membership;
}

export async function listPartnerResources(accountId: string, database?: D1Database): Promise<PartnerManagedResource[]> {
  const result = await getPartnerDatabase(database).prepare(`
    SELECT r.id resourceId,r.entity_type entityType,m.role,
      COALESCE(d.id,o.id,e.id) canonicalId,COALESCE(d.name,o.name,e.title) name,
      COALESCE(d.status,o.status,e.status) status,COALESCE(d.slug,o.slug,e.slug) slug,
      d.category directoryCategory,COALESCE(v.status,'UNVERIFIED') verificationStatus
    FROM partner_memberships m
    JOIN partner_accounts a ON a.id=m.account_id AND a.status='ACTIVE'
    JOIN partner_resources r ON r.id=m.resource_id
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
    LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    LEFT JOIN managed_events e ON e.id=r.managed_event_id
    LEFT JOIN partner_resource_verifications v ON v.account_id=m.account_id AND v.resource_id=m.resource_id
    WHERE m.account_id=?1 AND m.revoked_at IS NULL
    ORDER BY name COLLATE NOCASE,r.id
  `).bind(accountId).all<{resourceId:string;entityType:PartnerResourceType;role:string;canonicalId:number;name:string;status:string;slug:string;directoryCategory:string|null;verificationStatus:"UNVERIFIED"|"PENDING_VERIFICATION"|"VERIFIED"|"REJECTED"}>();
  return result.results.map((item) => ({
    ...item, role: role(item.role),
    publicHref: item.entityType === "DIRECTORY_PROFILE" ? `/adresar/${item.directoryCategory}/${item.slug}`
      : item.entityType === "HELP_ORGANIZATION" ? `/organizacie/${item.slug}`
      : item.status === "published" ? `/podujatia/${item.slug}` : null,
  }));
}

export type PartnerAuditAction = "ACCOUNT_CREATED"|"EMAIL_VERIFIED"|"ACCOUNT_SUSPENDED"|"ACCOUNT_REACTIVATED"|"ACCOUNT_DEACTIVATED"|"SESSIONS_REVOKED"|"MEMBERSHIP_CREATED"|"MEMBERSHIP_ROLE_CHANGED"|"MEMBERSHIP_REVOKED"|"COMMERCIAL_INTEREST_CREATED"|"COMMERCIAL_INTEREST_STATUS_CHANGED"|"COMMERCIAL_INTEREST_NOTE_UPDATED"|"CLAIM_SUBMITTED"|"CLAIM_APPROVED"|"CLAIM_REJECTED"|"CLAIM_CANCELLED"|"VERIFICATION_REQUESTED"|"VERIFICATION_VERIFIED"|"VERIFICATION_REJECTED";
export type PartnerAuditActor = "PARTNER"|"ADMIN"|"SYSTEM";

function safeMetadata(value: Record<string, unknown> = {}) {
  const safe: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/email|cipher|hash|token|secret|password/i.test(key)) continue;
    if (item === null || ["string", "number", "boolean"].includes(typeof item)) safe[key] = item;
  }
  return JSON.stringify(safe);
}

export async function appendPartnerAuditEvent(input: {actorType:PartnerAuditActor;actorRef:string;action:PartnerAuditAction;targetType:string;targetId:string;metadata?:Record<string,unknown>;now?:Date;database?:D1Database}) {
  await getPartnerDatabase(input.database).prepare(`INSERT INTO partner_audit_events
    (id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`)
    .bind(crypto.randomUUID(),input.actorType,input.actorRef,input.action,input.targetType,input.targetId,safeMetadata(input.metadata),(input.now??new Date()).toISOString()).run();
}

export type PartnerAccountSummary = { id:string; emailCiphertext:string; status:PartnerAccountStatus; emailVerifiedAt:string|null; createdAt:string; activeMembershipCount:number };
