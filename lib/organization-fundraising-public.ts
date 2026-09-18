import type { AdoptionD1Database } from "./adoption-store.ts";
import {
  formatIbanForPublicDisplay,
  isOrganizationFundraisingMethodPubliclyEligible,
  validateFundraisingUrl,
  type OrganizationFundraisingMethodType,
  type OrganizationFundraisingOwnership,
  type OrganizationFundraisingVerificationStatus,
} from "./organization-fundraising-contract.ts";

export type PublicOrganizationFundraisingMethod = {
  id: number;
  type: OrganizationFundraisingMethodType;
  label: string;
  url: string | null;
  value: string | null;
  instructions: string | null;
  sortOrder: number;
};

type PublicOrganizationFundraisingCandidateRow = {
  id: number;
  type: OrganizationFundraisingMethodType;
  label: string;
  url: string | null;
  value: string | null;
  instructions: string | null;
  ownership: OrganizationFundraisingOwnership;
  sort_order: number;
  is_active: number;
  verification_status: OrganizationFundraisingVerificationStatus;
  verification_expires_at: string | null;
  valid_until: string | null;
  archived_at: string | null;
};

export function buildPublicOrganizationFundraisingMethodsQuery(organizationId: number) {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return null;
  return {
    sql: `SELECT f.id, f.type, f.label, f.url, f.value, f.instructions, f.ownership, f.sort_order,
      f.is_active, f.verification_status, f.verification_expires_at, f.valid_until, f.archived_at
      FROM organization_fundraising_methods f
      WHERE f.organization_id = ?
      ORDER BY f.sort_order ASC, f.id ASC`,
    bindings: [organizationId] as const,
  };
}

function normalizedText(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function toPublicMethod(row: PublicOrganizationFundraisingCandidateRow): PublicOrganizationFundraisingMethod {
  const urlResult = row.url ? validateFundraisingUrl(row.url) : null;
  const value = row.type === "BANK_TRANSFER" || row.type === "TRANSPARENT_ACCOUNT"
    ? formatIbanForPublicDisplay(row.value)
    : normalizedText(row.value);

  return {
    id: Number(row.id),
    type: row.type,
    label: row.label.trim(),
    url: urlResult?.valid ? urlResult.normalizedUrl : null,
    value,
    instructions: normalizedText(row.instructions),
    sortOrder: Number(row.sort_order),
  };
}

export async function listPublicOrganizationFundraisingMethods(
  organizationId: number,
  parentOrganizationStatus: unknown,
  database: AdoptionD1Database,
  now = new Date(),
): Promise<PublicOrganizationFundraisingMethod[]> {
  const query = buildPublicOrganizationFundraisingMethodsQuery(organizationId);
  if (!query) return [];

  const result = await database
    .prepare(query.sql)
    .bind(...query.bindings)
    .all<PublicOrganizationFundraisingCandidateRow>();

  return result.results
    .filter((row) => isOrganizationFundraisingMethodPubliclyEligible(
      parentOrganizationStatus,
      {
        type: row.type,
        url: row.url,
        value: row.value,
        ownership: row.ownership,
        active: Boolean(row.is_active),
        verificationStatus: row.verification_status,
        archivedAt: row.archived_at,
        verificationExpiresAt: row.verification_expires_at,
        validUntil: row.valid_until,
      },
      now,
    ))
    .map(toPublicMethod);
}
