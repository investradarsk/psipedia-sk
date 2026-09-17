import type {
  OrganizationFundraisingMethodType,
  OrganizationFundraisingOwnership,
  OrganizationFundraisingVerificationStatus,
} from "./organization-fundraising-contract.ts";

export type OrganizationFundraisingMethodStorageRow = {
  id: number;
  organization_id: number;
  type: OrganizationFundraisingMethodType;
  label: string;
  url: string | null;
  value: string | null;
  instructions: string | null;
  beneficiary_identity: string | null;
  ownership: OrganizationFundraisingOwnership;
  sort_order: number;
  is_active: number;
  verification_status: OrganizationFundraisingVerificationStatus;
  verified_at: string | null;
  verified_by: string | null;
  verification_source_url: string | null;
  verification_expires_at: string | null;
  valid_until: string | null;
  version: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
};

export type OrganizationFundraisingMethodRecord = {
  id: number;
  organizationId: number;
  type: OrganizationFundraisingMethodType;
  label: string;
  url: string | null;
  value: string | null;
  instructions: string | null;
  beneficiaryIdentity: string | null;
  ownership: OrganizationFundraisingOwnership;
  sortOrder: number;
  isActive: boolean;
  verificationStatus: OrganizationFundraisingVerificationStatus;
  verifiedAt: string | null;
  verifiedBy: string | null;
  verificationSourceUrl: string | null;
  verificationExpiresAt: string | null;
  validUntil: string | null;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export function mapOrganizationFundraisingMethodRow(
  row: OrganizationFundraisingMethodStorageRow,
): OrganizationFundraisingMethodRecord {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    type: row.type,
    label: row.label,
    url: row.url,
    value: row.value,
    instructions: row.instructions,
    beneficiaryIdentity: row.beneficiary_identity,
    ownership: row.ownership,
    sortOrder: Number(row.sort_order),
    isActive: Boolean(row.is_active),
    verificationStatus: row.verification_status,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    verificationSourceUrl: row.verification_source_url,
    verificationExpiresAt: row.verification_expires_at,
    validUntil: row.valid_until,
    version: Number(row.version),
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}
