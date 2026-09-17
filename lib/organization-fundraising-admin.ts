import {
  isOrganizationFundraisingMethodType,
  isOrganizationFundraisingOwnership,
  isValidOrganizationFundraisingDestination,
  normalizeIban,
  validateFundraisingUrl,
  type OrganizationFundraisingMethodType,
  type OrganizationFundraisingOwnership,
} from "./organization-fundraising-contract.ts";

export type OrganizationFundraisingAdminEditableInput = {
  type: OrganizationFundraisingMethodType;
  label: string;
  url: string | null;
  value: string | null;
  instructions: string | null;
  beneficiaryIdentity: string | null;
  ownership: OrganizationFundraisingOwnership;
  sortOrder: number;
  isActive: boolean;
};

const MANAGED_FIELD_KEYS = new Set([
  "organizationId", "organization_id", "version", "archivedAt", "archived_at",
  "createdAt", "created_at", "updatedAt", "updated_at", "createdBy", "created_by", "updatedBy", "updated_by",
  "verificationStatus", "verification_status", "verifiedAt", "verified_at", "verifiedBy", "verified_by",
  "verificationSourceUrl", "verification_source_url", "verificationExpiresAt", "verification_expires_at",
  "validUntil", "valid_until",
]);

export class OrganizationFundraisingAdminValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationFundraisingAdminValidationError";
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OrganizationFundraisingAdminValidationError("Fundraising payload musí byť objekt.");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, fallback = "") {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") {
    throw new OrganizationFundraisingAdminValidationError(`${field} musí byť text.`);
  }
  return value.trim();
}

function nullableText(value: unknown, field: string) {
  const normalized = text(value, field);
  return normalized || null;
}

function normalizeSortOrder(value: unknown) {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new OrganizationFundraisingAdminValidationError("Poradie musí byť celé číslo.");
  }
  return value;
}

function normalizeActive(value: unknown) {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") {
    throw new OrganizationFundraisingAdminValidationError("Aktívny stav musí byť boolean.");
  }
  return value;
}

function rejectManagedFields(record: Record<string, unknown>) {
  const managed = Object.keys(record).find((key) => MANAGED_FIELD_KEYS.has(key));
  if (managed) {
    throw new OrganizationFundraisingAdminValidationError(`Pole ${managed} spravuje server alebo verification workflow.`);
  }
}

export function normalizeOrganizationFundraisingAdminInput(
  value: unknown,
  mode: "create" | "update" = "update",
): OrganizationFundraisingAdminEditableInput {
  const record = requireRecord(value);
  rejectManagedFields(record);

  if (!isOrganizationFundraisingMethodType(record.type)) {
    throw new OrganizationFundraisingAdminValidationError("Neplatný typ fundraising metódy.");
  }
  if (!isOrganizationFundraisingOwnership(record.ownership)) {
    throw new OrganizationFundraisingAdminValidationError("Neplatné vlastníctvo fundraising metódy.");
  }

  const rawUrl = nullableText(record.url, "URL");
  let url: string | null = null;
  if (rawUrl) {
    const result = validateFundraisingUrl(rawUrl);
    if (!result.valid) {
      throw new OrganizationFundraisingAdminValidationError(`Neplatná alebo nebezpečná fundraising URL (${result.reason}).`);
    }
    url = result.normalizedUrl;
  }

  const rawValue = nullableText(record.value, "Hodnota");
  const normalizedValue = rawValue && (record.type === "BANK_TRANSFER" || record.type === "TRANSPARENT_ACCOUNT")
    ? normalizeIban(rawValue)
    : rawValue;
  const isActive = normalizeActive(record.isActive);
  if (mode === "create" && isActive) {
    throw new OrganizationFundraisingAdminValidationError("Nová fundraising metóda musí začať ako neaktívna.");
  }

  const normalized: OrganizationFundraisingAdminEditableInput = {
    type: record.type,
    label: text(record.label, "Názov"),
    url,
    value: normalizedValue,
    instructions: nullableText(record.instructions, "Inštrukcie"),
    beneficiaryIdentity: nullableText(record.beneficiaryIdentity, "Identita príjemcu"),
    ownership: record.ownership,
    sortOrder: normalizeSortOrder(record.sortOrder),
    isActive,
  };

  if (!isValidOrganizationFundraisingDestination(normalized)) {
    throw new OrganizationFundraisingAdminValidationError("Fundraising cieľ nezodpovedá contractu zvoleného typu.");
  }

  return normalized;
}
