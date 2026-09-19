import { isOrganizationPublicationType, type OrganizationPublicationCandidate } from "./help-organization-publication.ts";

export type OrganizationAdminInput = {
  name: string;
  slug: string;
  legalName: string;
  registrationNumber: string | null;
  type: string;
  shortDescription: string;
  description: string;
  publicEmail: string | null;
  publicPhone: string | null;
  websiteUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  imageUrl: string | null;
  imageKey: string | null;
  sourceUrl: string | null;
};

export class OrganizationAdminValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationAdminValidationError";
  }
}

function objectPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OrganizationAdminValidationError("Chýbajú alebo sú neplatné údaje organizácie.");
  }
  return value as Record<string, unknown>;
}

function requiredString(object: Record<string, unknown>, key: string, label: string, max: number) {
  const value = object[key];
  if (typeof value !== "string") throw new OrganizationAdminValidationError(`${label} musí byť text.`);
  const normalized = value.trim();
  if (!normalized) throw new OrganizationAdminValidationError(`${label} je povinný údaj.`);
  if (normalized.length > max) throw new OrganizationAdminValidationError(`${label} môže mať najviac ${max} znakov.`);
  return normalized;
}

function stringValue(object: Record<string, unknown>, key: string, label: string, max: number) {
  const value = object[key];
  if (typeof value !== "string") throw new OrganizationAdminValidationError(`${label} musí byť text.`);
  const normalized = value.trim();
  if (normalized.length > max) throw new OrganizationAdminValidationError(`${label} môže mať najviac ${max} znakov.`);
  return normalized;
}

function nullableString(object: Record<string, unknown>, key: string, label: string, max: number) {
  const value = object[key];
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new OrganizationAdminValidationError(`${label} musí byť text.`);
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new OrganizationAdminValidationError(`${label} môže mať najviac ${max} znakov.`);
  return normalized;
}

function nullableUrl(object: Record<string, unknown>, key: string, label: string) {
  const value = nullableString(object, key, label, 1200);
  if (!value) return null;
  if (value.startsWith("/media/")) return value;
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new OrganizationAdminValidationError(`${label} musí byť platná URL adresa.`); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new OrganizationAdminValidationError(`${label} musí používať http alebo https.`);
  }
  return parsed.toString();
}

function nullableEmail(object: Record<string, unknown>) {
  const value = nullableString(object, "publicEmail", "Verejný e-mail", 320);
  if (!value) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new OrganizationAdminValidationError("Verejný e-mail nemá platný formát.");
  }
  return value;
}

function nullableImageKey(object: Record<string, unknown>) {
  const value = nullableString(object, "imageKey", "Kľúč obrázka", 600);
  if (!value) return null;
  if (!/^help\/\d{4}\/[a-zA-Z0-9._-]+$/.test(value)) {
    throw new OrganizationAdminValidationError("Kľúč obrázka nepatrí do podporovaného help media priestoru.");
  }
  return value;
}

export function parseOrganizationAdminInput(value: unknown): OrganizationAdminInput {
  const object = objectPayload(value);
  for (const managed of ["id", "status", "publishedAt", "archivedAt", "lastVerifiedAt", "createdAt", "updatedAt", "createdBy", "updatedBy"]) {
    if (managed in object) throw new OrganizationAdminValidationError(`${managed} spravuje server a nesmie byť súčasťou editovateľného payloadu.`);
  }

  const slug = requiredString(object, "slug", "Slug", 180).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new OrganizationAdminValidationError("Slug môže obsahovať iba malé písmená bez diakritiky, čísla a pomlčky.");
  }

  const type = requiredString(object, "type", "Typ organizácie", 80);
  if (!isOrganizationPublicationType(type)) {
    throw new OrganizationAdminValidationError("Vyber platný canonical typ organizácie.");
  }

  const imageUrl = nullableUrl(object, "imageUrl", "Obrázok");
  const imageKey = nullableImageKey(object);
  if (imageKey && (!imageUrl || !imageUrl.startsWith("/media/"))) {
    throw new OrganizationAdminValidationError("Spravovaný obrázok musí používať canonical /media/ URL.");
  }

  return {
    name: requiredString(object, "name", "Názov", 180),
    slug,
    legalName: stringValue(object, "legalName", "Právny názov", 240),
    registrationNumber: nullableString(object, "registrationNumber", "Registračné číslo", 100),
    type,
    shortDescription: stringValue(object, "shortDescription", "Krátky popis", 700),
    description: stringValue(object, "description", "Verejný popis", 20_000),
    publicEmail: nullableEmail(object),
    publicPhone: nullableString(object, "publicPhone", "Verejný telefón", 100),
    websiteUrl: nullableUrl(object, "websiteUrl", "Web"),
    facebookUrl: nullableUrl(object, "facebookUrl", "Facebook"),
    instagramUrl: nullableUrl(object, "instagramUrl", "Instagram"),
    imageUrl,
    imageKey,
    sourceUrl: nullableUrl(object, "sourceUrl", "Zdroj"),
  };
}

export function organizationAdminInputFromCandidate(
  organization: OrganizationPublicationCandidate & { imageKey?: string | null },
): OrganizationAdminInput {
  return {
    name: organization.name,
    slug: organization.slug,
    legalName: organization.legalName,
    registrationNumber: organization.registrationNumber,
    type: organization.type,
    shortDescription: organization.shortDescription,
    description: organization.description,
    publicEmail: organization.publicEmail,
    publicPhone: organization.publicPhone,
    websiteUrl: organization.websiteUrl,
    facebookUrl: organization.facebookUrl,
    instagramUrl: organization.instagramUrl,
    imageUrl: organization.imageUrl,
    imageKey: organization.imageKey ?? null,
    sourceUrl: organization.sourceUrl,
  };
}
