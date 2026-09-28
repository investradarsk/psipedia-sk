import { env } from "cloudflare:workers";
import { hashPii, normalizeEmail } from "@/lib/pii-crypto";

type Bindings = { PII_HASH_KEY?: string };

export class PartnerOwnershipApprovalGuardError extends Error {
  readonly status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
    this.name = "PartnerOwnershipApprovalGuardError";
  }
}

export async function assertIndependentOwnershipApprover(input: {
  adminEmail: string;
  accountId: string;
  resourceId?: string | null;
  database: D1Database;
  hashKey?: string;
}) {
  const hashKey = input.hashKey ?? (env as unknown as Bindings).PII_HASH_KEY;
  if (!hashKey) {
    throw new PartnerOwnershipApprovalGuardError("PII_HASH_KEY nie je nakonfigurovaný.", 503);
  }

  const emailHash = await hashPii(normalizeEmail(input.adminEmail), hashKey);
  const mapped = await input.database.prepare(`
    SELECT a.id accountId,
      CASE
        WHEN ?2 IS NULL THEN 0
        ELSE EXISTS(
          SELECT 1 FROM partner_memberships m
          WHERE m.account_id=a.id AND m.resource_id=?2 AND m.revoked_at IS NULL
        )
      END resourceMember
    FROM partner_accounts a
    WHERE a.email_hash=?1
    LIMIT 1
  `).bind(emailHash, input.resourceId ?? null).first<{ accountId: string; resourceMember: number }>();

  if (mapped && (mapped.accountId === input.accountId || Boolean(mapped.resourceMember))) {
    throw new PartnerOwnershipApprovalGuardError(
      "Vlastnú žiadosť s pridelením oprávnenia na správu musí schváliť iný administrátor.",
      403,
    );
  }
}
