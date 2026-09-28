export const ORGANIZATION_LOCATION_ROLES = ["UNSPECIFIED", "SITE", "LEGAL_SEAT", "SERVICE_AREA"] as const;
export type OrganizationLocationRole = (typeof ORGANIZATION_LOCATION_ROLES)[number];

export type OrganizationLocationAdminInput = {
  role: OrganizationLocationRole;
  label: string;
  address: string;
  city: string;
  district: string;
  region: string;
  countryCode: string;
  isPrimary: boolean;
  sortOrder: number;
};

const MANAGED_FIELD_KEYS = new Set(["id", "organizationId", "organization_id"]);
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

export class OrganizationLocationAdminValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationLocationAdminValidationError";
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OrganizationLocationAdminValidationError("Payload lokality musí byť objekt.");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, fallback = "") {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") {
    throw new OrganizationLocationAdminValidationError(`${field} musí byť text.`);
  }
  const normalized = value.normalize("NFC").trim();
  if (CONTROL_CHARACTERS.test(normalized)) {
    throw new OrganizationLocationAdminValidationError(`${field} obsahuje nepovolené riadiace znaky.`);
  }
  return normalized;
}

function sortOrder(value: unknown) {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new OrganizationLocationAdminValidationError("Poradie musí byť celé číslo.");
  }
  return value;
}

function primary(value: unknown) {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") {
    throw new OrganizationLocationAdminValidationError("Primary stav musí byť boolean.");
  }
  return value;
}

function rejectManagedFields(record: Record<string, unknown>) {
  const managed = Object.keys(record).find((key) => MANAGED_FIELD_KEYS.has(key));
  if (managed) {
    throw new OrganizationLocationAdminValidationError(`Pole ${managed} spravuje server.`);
  }
}

export function normalizeOrganizationLocationAdminInput(value: unknown): OrganizationLocationAdminInput {
  const record = requireRecord(value);
  rejectManagedFields(record);

  if (typeof record.role !== "string" || !(ORGANIZATION_LOCATION_ROLES as readonly string[]).includes(record.role)) {
    throw new OrganizationLocationAdminValidationError("Neplatná rola lokality.");
  }

  return {
    role: record.role as OrganizationLocationRole,
    label: text(record.label, "Názov lokality"),
    address: text(record.address, "Adresa"),
    city: text(record.city, "Mesto"),
    district: text(record.district, "Okres"),
    region: text(record.region, "Kraj"),
    countryCode: text(record.countryCode, "Kód krajiny", "SK") || "SK",
    isPrimary: primary(record.isPrimary),
    sortOrder: sortOrder(record.sortOrder),
  };
}
