/**
 * One active external manager per canonical partner resource.
 * A single partner account may still manage any number of resources.
 * This is checked before user-facing approvals; migration 0171 is the
 * database-level concurrency backstop.
 */
export class PartnerSingleManagerConflictError extends Error {
  readonly status = 409;

  constructor() {
    super("Tento záznam už spravuje iný partner. Najprv mu odoberte prístup.");
    this.name = "PartnerSingleManagerConflictError";
  }
}

export async function assertSingleActivePartnerManager(input: {
  database: D1Database;
  resourceId: string;
  accountId: string;
}) {
  const conflicting = await input.database.prepare(
    "SELECT id FROM partner_memberships WHERE resource_id=?1 AND account_id<>?2 AND revoked_at IS NULL LIMIT 1",
  ).bind(input.resourceId, input.accountId).first<{ id: string }>();
  if (conflicting) throw new PartnerSingleManagerConflictError();
}

export function isPartnerSingleManagerConstraintError(error: unknown) {
  return error instanceof Error &&
    /partner_memberships_one_active_resource|UNIQUE constraint failed: partner_memberships\.resource_id|partner_memberships_only_owner/i.test(error.message);
}
