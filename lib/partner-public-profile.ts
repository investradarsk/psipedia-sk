import { getPartnerDatabase } from "./partner-auth-store";
import {
  partnerRoleHasPermission,
  partnerRoles,
  type PartnerRole,
} from "./partner-platform";
import { isPublicPartnerResourceVerified, type PartnerClaimableResourceType } from "./partner-claims";
import { normalizePartnerReturnTo, partnerAuthHref } from "./partner-return-to";

type PublicPartnerProfileBase = {
  verified: boolean;
};

export type PublicPartnerProfileManagementState =
  | (PublicPartnerProfileBase & {
      kind: "anonymous";
      managementHref: string;
    })
  | (PublicPartnerProfileBase & {
      kind: "eligible";
      claimHref: string;
    })
  | (PublicPartnerProfileBase & {
      kind: "pending";
      requestHref: string;
    })
  | (PublicPartnerProfileBase & {
      kind: "rejected";
      claimHref: string;
      requestHref: string;
    })
  | (PublicPartnerProfileBase & {
      kind: "member";
      role: PartnerRole;
      editHref: string | null;
      accountHref: string;
    });

type PublicPartnerProfileStateRow = {
  resourceId: string;
  membershipRole: string | null;
  pendingClaimId: string | null;
  rejectedClaimId: string | null;
  verified: number;
};

function canonicalId(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Neplatný verejný profil.");
  }
  return value;
}

function membershipRole(value: string | null): PartnerRole | null {
  if (!value) return null;
  if (!(partnerRoles as readonly string[]).includes(value)) {
    throw new Error("Neplatná Partner rola v databáze.");
  }
  return value as PartnerRole;
}

export function publicPartnerClaimHref(
  entityType: PartnerClaimableResourceType,
  canonicalIdValue: number,
) {
  return `/partner/prevziat-profil/${encodeURIComponent(entityType)}/${canonicalId(canonicalIdValue)}`;
}

export async function getPublicPartnerProfileManagementState(input: {
  accountId: string | null;
  entityType: PartnerClaimableResourceType;
  canonicalId: number;
  database?: D1Database;
}): Promise<PublicPartnerProfileManagementState> {
  const database = getPartnerDatabase(input.database);
  const id = canonicalId(input.canonicalId);
  const accountId = input.accountId ?? "";
  const column = input.entityType === "DIRECTORY_PROFILE"
    ? "directory_profile_id"
    : "help_organization_id";
  const claimHref = publicPartnerClaimHref(input.entityType, id);

  if (!input.accountId) {
    const verified = await isPublicPartnerResourceVerified(input.entityType, id, database);
    const returnTo = normalizePartnerReturnTo(claimHref);
    return {
      kind: "anonymous",
      verified,
      managementHref: partnerAuthHref("/partner/prihlasenie", returnTo),
    };
  }

  const row = await database.prepare(`
    SELECT
      r.id resourceId,
      m.role membershipRole,
      pending.id pendingClaimId,
      rejected.id rejectedClaimId,
      EXISTS(
        SELECT 1
        FROM partner_memberships verified_membership
        JOIN partner_accounts verified_account
          ON verified_account.id=verified_membership.account_id
          AND verified_account.status='ACTIVE'
        JOIN partner_resource_verifications verification
          ON verification.resource_id=r.id
          AND verification.account_id=verified_membership.account_id
          AND verification.status='VERIFIED'
        WHERE verified_membership.resource_id=r.id
          AND verified_membership.revoked_at IS NULL
      ) verified
    FROM partner_resources r
    LEFT JOIN partner_memberships m
      ON m.resource_id=r.id
      AND m.account_id=?3
      AND m.revoked_at IS NULL
    LEFT JOIN partner_claims pending
      ON pending.resource_id=r.id
      AND pending.account_id=?3
      AND pending.status='PENDING'
    LEFT JOIN partner_claims rejected
      ON rejected.id=(
        SELECT rejected_candidate.id
        FROM partner_claims rejected_candidate
        WHERE rejected_candidate.resource_id=r.id
          AND rejected_candidate.account_id=?3
          AND rejected_candidate.status='REJECTED'
        ORDER BY COALESCE(
          rejected_candidate.reviewed_at,
          rejected_candidate.updated_at,
          rejected_candidate.created_at
        ) DESC, rejected_candidate.id DESC
        LIMIT 1
      )
    WHERE r.entity_type=?1 AND r.${column}=?2
    LIMIT 1
  `).bind(input.entityType, id, accountId).first<PublicPartnerProfileStateRow>();

  const verified = Boolean(row?.verified);
  const role = membershipRole(row?.membershipRole ?? null);
  if (row?.resourceId && role) {
    return {
      kind: "member",
      verified,
      role,
      editHref: partnerRoleHasPermission(role, "PROFILE_SUBMIT_CHANGE")
        ? `/partner/profily/${encodeURIComponent(row.resourceId)}/upravit`
        : null,
      accountHref: "/partner/profily",
    };
  }

  if (row?.pendingClaimId) {
    return {
      kind: "pending",
      verified,
      requestHref: "/partner/ziadosti",
    };
  }

  if (row?.rejectedClaimId) {
    return {
      kind: "rejected",
      verified,
      claimHref,
      requestHref: "/partner/ziadosti",
    };
  }

  return {
    kind: "eligible",
    verified,
    claimHref,
  };
}
