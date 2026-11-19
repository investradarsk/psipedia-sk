import { env } from "cloudflare:workers";
import { readProfileGallery, mergeProfileGallery, normalizeProfileGalleryUrls, PROFILE_GALLERY_LIMIT } from "@/lib/partner-profile-gallery";
import { DIRECTORY_ADDITIONAL_CATEGORIES_SQL_CONFIRMED_KEY, mergeAdditionalDirectoryCategories, readAdditionalDirectoryCategories } from "@/lib/directory-multi-category";
import { assertPendingPartnerGalleryMedia, attachPartnerGalleryMediaStatements, galleryPendingInsertGuard, normalizePartnerGalleryMediaIds, partnerGalleryMediaIdsFromStoredPatch, terminalPartnerGalleryMediaStatements, PARTNER_GALLERY_MEDIA_KEY } from "@/lib/partner-profile-gallery-media";
import { enqueueAdminNotificationEvent } from "@/lib/admin-notifications";
import { omitDirectorySqlContactAliases } from "@/lib/directory-profile-metadata";
import { readDirectorySqlBackedContacts } from "@/lib/directory-sql-contacts";
import { readDirectoryPublicMetadataValue } from "@/lib/directory-public-facts";
import { getDirectoryFilterDefinition, mergeDirectoryFilterValues, normalizeDirectoryFilterValue, serviceFilterCategories, serviceFiltersForCategory, type ServiceFilterCategory } from "@/lib/directory-filter-contract";
import { normalizeDirectoryRegion, normalizeDirectorySearchText } from "@/lib/directory-store";
import { getPartnerDatabase } from "@/lib/partner-auth-store";
import { requirePartnerPermission, type PartnerRole } from "@/lib/partner-platform";
import { enforcePartnerProfileChangeRateLimit } from "@/lib/partner-security";
import { normalizePartnerMediaId, terminalPartnerMediaStatement } from "@/lib/partner-media";
import { resolveSlovakLocation } from "@/lib/slovakia-locations";
import {
  applyAtomicModerationTransition,
  canTransitionModerationSubmission,
  isFoundationSubmissionStatus,
  type FoundationSubmissionStatus,
} from "@/lib/moderation-transition";

export const partnerProfileChangeResourceTypes = ["DIRECTORY_PROFILE", "HELP_ORGANIZATION"] as const;
export type PartnerProfileChangeResourceType = (typeof partnerProfileChangeResourceTypes)[number];
export type PartnerProfileEditableValue = string | string[] | boolean | null;
export type PartnerProfilePatch = Record<string, PartnerProfileEditableValue>;

export type PartnerProfileFieldDefinition = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "url" | "email" | "phone" | "boolean" | "list" | "select";
  required?: boolean;
  options?: readonly string[];
};

const DIRECTORY_FIELDS: readonly PartnerProfileFieldDefinition[] = [
  { key: "name", label: "Názov", kind: "text", required: true },
  { key: "excerpt", label: "Krátky popis", kind: "textarea", required: true },
  { key: "description", label: "Popis", kind: "textarea" },
  { key: "additionalCategories", label: "Ďalšie kategórie", kind: "list" },
  { key: "services", label: "Služby", kind: "list" },
  { key: "qualifications", label: "Kvalifikácie", kind: "list" },
  { key: "city", label: "Mesto", kind: "text", required: true },
  { key: "district", label: "Okres", kind: "text" },
  { key: "region", label: "Kraj", kind: "text", required: true },
  { key: "address", label: "Adresa", kind: "text" },
  { key: "openingHours", label: "Otváracie / ordinačné hodiny", kind: "textarea" },
  { key: "priceNote", label: "Poznámka k cene", kind: "textarea" },
  { key: "websiteUrl", label: "Web", kind: "text" },
  { key: "publicPhone", label: "Verejný telefón", kind: "text" },
  { key: "publicEmail", label: "Verejný e-mail", kind: "text" },
  { key: "facebookUrl", label: "Facebook", kind: "text" },
  { key: "instagramUrl", label: "Instagram", kind: "text" },
  { key: "galleryUrls", label: "Fotogaléria", kind: "list" },
];

const HELP_TYPES = [
  "SHELTER",
  "CIVIC_ASSOCIATION",
  "RESCUE_ORGANIZATION",
  "MUNICIPAL_ORGANIZATION",
  "NONPROFIT",
  "OTHER",
] as const;

const HELP_FIELDS: readonly PartnerProfileFieldDefinition[] = [
  { key: "name", label: "Názov", kind: "text", required: true },
  { key: "legalName", label: "Právny názov", kind: "text" },
  { key: "type", label: "Typ organizácie", kind: "select", required: true, options: HELP_TYPES },
  { key: "shortDescription", label: "Krátky popis", kind: "textarea" },
  { key: "description", label: "Popis", kind: "textarea" },
  { key: "publicEmail", label: "Verejný e-mail", kind: "text" },
  { key: "publicPhone", label: "Verejný telefón", kind: "text" },
  { key: "websiteUrl", label: "Web", kind: "text" },
  { key: "facebookUrl", label: "Facebook", kind: "text" },
  { key: "instagramUrl", label: "Instagram", kind: "text" },
  { key: "address", label: "Adresa", kind: "text" },
  { key: "city", label: "Mesto", kind: "text" },
  { key: "district", label: "Okres", kind: "text" },
  { key: "region", label: "Kraj", kind: "text" },
  { key: "countryCode", label: "Krajina", kind: "text", required: true },
  { key: "galleryUrls", label: "Fotogaléria", kind: "list" },
];

const DIRECTORY_FIELD_KEYS = new Set(DIRECTORY_FIELDS.map((field) => field.key));
const HELP_FIELD_KEYS = new Set(HELP_FIELDS.map((field) => field.key));

const PUBLIC_REJECTION_REASONS = {
  INCORRECT_INFORMATION: "Navrhované údaje sa nepodarilo potvrdiť.",
  INSUFFICIENT_EVIDENCE: "Na schválenie zmeny chýbajú dostatočné podklady.",
  POLICY_CONFLICT: "Navrhovaná zmena nie je v súlade s pravidlami profilu.",
  OTHER: "Návrh úprav nebol schválený.",
} as const;

export type PartnerProfileChangeRejectionReason = keyof typeof PUBLIC_REJECTION_REASONS;
export const partnerProfileChangeRejectionReasons = Object.keys(PUBLIC_REJECTION_REASONS) as PartnerProfileChangeRejectionReason[];

type RuntimeBindings = {
  DB?: D1Database;
  PII_HASH_KEY?: string;
};

export class PartnerProfileChangeError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = "PartnerProfileChangeError";
  }
}

type ResourceRow = {
  resourceId: string;
  entityType: string;
  canonicalId: number | null;
  name: string | null;
  status: string | null;
  slug: string | null;
  directoryCategory: string | null;
};

type CanonicalEditable = {
  resourceId: string;
  entityType: PartnerProfileChangeResourceType;
  canonicalId: number;
  name: string;
  status: string;
  slug: string;
  directoryCategory: string | null;
  publicHref: string | null;
  imageUrl: string | null;
  updatedAt: string;
  values: PartnerProfilePatch;
  locationId: number | null;
  sourceData: Record<string, string | number | null> | null;
  /** Exact source JSON, including legacy objects excluded from public/editable fields. */
  sourceDataJson: string | null;
};

type PartnerChangeRow = {
  id: string;
  resourceType: PartnerProfileChangeResourceType;
  subjectId: string;
  operation: string;
  status: string;
  submitterRef: string | null;
  proposedPatchJson: string;
  riskFlagsJson: string;
  rejectionReasonCode: string | null;
  createdAt: string;
  updatedAt: string;
  resourceId: string;
  accountId: string;
  baseUpdatedAt: string;
  baseSnapshotJson: string;
  resourceName: string;
  slug: string;
  directoryCategory: string | null;
};

function database(input?: D1Database) {
  return getPartnerDatabase(input ?? (env as unknown as RuntimeBindings).DB);
}

function isProfileResourceType(value: unknown): value is PartnerProfileChangeResourceType {
  return typeof value === "string" && (partnerProfileChangeResourceTypes as readonly string[]).includes(value);
}

export function getPartnerEditableFields(resourceType: PartnerProfileChangeResourceType) {
  return resourceType === "DIRECTORY_PROFILE" ? DIRECTORY_FIELDS : HELP_FIELDS;
}

function safeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PartnerProfileChangeError("Údaje zmien nie sú platné.");
  }
  return value as Record<string, unknown>;
}

function rejectMarkup(value: string, label: string) {
  if (/[<>]/.test(value)) throw new PartnerProfileChangeError(label + " nesmie obsahovať HTML.");
  if (/[ --]/.test(value)) {
    throw new PartnerProfileChangeError(label + " obsahuje nepovolené znaky.");
  }
}

function textValue(value: unknown, label: string, max: number, required = false, min = 0) {
  if (typeof value !== "string") throw new PartnerProfileChangeError(label + " musí byť text.");
  const clean = value.replace(/\r\n?/g, "\n").trim();
  rejectMarkup(clean, label);
  if (required && !clean) throw new PartnerProfileChangeError(label + " je povinný údaj.");
  if (clean && clean.length < min) throw new PartnerProfileChangeError(label + " je príliš krátky.");
  if (clean.length > max) throw new PartnerProfileChangeError(label + " je príliš dlhý.");
  return clean;
}

function urlValue(value: unknown, label: string) {
  const clean = textValue(value, label, 1200);
  if (!clean) return "";
  let parsed: URL;
  try { parsed = new URL(clean); } catch { throw new PartnerProfileChangeError(label + " musí byť platná URL."); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PartnerProfileChangeError(label + " musí používať http alebo https.");
  }
  return parsed.toString();
}

function emailValue(value: unknown) {
  const clean = textValue(value, "Verejný e-mail", 320).toLowerCase();
  if (clean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    throw new PartnerProfileChangeError("Verejný e-mail nemá platný formát.");
  }
  return clean;
}

function phoneValue(value: unknown) {
  const clean = textValue(value, "Verejný telefón", 100);
  if (clean && !/^[+0-9() .\/-]+$/.test(clean)) {
    throw new PartnerProfileChangeError("Verejný telefón nemá platný formát.");
  }
  return clean;
}

function listValue(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new PartnerProfileChangeError(label + " musí byť zoznam.");
  if (value.length > 20) throw new PartnerProfileChangeError(label + " môže obsahovať najviac 20 položiek.");
  const result: string[] = [];
  for (const item of value) {
    const clean = textValue(item, label, 160);
    if (clean && !result.includes(clean)) result.push(clean);
  }
  return result;
}

function equalValue(a: PartnerProfileEditableValue, b: PartnerProfileEditableValue) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseJsonObject(value: string | null | undefined) {
  if (!value) return {} as Record<string, string | number | null>;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, string | number | null>;
  } catch {
    return {};
  }
}

function parsePatch(value: string): PartnerProfilePatch {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const clean = { ...(parsed as PartnerProfilePatch) };
    delete clean[PARTNER_GALLERY_MEDIA_KEY];
    return clean;
  } catch {
    return {};
  }
}

function parseStringList(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function resourceRow(resourceId: string, db: D1Database): Promise<ResourceRow | null> {
  return db.prepare(`
    SELECT r.id resourceId,r.entity_type entityType,
      COALESCE(r.directory_profile_id,r.help_organization_id) canonicalId,
      COALESCE(d.name,o.name) name,COALESCE(d.status,o.status) status,
      COALESCE(d.slug,o.slug) slug,d.category directoryCategory
    FROM partner_resources r
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
    LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    WHERE r.id=?1
      AND r.entity_type IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION')
    LIMIT 1
  `).bind(resourceId).first<ResourceRow>();
}

const OPENING_HOUR_KEYS = ["Otváracie hodiny", "Ordinačné hodiny", "Otváracia doba", "Ordinačná doba", "Pracovná doba"] as const;
async function loadCanonical(resource: ResourceRow, db: D1Database): Promise<CanonicalEditable> {
  if (!isProfileResourceType(resource.entityType) || !resource.canonicalId) {
    throw new PartnerProfileChangeError("Tento resource nie je možné upravovať.", 400);
  }

  if (resource.entityType === "DIRECTORY_PROFILE") {
    const row = await db.prepare(`
      SELECT id,name,slug,category,status,excerpt,description,services_json,qualifications_json,
        city,district,region,address,price_note,website_url,public_phone,public_email,
        facebook_url,instagram_url,image_url,source_data_json,updated_at
      FROM directory_profiles WHERE id=?1 LIMIT 1
    `).bind(resource.canonicalId).first<{
      id:number;name:string;slug:string;category:string;status:string;excerpt:string;description:string;
      services_json:string;qualifications_json:string;city:string;district:string;region:string;address:string;
      price_note:string;website_url:string|null;public_phone?:string|null;public_email?:string|null;
      facebook_url?:string|null;instagram_url?:string|null;image_url:string|null;source_data_json:string;updated_at:string;
    }>();
    if (!row || row.status === "archived") throw new PartnerProfileChangeError("Profil už nie je dostupný na úpravu.", 409);
    const sourceData = parseJsonObject(row.source_data_json);
    const contacts = readDirectorySqlBackedContacts(sourceData, row);
    return {
      resourceId: resource.resourceId,
      entityType: "DIRECTORY_PROFILE",
      canonicalId: row.id,
      name: row.name,
      status: row.status,
      slug: row.slug,
      directoryCategory: row.category,
      publicHref: `/adresar/${row.category}/${row.slug}`,
      imageUrl: row.image_url,
      updatedAt: row.updated_at,
      locationId: null,
      sourceData,
      sourceDataJson: row.source_data_json,
      values: {
        ...Object.fromEntries(serviceFiltersForCategory(row.category).map((definition) => [
          definition.id, sourceData[definition.d1.key] ?? null,
        ])),
        name: row.name,
        excerpt: row.excerpt,
        description: row.description,
        additionalCategories: readAdditionalDirectoryCategories(sourceData, row.category),
        services: parseStringList(row.services_json),
        qualifications: parseStringList(row.qualifications_json),
        city: row.city,
        district: row.district,
        region: row.region,
        address: row.address,
        priceNote: row.price_note,
        openingHours: readDirectoryPublicMetadataValue(sourceData, "Ordinačné hodiny"),
        galleryUrls: readProfileGallery(sourceData, row.category),
        websiteUrl: contacts.website,
        publicPhone: contacts.phone,
        publicEmail: contacts.email,
        facebookUrl: contacts.facebook,
        instagramUrl: contacts.instagram,
      },
    };
  }

  const row = await db.prepare(`
    SELECT id,name,slug,legal_name,registration_number,type,status,short_description,description,
      public_email,public_phone,website_url,facebook_url,instagram_url,image_url,address,city,district,region,
      country_code,source_data_json,updated_at
    FROM help_organizations WHERE id=?1 LIMIT 1
  `).bind(resource.canonicalId).first<{
    id:number;name:string;slug:string;legal_name:string;registration_number:string|null;type:string;status:string;
    short_description:string;description:string;public_email:string|null;public_phone:string|null;
    website_url:string|null;facebook_url:string|null;instagram_url:string|null;image_url:string|null;address:string;city:string;
    district:string;region:string;country_code:string;source_data_json:string;updated_at:string;
  }>();
  if (!row || row.status === "ARCHIVED") throw new PartnerProfileChangeError("Organizácia už nie je dostupná na úpravu.", 409);
  const location = await db.prepare(`
    SELECT id,address,city,district,region,country_code countryCode
    FROM organization_locations WHERE organization_id=?1
    ORDER BY is_primary DESC,sort_order ASC,id ASC LIMIT 1
  `).bind(row.id).first<{id:number;address:string;city:string;district:string;region:string;countryCode:string}>();
  return {
    resourceId: resource.resourceId,
    entityType: "HELP_ORGANIZATION",
    canonicalId: row.id,
    name: row.name,
    status: row.status,
    slug: row.slug,
    directoryCategory: null,
    publicHref: `/organizacie/${row.slug}`,
    imageUrl: row.image_url,
    updatedAt: row.updated_at,
    locationId: location?.id ?? null,
    sourceData: parseJsonObject(row.source_data_json),
    sourceDataJson: row.source_data_json,
    values: {
      name: row.name,
      legalName: row.legal_name,
      registrationNumber: row.registration_number ?? "",
      type: row.type,
      shortDescription: row.short_description,
      description: row.description,
      publicEmail: row.public_email ?? "",
      publicPhone: row.public_phone ?? "",
      websiteUrl: row.website_url ?? "",
      facebookUrl: row.facebook_url ?? "",
      instagramUrl: row.instagram_url ?? "",
      address: location?.address ?? row.address,
      city: location?.city ?? row.city,
      district: location?.district ?? row.district,
      region: location?.region ?? row.region,
      countryCode: location?.countryCode ?? row.country_code,
      galleryUrls: readProfileGallery(parseJsonObject(row.source_data_json)),
    },
  };
}

async function revisionFor(updatedAt: string, values: PartnerProfilePatch) {
  const data = new TextEncoder().encode(updatedAt + "\n" + JSON.stringify(values));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
}

export async function getPartnerProfileEditor(accountId: string, resourceId: string, dbInput?: D1Database) {
  const db = database(dbInput);
  const membership = await requirePartnerPermission(accountId, resourceId, "PROFILE_SUBMIT_CHANGE", db);
  const resource = await resourceRow(resourceId, db);
  if (!resource) throw new PartnerProfileChangeError("Profil sa nenašiel.", 404);
  const canonical = await loadCanonical(resource, db);
  return {
    resource: {
      resourceId: canonical.resourceId,
      entityType: canonical.entityType,
      canonicalId: canonical.canonicalId,
      name: canonical.name,
      status: canonical.status,
      publicHref: canonical.publicHref,
      imageUrl: canonical.imageUrl,
      directoryCategory: canonical.directoryCategory,
      role: membership.role as PartnerRole,
    },
    fields: getPartnerEditableFields(canonical.entityType),
    values: canonical.values,
    baseUpdatedAt: canonical.updatedAt,
    baseRevision: await revisionFor(canonical.updatedAt, canonical.values),
  };
}

export async function loadPartnerCanonicalForResource(resourceId: string, dbInput?: D1Database) {
  const db = database(dbInput);
  const resource = await resourceRow(resourceId, db);
  if (!resource) throw new PartnerProfileChangeError("Profil sa nenašiel.", 404);
  return loadCanonical(resource, db);
}

function validateSlovakLocationChange(
  raw: Record<string, unknown>,
  current: PartnerProfilePatch,
  normalized: PartnerProfilePatch,
  resourceType: PartnerProfileChangeResourceType,
) {
  const locationTouched = ["city", "district", "region"].some((key) => Object.hasOwn(raw, key));
  const countryTouched = resourceType === "HELP_ORGANIZATION" && Object.hasOwn(raw, "countryCode");
  if (!locationTouched && !countryTouched) return;

  const next = { ...current, ...normalized };
  const countryCode = resourceType === "DIRECTORY_PROFILE"
    ? "SK"
    : String(next.countryCode ?? "SK").trim().toUpperCase();
  if (countryCode !== "SK") return;

  const hasAnyLocation = ["city", "district", "region"].some((key) => String(next[key] ?? "").trim());
  if (resourceType === "HELP_ORGANIZATION" && !hasAnyLocation) return;

  const canonical = resolveSlovakLocation({
    city: String(next.city ?? ""),
    district: String(next.district ?? ""),
    region: String(next.region ?? ""),
  });
  if (!canonical) {
    throw new PartnerProfileChangeError("Vyberte platnú obec/mesto, okres a kraj zo slovenského číselníka.");
  }

  for (const key of ["city", "district", "region"] as const) {
    if (Object.hasOwn(normalized, key)) normalized[key] = canonical[key];
  }
}

function normalizeDirectoryPatch(raw: Record<string, unknown>, current: PartnerProfilePatch, allowEmpty = false, directoryCategory?: string | null) {
  const result: PartnerProfilePatch = {};
  for (const [key, value] of Object.entries(raw)) {
    const facet = getDirectoryFilterDefinition(key);
    if (facet) {
      if (facet.category !== directoryCategory) {
        throw new PartnerProfileChangeError(`Filter ${key} nepatrí do kategórie profilu.`);
      }
      const normalized = normalizeDirectoryFilterValue(facet, value);
      if (normalized.status !== "known") throw new PartnerProfileChangeError(`Nepovolená hodnota filtra: ${key}.`);
      result[key] = normalized.value;
      continue;
    }
    if (!DIRECTORY_FIELD_KEYS.has(key)) throw new PartnerProfileChangeError(`Pole ${key} nie je možné upravovať.`);
    if (key === "name") result[key] = textValue(value, "Názov", 180, true);
    else if (key === "excerpt") result[key] = textValue(value, "Krátky popis", 700, true, 20);
    else if (key === "description") result[key] = textValue(value, "Popis", 20_000);
    else if (key === "additionalCategories") {
      try {
        const merged = mergeAdditionalDirectoryCategories({}, value, directoryCategory ?? "");
        result[key] = readAdditionalDirectoryCategories(merged, directoryCategory ?? "");
      } catch (error) {
        throw new PartnerProfileChangeError(error instanceof Error ? error.message : "Neplatná kategória.");
      }
    }
    else if (key === "services" || key === "qualifications") result[key] = listValue(value, key === "services" ? "Služby" : "Kvalifikácie");
    else if (key === "city") result[key] = textValue(value, "Mesto", 120, true);
    else if (key === "district") result[key] = textValue(value, "Okres", 120);
    else if (key === "region") {
      const clean = textValue(value, "Kraj", 80, true);
      const normalized = normalizeDirectoryRegion(clean);
      if (!normalized) throw new PartnerProfileChangeError("Vyber platný kraj.");
      result[key] = normalized;
    } else if (key === "address") result[key] = textValue(value, "Adresa", 300);
    else if (key === "openingHours") result[key] = textValue(value, "Otváracie hodiny", 1500);
    else if (key === "galleryUrls") {
      try { result[key] = normalizeProfileGalleryUrls(value); }
      catch (error) { throw new PartnerProfileChangeError(error instanceof Error ? error.message : "Neplatná galéria."); }
    }
    else if (key === "priceNote") result[key] = textValue(value, "Poznámka k cene", 1000);
    // Directory contacts are editorial text, just like Perex/Popis.
    // URL/mailto/tel validation belongs only to the public renderer.
    // Never reject or rewrite an entered value because it is not yet clickable.
    else if (key === "websiteUrl") result[key] = textValue(value, "Web", 2048);
    else if (key === "publicPhone") result[key] = textValue(value, "Verejný telefón", 2048);
    else if (key === "publicEmail") result[key] = textValue(value, "Verejný e-mail", 2048);
    else if (key === "facebookUrl") result[key] = textValue(value, "Facebook", 2048);
    else if (key === "instagramUrl") result[key] = textValue(value, "Instagram", 2048);
  }
  validateSlovakLocationChange(raw, current, result, "DIRECTORY_PROFILE");
  return changedOnly(result, current, allowEmpty);
}

function normalizeHelpPatch(raw: Record<string, unknown>, current: PartnerProfilePatch, allowEmpty = false) {
  const result: PartnerProfilePatch = {};
  const nextCountryCode = Object.hasOwn(raw, "countryCode")
    ? textValue(raw.countryCode, "Krajina", 2, true).toUpperCase()
    : String(current.countryCode ?? "SK").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(nextCountryCode)) throw new PartnerProfileChangeError("Kód krajiny musí mať dva znaky.");

  for (const [key, value] of Object.entries(raw)) {
    if (!HELP_FIELD_KEYS.has(key)) throw new PartnerProfileChangeError(`Pole ${key} nie je možné upravovať.`);
    if (key === "name") result[key] = textValue(value, "Názov", 180, true);
    else if (key === "legalName") result[key] = textValue(value, "Právny názov", 240);
    else if (key === "type") {
      const clean = textValue(value, "Typ organizácie", 80, true);
      if (!(HELP_TYPES as readonly string[]).includes(clean)) throw new PartnerProfileChangeError("Vyber platný typ organizácie.");
      result[key] = clean;
    } else if (key === "shortDescription") result[key] = textValue(value, "Krátky popis", 700);
    else if (key === "description") result[key] = textValue(value, "Popis", 20_000);
    else if (key === "publicEmail") result[key] = textValue(value, "Verejný e-mail", 2048);
    else if (key === "publicPhone") result[key] = textValue(value, "Verejný telefón", 2048);
    else if (key === "websiteUrl") result[key] = textValue(value, "Web", 2048);
    else if (key === "facebookUrl") result[key] = textValue(value, "Facebook", 2048);
    else if (key === "instagramUrl") result[key] = textValue(value, "Instagram", 2048);
    else if (key === "address") result[key] = textValue(value, "Adresa", 300);
    else if (key === "city") result[key] = textValue(value, "Mesto", 120);
    else if (key === "district") result[key] = textValue(value, "Okres", 120);
    else if (key === "region") {
      const clean = textValue(value, nextCountryCode === "SK" ? "Kraj" : "Kraj / región", 80);
      if (!clean) result[key] = "";
      else if (nextCountryCode !== "SK") result[key] = clean;
      else {
        const normalized = normalizeDirectoryRegion(clean);
        if (!normalized) throw new PartnerProfileChangeError("Vyber platný kraj.");
        result[key] = normalized;
      }
    } else if (key === "countryCode") {
      result[key] = nextCountryCode;
    } else if (key === "galleryUrls") {
      try { result[key] = normalizeProfileGalleryUrls(value); }
      catch (error) { throw new PartnerProfileChangeError(error instanceof Error ? error.message : "Neplatná galéria."); }
    }
  }
  validateSlovakLocationChange(raw, current, result, "HELP_ORGANIZATION");
  return changedOnly(result, current, allowEmpty);
}

function changedOnly(normalized: PartnerProfilePatch, current: PartnerProfilePatch, allowEmpty = false) {
  const changed: PartnerProfilePatch = {};
  for (const [key, value] of Object.entries(normalized)) {
    if (!equalValue(value, current[key] ?? null)) changed[key] = value;
  }
  if (!Object.keys(changed).length && !allowEmpty) throw new PartnerProfileChangeError("Nezmenili ste žiadny údaj.");
  return changed;
}

export function normalizePartnerProfilePatch(
  resourceType: PartnerProfileChangeResourceType,
  value: unknown,
  current: PartnerProfilePatch,
  allowEmpty = false,
  directoryCategory?: string | null,
) {
  const raw = safeObject(value);
  if (!Object.keys(raw).length && !allowEmpty) throw new PartnerProfileChangeError("Doplňte aspoň jednu zmenu.");
  return resourceType === "DIRECTORY_PROFILE"
    ? normalizeDirectoryPatch(raw, current, allowEmpty, directoryCategory)
    : normalizeHelpPatch(raw, current, allowEmpty);
}

export function partnerProfileChangeRiskFlags(patch: PartnerProfilePatch) {
  const keys = new Set(Object.keys(patch));
  const flags: string[] = [];
  if (keys.has("name")) flags.push("NAME_CHANGE");
  if (["address", "city", "district", "region", "countryCode"].some((key) => keys.has(key))) flags.push("ADDRESS_CHANGE");
  if (["websiteUrl", "facebookUrl", "instagramUrl"].some((key) => keys.has(key))) flags.push("WEBSITE_CHANGE");
  if (["publicEmail", "publicPhone"].some((key) => keys.has(key))) flags.push("SENSITIVE_CONTACT_CHANGE");
  return flags;
}

function isUniqueActiveError(error: unknown) {
  return /partner_profile_change_active_unique|UNIQUE constraint failed: partner_profile_change_metadata/i
    .test(error instanceof Error ? error.message : String(error));
}

export async function submitPartnerProfileChange(input: {
  accountId: string;
  resourceId: string;
  baseRevision: unknown;
  patch: unknown;
  mediaAssetId?: unknown;
  galleryMediaIds?: unknown;
  database?: D1Database;
  hashKey?: string;
  now?: Date;
}) {
  const db = database(input.database);
  await requirePartnerPermission(input.accountId, input.resourceId, "PROFILE_SUBMIT_CHANGE", db);
  const resource = await resourceRow(input.resourceId, db);
  if (!resource) throw new PartnerProfileChangeError("Profil sa nenašiel.", 404);
  const canonical = await loadCanonical(resource, db);
  const currentRevision = await revisionFor(canonical.updatedAt, canonical.values);
  if (typeof input.baseRevision !== "string" || input.baseRevision !== currentRevision) {
    throw new PartnerProfileChangeError("Profil sa medzitým zmenil. Obnovte stránku a skontrolujte aktuálne údaje.", 409);
  }
  const mediaAssetId = normalizePartnerMediaId(input.mediaAssetId);
  const galleryMediaIds = normalizePartnerGalleryMediaIds(input.galleryMediaIds);
  if (mediaAssetId && galleryMediaIds.includes(mediaAssetId)) throw new PartnerProfileChangeError("Hlavný obrázok sa nesmie súčasne použiť v galérii.");
  const patch = normalizePartnerProfilePatch(canonical.entityType, input.patch, canonical.values, Boolean(mediaAssetId || galleryMediaIds.length), canonical.directoryCategory);
  const existingGallery = Array.isArray(patch.galleryUrls) ? patch.galleryUrls : canonical.values.galleryUrls;
  if (!Array.isArray(existingGallery) || existingGallery.length + galleryMediaIds.length > PROFILE_GALLERY_LIMIT) {
    throw new PartnerProfileChangeError("Galéria môže obsahovať najviac 6 fotografií.");
  }
  await assertPendingPartnerGalleryMedia(db, input.accountId, galleryMediaIds);
  const hashKey = input.hashKey ?? (env as unknown as RuntimeBindings).PII_HASH_KEY?.trim();
  if (!hashKey) throw new PartnerProfileChangeError("Bezpečnostná konfigurácia nie je dostupná.", 503);
  await enforcePartnerProfileChangeRateLimit({
    database: db,
    accountId: input.accountId,
    resourceId: input.resourceId,
    hashKey,
    now: input.now,
  });

  const existing = await db.prepare(`
    SELECT m.submission_id id
    FROM partner_profile_change_metadata m
    JOIN moderation_submissions s ON s.id=m.submission_id
    WHERE m.partner_account_id=?1 AND m.partner_resource_id=?2 AND m.dedupe_active=1
      AND s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED')
    LIMIT 1
  `).bind(input.accountId, input.resourceId).first<{id:string}>();
  if (existing) throw new PartnerProfileChangeError("Pre tento profil už máte návrh, ktorý čaká na spracovanie.", 409);

  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();
  const riskFlags = partnerProfileChangeRiskFlags(patch);
  const changedFields = [...new Set([...Object.keys(patch), ...(galleryMediaIds.length ? ["galleryUrls"] : []), ...(mediaAssetId ? ["image"] : [])])];
  const storedPatch = { ...patch, ...(galleryMediaIds.length ? { [PARTNER_GALLERY_MEDIA_KEY]: galleryMediaIds } : {}) };
  const galleryGuard = galleryPendingInsertGuard(galleryMediaIds);
  const notificationId = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const statements = [
    db.prepare(`
      INSERT INTO moderation_submissions(
        id,resource_type,subject_id,operation,status,submitter_type,submitter_ref,
        proposed_patch_json,risk_flags_json,media_asset_id,created_at,updated_at
      ) SELECT ?1,?2,?3,'UPDATE','SUBMITTED','PARTNER_ACCOUNT',?4,?5,?6,?7,?8,?8${galleryGuard.sql}
    `).bind(id, canonical.entityType, String(canonical.canonicalId), input.accountId, JSON.stringify(storedPatch), JSON.stringify(riskFlags), mediaAssetId, nowIso, ...galleryGuard.bindings, ...(galleryMediaIds.length ? [input.accountId, galleryMediaIds.length] : [])),
    db.prepare(`
      INSERT INTO partner_profile_change_metadata(
        submission_id,partner_resource_id,partner_account_id,base_updated_at,base_snapshot_json,changed_field_count,dedupe_active,created_at
      ) VALUES(?1,?2,?3,?4,?5,?6,1,?7)
    `).bind(id, input.resourceId, input.accountId, canonical.updatedAt, JSON.stringify(canonical.values), changedFields.length, nowIso),
    db.prepare(`
      INSERT INTO moderation_events(
        id,submission_id,resource_type,subject_id,action,actor_type,actor_ref,
        from_status,to_status,changed_fields_json,created_at
      ) VALUES(?1,?2,?3,?4,'SUBMISSION_CREATED','PARTNER',?5,NULL,'SUBMITTED',?6,?7)
    `).bind(crypto.randomUUID(), id, canonical.entityType, String(canonical.canonicalId), input.accountId, JSON.stringify(changedFields), nowIso),
    db.prepare(`
      INSERT INTO partner_audit_events(id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
      VALUES(?1,'PARTNER',?2,'PROFILE_CHANGE_SUBMITTED','MODERATION_SUBMISSION',?3,?4,?5)
    `).bind(crypto.randomUUID(), `partner:${input.accountId}`, id, JSON.stringify({resourceId:input.resourceId,changedFieldCount:changedFields.length}), nowIso),
    db.prepare(`
      INSERT OR IGNORE INTO partner_notification_outbox(
        id,partner_account_id,notification_type,dedupe_key,status,encrypted_secret,expires_at,attempts,created_at,updated_at
      ) VALUES(?1,?2,'PROFILE_CHANGE_SUBMITTED',?3,'PENDING',NULL,?4,0,?5,?5)
    `).bind(notificationId, input.accountId, `partner-profile-change-submitted/${id}`, expiresAt, nowIso),
    ...attachPartnerGalleryMediaStatements(db, input.accountId, galleryMediaIds),
  ];

  try {
    await db.batch(statements);
  } catch (error) {
    if (isUniqueActiveError(error)) {
      throw new PartnerProfileChangeError("Pre tento profil už máte návrh, ktorý čaká na spracovanie.", 409);
    }
    if (/invalid partner media attachment|moderation_submissions_media_asset_unique/i.test(String(error))) {
      throw new PartnerProfileChangeError("Priložený obrázok už nie je platný pre túto žiadosť.",409);
    }
    throw error;
  }

  try {
    await enqueueAdminNotificationEvent(db, {
      eventType: "partner_profile_change_submitted",
      sourceType: "PARTNER_PROFILE_CHANGE_REVIEW",
      resourceType: "partner_profile_change",
      resourceRef: id,
      actorType: "PARTNER",
      actorRef: `partner:${input.accountId}`,
      targetUrl: `/admin/partners/changes/${id}`,
      title: "Partner navrhol úpravu profilu",
      body: `${String(canonical.values.name ?? "Profil")} čaká na kontrolu.`,
      tag: `partner-profile-change-${id}`,
      dedupeKey: `partner-profile-change/${id}`,
    }, now);
  } catch (error) {
    console.error(JSON.stringify({ event: "partner_profile_change_admin_push_enqueue", submissionId: id, result: "failed", error: error instanceof Error ? error.message : "unknown" }));
  }

  return {
    id,
    resourceId: input.resourceId,
    resourceType: canonical.entityType,
    status: "SUBMITTED" as const,
    changedFields,
    riskFlags,
    createdAt: nowIso,
  };
}

function profileChangeStatusLabel(status: string) {
  if (status === "SUBMITTED" || status === "PENDING_REVIEW") return "Čaká na kontrolu";
  if (status === "QUARANTINED") return "Vyžaduje dodatočnú kontrolu";
  if (status === "APPROVED") return "Schválené";
  if (status === "REJECTED") return "Zamietnuté";
  return "Zrušené";
}

export async function listPartnerProfileChanges(accountId: string, dbInput?: D1Database) {
  const db = database(dbInput);
  const result = await db.prepare(`
    SELECT s.id,s.resource_type resourceType,s.subject_id subjectId,s.operation,s.status,
      s.submitter_ref submitterRef,s.proposed_patch_json proposedPatchJson,s.risk_flags_json riskFlagsJson,
      s.rejection_reason_code rejectionReasonCode,s.created_at createdAt,s.updated_at updatedAt,
      m.partner_resource_id resourceId,m.partner_account_id accountId,m.base_updated_at baseUpdatedAt,
      m.base_snapshot_json baseSnapshotJson,COALESCE(d.name,o.name) resourceName,
      COALESCE(d.slug,o.slug) slug,d.category directoryCategory
    FROM partner_profile_change_metadata m
    JOIN moderation_submissions s ON s.id=m.submission_id
    JOIN partner_resources r ON r.id=m.partner_resource_id
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
    LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    WHERE m.partner_account_id=?1
    ORDER BY s.created_at DESC,s.id DESC
    LIMIT 200
  `).bind(accountId).all<PartnerChangeRow>();
  return result.results.map((row) => {
    const patch = parsePatch(row.proposedPatchJson);
    const reason = row.rejectionReasonCode && row.rejectionReasonCode in PUBLIC_REJECTION_REASONS
      ? PUBLIC_REJECTION_REASONS[row.rejectionReasonCode as PartnerProfileChangeRejectionReason]
      : row.status === "REJECTED" ? PUBLIC_REJECTION_REASONS.OTHER : null;
    return {
      id: row.id,
      resourceId: row.resourceId,
      resourceType: row.resourceType,
      resourceName: row.resourceName,
      publicHref: row.resourceType === "DIRECTORY_PROFILE"
        ? `/adresar/${row.directoryCategory}/${row.slug}`
        : `/organizacie/${row.slug}`,
      status: row.status,
      statusLabel: profileChangeStatusLabel(row.status),
      changedFields: [...new Set([...Object.keys(patch), ...(partnerGalleryMediaIdsFromStoredPatch(row.proposedPatchJson).length ? ["galleryUrls"] : [])])],
      proposedPatch: patch,
      riskFlags: parseStringList(row.riskFlagsJson),
      rejectionReason: reason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      canWithdraw: ["SUBMITTED","PENDING_REVIEW","QUARANTINED"].includes(row.status),
    };
  });
}

export async function withdrawPartnerProfileChange(input: {
  accountId: string;
  id: string;
  database?: D1Database;
  now?: Date;
}) {
  const db = database(input.database);
  const row = await db.prepare(`
    SELECT s.id,s.status,s.proposed_patch_json proposedPatchJson,m.partner_account_id accountId
    FROM moderation_submissions s
    JOIN partner_profile_change_metadata m ON m.submission_id=s.id
    WHERE s.id=?1 LIMIT 1
  `).bind(input.id).first<{id:string;status:string;accountId:string;proposedPatchJson:string}>();
  if (!row || row.accountId !== input.accountId) throw new PartnerProfileChangeError("Návrh sa nenašiel.", 404);
  if (!isFoundationSubmissionStatus(row.status) || !canTransitionModerationSubmission(row.status, "WITHDRAWN")) {
    throw new PartnerProfileChangeError("Tento návrh už nie je možné zrušiť.", 409);
  }
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const galleryMediaIds = partnerGalleryMediaIdsFromStoredPatch(row.proposedPatchJson);
  const auditId = crypto.randomUUID();
  const actorRef = `partner:${input.accountId}`;
  await applyAtomicModerationTransition(db, {
    id: input.id,
    expectedStatus: row.status as FoundationSubmissionStatus,
    toStatus: "WITHDRAWN",
    actorType: "PARTNER",
    actorRef,
    eventId: crypto.randomUUID(),
    changedFieldsJson: JSON.stringify(["status"]),
    now: nowIso,
    extraStatements: [
      terminalPartnerMediaStatement({database:db,submissionId:input.id,state:"ORPHANED",nowIso,actorRef}),
      ...terminalPartnerGalleryMediaStatements({database:db,submissionId:input.id,ids:galleryMediaIds,state:"ORPHANED",nowIso,actorRef}),
      db.prepare(`
        UPDATE partner_profile_change_metadata SET dedupe_active=0
        WHERE submission_id=?1 AND EXISTS(
          SELECT 1 FROM moderation_submissions
          WHERE id=?1 AND status='WITHDRAWN' AND updated_at=?2
        )
      `).bind(input.id, nowIso),
      db.prepare(`
        INSERT INTO partner_audit_events(id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
        SELECT ?1,'PARTNER',?2,'PROFILE_CHANGE_WITHDRAWN','MODERATION_SUBMISSION',?3,'{}',?4
        WHERE EXISTS(
          SELECT 1 FROM moderation_submissions
          WHERE id=?3 AND status='WITHDRAWN' AND updated_at=?4
        )
      `).bind(auditId, actorRef, input.id, nowIso),
    ],
  });
  return { id: input.id, status: "WITHDRAWN" as const };
}

export function publicPartnerProfileChangeReason(code: string | null | undefined) {
  if (!code || !(code in PUBLIC_REJECTION_REASONS)) return null;
  return PUBLIC_REJECTION_REASONS[code as PartnerProfileChangeRejectionReason];
}

export function isPartnerProfileChangeRejectionReason(value: unknown): value is PartnerProfileChangeRejectionReason {
  return typeof value === "string" && partnerProfileChangeRejectionReasons.includes(value as PartnerProfileChangeRejectionReason);
}

export function partnerProfileChangeIsStale(
  baseSnapshotJson: string,
  current: PartnerProfilePatch,
  resourceType?: PartnerProfileChangeResourceType,
) {
  try {
    const parsed = JSON.parse(baseSnapshotJson) as Record<string, PartnerProfileEditableValue>;
    const base = { ...parsed };
    if (resourceType === "DIRECTORY_PROFILE") delete base.online;
    return JSON.stringify(base) !== JSON.stringify(current);
  } catch {
    return true;
  }
}

export type PartnerDirectOwnerGuard = { resourceId: string; accountId: string; baseUpdatedAt: string; mediaIds?: readonly string[] };
function directOwnerCondition(type: PartnerProfileChangeResourceType, table: string) {
  const column = type === "DIRECTORY_PROFILE" ? "directory_profile_id" : "help_organization_id";
  return ` AND updated_at=? AND EXISTS (
    SELECT 1 FROM partner_resources r
    JOIN partner_memberships m ON m.resource_id=r.id AND m.revoked_at IS NULL AND m.role='OWNER'
    JOIN partner_accounts a ON a.id=m.account_id AND a.status='ACTIVE'
    WHERE r.id=? AND r.entity_type='${type}' AND r.${column}=${table}.id AND m.account_id=?
  )`;
}
function directMediaGuard(guard?: PartnerDirectOwnerGuard) {
  const ids = guard?.mediaIds ?? [];
  if (!ids.length) return { sql: "", values: [] as unknown[] };
  return {
    sql: ` AND (SELECT COUNT(*) FROM media_assets WHERE id IN (${ids.map(() => "?").join(",")})
      AND owner_id=? AND owner_type='PARTNER_PROFILE_UPDATE' AND state='PENDING' AND deleted_at IS NULL)=?`,
    values: [...ids, guard!.accountId, ids.length] as unknown[],
  };
}
export function buildDirectoryApplyStatement(
  db: D1Database,
  canonical: CanonicalEditable,
  patch: PartnerProfilePatch,
  actorRef: string,
  nowIso: string,
  approvalSubmissionId?: string,
  directGuard?: PartnerDirectOwnerGuard,
) {
  const sets: string[] = [];
  const bindings: unknown[] = [];
  const add = (column: string, value: unknown) => { sets.push(`${column}=?`); bindings.push(value); };
  const direct: Record<string,string> = {
    name:"name", excerpt:"excerpt", description:"description", city:"city", district:"district",
    region:"region", address:"address", priceNote:"price_note",
  };
  for (const [key,column] of Object.entries(direct)) if (key in patch) add(column, patch[key]);
  if ("services" in patch) add("services_json", JSON.stringify(patch.services));
  if ("qualifications" in patch) add("qualifications_json", JSON.stringify(patch.qualifications));

  const filterUpdates = Object.fromEntries(
    Object.entries(patch).filter(([key]) => Boolean(getDirectoryFilterDefinition(key))),
  ) as Record<string, string>;
  const contactTouched = ["websiteUrl","publicPhone","publicEmail","facebookUrl","instagramUrl"]
    .some((key) => key in patch);
  if (Object.keys(filterUpdates).length || contactTouched || "galleryUrls" in patch || "openingHours" in patch || "additionalCategories" in patch) {
    // Start from the exact stored JSON, never the public/contact projection:
    // imported metadata may contain objects and keys not exposed by Partner.
    let preserved = canonical.sourceDataJson ?? "{}";
    if (Object.keys(filterUpdates).length) {
      if (!canonical.directoryCategory || !(serviceFilterCategories as readonly string[]).includes(canonical.directoryCategory)) {
        throw new PartnerProfileChangeError("Kategória profilu nepodporuje tieto filtre.");
      }
      preserved = mergeDirectoryFilterValues(preserved, canonical.directoryCategory as ServiceFilterCategory, filterUpdates);
    }
    let source: Record<string, string | number | null>;
    try {
      const parsed: unknown = JSON.parse(preserved);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      source = parsed as Record<string, string | number | null>;
    } catch {
      throw new PartnerProfileChangeError("Pôvodné metadáta profilu sú neplatné; zmena je zablokovaná.");
    }
    if ("galleryUrls" in patch) {
      source = mergeProfileGallery(source, patch.galleryUrls, canonical.directoryCategory);
    }
    if ("additionalCategories" in patch) {
      source = mergeAdditionalDirectoryCategories(source, patch.additionalCategories, canonical.directoryCategory ?? "");
      // Both partner approval and direct-owner routes mirror this explicit
      // selection in the SAME D1 transaction. "1" certifies even an empty [].
      source[DIRECTORY_ADDITIONAL_CATEGORIES_SQL_CONFIRMED_KEY] = "1";
    }
    if ("openingHours" in patch) {
      // Partner moderation and Admin must write the SAME canonical source key.
      // Remove only historical hour spellings; never touch other JSON fields.
      for (const key of OPENING_HOUR_KEYS) delete source[key];
      // Preserve deliberate clears as explicit empty canonical values.
      // Otherwise a subsequent legacy import could resurrect old hours.
      source["Ordinačné hodiny"] = String(patch.openingHours ?? "").trim();
    }
    if (contactTouched) {
      // Explicitly edited public contacts are single-source SQL values.
      // Remove only their historical aliases; never copy unrelated contacts
      // from an old partner editor snapshot back into JSON.
      source = omitDirectorySqlContactAliases(source, {
        publicPhone: "publicPhone" in patch ? String(patch.publicPhone ?? "") : undefined,
        publicEmail: "publicEmail" in patch ? String(patch.publicEmail ?? "") : undefined,
        websiteUrl: "websiteUrl" in patch ? String(patch.websiteUrl ?? "") : undefined,
        facebookUrl: "facebookUrl" in patch ? String(patch.facebookUrl ?? "") : undefined,
        instagramUrl: "instagramUrl" in patch ? String(patch.instagramUrl ?? "") : undefined,
      });
      for (const [field, column] of [
        ["websiteUrl", "website_url"],
        ["publicPhone", "public_phone"],
        ["publicEmail", "public_email"],
        ["facebookUrl", "facebook_url"],
        ["instagramUrl", "instagram_url"],
      ] as const) {
        if (field in patch) add(column, String(patch[field] ?? ""));
      }
    }
    add("source_data_json", JSON.stringify(source));
  }

  const next = { ...canonical.values, ...patch };
  if (["name","excerpt","description","services","qualifications","city","district","region","address"].some((key) => key in patch)) {
    add("search_text", normalizeDirectorySearchText([
      String(next.name ?? ""),String(next.excerpt ?? ""),String(next.description ?? ""),
      Array.isArray(next.services) ? next.services.join(" ") : "",
      Array.isArray(next.qualifications) ? next.qualifications.join(" ") : "",
      String(next.city ?? ""),String(next.district ?? ""),String(next.region ?? ""),String(next.address ?? ""),
    ].join(" ")));
  }
  sets.push("updated_at=?", "updated_by=?");
  bindings.push(nowIso, actorRef, canonical.canonicalId);
  const approvalGuard = approvalSubmissionId
    ? " AND EXISTS(SELECT 1 FROM moderation_submissions WHERE id=? AND status='APPROVED' AND reviewed_at=? AND reviewed_by=?)"
    : "";
  if (approvalSubmissionId) bindings.push(approvalSubmissionId, nowIso, actorRef);
  if (directGuard) bindings.push(directGuard.baseUpdatedAt, directGuard.resourceId, directGuard.accountId);
  const mediaGuard = directMediaGuard(directGuard); bindings.push(...mediaGuard.values);
  const directWhere = directGuard ? directOwnerCondition("DIRECTORY_PROFILE", "directory_profiles") : "";
  return db.prepare(`UPDATE directory_profiles SET ${sets.join(",")} WHERE id=?${approvalGuard}${directWhere}${mediaGuard.sql} RETURNING id`).bind(...bindings);
}

export function buildHelpApplyStatements(
  db: D1Database,
  canonical: CanonicalEditable,
  patch: PartnerProfilePatch,
  actorRef: string,
  nowIso: string,
  approvalSubmissionId?: string,
  directGuard?: PartnerDirectOwnerGuard,
) {
  const sets: string[] = [];
  const bindings: unknown[] = [];
  const add = (column: string, value: unknown) => { sets.push(`${column}=?`); bindings.push(value); };
  const direct: Record<string,string> = {
    name:"name", legalName:"legal_name", registrationNumber:"registration_number", type:"type",
    shortDescription:"short_description", description:"description", publicEmail:"public_email",
    publicPhone:"public_phone", websiteUrl:"website_url", facebookUrl:"facebook_url",
    instagramUrl:"instagram_url", address:"address", city:"city", district:"district",
    region:"region", countryCode:"country_code",
  };
  for (const [key,column] of Object.entries(direct)) {
    if (!(key in patch)) continue;
    const value = patch[key];
    add(column, ["registrationNumber","publicEmail","publicPhone","websiteUrl","facebookUrl","instagramUrl"].includes(key) && value === "" ? null : value);
  }
  if ("galleryUrls" in patch) {
    const source = mergeProfileGallery(parseJsonObject(canonical.sourceDataJson), patch.galleryUrls);
    add("source_data_json", JSON.stringify(source));
  }
  sets.push("updated_at=?", "updated_by=?");
  bindings.push(nowIso, actorRef, canonical.canonicalId);
  const approvalGuard = approvalSubmissionId
    ? " AND EXISTS(SELECT 1 FROM moderation_submissions WHERE id=? AND status='APPROVED' AND reviewed_at=? AND reviewed_by=?)"
    : "";
  if (approvalSubmissionId) bindings.push(approvalSubmissionId, nowIso, actorRef);
  if (directGuard) bindings.push(directGuard.baseUpdatedAt, directGuard.resourceId, directGuard.accountId);
  const mediaGuard = directMediaGuard(directGuard); bindings.push(...mediaGuard.values);
  const directWhere = directGuard ? directOwnerCondition("HELP_ORGANIZATION", "help_organizations") : "";
  const statements: D1PreparedStatement[] = [
    db.prepare(`UPDATE help_organizations SET ${sets.join(",")} WHERE id=?${approvalGuard}${directWhere}${mediaGuard.sql} RETURNING id`).bind(...bindings),
  ];
  const locationKeys = ["address","city","district","region","countryCode"].filter((key) => key in patch);
  if (canonical.locationId && locationKeys.length) {
    const locationSets: string[] = [];
    const locationBindings: unknown[] = [];
    const locationColumns: Record<string,string> = {address:"address",city:"city",district:"district",region:"region",countryCode:"country_code"};
    for (const key of locationKeys) {
      locationSets.push(`${locationColumns[key]}=?`);
      locationBindings.push(patch[key]);
    }
    locationBindings.push(canonical.locationId);
    const locationGuard = approvalSubmissionId
      ? " AND EXISTS(SELECT 1 FROM moderation_submissions WHERE id=? AND status='APPROVED' AND reviewed_at=? AND reviewed_by=?)"
      : "";
    if (approvalSubmissionId) locationBindings.push(approvalSubmissionId, nowIso, actorRef);
    const directLocationGuard = directGuard ? ` AND EXISTS (
      SELECT 1 FROM help_organizations o
      JOIN partner_resources r ON r.help_organization_id=o.id AND r.entity_type='HELP_ORGANIZATION'
      JOIN partner_memberships m ON m.resource_id=r.id AND m.account_id=? AND m.role='OWNER' AND m.revoked_at IS NULL
      JOIN partner_accounts a ON a.id=m.account_id AND a.status='ACTIVE'
      WHERE o.id=organization_locations.organization_id AND r.id=? AND o.updated_at=?
    )` : "";
    if (directGuard) locationBindings.push(directGuard.accountId, directGuard.resourceId, nowIso);
    statements.push(db.prepare(`UPDATE organization_locations SET ${locationSets.join(",")} WHERE id=?${locationGuard}${directLocationGuard}`).bind(...locationBindings));
  }
  return statements;
}
