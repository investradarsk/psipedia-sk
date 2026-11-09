import { recordNotionTransfer } from "@/lib/notion-transfer-audit";
import { getDirectoryFilterDefinition, mergeDirectoryFilterValues, normalizeDirectoryFilterValue, serviceFilterCategories, type ServiceFilterCategory } from "@/lib/directory-filter-contract";
import { recordDirectoryNotionAlert } from "@/lib/directory-notion-sync-alerts";
import { selectiveNotionProperties } from "@/lib/notion-selective-property-patch";
import {importNotionServiceChoices} from "./service-profile-notion-bridge.ts";
import {loadNotionCatalogRelationLookup,syncProfileCatalogRelation,type CatalogRelationLookup}
  from "./service-catalog-notion-relations";
import { acquireGeminiNotionLock } from "./gemini-notion-review-lock";
import { resolveGeminiPublicSlug } from "./gemini-public-slug";
import type { ManagedDirectoryProfile } from "@/lib/directory";
import {
  archiveManagedDirectoryProfile,
  createManagedDirectoryProfile,
  getManagedDirectoryProfileById,
  normalizeDirectorySearchText,
  normalizeManagedDirectoryProfileInput,
  updateManagedDirectoryProfile,
  type ManagedDirectoryProfileInput,
} from "@/lib/directory-store";
import {
  directoryQualityCheckedAtSummary,
  directoryQualityFields,
  readDirectoryPublicContacts,
  readTrainerServicesText,
  TRAINER_SERVICES_TEXT_METADATA_KEY,
  type DirectoryQualityField,
  type DirectoryQualityResolutionInput,
  type DirectoryQualityResolutionStatus,
} from "@/lib/directory-profile-metadata";
import { verifyDirectoryCanonicalAddress } from "@/lib/directory-address-provider";
import {
  applyVerifiedDirectoryAddressGeo,
  directoryPhysicalAddressChanged,
  withVerifiedDirectoryAddress,
} from "@/lib/directory-address-save";
import {
  cleanupNotionImageKeys,
  cleanupUnreferencedNotionUpload,
  notionFlagEnabled,
  notionPropertyRecord,
  notionRequest,
  prepareNotionMainImage,
  sha256Text,
  type NotionSyncBindings,
} from "@/lib/notion-sync-shared";
import {
  getMediaSourceMonitorForEntity,
  upsertMediaSourceMonitor,
} from "@/lib/media-source-monitor";
import { SITE_URL } from "@/config/public-site";
import { canRecoverNotionDirectoryMapping, directorySyncErrorMetadataNeedsWrite, NotionDirectoryUnsafeTargetError, notionDirectoryPageBelongsToSource, notionDirectoryUpdateSafety } from "@/lib/notion-directory-update-safety";
import { gemini22PriorityEnabled, mergeGeminiDirectoryPriority } from "@/lib/notion-gemini-22-priority";
import { readProfileFieldBaseline, recordProfileFieldBaseline } from "@/lib/notion-profile-field-baseline";
import { reconcileProfileFields, reconcileProfileFieldsWithoutBaseline, trustedProfileBaselineFromHashes } from "@/lib/notion-profile-field-reconciliation";
import { readNotionFieldAuthorities, NOTION_AUTHORITY_GROUPS } from "@/lib/notion-field-authority";
import { planOwnerDirectedFields, type ManualFieldDirection } from "@/lib/notion-manual-transfer-plan";
import {
  BREEDER_NOTION_EDITORIAL_FIELDS, breederAdminChangedFields,
  breederNotionChangedFields, breederApplyNotionChanges, breederReadPath,
  breederPreserveUneditedFields, type BreederEditorialField,
} from "@/lib/notion-breeder-field-events";
import { recordGeminiImportReviewNotes } from "./gemini-import-review-notes";
import { isDirectoryEventPilotCategory, isDirectoryFieldEventCategory } from "./notion-directory-field-event-scope";
import {
  changedTrainerTrustNotionFields, TRAINER_TRUST_NOTION_PROPERTIES,
  type TrainerTrustField,
} from "./notion-trainer-trust-fields";
import {
  getBreederRelationSelection, listBreederRelationOptions, saveBreederRelationSelection,
} from "./breeder-profile-relations";
import {
  BREEDER_NOTION_RELATION_FIELDS, breederRelationChangedFields,
  resolveBreederRelationText, formatBreederRelationText, sameBreederRelationIds,
  type BreederRelationField,
} from "./breeder-relation-text.ts";

export type NotionDirectorySyncBindings = NotionSyncBindings & {
  NOTION_DIRECTORY_SYNC_ENABLED?: string;
  NOTION_DIRECTORY_DATA_SOURCE_ID?: string;
  NOTION_GEMINI_22_PRIORITY_A_ENABLED?: string;
};

type NotionPage = {
  id: string;
  url?: string;
  last_edited_time?: string;
  properties?: Record<string, unknown>;
  // Notion page ownership is verified before a mapped-page PATCH.
  parent?: { type?: string; data_source_id?: string };
  archived?: boolean;
  in_trash?: boolean;
};

type NotionQueryResponse = {
  results?: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
};

type DirectoryNotionMapping = {
  notion_page_id: string;
  directory_profile_id: number;
  content_hash: string;
  notion_last_edited_time: string | null;
  psipedia_updated_at: string | null;
  last_synced_at: string;
};

type GeoMirrorRow = {
  geocode_status: string | null;
  latitude: number | null;
  longitude: number | null;
  provider: string | null;
  source_fingerprint: string | null;
  google_place_id: string | null;
  google_place_source_fingerprint: string | null;
  google_maps_action: string | null;
  updated_at: string | null;
};

type EditableDirectorySnapshot = {
  slug: string;
  name: string;
  category: string;
  status: "draft" | "published" | "archived";
  excerpt: string;
  description: string;
  services: string[];
  qualifications: string[];
  region: string;
  district: string;
  city: string;
  address: string;
  postalCode: string;
  street: string;
  houseNumber: string;
  addressFormat: "" | "STREET" | "MUNICIPALITY_NUMBER";
  confirmedServiceLocation: boolean;
  priceNote: string;
  websiteUrl: string;
  publicPhone: string;
  publicEmail: string;
  facebookUrl: string;
  instagramUrl: string;
  internalEmail: string;
  imageUrl: string;
  qualityResolutions: DirectoryQualityResolutionInput;
  qualityCheckedAt: string;
  verified: boolean;
  featured: boolean;
  seo: {
    title: string;
    description: string;
    focusKeyword: string;
    canonicalUrl: string;
    ogTitle: string;
    ogDescription: string;
    ogImage: string;
    noindex: boolean;
  };
};

export type NotionDirectorySyncSummary = {
  enabled: boolean;
  schemaReady: boolean;
  notionScanned: number;
  bootstrapped: number;
  createdFromNotion: number;
  pulledFromNotion: number;
  pushedToNotion: number;
  unchanged: number;
  failed: number;
  /** Only present when an explicit Admin choice save requests Services V3 sync. */
  serviceRelationSync?: "skipped" | "unchanged" | "pushed" | "pulled";
};

export type NotionDirectoryBootstrapSummary = {
  enabled: boolean;
  schemaReady: boolean;
  selected: number;
  bootstrapped: number;
  failed: number;
  hasMore: boolean;
};


const SYSTEM_ACTOR = "notion-directory-sync@psipedia.sk";
const BOOTSTRAP_BATCH = 20;
const CHANGED_PROFILE_BATCH = 20;
const NOTION_SCAN_BATCH = 40;
const NOTION_API_RICH_TEXT_CHUNK = 1800;

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
}

function property(page: NotionPage, name: string) {
  return notionPropertyRecord(page as Parameters<typeof notionPropertyRecord>[0], name);
}

function richTextPlainText(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    if (!item || typeof item !== "object") return "";
    const plainText = (item as Record<string, unknown>).plain_text;
    return typeof plainText === "string" ? plainText : "";
  }).join("").replace(/\r\n?/g, "\n").trim();
}

function propertyText(page: NotionPage, name: string) {
  const record = property(page, name);
  if (!record) return "";
  if (Array.isArray(record.title)) return richTextPlainText(record.title);
  if (Array.isArray(record.rich_text)) return richTextPlainText(record.rich_text);
  if (typeof record.url === "string") return record.url.trim();
  if (typeof record.email === "string") return record.email.trim();
  if (typeof record.phone_number === "string") return record.phone_number.trim();
  const select = record.select;
  if (select && typeof select === "object" && typeof (select as Record<string, unknown>).name === "string") {
    return String((select as Record<string, unknown>).name).trim();
  }
  return "";
}

function propertyCheckbox(page: NotionPage, name: string) {
  return property(page, name)?.checkbox === true;
}

function propertyDateStart(page: NotionPage, name: string) {
  const value = property(page, name)?.date;
  if (!value || typeof value !== "object") return "";
  const start = (value as Record<string, unknown>).start;
  return typeof start === "string" ? start.trim() : "";
}

const notionQualityProperties: Record<DirectoryQualityField, string> = {
  phone: "Kvalita · Telefón",
  email: "Kvalita · E-mail",
  website: "Kvalita · Web",
  image: "Kvalita · Obrázok",
  address: "Kvalita · Adresa",
};

const notionQualityStatusMap: Record<string, DirectoryQualityResolutionStatus> = {
  "Nemá": "DOES_NOT_EXIST",
  "Verejne nezverejnené": "NOT_PUBLIC",
  "Nedohľadateľné": "NOT_FOUND",
  "Nevzťahuje sa": "NOT_APPLICABLE",
};

function qualityStatusFromNotion(value: string): DirectoryQualityResolutionStatus | "" {
  return notionQualityStatusMap[value] ?? "";
}

function qualityStatusToNotion(value: DirectoryQualityResolutionStatus | "" | undefined) {
  if (!value) return "";
  return Object.entries(notionQualityStatusMap).find(([, status]) => status === value)?.[0] ?? "";
}

function notionQualityResolutions(page: NotionPage): DirectoryQualityResolutionInput {
  return Object.fromEntries(directoryQualityFields.map((field) => [
    field,
    qualityStatusFromNotion(propertyText(page, notionQualityProperties[field])),
  ])) as DirectoryQualityResolutionInput;
}

function splitList(value: string) {
  return [...new Set(value
    .split(/\n|;/g)
    .map((item) => item.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean))]
    .slice(0, 20);
}

/** Qualifications are human prose: semicolons belong inside the same sentence. */
function splitQualificationLines(value: string) {
  return [...new Set(value
    .split(/\r?\n|<br\s*\/?\s*>/gi)
    .map(item => item.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean))]
    .slice(0, 40);
}

function statusFromNotion(value: string): EditableDirectorySnapshot["status"] {
  if (value === "Publikované") return "published";
  if (value === "Archív") return "archived";
  return "draft";
}

function statusToNotion(value: EditableDirectorySnapshot["status"]) {
  if (value === "published") return "Publikované";
  if (value === "archived") return "Archív";
  return "Koncept";
}

function editorialStateForProfile(value: EditableDirectorySnapshot["status"]) {
  if (value === "published") return "Publikované";
  if (value === "archived") return "Archív";
  return "Ready";
}

function absoluteAsset(value: string | null | undefined) {
  const cleanValue = clean(value);
  if (!cleanValue) return "";
  if (cleanValue.startsWith("/")) return `${SITE_URL}${cleanValue}`;
  return cleanValue;
}

function localizeOwnAsset(value: string) {
  const cleanValue = clean(value);
  if (!cleanValue) return null;
  if (cleanValue.startsWith(`${SITE_URL}/media/`) || cleanValue.startsWith(`${SITE_URL}/images/`)) {
    return cleanValue.slice(SITE_URL.length);
  }
  return cleanValue;
}

function externalSourceImageUrl(value: string | null | undefined) {
  const cleanValue = clean(value);
  if (!cleanValue || !/^https:\/\//i.test(cleanValue)) return "";
  try {
    const url = new URL(cleanValue);
    if (url.hostname === "psipedia.sk" || url.hostname.endsWith(".psipedia.sk")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function profileSnapshot(profile: ManagedDirectoryProfile, sourceImageUrl = ""): EditableDirectorySnapshot {
  const contacts = readDirectoryPublicContacts(profile.importData, profile.websiteUrl ?? "");
  return {
    slug: clean(profile.slug),
    name: clean(profile.name),
    category: clean(profile.category),
    status: profile.status,
    excerpt: clean(profile.excerpt),
    description: clean(profile.description),
    services: profile.category === "treneri"
      ? readTrainerServicesText(profile.importData).split(/\r?\n/).map(clean).filter(Boolean)
      : profile.services.map(clean).filter(Boolean),
    qualifications: profile.qualifications.map(clean).filter(Boolean),
    region: clean(profile.region),
    district: clean(profile.district),
    city: clean(profile.city),
    address: clean(profile.address),
    postalCode: clean(profile.postalCode),
    street: clean(profile.street),
    houseNumber: clean(profile.houseNumber),
    addressFormat: profile.addressFormat === "STREET" || profile.addressFormat === "MUNICIPALITY_NUMBER"
      ? profile.addressFormat
      : "",
    confirmedServiceLocation: profile.serviceAddressConfirmation === "CONFIRMED_SERVICE_LOCATION",
    priceNote: clean(profile.priceNote),
    websiteUrl: clean(profile.websiteUrl),
    publicPhone: clean(contacts.phone),
    publicEmail: clean(contacts.email),
    facebookUrl: clean(contacts.facebook),
    instagramUrl: clean(contacts.instagram),
    internalEmail: clean(profile.internalEmail),
    imageUrl: sourceImageUrl || externalSourceImageUrl(profile.imageUrl),
    qualityResolutions: Object.fromEntries(directoryQualityFields.map((field) => [
      field,
      profile.qualityMetadata[field]?.status ?? "",
    ])) as DirectoryQualityResolutionInput,
    qualityCheckedAt: directoryQualityCheckedAtSummary(profile.qualityMetadata),
    verified: profile.verified,
    featured: profile.featured,
    seo: {
      title: clean(profile.seo?.title),
      description: clean(profile.seo?.description),
      focusKeyword: clean(profile.seo?.focusKeyword),
      canonicalUrl: clean(profile.seo?.canonicalUrl),
      ogTitle: clean(profile.seo?.ogTitle),
      ogDescription: clean(profile.seo?.ogDescription),
      ogImage: absoluteAsset(profile.seo?.ogImage),
      noindex: profile.seo?.noindex === true,
    },
  };
}

function notionSnapshot(page: NotionPage): EditableDirectorySnapshot {
  const format = propertyText(page, "Formát adresy");
  return {
    slug: propertyText(page, "Slug"),
    name: propertyText(page, "Názov"),
    category: propertyText(page, "Kategória"),
    status: statusFromNotion(propertyText(page, "Psipedia stav")),
    excerpt: propertyText(page, "Perex"),
    description: propertyText(page, "Popis"),
    services: ["chovatelske-stanice", "salony-a-sluzby", "treneri"].includes(propertyText(page, "Kategória"))
      ? propertyText(page, "Služby").split(/\r?\n|<br\s*\/?\s*>/gi).map(item => item.trim()).filter(Boolean)
      : splitList(propertyText(page, "Služby")),
    qualifications: splitQualificationLines(propertyText(page, "Kvalifikácie")),
    region: propertyText(page, "Kraj"),
    district: propertyText(page, "Okres"),
    city: propertyText(page, "Mesto"),
    address: propertyText(page, "Adresa"),
    postalCode: propertyText(page, "PSČ"),
    street: propertyText(page, "Ulica"),
    houseNumber: propertyText(page, "Číslo domu"),
    addressFormat: format === "STREET" || format === "MUNICIPALITY_NUMBER" ? format : "",
    confirmedServiceLocation: propertyCheckbox(page, "Potvrdená prevádzka"),
    priceNote: propertyText(page, "Cena / poznámka"),
    websiteUrl: propertyText(page, "Web"),
    publicPhone: propertyText(page, "Telefón"),
    publicEmail: propertyText(page, "E-mail"),
    facebookUrl: propertyText(page, "Facebook"),
    instagramUrl: propertyText(page, "Instagram"),
    internalEmail: propertyText(page, "Interný e-mail"),
    imageUrl: propertyText(page, "Hlavný obrázok URL"),
    qualityResolutions: notionQualityResolutions(page),
    qualityCheckedAt: propertyDateStart(page, "Kvalita skontrolované"),
    verified: propertyCheckbox(page, "Overené"),
    featured: propertyCheckbox(page, "Odporúčané"),
    seo: {
      title: propertyText(page, "SEO title"),
      description: propertyText(page, "SEO popis"),
      focusKeyword: propertyText(page, "SEO kľúčové slovo"),
      canonicalUrl: propertyText(page, "Canonical URL"),
      ogTitle: propertyText(page, "OG title"),
      ogDescription: propertyText(page, "OG popis"),
      ogImage: propertyText(page, "OG obrázok"),
      noindex: propertyCheckbox(page, "Noindex"),
    },
  };
}

async function snapshotHash(snapshot: EditableDirectorySnapshot) {
  return sha256Text(JSON.stringify(snapshot));
}

function richTextItems(value: string) {
  if (!value) return [];
  const output = [];
  for (let index = 0; index < value.length; index += NOTION_API_RICH_TEXT_CHUNK) {
    output.push({ type: "text", text: { content: value.slice(index, index + NOTION_API_RICH_TEXT_CHUNK) } });
  }
  return output;
}

function richText(value: string) {
  return { rich_text: richTextItems(value) };
}

function title(value: string) {
  return { title: richTextItems(value || "Bez názvu") };
}

function select(value: string) {
  return { select: value ? { name: value } : null };
}

function checkbox(value: boolean) {
  return { checkbox: value };
}

function url(value: string) {
  return { url: value || null };
}

function email(value: string) {
  return { email: value || null };
}

function phone(value: string) {
  return { phone_number: value || null };
}

function date(value: string | null | undefined) {
  return { date: value ? { start: value } : null };
}

async function loadGeoMirror(database: D1Database, profileId: number) {
  return database.prepare(`
    SELECT geocode_status, latitude, longitude, provider, source_fingerprint,
           google_place_id, google_place_source_fingerprint, updated_at,
           (SELECT m.action FROM moderation_events m
            WHERE m.resource_type = 'GEO_POINT'
              AND m.subject_id = CAST(geo_points.id AS TEXT)
              AND m.action IN ('GOOGLE_MAPS_NOT_REQUIRED', 'GOOGLE_MAPS_REQUIRED_AGAIN')
            ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS google_maps_action
    FROM geo_points
    WHERE directory_profile_id = ?
    LIMIT 1
  `).bind(profileId).first<GeoMirrorRow>();
}

function notionProfileProperties(
  profile: ManagedDirectoryProfile,
  geo: GeoMirrorRow | null,
  hash: string,
  syncedAt: string,
  sourceImageUrl = "",
) {
  const snapshot = profileSnapshot(profile, sourceImageUrl);
  const publicUrl = `${SITE_URL}/adresar/${profile.category}/${profile.slug}`;

  return {
    "Názov": title(snapshot.name),
    "Psipedia ID": richText(String(profile.id)),
    "Slug": richText(snapshot.slug),
    "Kategória": richText(snapshot.category),
    "Psipedia stav": select(statusToNotion(snapshot.status)),
    "Stav": select(editorialStateForProfile(snapshot.status)),
    "Perex": richText(snapshot.excerpt),
    "Popis": richText(snapshot.description),
    "Služby": richText(snapshot.services.join("\n")),
    "Kvalifikácie": richText(snapshot.qualifications.join("\n")),
    "Kraj": richText(snapshot.region),
    "Okres": richText(snapshot.district),
    "Mesto": richText(snapshot.city),
    "Adresa": richText(snapshot.address),
    "PSČ": richText(snapshot.postalCode),
    "Ulica": richText(snapshot.street),
    "Číslo domu": richText(snapshot.houseNumber),
    "Formát adresy": select(snapshot.addressFormat),
    "Potvrdená prevádzka": checkbox(snapshot.confirmedServiceLocation),
    "Cena / poznámka": richText(snapshot.priceNote),
    "Web": url(snapshot.websiteUrl),
    "Telefón": phone(snapshot.publicPhone),
    "E-mail": email(snapshot.publicEmail),
    "Facebook": url(snapshot.facebookUrl),
    "Instagram": url(snapshot.instagramUrl),
    "Hlavný obrázok URL": url(snapshot.imageUrl),
    "Kvalita · Telefón": select(qualityStatusToNotion(snapshot.qualityResolutions.phone)),
    "Kvalita · E-mail": select(qualityStatusToNotion(snapshot.qualityResolutions.email)),
    "Kvalita · Web": select(qualityStatusToNotion(snapshot.qualityResolutions.website)),
    "Kvalita · Obrázok": select(qualityStatusToNotion(snapshot.qualityResolutions.image)),
    "Kvalita · Adresa": select(qualityStatusToNotion(snapshot.qualityResolutions.address)),
    "Kvalita skontrolované": date(snapshot.qualityCheckedAt),
    "Overené": checkbox(snapshot.verified),
    "Odporúčané": checkbox(snapshot.featured),
    "SEO title": richText(snapshot.seo.title),
    "SEO popis": richText(snapshot.seo.description),
    "SEO kľúčové slovo": richText(snapshot.seo.focusKeyword),
    "Canonical URL": url(snapshot.seo.canonicalUrl),
    "OG title": richText(snapshot.seo.ogTitle),
    "OG popis": richText(snapshot.seo.ogDescription),
    "OG obrázok": url(snapshot.seo.ogImage),
    "Noindex": checkbox(snapshot.seo.noindex),
    "URL Psipedia": url(publicUrl),
    "Obrázok Psipedia": url(absoluteAsset(profile.imageUrl)),
    "Obrázok key": richText(profile.imageKey ?? ""),
    "Vytvorené Psipedia": date(profile.createdAt),
    "Aktualizované Psipedia": date(profile.updatedAt),
    "Publikované Psipedia": date(profile.publishedAt),
    "Archivované Psipedia": date(profile.archivedAt),
    "Vytvoril": richText(profile.createdBy),
    "Upravil": richText(profile.updatedBy),
    "Sync hash": richText(hash),
    "Sync stav": select("Synchronizované"),
    "Sync chyba": richText(""),
    "Posledný sync": date(syncedAt),
  };
}

async function schemaReady(database: D1Database) {
  const row = await database.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='directory_notion_sync' LIMIT 1",
  ).first<{ ok: number }>();
  return Boolean(row?.ok);
}

async function loadMappingByProfile(database: D1Database, profileId: number) {
  return database.prepare(
    "SELECT * FROM directory_notion_sync WHERE directory_profile_id=? LIMIT 1",
  ).bind(profileId).first<DirectoryNotionMapping>();
}

async function loadMappingByPage(database: D1Database, pageId: string) {
  return database.prepare(
    "SELECT * FROM directory_notion_sync WHERE notion_page_id=? LIMIT 1",
  ).bind(pageId).first<DirectoryNotionMapping>();
}

async function saveMapping(input: {
  database: D1Database;
  pageId: string;
  profileId: number;
  contentHash: string;
  notionLastEditedTime?: string | null;
  psipediaUpdatedAt?: string | null;
  syncedAt: string;
}) {
  await input.database.prepare(`
    INSERT INTO directory_notion_sync (
      notion_page_id, directory_profile_id, content_hash, notion_last_edited_time,
      psipedia_updated_at, last_synced_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(directory_profile_id) DO UPDATE SET
      notion_page_id=excluded.notion_page_id,
      content_hash=excluded.content_hash,
      notion_last_edited_time=excluded.notion_last_edited_time,
      psipedia_updated_at=excluded.psipedia_updated_at,
      last_synced_at=excluded.last_synced_at,
      updated_at=excluded.updated_at
  `).bind(
    input.pageId,
    input.profileId,
    input.contentHash,
    input.notionLastEditedTime ?? null,
    input.psipediaUpdatedAt ?? null,
    input.syncedAt,
    input.syncedAt,
    input.syncedAt,
  ).run();
}

async function fetchNotionPage(bindings: NotionDirectorySyncBindings, pageId: string) {
  return notionRequest<NotionPage>(bindings, `/pages/${encodeURIComponent(pageId)}`);
}

async function patchNotionPage(
  bindings: NotionDirectorySyncBindings,
  pageId: string,
  properties: Record<string, unknown>,
) {
  return notionRequest<NotionPage>(
    bindings,
    `/pages/${encodeURIComponent(pageId)}`,
    { method: "PATCH", body: JSON.stringify({ properties }) },
  );
}

// The Directory data source is shared across categories. During the safe
// typed-to-text migration, both existing URL/email/phone columns and the new
// RICH_TEXT properties must be writable without discarding a field value.
const directoryEditableTextProperties = [
  "Web", "Facebook", "Instagram", "Telefón",
  "E-mail", "Canonical URL", "OG obrázok",
] as const;
function adaptDirectoryNotionTextProperties(
  desired: Record<string, unknown>,
  remote: Record<string, unknown>,
): Record<string, unknown> {
  const output = { ...desired };
  for (const name of directoryEditableTextProperties) {
    const declared = remote[name] as { type?: unknown } | undefined;
    if (declared?.type !== "rich_text") continue;
    const previous = output[name] as {
      url?: string | null; email?: string | null; phone_number?: string | null;
    } | undefined;
    const value = previous?.url ?? previous?.email ?? previous?.phone_number ?? "";
    output[name] = richText(value);
  }
  return output;
}

async function createNotionPage(
  bindings: NotionDirectorySyncBindings,
  dataSourceId: string,
  properties: Record<string, unknown>,
  singleAttempt = false,
) {
  let sourceTypes: Record<string, unknown> = {};
  try {
    const source = await notionRequest<{ properties?: Record<string, unknown> }>(
      bindings, `/data_sources/${encodeURIComponent(dataSourceId)}`,
    );
    sourceTypes = source.properties ?? {};
  } catch {
    // Legacy schemas still accept typed email/phone/URL values.
  }
  return notionRequest<NotionPage>(
    bindings,
    "/pages",
    {
      method: "POST",
      body: JSON.stringify({
        parent: { type: "data_source_id", data_source_id: dataSourceId },
        properties: adaptDirectoryNotionTextProperties(properties, sourceTypes),
      }),
    },
    { retryTransient: !singleAttempt },
  );
}

async function markPageError(
  bindings: NotionDirectorySyncBindings,
  pageId: string,
  error: unknown,
  page?: NotionPage,
) {
  const message = error instanceof Error ? error.message : String(error);
  if (page?.id === pageId && !directorySyncErrorMetadataNeedsWrite({
    syncStatus: propertyText(page, "Sync stav"),
    syncError: propertyText(page, "Sync chyba"),
    message,
  })) return;
  await patchNotionPage(bindings, pageId, {
    "Sync stav": select("Chyba"),
    "Sync chyba": richText(message.slice(0, 1800)),
    "Posledný sync": date(new Date().toISOString()),
  }).catch(() => undefined);
}

async function writeProfileToNotion(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
  dataSourceId: string;
  profile: ManagedDirectoryProfile;
  pageId?: string | null;
  singleAttemptCreate?: boolean;
}) {
  const syncedAt = new Date().toISOString();
  const monitor = await getMediaSourceMonitorForEntity(input.database, "DIRECTORY_PROFILE", input.profile.id);
  const sourceImageUrl = monitor?.sourceImageUrl || externalSourceImageUrl(input.profile.imageUrl);
  const hash = await snapshotHash(profileSnapshot(input.profile, sourceImageUrl));
  const geo = await loadGeoMirror(input.database, input.profile.id);
  const properties = notionProfileProperties(input.profile, geo ?? null, hash, syncedAt, sourceImageUrl);
  if (input.pageId) delete (properties as Partial<typeof properties>)["Vytvoril"];
  let page: NotionPage;
  if (input.pageId) {
    const current = await fetchNotionPage(input.bindings, input.pageId);
    if (current.id !== input.pageId || !notionDirectoryPageBelongsToSource(current, input.dataSourceId))
      throw new NotionDirectoryUnsafeTargetError("NOTION_DIRECTORY_TARGET_MOVED");
    const adapted = adaptDirectoryNotionTextProperties(properties, current.properties ?? {});
    const patch = selectiveNotionProperties(current.properties ?? {}, adapted);
    page = patch ? await patchNotionPage(input.bindings, input.pageId, patch) : current;
  } else {
    page = await createNotionPage(input.bindings, input.dataSourceId, properties, input.singleAttemptCreate === true);
  }

  // A partial or stale Notion response is not evidence of a successful
  // editorial write. Check page identity and the complete reflected snapshot
  // BEFORE advancing the canonical mapping or the verified field baseline.
  // The remote operation may have happened despite a rejected echo; retry
  // conservatively against the unchanged previous mapping.
  if (!page?.id || (input.pageId && page.id !== input.pageId)
      || !page.properties || await snapshotHash(notionSnapshot(page)) !== hash) {
    throw new Error("NOTION_DIRECTORY_EDITORIAL_WRITEBACK_ECHO_MISMATCH");
  }

  if (sourceImageUrl) {
    await upsertMediaSourceMonitor({
      database: input.database,
      entityType: "DIRECTORY_PROFILE",
      entityId: input.profile.id,
      sourcePageUrl: monitor?.sourcePageUrl || input.profile.websiteUrl,
      sourceImageUrl,
      activeImageKey: input.profile.imageKey,
    });
  }

  // The verified snapshot and the mapping must describe the same acknowledged
  // Notion state. Failure to persist either keeps further divergent edits
  // fail-closed; never assert success merely because PATCH returned HTTP 200.
  await saveMapping({
    database: input.database,
    pageId: page.id,
    profileId: input.profile.id,
    contentHash: hash,
    notionLastEditedTime: page.last_edited_time ?? syncedAt,
    psipediaUpdatedAt: input.profile.updatedAt,
    syncedAt,
  });
  await recordProfileFieldBaseline({
    database: input.database, agenda: "directory", entityId: input.profile.id,
    pageId: page.id, hash, snapshot: profileSnapshot(input.profile, sourceImageUrl), syncedAt,
  });
  return page;
}

function fullProfileInput(
  desired: EditableDirectorySnapshot,
  current: ManagedDirectoryProfile,
  preparedImage?: { imageUrl: string | null; imageKey: string | null } | null,
): ManagedDirectoryProfileInput {
  const imageUrl = preparedImage?.imageUrl ?? current.imageUrl;
  const imageKey = preparedImage?.imageKey ?? current.imageKey;
  return {
    slug: desired.slug,
    name: desired.name,
    category: desired.category,
    status: desired.status === "published" ? "published" : "draft",
    excerpt: desired.excerpt,
    description: desired.description,
    services: desired.services,
    qualifications: desired.qualifications,
    region: desired.region,
    district: desired.district,
    city: desired.city,
    address: desired.address,
    postalCode: desired.postalCode,
    street: desired.street,
    houseNumber: desired.houseNumber,
    addressFormat: desired.addressFormat,
    priceNote: desired.priceNote,
    websiteUrl: desired.websiteUrl || null,
    publicPhone: desired.publicPhone,
    publicEmail: desired.publicEmail,
    facebookUrl: desired.facebookUrl,
    instagramUrl: desired.instagramUrl,
    internalEmail: current.internalEmail,
    imageUrl,
    imageKey,
    qualityResolutions: desired.qualityResolutions,
    qualityCheckedAt: desired.qualityCheckedAt,
    verified: desired.verified,
    featured: desired.featured,
    seo: {
      title: desired.seo.title,
      description: desired.seo.description,
      focusKeyword: desired.seo.focusKeyword,
      canonicalUrl: desired.seo.canonicalUrl,
      ogTitle: desired.seo.ogTitle,
      ogDescription: desired.seo.ogDescription,
      ogImage: localizeOwnAsset(desired.seo.ogImage) ?? current.seo?.ogImage ?? "",
      noindex: desired.seo.noindex,
    },
  };
}

function ownPsipediaImage(value: string) {
  const localized = localizeOwnAsset(value);
  return localized && (localized.startsWith("/media/") || localized.startsWith("/images/"))
    ? localized
    : null;
}

function newProfileInput(
  desired: EditableDirectorySnapshot,
  preparedImage?: { imageUrl: string | null; imageKey: string | null } | null,
): ManagedDirectoryProfileInput {
  return {
    slug: desired.slug,
    name: desired.name,
    category: desired.category,
    // New Notion Ready records must first enter canonical draft review.
    // Publication requires explicit Notion Psipedia stav = Publikované.
    status: "draft", // Notion-first creates never publish without canonical Admin action.
    excerpt: desired.excerpt,
    description: desired.description,
    services: desired.services,
    qualifications: desired.qualifications,
    region: desired.region,
    district: desired.district,
    city: desired.city,
    address: desired.address,
    postalCode: desired.postalCode,
    street: desired.street,
    houseNumber: desired.houseNumber,
    addressFormat: desired.addressFormat,
    priceNote: desired.priceNote,
    websiteUrl: desired.websiteUrl || null,
    publicPhone: desired.publicPhone,
    publicEmail: desired.publicEmail,
    facebookUrl: desired.facebookUrl,
    instagramUrl: desired.instagramUrl,
    internalEmail: null,
    imageUrl: preparedImage?.imageUrl ?? ownPsipediaImage(desired.imageUrl),
    imageKey: preparedImage?.imageKey ?? null,
    qualityResolutions: desired.qualityResolutions,
    qualityCheckedAt: desired.qualityCheckedAt,
    verified: desired.verified,
    featured: desired.featured,
    seo: {
      title: desired.seo.title,
      description: desired.seo.description,
      focusKeyword: desired.seo.focusKeyword,
      canonicalUrl: desired.seo.canonicalUrl,
      ogTitle: desired.seo.ogTitle,
      ogDescription: desired.seo.ogDescription,
      ogImage: ownPsipediaImage(desired.seo.ogImage) ?? "",
      noindex: desired.seo.noindex,
    },
  };
}

function notionProfileReadyForCreate(page: NotionPage, trustedGemini = false) {
  if (propertyText(page, "Psipedia ID")) return false;
  const editorialState = propertyText(page, "Stav");
  // Textual creator marker is never sufficient to grant automatic import.
  if (trustedGemini)
    return ["", "Nápad", "Na kontrolu", "Ready", "Koncept"].includes(editorialState) &&
      propertyText(page, "Psipedia stav") === "Koncept";
  if (propertyText(page, "Vytvoril") === "Gemini automatizácia") return false;
  return editorialState === "Ready" || editorialState === "Publikované";
}

async function createProfileFromNotion(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
  page: NotionPage;
  trustedGemini?: boolean;
}) {
  const desired = notionSnapshot(input.page);
  const importWarnings: string[] = [];
  if (input.trustedGemini) {
    const validUrl = (value: string) => {
      if (!value) return true;
      try {
        const parsed = new URL(value);
        return (parsed.protocol === "https:" || parsed.protocol === "http:")
          && !parsed.username && !parsed.password;
      } catch { return false; }
    };
    for (const field of ["websiteUrl", "facebookUrl", "instagramUrl"] as const) {
      if (desired[field] && !validUrl(desired[field])) {
        desired[field] = "";
        importWarnings.push("Skontroluj neplatný odkaz: " + field + ".");
      }
    }
    for (const field of ["publicEmail", "internalEmail"] as const) {
      if (desired[field] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(desired[field])) {
        desired[field] = "";
        importWarnings.push("Skontroluj e-mail: " + field + ".");
      }
    }
    if (desired.publicPhone && !/^[+0-9() .\/-]{1,50}$/.test(desired.publicPhone)) {
      desired.publicPhone = "";
      importWarnings.push("Skontroluj telefónne číslo.");
    }
    if (desired.postalCode && !/^\d{3}\s?\d{2}$/.test(desired.postalCode)) {
      desired.postalCode = "";
      importWarnings.push("Skontroluj PSČ.");
    }
    if (desired.addressFormat && !["STREET", "MUNICIPALITY_NUMBER"].includes(desired.addressFormat)) {
      desired.addressFormat = "";
      importWarnings.push("Skontroluj formát adresy.");
    }
    if (desired.confirmedServiceLocation) {
      desired.confirmedServiceLocation = false;
      importWarnings.push("Potvrď prevádzku a adresu v administrácii.");
    }
    if (desired.services.length) importWarnings.push("Služby skontroluj a priraď v katalógu Admin/D1.");
    desired.services = [];
    if (!desired.region) importWarnings.push("Doplň kraj.");
    if (!desired.city) importWarnings.push("Doplň mesto/obec.");
    if (!desired.description) importWarnings.push("Doplň popis profilu.");
    desired.slug = await resolveGeminiPublicSlug(input.database, "directory", {
      requestedSlug: desired.slug, name: desired.name, city: desired.city, notionPageId: input.page.id,
    });
  }
  const sourceImageUrl = externalSourceImageUrl(desired.imageUrl);
  const sourcePageUrl = propertyText(input.page, "Zdroj obrázka") || desired.websiteUrl || "";
  const imageAltText = propertyText(input.page, "Alt text obrázka") || desired.name;
  let payload = newProfileInput(desired);
  if (input.trustedGemini) {
    // Fail closed, regardless of unexpected Notion status/defaults.
    payload = { ...payload, status: "draft" };
  }
  let verified = null;

  if (desired.confirmedServiceLocation) {
    if ((desired.houseNumber ?? "").trim()) {
      // Exact provider verification is only possible with a house number.
      const addressFormat = desired.addressFormat || (desired.street ? "STREET" : "MUNICIPALITY_NUMBER");
      verified = await verifyDirectoryCanonicalAddress({
        region: desired.region,
        district: desired.district,
        city: desired.city,
        street: desired.street,
        houseNumber: desired.houseNumber,
        addressFormat,
        revalidateStreet: addressFormat === "STREET",
      });
      payload = withVerifiedDirectoryAddress(payload, verified);
    } else {
      // Missing house numbers are editorial review signals, not sync errors.
      payload = { ...payload, clearServiceAddressConfirmation: true };
      importWarnings.push("Číslo domu nie je uvedené; presná adresa zostáva nepotvrdená.");
    }
  } else {
    payload = { ...payload, clearServiceAddressConfirmation: true };
  }

  normalizeManagedDirectoryProfileInput(payload);
  // A remote image may return 403 or time out. For signed Gemini drafts,
  // the image is optional: import the PRIVATE profile and let the owner add
  // a photo later. Ordinary Notion imports retain their existing error policy.
  let prepared: Awaited<ReturnType<typeof prepareNotionMainImage>> | null = null;
  let imageWarning = "";
  if (sourceImageUrl) {
    try {
      prepared = await prepareNotionMainImage({
        bindings: input.bindings,
        sourceUrl: sourceImageUrl,
        sourcePageUrl,
        altText: imageAltText,
        folder: "directory",
        existingImageUrl: null,
        existingImageKey: null,
      });
    } catch (error) {
      if (!input.trustedGemini) throw error;
      imageWarning = error instanceof Error ? error.message : String(error);
    }
  }

  try {
    if (prepared) payload = { ...payload, imageUrl: prepared.imageUrl, imageKey: prepared.imageKey };

    const created = await createManagedDirectoryProfile(payload, SYSTEM_ACTOR, input.database);
    return {
      profile: created,
      verified,
      prepared,
      sourceImageUrl,
      sourcePageUrl,
      imageWarning,
      importWarnings,
    };
  } catch (error) {
    if (prepared?.uploadedKey) {
      await cleanupUnreferencedNotionUpload(input.database, input.bindings.BUCKET, prepared.uploadedKey);
    }
    throw error;
  }
}

async function applyNotionToProfile(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
  page: NotionPage;
  profile: ManagedDirectoryProfile;
  desiredOverride?: EditableDirectorySnapshot;
}) {
  const desired = input.desiredOverride ?? notionSnapshot(input.page);
  const current = input.profile;

  if (desired.status !== current.status || desired.slug !== current.slug || desired.category !== current.category) {
    throw new Error("REVIEW_REQUIRED: Stav, slug a kategória sa menia iba v kanonickom administrátorskom editore.");
  }
  if (desired.status === "archived") {
    const archived = await archiveManagedDirectoryProfile(current.id, SYSTEM_ACTOR, new Date(), input.database);
    if (!archived) throw new Error("Profil sa pri synchronizácii nepodarilo archivovať.");
    return archived;
  }

  const sourceImageUrl = externalSourceImageUrl(desired.imageUrl);
  const sourcePageUrl = propertyText(input.page, "Zdroj obrázka") || desired.websiteUrl || current.websiteUrl || "";
  const imageAltText = propertyText(input.page, "Alt text obrázka") || desired.name || current.name;
  let payload = fullProfileInput(desired, current);
  const createdByGemini = await input.database.prepare(
    "SELECT notion_page_id FROM gemini_notion_created_pages WHERE notion_page_id=? " +
    "AND import_agenda='directory' AND canonical_entity_id=?"
  ).bind(input.page.id, current.id).first<{ notion_page_id: string }>();
  if (createdByGemini) {
    // Notion cannot publish or unpublish a Gemini-created profile.
    // Only the explicit canonical admin publish action can change its status.
    payload = { ...payload, status: current.status, slug: current.slug };
  }
  const addressChanged = directoryPhysicalAddressChanged(current, payload);
  const safety = notionDirectoryUpdateSafety({
    physicalAddressChanged: addressChanged,
    notionConfirmedLocation: desired.confirmedServiceLocation,
    canonicalConfirmedLocation: current.serviceAddressConfirmation === "CONFIRMED_SERVICE_LOCATION",
    notionPublicPhone: desired.publicPhone,
    canonicalPublicPhone: readDirectoryPublicContacts(current.importData, current.websiteUrl ?? "").phone,
  });
  if (safety.blocksConfirmedAddressDowngrade) {
    throw new Error("REVIEW_REQUIRED: Potvrdenú prevádzku nemožno zrušiť iba neúplným Notion záznamom.");
  }
  if (safety.preserveUnchangedCanonicalPhone) {
    // Do not revalidate or truncate pre-existing contact values when only
    // unrelated editorial/location fields changed.
    payload = { ...payload, publicPhone: undefined };
  }

  let verified = null;
  if (safety.verifyExactAddress) {
    if ((desired.houseNumber ?? "").trim()) {
      const addressFormat = desired.addressFormat || (desired.street ? "STREET" : "MUNICIPALITY_NUMBER");
      verified = await verifyDirectoryCanonicalAddress({
        region: desired.region,
        district: desired.district,
        city: desired.city,
        street: desired.street,
        houseNumber: desired.houseNumber,
        addressFormat,
        revalidateStreet: addressFormat === "STREET",
      });
      payload = withVerifiedDirectoryAddress(payload, verified);
    } else if (current.serviceAddressConfirmation === "CONFIRMED_SERVICE_LOCATION") {
      // Partial Notion address cannot replace a verified canonical address
      // or overwrite its manually confirmed GEO / Google Place association.
      payload = {
        ...payload,
        region: current.region,
        district: current.district,
        city: current.city,
        address: current.address,
        postalCode: current.postalCode,
        street: current.street,
        houseNumber: current.houseNumber,
        addressFormat: current.addressFormat,
        confirmServiceAddress: true,
      };
    } else {
      // Continue synchronizing editorial fields without claiming exact GEO.
      payload = { ...payload, clearServiceAddressConfirmation: true };
    }
  } else if (desired.confirmedServiceLocation) {
    payload = { ...payload, confirmServiceAddress: true };
  } else {
    payload = { ...payload, clearServiceAddressConfirmation: true };
  }

  normalizeManagedDirectoryProfileInput(payload, current.importData, {
    currentServiceAddressConfirmation: current.serviceAddressConfirmation,
    legacyAddress: current.address,
  });

  const prepared = sourceImageUrl
    ? await prepareNotionMainImage({
        bindings: input.bindings,
        sourceUrl: sourceImageUrl,
        sourcePageUrl,
        altText: imageAltText,
        folder: "directory",
        existingImageUrl: current.imageUrl,
        existingImageKey: current.imageKey,
      })
    : null;

  if (prepared) payload = { ...payload, imageUrl: prepared.imageUrl, imageKey: prepared.imageKey };

  try {
    const updated = await updateManagedDirectoryProfile(
      current.id,
      payload,
      SYSTEM_ACTOR,
      current,
      input.database,
      { expectedUpdatedAt: current.updatedAt, restoreArchived: current.status === "archived" },
    );
    if (!updated) throw new Error("CONFLICT: Profil bol súbežne upravený; Notion zápis sa neuskutočnil.");

    if (prepared && sourceImageUrl) {
      await upsertMediaSourceMonitor({
        database: input.database,
        entityType: "DIRECTORY_PROFILE",
        entityId: updated.id,
        sourcePageUrl,
        sourceImageUrl,
        sourceContentHash: prepared.sourceContentHash,
        activeImageKey: prepared.imageKey,
      });
      for (const key of prepared.replacedKeys) {
        await cleanupUnreferencedNotionUpload(input.database, input.bindings.BUCKET, key);
      }
    }

    if (verified) {
      await applyVerifiedDirectoryAddressGeo({
        profileId: updated.id,
        verified,
        actorRef: SYSTEM_ACTOR,
        database: input.database,
      });
    }

    // Paid Google Places search must only run after an explicit admin action.

    if(JSON.stringify(desired.services)!==JSON.stringify(current.services)){
      // Only a Notion-side "Služby" edit maps to canonical choices. The existing
      // profile field conflict policy has already approved the editorial merge.
      await importNotionServiceChoices(input.database,updated.id,updated.category,desired.services);
    }
    return await getManagedDirectoryProfileById(updated.id, input.database) ?? updated;
  } catch (error) {
    if (prepared?.uploadedKey) {
      await cleanupUnreferencedNotionUpload(input.database, input.bindings.BUCKET, prepared.uploadedKey);
    }
    throw error;
  }
}

async function recentNotionPages(
  bindings: NotionDirectorySyncBindings,
  dataSourceId: string,
) {
  const response = await notionRequest<NotionQueryResponse>(
    bindings,
    `/data_sources/${encodeURIComponent(dataSourceId)}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
        page_size: NOTION_SCAN_BATCH,
      }),
    },
  );
  return response.results ?? [];
}

async function bootstrapProfileIds(database: D1Database) {
  const result = await database.prepare(`
    SELECT dp.id
    FROM directory_profiles dp
    LEFT JOIN directory_notion_sync dns ON dns.directory_profile_id = dp.id
    WHERE dns.directory_profile_id IS NULL AND dp.category <> 'chovatelske-stanice'
      AND dp.category NOT IN ('veterinari', 'kynologicke-kluby', 'fyzioterapia', 'dalsie-sluzby')
    ORDER BY dp.id ASC
    LIMIT ?
  `).bind(BOOTSTRAP_BATCH).all<{ id: number }>();
  return (result.results ?? []).map((row) => Number(row.id)).filter(Number.isSafeInteger);
}

async function changedProfileIds(database: D1Database) {
  const result = await database.prepare(`
    SELECT dp.id
    FROM directory_profiles dp
    JOIN directory_notion_sync dns ON dns.directory_profile_id = dp.id
    LEFT JOIN geo_points gp ON gp.directory_profile_id = dp.id
    WHERE dp.category <> 'chovatelske-stanice'
      AND dp.category NOT IN ('treneri', 'veterinari', 'kynologicke-kluby', 'fyzioterapia', 'dalsie-sluzby') AND (
       COALESCE(dns.psipedia_updated_at, '') <> dp.updated_at
       OR (gp.updated_at IS NOT NULL AND gp.updated_at > dns.last_synced_at)
       OR EXISTS (
         SELECT 1 FROM moderation_events m
         WHERE m.resource_type='GEO_POINT'
           AND m.subject_id=CAST(gp.id AS TEXT)
           AND m.action IN ('GOOGLE_MAPS_NOT_REQUIRED', 'GOOGLE_MAPS_REQUIRED_AGAIN')
           AND m.created_at > dns.last_synced_at
       )
    )
    ORDER BY dp.updated_at ASC, dp.id ASC
    LIMIT ?
  `).bind(CHANGED_PROFILE_BATCH).all<{ id: number }>();
  return (result.results ?? []).map((row) => Number(row.id)).filter(Number.isSafeInteger);
}

/** Keep freshly imported Notion data when an older Admin form saves other fields. */
export function preserveLiveBreederFields(
  live: ManagedDirectoryProfile,
  submitted: ManagedDirectoryProfileInput,
  edited: readonly BreederEditorialField[],
): ManagedDirectoryProfileInput {
  const preserved = breederPreserveUneditedFields(
    submitted as Record<string, unknown>,
    profileSnapshot(live) as unknown as Record<string, unknown>,
    edited,
  ) as ManagedDirectoryProfileInput;
  // The trainer services text lives in metadata, NOT services_json or V3.
  // Never insert this editorial snapshot into the canonical service list.
  return live.category === "treneri" ? { ...preserved, services: live.services } : preserved;
}

/** Exactly the editorial fields saved in Admin; the rest of the profile is irrelevant. */
export function breederEditedFields(
  before: ManagedDirectoryProfile,
  after: ManagedDirectoryProfile,
): BreederEditorialField[] {
  return breederAdminChangedFields(
    profileSnapshot(before) as unknown as Record<string, unknown>,
    profileSnapshot(after) as unknown as Record<string, unknown>,
  );
}

/**
 * Breeder/trainer editorial fields are raw content. Write ONLY the changed D1 value
 * (plus its derived search index), never call the record-wide profile validator.
 * Identifiers, publication state, Services V3 and verified GEO are untouched.
 *
 * SQL identifiers and JSON paths below are compile-time allowlisted; values
 * are always bound. Invalid unrelated historical contact/SEO data cannot
 * veto a plain-text edit.
 */
const breederScalarColumns: Partial<Record<BreederEditorialField, string>> = {
  name: "name", excerpt: "excerpt", description: "description",
  region: "region", district: "district", city: "city", address: "address",
  postalCode: "postal_code", street: "street", houseNumber: "house_number",
  priceNote: "price_note",
};
const breederContactJsonNames: Partial<Record<BreederEditorialField, string>> = {
  publicPhone: "Telefón", publicEmail: "E-mail",
  websiteUrl: "Web", facebookUrl: "Facebook", instagramUrl: "Instagram",
};
const breederSeoJsonNames: Partial<Record<BreederEditorialField, string>> = {
  "seo.title": "title", "seo.description": "description",
  "seo.focusKeyword": "focusKeyword", "seo.canonicalUrl": "canonicalUrl",
  "seo.ogTitle": "ogTitle", "seo.ogDescription": "ogDescription",
  "seo.ogImage": "ogImage",
};
const breederFacetNotionProperties = {
  "veterinari.facility_type": "Typ pracoviska",
  "veterinari.emergency": "Pohotovosť",
  "veterinari.home_visits": "Návštevy doma",
  "chovatelske-stanice.visits_by_appointment": "Návštevy po dohode",
  "chovatelske-stanice.health_testing_information": "Informácie o zdravotných testoch",
  "treneri.individual_training": "Individuálny výcvik",
  "treneri.group_training": "Skupinový výcvik",
} as const;
type BreederFacetId = keyof typeof breederFacetNotionProperties;
const breederFacetIds = Object.keys(breederFacetNotionProperties) as BreederFacetId[];
function breederChangedNotionFacets(page: NotionPage, changedIds: readonly string[]): BreederFacetId[] {
  const changed = new Set(changedIds);
  return breederFacetIds.filter(id => {
    const key = breederFacetNotionProperties[id];
    const record = page.properties?.[key] as { id?: string } | undefined;
    return changed.has(key) || Boolean(record?.id && changed.has(record.id));
  });
}
function notionFacetLabel(value: string): string {
  if (value === "ambulance") return "Ambulancia";
  if (value === "clinic") return "Klinika";
  if (value === "hospital") return "Nemocnica";
  return value === "yes" ? "Áno" : value === "no" ? "Nie" : "Neznáme";
}
function notionFacetSourceValue(value: string): string {
  if (value === "Ambulancia") return "ambulance";
  if (value === "Klinika") return "clinic";
  if (value === "Nemocnica") return "hospital";
  if (value === "Neznáme") return "unknown";
  return value;
}
const breederSearchFields = new Set<BreederEditorialField>([
  "name", "excerpt", "description", "services", "qualifications", "region", "district",
  "city", "address", "postalCode", "street", "houseNumber",
]);
async function saveBreederEditorialValue(
  database: D1Database,
  current: ManagedDirectoryProfile,
  desired: Record<string, unknown>,
  path: BreederEditorialField,
): Promise<ManagedDirectoryProfile> {
  if ((!isDirectoryEventPilotCategory(current.category) && !["chovatelske-stanice", "salony-a-sluzby", "treneri"].includes(current.category)) || current.status === "archived")
    throw new Error("BREEDER_FIELD_WRITE_NOT_ALLOWED");
  // Pilot categories use the canonical Services V3 catalog. Their retired
  // legacy "Služby" text must not be written by any editorial event.
  if (path === "services" && isDirectoryEventPilotCategory(current.category))
    throw new Error("DIRECTORY_PILOT_LEGACY_SERVICES_READ_ONLY");
  const raw = breederReadPath(desired, path);
  const value = typeof raw === "string" ? raw : "";
  const assignments: string[] = [];
  const params: string[] = [];
  const scalar = breederScalarColumns[path];
  const contact = breederContactJsonNames[path];
  const seoKey = breederSeoJsonNames[path];
  if (scalar) {
    assignments.push(scalar + " = ?");
    params.push(value);
  } else if (path === "services" && current.category === "treneri") {
    // Trainers use Services V3 / services_json for canonical choices. Notion
    // prose is a separate private metadata string; never replace those choices.
    const text = Array.isArray(raw)
      ? raw.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).join("\n")
      : value;
    assignments.push("source_data_json = json_set(COALESCE(source_data_json, '{}'), ?, ?)");
    params.push("$." + TRAINER_SERVICES_TEXT_METADATA_KEY, text);
  } else if (path === "services" || path === "qualifications") {
    // Breeders store free-text service lines; qualifications also remain text. 
    const items = Array.isArray(raw)
      ? raw.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      : value ? value.split(/\r?\n/).map(item => item.trim()).filter(Boolean) : [];
    assignments.push(path === "services" ? "services_json = ?" : "qualifications_json = ?");
    params.push(JSON.stringify(items));
  } else if (path === "addressFormat") {
    // A storage format is a technical enum, not editorial prose.
    if (!["", "STREET", "MUNICIPALITY_NUMBER"].includes(value))
      throw new Error("BREEDER_ADDRESS_FORMAT_INVALID");
    assignments.push("address_format = ?");
    params.push(value);
  } else if (contact) {
    // source_data_json also carries unrelated original import metadata.
    // JSON_SET mutates only the named contact and preserves all other keys.
    assignments.push("source_data_json = json_set(COALESCE(source_data_json, '{}'), ?, ?)");
    params.push('$."' + contact + '"', value);
    if (path === "websiteUrl") {
      assignments.push("website_url = ?");
      params.push(value);
    }
  } else if (seoKey) {
    assignments.push("seo_json = json_set(COALESCE(seo_json, '{}'), ?, ?)");
    params.push("$." + seoKey, value);
  } else {
    throw new Error("BREEDER_FIELD_UNSUPPORTED");
  }
  if (breederSearchFields.has(path)) {
    const next = desired as unknown as EditableDirectorySnapshot;
    assignments.push("search_text = ?");
    params.push(normalizeDirectorySearchText([
      next.name, next.excerpt, next.description,
      next.services.join(" "), next.qualifications.join(" "),
      next.city, next.district, next.region, next.address,
      next.postalCode, next.street, next.houseNumber,
    ].join(" ")));
  }
  const now = new Date().toISOString();
  const guardedCategory = current.category === "chovatelske-stanice"
    ? "category = 'chovatelske-stanice'" : "category = ?";
  const categoryArg = current.category === "chovatelske-stanice" ? [] : [current.category];
  const saved = await database.prepare(
    "UPDATE directory_profiles SET " + assignments.join(", ") +
    ", updated_at = ?, updated_by = ? " +
    "WHERE id = ? AND " + guardedCategory + " AND status <> 'archived' " +
    "AND updated_at = ? RETURNING id",
  ).bind(...params, now, SYSTEM_ACTOR, current.id, ...categoryArg, current.updatedAt)
    .first<{ id: number }>();
  if (!saved) throw new Error("BREEDER_FIELD_WRITE_CONFLICT");
  const updated = await getManagedDirectoryProfileById(current.id, database);
  if (!updated) throw new Error("BREEDER_FIELD_RELOAD_FAILED");
  return updated;
}

/**
 * Extra operational text for the field-event pilot categories. This is not part of
 * the legacy whole-profile snapshot/hash, nor of canonical Services V3/GEO.
 */
export const PILOT_DIRECTORY_METADATA_FIELDS = [
  "Ordinačné hodiny", "Zdroj dát", "Zdroj obrázka", "Alt text obrázka",
  "Organizácia", "Zameranie",
] as const;
export const PUBLIC_DIRECTORY_FACT_FIELDS = ["Organizácia", "Zameranie"] as const;
export type PilotDirectoryMetadataField = (typeof PILOT_DIRECTORY_METADATA_FIELDS)[number];

function pilotChangedNotionMetadataFields(
  page: NotionPage, changedIds: readonly string[],
): PilotDirectoryMetadataField[] {
  const changed = new Set(changedIds);
  return PILOT_DIRECTORY_METADATA_FIELDS.filter(name => {
    const item = page.properties?.[name] as { id?: unknown } | undefined;
    return changed.has(name) || (typeof item?.id === "string" && changed.has(item.id));
  });
}

/** Save one source/hours field, preserving every unrelated JSON property. */
export async function savePilotDirectoryMetadataField(input: {
  database: D1Database;
  profileId: number;
  category: string;
  field: PilotDirectoryMetadataField;
  value: string;
}): Promise<ManagedDirectoryProfile> {
  if (!(serviceFilterCategories as readonly string[]).includes(input.category) ||
      !PILOT_DIRECTORY_METADATA_FIELDS.includes(input.field))
    throw new Error("DIRECTORY_PILOT_METADATA_SCOPE_INVALID");
  const trimmed = input.value.trim();
  // A blank value is an explicit Admin edit and must clear only this field.
  // Blank Notion webhook values are still ignored in syncBreederEvent.
  const current = await getManagedDirectoryProfileById(input.profileId, input.database);
  if (!current || current.category !== input.category || current.status === "archived")
    throw new Error("DIRECTORY_PILOT_METADATA_IDENTITY_MISMATCH");
  if (String(current.importData?.[input.field] ?? "").trim() === trimmed) return current;
  const now = new Date().toISOString();
  const saved = await input.database.prepare(
    "UPDATE directory_profiles SET source_data_json = json_set(" +
      "COALESCE(source_data_json, '{}'), ?, ?), updated_at = ?, updated_by = ? " +
    "WHERE id = ? AND category = ? AND status <> 'archived' " +
      "AND updated_at = ? AND json_valid(COALESCE(source_data_json,'{}')) RETURNING id"
  ).bind('$."' + input.field + '"', trimmed, now, SYSTEM_ACTOR,
    input.profileId, input.category, current.updatedAt).first<{ id: number }>();
  if (!saved) throw new Error("DIRECTORY_PILOT_METADATA_WRITE_CONFLICT");
  const next = await getManagedDirectoryProfileById(input.profileId, input.database);
  if (!next) throw new Error("DIRECTORY_PILOT_METADATA_RELOAD_FAILED");
  return next;
}

/** Admin -> Notion: changed operational fields only, never a record-wide push. */
export async function mirrorPilotDirectoryMetadataFieldsToNotion(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
  profileId: number;
  changed: Partial<Record<PilotDirectoryMetadataField, string>>;
}): Promise<boolean> {
  const profile = await getManagedDirectoryProfileById(input.profileId, input.database);
  if (!profile || !(serviceFilterCategories as readonly string[]).includes(profile.category))
    throw new Error("DIRECTORY_PILOT_METADATA_SCOPE_INVALID");
  const mapping = await loadMappingByProfile(input.database, input.profileId);
  if (!mapping) throw new Error("DIRECTORY_PILOT_METADATA_UNLINKED");
  const dataSourceId = input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim();
  if (!dataSourceId || !input.bindings.NOTION_API_TOKEN?.trim())
    throw new Error("DIRECTORY_PILOT_METADATA_NOTION_DISABLED");
  const page = await fetchNotionPage(input.bindings, mapping.notion_page_id);
  if (page.id !== mapping.notion_page_id ||
      !notionDirectoryPageBelongsToSource(page, dataSourceId) ||
      propertyText(page, "Psipedia ID") !== String(input.profileId))
    throw new NotionDirectoryUnsafeTargetError("DIRECTORY_PILOT_METADATA_TARGET_INVALID");
  const patch: Record<string, unknown> = {};
  for (const field of PILOT_DIRECTORY_METADATA_FIELDS) {
    if (!Object.hasOwn(input.changed, field)) continue;
    const value = input.changed[field]!.trim();
    if (propertyText(page, field) === value) continue;
    if (!Object.hasOwn(page.properties ?? {}, field)) {
      // Public fact fields predate the optional Notion schema rollout.
      // Keep their value in Admin without blocking other field updates.
      if ((PUBLIC_DIRECTORY_FACT_FIELDS as readonly string[]).includes(field)) continue;
      throw new Error("DIRECTORY_PILOT_METADATA_NOTION_FIELD_MISSING: " + field);
    }
    patch[field] = richText(value);
  }
  if (!Object.keys(patch).length) return false;
  const echoed = await patchNotionPage(input.bindings, page.id, patch);
  if (echoed.id !== page.id || !echoed.properties ||
      Object.keys(patch).some(field => propertyText(echoed, field) !== input.changed[field]?.trim()))
    throw new Error("DIRECTORY_PILOT_METADATA_WRITEBACK_UNVERIFIED");
  return true;
}

/**
 * One-column CAS write. Trust status is deliberately distinct from publication
 * and from editorial profile updates. Never touch Services V3 or source_data_json.
 */
async function saveTrainerTrustField(
  database: D1Database,
  current: ManagedDirectoryProfile,
  field: TrainerTrustField,
  value: boolean,
): Promise<ManagedDirectoryProfile> {
  if (!serviceFilterCategories.includes(current.category as ServiceFilterCategory) || current.status === "archived")
    throw new Error("DIRECTORY_TRUST_SCOPE_INVALID");
  if (current[field] === value) return current;
  const column = field === "verified" ? "verified" : "featured";
  const changed = await database.prepare(
    "UPDATE directory_profiles SET " + column + " = ?, updated_at = ?, updated_by = ? " +
    "WHERE id = ? AND category = ? AND status <> 'archived' AND updated_at = ? RETURNING id",
  ).bind(value ? 1 : 0, new Date().toISOString(), SYSTEM_ACTOR, current.id, current.category, current.updatedAt)
    .first<{ id: number }>();
  if (!changed) throw new Error("TRAINER_TRUST_WRITE_CONFLICT");
  const updated = await getManagedDirectoryProfileById(current.id, database);
  if (!updated) throw new Error("TRAINER_TRUST_RELOAD_FAILED");
  return updated;
}

/**
 * Mapped breeder/trainer event mode: one explicit source action is authoritative for
 * the fields it edited. No record-wide hash/baseline/conflict reconciliation.
 * Retain the mapped identity, auth, and canonical structural constraints.
 */
async function syncBreederEvent(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
  page: NotionPage;
  profile: ManagedDirectoryProfile;
  changedPropertyIds?: readonly string[];
  adminChangedFields?: readonly BreederEditorialField[];
}): Promise<"pulled" | "pushed" | "unchanged"> {
  const { database, bindings, page } = input;
  const now = new Date().toISOString();
  if (input.changedPropertyIds !== undefined) {
    const paths = breederNotionChangedFields(page.properties, input.changedPropertyIds)
      .filter(path => path !== "services" || ["chovatelske-stanice", "salony-a-sluzby", "treneri"].includes(input.profile.category));
    const relationFields = ["chovatelske-stanice", "treneri"].includes(input.profile.category)
      ? breederRelationChangedFields(page.properties, input.changedPropertyIds) : [];
    const facetFields = ["chovatelske-stanice", "treneri", "veterinari"].includes(input.profile.category)
      ? breederChangedNotionFacets(page, input.changedPropertyIds)
          .filter(id => getDirectoryFilterDefinition(id)?.category === input.profile.category)
      : [];
    const trustFields = changedTrainerTrustNotionFields(page.properties, input.changedPropertyIds);
    const pilotMetaFields = isDirectoryEventPilotCategory(input.profile.category)
      ? pilotChangedNotionMetadataFields(page, input.changedPropertyIds) : [];
    if (!paths.length && !relationFields.length && !facetFields.length && !trustFields.length && !pilotMetaFields.length)
      return "unchanged";
    const fromNotion = notionSnapshot(page) as unknown as Record<string, unknown>;
    let current = input.profile;
    let updated = false;
    const failures: string[] = [];
    for (const path of paths) {
      // The Notion address is editorial text only: never modify the Google
      // Place ID, geo_points coordinates or paid-provider verification.
      const before = profileSnapshot(current) as unknown as Record<string, unknown>;
      const desired = breederApplyNotionChanges(before, fromNotion, [path]);
      if (JSON.stringify(breederReadPath(before, path)) ===
          JSON.stringify(breederReadPath(desired, path))) continue;
      try {
        current = await saveBreederEditorialValue(database, current, desired, path);
        updated = true;
      } catch (error) {
        // Keep the real reason in server logs; only this path is retried.
        console.error("BREEDER_EDITORIAL_FIELD_WRITE_FAILED", current.id, path, error);
        failures.push(path);
      }
    }
    // Operational hours and sources are one-field JSON writes. Empty Notion
    // values are missing, never a delete; other fields still transfer.
    let pilotMetaUpdated = false;
    for (const field of pilotMetaFields) {
      const value = propertyText(page, field).trim();
      if (!value) continue;
      try {
        const next = await savePilotDirectoryMetadataField({
          database, profileId: current.id, category: current.category, field, value,
        });
        if (next.updatedAt !== current.updatedAt) pilotMetaUpdated = true;
        current = next;
      } catch (error) {
        console.error("DIRECTORY_PILOT_METADATA_FIELD_WRITE_FAILED", current.id, field, error);
        failures.push(field);
      }
    }

    // Explicit tri-state Notion changes never infer "No" from an empty field.
    let facetsUpdated = false;
    for (const id of facetFields) {
      const def = getDirectoryFilterDefinition(id);
      if (!def) continue;
      const selected = propertyText(page, breederFacetNotionProperties[id]);
      if (!selected) continue;
      const normalized = normalizeDirectoryFilterValue(def, notionFacetSourceValue(selected));
      if (normalized.status !== "known") {
        failures.push(id);
        continue;
      }
      try {
        const row = await database.prepare("SELECT source_data_json, updated_at FROM directory_profiles WHERE id=? LIMIT 1")
          .bind(current.id).first<{ source_data_json: string; updated_at: string }>();
        if (!row) throw new Error("BREEDER_FACET_PROFILE_MISSING");
        const source = JSON.parse(row.source_data_json) as Record<string, unknown>;
        if (source[def.d1.key] === normalized.value) continue;
        const merged = mergeDirectoryFilterValues(row.source_data_json, current.category as "chovatelske-stanice" | "treneri", { [id]: normalized.value });
        const changed = await database.prepare(`UPDATE directory_profiles
          SET source_data_json=?, updated_at=?, updated_by=?
          WHERE id=? AND source_data_json=? AND updated_at=? RETURNING id`)
          .bind(merged, new Date().toISOString(), SYSTEM_ACTOR, current.id, row.source_data_json, row.updated_at)
          .first<{ id: number }>();
        if (!changed) throw new Error("BREEDER_FACET_WRITE_CONFLICT");
        current = (await getManagedDirectoryProfileById(current.id, database)) ?? current;
        facetsUpdated = true;
      } catch (error) {
        console.error("BREEDER_FACET_FIELD_WRITE_FAILED", current.id, id, error);
        failures.push(id);
      }
    }
    // Trainer trust checkboxes are explicit booleans: false is an intentional
    // change, not a missing value. Each checkbox writes its own guarded column.
    let trustUpdated = false;
    for (const field of trustFields) {
      const key = TRAINER_TRUST_NOTION_PROPERTIES[field];
      const raw = property(page, key)?.checkbox;
      if (typeof raw !== "boolean") { failures.push(field); continue; }
      try {
        const next = await saveTrainerTrustField(database, current, field, raw);
        if (next.updatedAt !== current.updatedAt) trustUpdated = true;
        current = next;
      } catch (error) {
        console.error("TRAINER_TRUST_FIELD_WRITE_FAILED", current.id, field, error);
        failures.push(field);
      }
    }
    // Relationship names are an independent, best-effort channel. Unknown,
    // ambiguous and empty entries NEVER erase old links or fail another field.
    let relationsUpdated = false;
    if (relationFields.length) {
      try {
        const selected = await getBreederRelationSelection(database, input.profile.id);
        if (selected) {
          const options = await listBreederRelationOptions(database);
          const next = { breedIds: [...selected.breedIds], clubIds: [...selected.clubIds] };
          for (const field of relationFields) {
            const text = propertyText(page, BREEDER_NOTION_RELATION_FIELDS[field]);
            const result = resolveBreederRelationText(text, field === "breedIds" ? options.breeds : options.clubs);
            if (result.status === "resolved") next[field] = result.ids;
            else if (result.status === "unmatched")
              console.warn("BREEDER_RELATION_NAME_UNMATCHED", input.profile.id, field, result.unmatched);
          }
          if (!sameBreederRelationIds(selected.breedIds, next.breedIds) ||
              !sameBreederRelationIds(selected.clubIds, next.clubIds)) {
            await saveBreederRelationSelection(database, input.profile.id, next, SYSTEM_ACTOR);
            relationsUpdated = true;
          }
        }
      } catch (error) {
        console.warn("BREEDER_RELATION_TEXT_SYNC_SKIPPED", input.profile.id, error);
      }
    }
    if (failures.length) {
      throw new Error("BREEDER_FIELD_SAVE_FAILED: " + failures.join(","));
    }
    if (!paths.length && !relationsUpdated && !facetFields.length && !trustFields.length && !pilotMetaFields.length) return "unchanged";
    // Also clear a legacy whole-profile conflict when the new event was
    // already applied (for example, an inbox retry or a duplicate delivery).
    await patchNotionPage(bindings, page.id, {
      "Sync stav": select("Synchronizované"),
      "Sync chyba": richText(""),
      "Posledný sync": date(now),
    });
    return updated || relationsUpdated || facetsUpdated || trustUpdated || pilotMetaUpdated ? "pulled" : "unchanged";
  }

  const fields = (input.adminChangedFields ?? []).filter(
    (path): path is BreederEditorialField =>
      Object.hasOwn(BREEDER_NOTION_EDITORIAL_FIELDS, path) &&
      (path !== "services" || ["chovatelske-stanice", "salony-a-sluzby", "treneri"].includes(input.profile.category)),
  );
  if (!fields.length) return "unchanged";
  const geo = await loadGeoMirror(database, input.profile.id);
  const monitor = await getMediaSourceMonitorForEntity(database, "DIRECTORY_PROFILE", input.profile.id);
  const sourceImageUrl = monitor?.sourceImageUrl || externalSourceImageUrl(input.profile.imageUrl);
  const allProperties = notionProfileProperties(input.profile, geo, "", now, sourceImageUrl);
  const patch: Record<string, unknown> = {};
  for (const path of fields) {
    const key = BREEDER_NOTION_EDITORIAL_FIELDS[path];
    patch[key] = adaptDirectoryNotionTextProperties(
      { [key]: allProperties[key] }, page.properties ?? {},
    )[key];
  }
  patch["Sync stav"] = select("Synchronizované");
  patch["Sync chyba"] = richText("");
  patch["Posledný sync"] = date(now);
  await patchNotionPage(bindings, page.id, patch);
  return "pushed";
}

/**
 * Admin relation choices -> human-readable Notion text.
 * Called only after a successful Admin selection save, and never reconciles
 * any ordinary profile field or removes relationships on Notion failures.
 */
export async function mirrorBreederCategoryFiltersToNotion(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
  profileId: number;
  fields: readonly string[];
}): Promise<boolean> {
  if (!input.fields.length) return false;
  if (!notionFlagEnabled(input.bindings.NOTION_DIRECTORY_SYNC_ENABLED) ||
      !input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim() || !input.bindings.NOTION_API_TOKEN?.trim())
    throw new Error("BREEDER_FACET_NOTION_SYNC_DISABLED");
  const mapping = await loadMappingByProfile(input.database, input.profileId);
  const profile = await getManagedDirectoryProfileById(input.profileId, input.database);
  if (!mapping || !profile || !["chovatelske-stanice", "treneri", "veterinari"].includes(profile.category))
    throw new Error("BREEDER_FACET_NOTION_MAPPING_UNAVAILABLE");
  const page = await fetchNotionPage(input.bindings, mapping.notion_page_id);
  if (page.id !== mapping.notion_page_id ||
      !notionDirectoryPageBelongsToSource(page, input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID!) ||
      propertyText(page, "Psipedia ID") !== String(input.profileId))
    throw new NotionDirectoryUnsafeTargetError("BREEDER_FACET_TARGET_INVALID");
  const patch: Record<string, unknown> = {};
  const expectedLabels: Record<string, string> = {};
  const missingProperties: string[] = [];
  for (const id of input.fields) {
    if (!Object.hasOwn(breederFacetNotionProperties, id)) continue;
    const key = breederFacetNotionProperties[id as BreederFacetId];
    if (!Object.hasOwn(page.properties ?? {}, key)) {
      if (profile.category !== "veterinari")
        throw new Error("BREEDER_NOTION_FACET_MISSING: " + key);
      missingProperties.push(key);
      continue;
    }
    const def = getDirectoryFilterDefinition(id);
    if (!def || def.category !== profile.category) continue;
    const state = normalizeDirectoryFilterValue(def, profile.importData?.[def.d1.key]);
    if (state.status !== "known") continue;
    const label = notionFacetLabel(state.value);
    if (propertyText(page, key) !== label) {
      patch[key] = select(label);
      expectedLabels[key] = label;
    }
  }
  if (!Object.keys(patch).length && !missingProperties.length) return false;
  // Vet facet edits remain independently transferable: one rejected Notion field
  // must not suppress the others or rewrite unrelated category properties.
  if (profile.category === "veterinari") {
    const failures: string[] = [...missingProperties];
    for (const [key, value] of Object.entries(patch)) {
      try {
        const echoed = await patchNotionPage(input.bindings, page.id, { [key]: value });
        if (propertyText(echoed, key) !== expectedLabels[key])
          throw new Error("VETERINARY_FACET_WRITEBACK_UNVERIFIED");
      } catch (error) {
        console.error("VETERINARY_FACET_WRITEBACK_FAILED", input.profileId, key, error);
        failures.push(key);
      }
    }
    if (failures.length)
      throw new Error("VETERINARY_FACET_FIELDS_PENDING: " + failures.join(","));
    await patchNotionPage(input.bindings, page.id, {
      "Sync stav": select("Synchronizované"),
      "Sync chyba": richText(""),
      "Posledný sync": date(new Date().toISOString()),
    });
    return true;
  }
  patch["Sync stav"] = select("Synchronizované");
  patch["Sync chyba"] = richText("");
  patch["Posledný sync"] = date(new Date().toISOString());
  await patchNotionPage(input.bindings, page.id, patch);
  return true;
}

/**
 * Admin -> Notion trust writeback for all service-directory categories. Each selected
 * checkbox is individually compared and patched; absence from 'fields'
 * never modifies the other checkbox, even when an old Admin form was open.
 */
export async function mirrorTrainerTrustFieldsToNotion(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
  profileId: number;
  fields: readonly TrainerTrustField[];
}): Promise<boolean> {
  if (!input.fields.length) return false;
  if (!notionFlagEnabled(input.bindings.NOTION_DIRECTORY_SYNC_ENABLED) ||
      !input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim() || !input.bindings.NOTION_API_TOKEN?.trim())
    throw new Error("TRAINER_TRUST_NOTION_DISABLED");
  const mapping = await loadMappingByProfile(input.database, input.profileId);
  const profile = await getManagedDirectoryProfileById(input.profileId, input.database);
  if (!mapping || !profile || !serviceFilterCategories.includes(profile.category as ServiceFilterCategory) || profile.status === "archived")
    throw new Error("DIRECTORY_TRUST_NOTION_MAPPING_INVALID");
  const page = await fetchNotionPage(input.bindings, mapping.notion_page_id);
  if (page.id !== mapping.notion_page_id ||
      !notionDirectoryPageBelongsToSource(page, input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID!) ||
      propertyText(page, "Psipedia ID") !== String(input.profileId))
    throw new NotionDirectoryUnsafeTargetError("TRAINER_TRUST_NOTION_TARGET_INVALID");
  const patch: Record<string, unknown> = {};
  for (const field of input.fields) {
    const name = TRAINER_TRUST_NOTION_PROPERTIES[field];
    const checked = property(page, name)?.checkbox;
    if (typeof checked !== "boolean")
      throw new Error("TRAINER_TRUST_NOTION_PROPERTY_INVALID: " + name);
    if (checked !== profile[field]) patch[name] = { checkbox: profile[field] };
  }
  if (!Object.keys(patch).length) return false;
  patch["Sync stav"] = select("Synchronizované");
  patch["Sync chyba"] = richText("");
  patch["Posledný sync"] = date(new Date().toISOString());
  const echoed = await patchNotionPage(input.bindings, page.id, patch);
  if (echoed.id !== page.id || !echoed.properties ||
      input.fields.some(field => property(echoed, TRAINER_TRUST_NOTION_PROPERTIES[field])?.checkbox !== profile[field]))
    throw new Error("TRAINER_TRUST_NOTION_WRITEBACK_UNVERIFIED");
  return true;
}

export async function mirrorBreederRelationNamesToNotion(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
  profileId: number;
  fields: readonly BreederRelationField[];
}): Promise<boolean> {
  if (!input.fields.length || !notionFlagEnabled(input.bindings.NOTION_DIRECTORY_SYNC_ENABLED) ||
      !input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim() || !input.bindings.NOTION_API_TOKEN?.trim())
    return false;
  const mapping = await loadMappingByProfile(input.database, input.profileId);
  const profile = await getManagedDirectoryProfileById(input.profileId, input.database);
  if (!mapping || !profile || !["chovatelske-stanice", "treneri"].includes(profile.category)) return false;
  const page = await fetchNotionPage(input.bindings, mapping.notion_page_id);
  if (page.id !== mapping.notion_page_id ||
      !notionDirectoryPageBelongsToSource(page, input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID!)) return false;
  if (propertyText(page, "Psipedia ID") !== String(input.profileId)) return false;
  const selected = await getBreederRelationSelection(input.database, input.profileId);
  if (!selected) return false;
  const options = await listBreederRelationOptions(input.database);
  const patch: Record<string, unknown> = {};
  for (const field of input.fields) {
    const name = BREEDER_NOTION_RELATION_FIELDS[field];
    if (!Object.hasOwn(page.properties ?? {}, name)) continue;
    const names = formatBreederRelationText(selected[field],
      field === "breedIds" ? options.breeds : options.clubs);
    if (names !== null && names !== propertyText(page, name))
      patch[name] = richText(names);
  }
  if (!Object.keys(patch).length) return false;
  await patchNotionPage(input.bindings, page.id, patch);
  return true;
}

async function syncMappedPage(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
  dataSourceId: string;
  mapping: DirectoryNotionMapping;
  page?: NotionPage;
  forcePsipediaPush?: boolean;
  /** Explicit owner request only; NEVER used by hourly/webhook sync. */
  manualDirection?: ManualFieldDirection;
  breederWebhookPropertyIds?: readonly string[];
  breederAdminFields?: readonly BreederEditorialField[];
}) {
  const profile = await getManagedDirectoryProfileById(input.mapping.directory_profile_id, input.database);
  if (!profile) return "unchanged" as const;

  let page = input.page ?? await fetchNotionPage(input.bindings, input.mapping.notion_page_id);
  if (page.id !== input.mapping.notion_page_id) {
    throw new NotionDirectoryUnsafeTargetError("IDENTITY_CONFLICT: Notion page ID nezodpovedá existujúcemu mapovaniu.");
  }
  // A mapping alone does not grant write access to a page moved out of the
  // canonical Directory data source. Never PATCH an unrelated Notion page.
  if (!notionDirectoryPageBelongsToSource(page, input.dataSourceId)) {
    throw new NotionDirectoryUnsafeTargetError("IDENTITY_CONFLICT: Notion profil už nepatrí do databázy Adresár.");
  }

  // Trainers already linked to Notion also use explicit field events. A
  // plain targeted sweep has no changed-property IDs and must not fall through
  // to the legacy whole-profile baseline reconciliation (BASELINE_UNAVAILABLE).
  // Owner-directed manual transfers retain their separate path below.
  if (profile.category === "treneri" &&
      !input.manualDirection &&
      input.breederWebhookPropertyIds === undefined &&
      input.breederAdminFields === undefined) {
    if (propertyText(page, "Psipedia ID") !== String(profile.id))
      throw new NotionDirectoryUnsafeTargetError("TRAINER_IDENTITY_MISMATCH");
    // Publishing through the canonical Admin editor is a structural event,
    // not an editorial field reconciliation. Preserve its existing writeback.
    const notionStatus = propertyText(page, "Psipedia stav");
    if (profile.status === "published" && notionStatus === "Archív")
      throw new Error("TRAINER_PUBLICATION_STATUS_CONFLICT");
    if (profile.status === "published" && notionStatus === "Koncept") {
      const echoed = await patchNotionPage(input.bindings, page.id, {
        "Psipedia stav": select("Publikované"),
        "Stav": select("Publikované"),
        "Publikované Psipedia": date(profile.publishedAt ?? profile.updatedAt),
      });
      if (echoed.id !== page.id || propertyText(echoed, "Psipedia stav") !== "Publikované")
        throw new Error("TRAINER_PUBLICATION_WRITEBACK_UNVERIFIED");
      return "pushed" as const;
    }
    // One-time lossless catch-up for existing mapped trainers: their Notion
    // prose was previously excluded from events. A missing metadata KEY
    // (not an empty value) is the only signal that this field was never
    // initialized. Do not run legacy baseline or overwrite deliberate blanks.
    if (profile.status !== "archived" &&
        !Object.hasOwn(profile.importData ?? {}, TRAINER_SERVICES_TEXT_METADATA_KEY)) {
      const incoming = notionSnapshot(page);
      if (incoming.services.length) {
        const desired = breederApplyNotionChanges(
          profileSnapshot(profile) as unknown as Record<string, unknown>,
          incoming as unknown as Record<string, unknown>,
          ["services"],
        );
        await saveBreederEditorialValue(input.database, profile, desired, "services");
        await patchNotionPage(input.bindings, page.id, {
          "Sync stav": select("Synchronizované"),
          "Sync chyba": richText(""),
          "Posledný sync": date(new Date().toISOString()),
        });
        return "pulled" as const;
      }
    }
    return "unchanged" as const;
  }

  // Breeders and all pilot service categories are field-event only.
  // A targeted sweep may still mirror Admin-confirmed publication, status only:
  // never re-enter record-wide editorial hash/baseline reconciliation.
  // The owner-directed manual full-profile transfer below stays available.
  if ((["chovatelske-stanice", "salony-a-sluzby"].includes(profile.category) || isDirectoryEventPilotCategory(profile.category)) &&
      !input.manualDirection &&
      input.breederWebhookPropertyIds === undefined &&
      input.breederAdminFields === undefined) {
    if (propertyText(page, "Psipedia ID") !== String(profile.id))
      throw new NotionDirectoryUnsafeTargetError("BREEDER_IDENTITY_MISMATCH");
    const notionStatus = propertyText(page, "Psipedia stav");
    if (profile.status === "published" && notionStatus === "Archív")
      throw new Error("BREEDER_PUBLICATION_STATUS_CONFLICT");
    if (profile.status === "published" && notionStatus === "Koncept") {
      const echoed = await patchNotionPage(input.bindings, page.id, {
        "Psipedia stav": select("Publikované"),
        "Stav": select("Publikované"),
        "Publikované Psipedia": date(profile.publishedAt ?? profile.updatedAt),
      });
      if (echoed.id !== page.id || propertyText(echoed, "Psipedia stav") !== "Publikované")
        throw new Error("BREEDER_PUBLICATION_WRITEBACK_UNVERIFIED");
      return "pushed" as const;
    }
    return "unchanged" as const;
  }

  if (isDirectoryFieldEventCategory(profile.category)
      && (input.breederWebhookPropertyIds !== undefined || input.breederAdminFields !== undefined)
      && !input.manualDirection) {
    // A signed webhook must not be allowed to reassign a different entity.
    if (propertyText(page, "Psipedia ID") !== String(profile.id)) {
      throw new NotionDirectoryUnsafeTargetError("BREEDER_IDENTITY_MISMATCH");
    }
    return syncBreederEvent({
      database: input.database, bindings: input.bindings, page, profile,
      changedPropertyIds: input.breederWebhookPropertyIds,
      adminChangedFields: input.breederAdminFields,
    });
  }

  // A mapping can already exist when the first Notion write-back failed.
  // Restore the canonical Psipedia ID/status before ordinary conflict resolution.
  if (propertyText(page, "Psipedia ID") !== String(profile.id)) {
    if (propertyText(page, "Psipedia ID")) {
      throw new Error("IDENTITY_CONFLICT: Notion stránka je priradená inému Psipedia ID.");
    }
    await writeProfileToNotion({
      database: input.database,
      bindings: input.bindings,
      dataSourceId: input.dataSourceId,
      profile,
      pageId: page.id,
    });
    return "pushed" as const;
  }

  // A confirmed canonical physical address must reach Notion even if a
  // different editorial field has an unresolved conflict. PATCH only these
  // protected fields; never advance the common mapping or field baseline on
  // this partial operation.
  const currentGeo = await loadGeoMirror(input.database, profile.id);
  const confirmedPlace = Boolean(currentGeo?.google_place_id
    && currentGeo.google_place_source_fingerprint && currentGeo.source_fingerprint
    && currentGeo.google_place_source_fingerprint === currentGeo.source_fingerprint);
  if (profile.serviceAddressConfirmation === "CONFIRMED_SERVICE_LOCATION" || confirmedPlace) {
    const addressKeys = [
      "Kraj", "Okres", "Mesto", "Adresa", "PSČ", "Ulica",
      "Číslo domu", "Formát adresy", "Potvrdená prevádzka",
    ] as const;
    const expected = profileSnapshot(profile);
    const differs = (candidate: NotionPage) => {
      const actual = notionSnapshot(candidate);
      return actual.region !== expected.region || actual.district !== expected.district
        || actual.city !== expected.city || actual.address !== expected.address
        || actual.postalCode !== expected.postalCode || actual.street !== expected.street
        || actual.houseNumber !== expected.houseNumber
        || actual.addressFormat !== expected.addressFormat
        || actual.confirmedServiceLocation !== expected.confirmedServiceLocation;
    };
    if (differs(page)) {
      const latest = await fetchNotionPage(input.bindings, page.id);
      if (latest.id !== page.id || !notionDirectoryPageBelongsToSource(latest, input.dataSourceId))
        throw new NotionDirectoryUnsafeTargetError("IDENTITY_CONFLICT: Canonical address target changed.");
      if (differs(latest)) {
        const properties = notionProfileProperties(profile, currentGeo, "", new Date().toISOString());
        const patch = Object.fromEntries(addressKeys.map(key => [key, properties[key]]));
        const echoed = await patchNotionPage(input.bindings, latest.id, patch);
        if (echoed.id !== latest.id || !echoed.properties || differs(echoed))
          throw new Error("NOTION_DIRECTORY_ADDRESS_WRITEBACK_UNVERIFIED");
        page = echoed;
      } else page = latest;
    }
  }
  const existingMonitor = await getMediaSourceMonitorForEntity(input.database, "DIRECTORY_PROFILE", profile.id);
  const currentSourceImageUrl = existingMonitor?.sourceImageUrl || externalSourceImageUrl(profile.imageUrl);
  const profileHash = await snapshotHash(profileSnapshot(profile, currentSourceImageUrl));
  const pageHash = await snapshotHash(notionSnapshot(page));
  // One-shot recovery must reconcile CURRENT values, including differences
  // previously acknowledged by a legacy mapping receipt. Never infer changes
  // from timestamps or mutate the normal saved field-authority rules.
  if(input.manualDirection){
    if(profile.status==="archived")throw Error("TRANSFER_DIRECTORY_ARCHIVED");
    const group=NOTION_AUTHORITY_GROUPS.find(g=>g.scope==="directory:"+profile.category);
    if(!group)throw Error("TRANSFER_DIRECTORY_CATEGORY_UNSUPPORTED");
    const protectedPaths=new Set([
      "slug","category","status","services","confirmedServiceLocation",
      "verified","featured","internalEmail","qualityCheckedAt",
      "qualityResolutions","seo.noindex","imageUrl","imageKey",
    ]);
    if(confirmedPlace || profile.serviceAddressConfirmation==="CONFIRMED_SERVICE_LOCATION")
      for(const key of ["region","district","city","address","postalCode","street","houseNumber","addressFormat"])
        protectedPaths.add(key);
    const plan=planOwnerDirectedFields({
      notion:notionSnapshot(page) as Record<string,unknown>,
      admin:profileSnapshot(profile,currentSourceImageUrl) as Record<string,unknown>,
      direction:input.manualDirection,
      editablePaths:group.fields.filter(f=>!f.locked).map(f=>f.id),
      protectedPaths,
    });
    if(!plan.changes.length)return "unchanged" as const;
    let updated=profile;
    if(input.manualDirection==="NOTION_TO_ADMIN"){
      const latest=await fetchNotionPage(input.bindings,page.id);
      if(latest.id!==page.id||!notionDirectoryPageBelongsToSource(latest,input.dataSourceId)
        ||await snapshotHash(notionSnapshot(latest))!==pageHash)
        throw Error("TRANSFER_DIRECTORY_SOURCE_CHANGED");
      const current=await getManagedDirectoryProfileById(profile.id,input.database);
      if(!current||current.updatedAt!==profile.updatedAt)
        throw Error("TRANSFER_DIRECTORY_ADMIN_CHANGED");
      updated=await applyNotionToProfile({
        database:input.database,bindings:input.bindings,page:latest,
        profile:current,desiredOverride:plan.desired as EditableDirectorySnapshot,
      });
    }
    await writeProfileToNotion({
      database:input.database,bindings:input.bindings,dataSourceId:input.dataSourceId,
      profile:updated,pageId:page.id,
    });
    return input.manualDirection==="NOTION_TO_ADMIN"?"pulled" as const:"pushed" as const;
  }
  const lastHash = input.mapping.content_hash;
  const profileChanged = profileHash !== lastHash;
  const notionChanged = pageHash !== lastHash;

  if (!profileChanged && !notionChanged) {
    const notionMetadataChanged = (page.last_edited_time ?? null) !== input.mapping.notion_last_edited_time;
    if (input.forcePsipediaPush || notionMetadataChanged) {
      await writeProfileToNotion({
        database: input.database,
        bindings: input.bindings,
        dataSourceId: input.dataSourceId,
        profile,
        pageId: page.id,
      });
      return "pushed" as const;
    }
    await recordProfileFieldBaseline({
      database: input.database, agenda: "directory", entityId: profile.id,
      pageId: page.id, hash: profileHash,
      snapshot: profileSnapshot(profile, currentSourceImageUrl),
      syncedAt: new Date().toISOString(),
    });
    return "unchanged" as const;
  }

  // Preserve the existing separately owner-approved Gemini priority mode.
  // When it is OFF, use the safer lossless field strategy. Neither mode
  // changes the feature flag or authorizes production activation.
  if (!gemini22PriorityEnabled(input.bindings.NOTION_GEMINI_22_PRIORITY_A_ENABLED)) {
    // Record-level modified times include our own sync writes. Three-way
    // comparison NEVER infers which same-field human edit happened last.
  const storedBaseline = await readProfileFieldBaseline({
    database: input.database, agenda: "directory", entityId: profile.id,
    pageId: page.id, expectedHash: lastHash,
  });
  const geoMirror = currentGeo;
  const canonicalSnapshot = profileSnapshot(profile, currentSourceImageUrl);
  const notionEditorial = notionSnapshot(page);
  // If only one side changed, the other side still equals the last
  // acknowledged hash and therefore proves the prior common snapshot.
  // This allows lossless one-sided sync without any new D1 table. Divergent
  // edits on both sides still require a verified stored baseline or review.
  const baseline = trustedProfileBaselineFromHashes({
    recorded: storedBaseline, notion: notionEditorial, psipedia: canonicalSnapshot,
    mappingHash: lastHash, notionHash: pageHash, psipediaHash: profileHash,
  });
  const protectedFields = new Set([
    "slug", "category", "status", "services", "confirmedServiceLocation",
    "verified", "featured", "internalEmail", "qualityCheckedAt",
    "qualityResolutions.phone", "qualityResolutions.email",
    "qualityResolutions.website", "qualityResolutions.image",
    "qualityResolutions.address", "seo.noindex",
  ]);
  const confirmedGooglePlace = Boolean(
    geoMirror?.google_place_id && geoMirror.google_place_source_fingerprint
    && geoMirror.source_fingerprint
    && geoMirror.google_place_source_fingerprint === geoMirror.source_fingerprint,
  );
  if (confirmedGooglePlace || profile.serviceAddressConfirmation === "CONFIRMED_SERVICE_LOCATION") {
    for (const field of ["region", "district", "city", "address", "postalCode",
      "street", "houseNumber", "addressFormat"]) protectedFields.add(field);
  }
  // User-configured authority is scoped to the canonical category, never
  // the Notion-editable title/category. All hard protected fields still win.
  const fieldAuthorities = await readNotionFieldAuthorities(
    input.database, "directory:" + profile.category,
  );
  const resolution = baseline
    ? reconcileProfileFields({
        baseline, notion: notionEditorial, psipedia: canonicalSnapshot, protectedFields,
        canonicalFieldsWin: true, authorities: fieldAuthorities,
      })
    : reconcileProfileFieldsWithoutBaseline({
        notion: notionEditorial, psipedia: canonicalSnapshot, protectedFields,
        canonicalFieldsWin: true, authorities: fieldAuthorities,
      });
  if (resolution.kind === "CONFLICT") {
    // A missing historical baseline does NOT justify replacing the whole page.
    // Canonical-owned fields may still be independently mirrored when an
    // unrelated editorial field needs manual review. Never advance mapping
    // or baseline for this partial write; a retry only touches outstanding
    // canonically owned differences.
    if (!baseline && resolution.psipediaFields.length) {
      const directoryFieldToNotion: Record<string, readonly string[]> = {
        name: ["Názov"], excerpt: ["Perex"], description: ["Popis"],
        qualifications: ["Kvalifikácie"],
        region: ["Kraj"], district: ["Okres"], city: ["Mesto"],
        address: ["Adresa"], postalCode: ["PSČ"], street: ["Ulica"],
        houseNumber: ["Číslo domu"], addressFormat: ["Formát adresy"],
        priceNote: ["Cena / poznámka"], websiteUrl: ["Web"],
        publicPhone: ["Telefón"], publicEmail: ["E-mail"],
        facebookUrl: ["Facebook"], instagramUrl: ["Instagram"],
        "seo.title": ["SEO title"], "seo.description": ["SEO popis"],
        slug: ["Slug"], category: ["Kategória"],
        status: ["Psipedia stav", "Stav"],
        services: ["Služby"],
        confirmedServiceLocation: ["Potvrdená prevádzka"],
        verified: ["Overené"], featured: ["Odporúčané"],
        internalEmail: ["Interný e-mail"],
        qualityCheckedAt: ["Kvalita skontrolované"],
        "qualityResolutions.phone": ["Kvalita · Telefón"],
        "qualityResolutions.email": ["Kvalita · E-mail"],
        "qualityResolutions.website": ["Kvalita · Web"],
        "qualityResolutions.image": ["Kvalita · Obrázok"],
        "qualityResolutions.address": ["Kvalita · Adresa"],
        "seo.noindex": ["Noindex"],
      };
      // Only declared, fixed canonical-owned fields are eligible here.
      const eligible = resolution.psipediaFields
        .filter(path => Object.hasOwn(directoryFieldToNotion, path));
      if (eligible.length) {
        const latest = await fetchNotionPage(input.bindings, page.id);
        const current = await getManagedDirectoryProfileById(profile.id, input.database);
        if (!current || current.updatedAt !== profile.updatedAt
            || latest.id !== page.id
            || !notionDirectoryPageBelongsToSource(latest, input.dataSourceId)
            || await snapshotHash(notionSnapshot(latest)) !== pageHash) {
          throw new Error("NOTION_DIRECTORY_PARTIAL_RECOVERY_REVISION_CHANGED");
        }
        const expected = notionProfileProperties(
          profile, currentGeo, "", new Date().toISOString(), currentSourceImageUrl,
        );
        const patch: Record<string, unknown> = {};
        for (const path of eligible) {
          for (const name of directoryFieldToNotion[path]) {
            if (!Object.hasOwn(latest.properties ?? {}, name)) {
              throw new Error("NOTION_DIRECTORY_PARTIAL_RECOVERY_PROPERTY_MISSING");
            }
            patch[name] = expected[name as keyof typeof expected];
          }
        }
        const written = await patchNotionPage(input.bindings, page.id, patch);
        if (written.id !== page.id || !written.properties
            || eligible.some(path => {
              const expectedSnapshot = profileSnapshot(profile, currentSourceImageUrl);
              const actual = notionSnapshot(written);
              const get = (obj: Record<string, unknown>, p: string) =>
                p.split(".").reduce<unknown>((value, key) =>
                  value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, obj);
              return JSON.stringify(get(actual, path)) !== JSON.stringify(get(expectedSnapshot, path));
            })) {
          throw new Error("NOTION_DIRECTORY_PARTIAL_RECOVERY_ECHO_MISMATCH");
        }
      }
    }
    if (!baseline && resolution.notionFields.length) {
      // An owner-selected Notion field can be committed to D1 without
      // adjudicating unrelated fields. Recheck identity/revisions and apply
      // an override built from the canonical profile, not a full Notion import.
      // Leave the shared mapping hash untouched until all fields converge.
      const latest = await fetchNotionPage(input.bindings, page.id);
      const current = await getManagedDirectoryProfileById(profile.id, input.database);
      if (!current || current.updatedAt !== profile.updatedAt
          || latest.id !== page.id
          || !notionDirectoryPageBelongsToSource(latest, input.dataSourceId)) {
        throw new Error("NOTION_DIRECTORY_PARTIAL_PULL_REVISION_CHANGED");
      }
      const get = (obj: Record<string, unknown>, path: string) =>
        path.split(".").reduce<unknown>((value, key) =>
          value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, obj);
      const actual = notionSnapshot(latest);
      if (resolution.notionFields.some(path =>
        JSON.stringify(get(actual, path)) !== JSON.stringify(get(notionEditorial, path)))) {
        throw new Error("NOTION_DIRECTORY_PARTIAL_PULL_REVISION_CHANGED");
      }
      const desiredPartial = resolution.merged as EditableDirectorySnapshot;
      const saved = await applyNotionToProfile({
        database: input.database, bindings: input.bindings, page: latest,
        profile: current, desiredOverride: desiredPartial,
      });
      const savedSnapshot = profileSnapshot(saved, currentSourceImageUrl);
      if (resolution.notionFields.some(path =>
        JSON.stringify(get(savedSnapshot, path)) !== JSON.stringify(get(desiredPartial, path)))) {
        throw new Error("NOTION_DIRECTORY_PARTIAL_PULL_VERIFY_FAILED");
      }
    }
    throw new Error("CONFLICT: LOSSLESS_FIELD_REVIEW_REQUIRED (" +
      resolution.conflicts.map((c) => c.field + ":" + c.reason).join(", ").slice(0, 1000) + ")");
  }
  const desired = resolution.merged as EditableDirectorySnapshot;
  const updated = await snapshotHash(desired) === profileHash
    ? profile
    : await applyNotionToProfile({
      database: input.database, bindings: input.bindings, page, profile,
      desiredOverride: desired,
    });
  await writeProfileToNotion({
    database: input.database, bindings: input.bindings, dataSourceId: input.dataSourceId,
    profile: updated, pageId: page.id,
  });
  return await snapshotHash(desired) === profileHash ? "pushed" as const : "pulled" as const;
  }

  // Owner-approved Gemini 22 Notion priority A: apply only with the
  // separate default-OFF production gate. Respect immutable directory
  // identity/publication, canonical quality decisions and Google location.
  if (gemini22PriorityEnabled(input.bindings.NOTION_GEMINI_22_PRIORITY_A_ENABLED)) {
    if (profile.status === "archived") {
      throw new Error("REVIEW_REQUIRED: Archivovaný profil sa nezosúlaďuje bez obnovenia.");
    }
    const geo = await loadGeoMirror(input.database, profile.id);
    const confirmedGooglePlace = Boolean(
      geo?.google_place_id
      && geo.google_place_source_fingerprint
      && geo.source_fingerprint
      && geo.google_place_source_fingerprint === geo.source_fingerprint,
    );
    const desired = mergeGeminiDirectoryPriority({
      canonical: profileSnapshot(profile, currentSourceImageUrl),
      notion: notionSnapshot(page),
      confirmedGooglePlace,
    });
    const desiredHash = await snapshotHash(desired);
    const updated = desiredHash === profileHash
      ? profile
      : await applyNotionToProfile({
          database: input.database,
          bindings: input.bindings,
          page,
          profile,
          desiredOverride: desired,
        });
    await writeProfileToNotion({
      database: input.database,
      bindings: input.bindings,
      dataSourceId: input.dataSourceId,
      profile: updated,
      pageId: page.id,
    });
    return desiredHash === profileHash ? "pushed" as const : "pulled" as const;
  }

  const notionWins = notionChanged && !profileChanged;
  if (notionChanged && profileChanged) {
    // Never last-write-wins over a human editor. Leave both sides intact,
    // so an operator can explicitly resolve the conflict.
    throw new Error("CONFLICT: Notion aj Psipedia boli upravené od poslednej synchronizácie.");
  }

  if (notionWins) {
    const updated = await applyNotionToProfile({
      database: input.database,
      bindings: input.bindings,
      page,
      profile,
    });
    await writeProfileToNotion({
      database: input.database,
      bindings: input.bindings,
      dataSourceId: input.dataSourceId,
      profile: updated,
      pageId: page.id,
    });
    return "pulled" as const;
  }

  await writeProfileToNotion({
    database: input.database,
    bindings: input.bindings,
    dataSourceId: input.dataSourceId,
    profile,
    pageId: page.id,
  });
  return "pushed" as const;
}

async function recoverMappingFromPage(input: {
  database: D1Database;
  page: NotionPage;
}) {
  const rawId = propertyText(input.page, "Psipedia ID");
  // parseInt("123-other") would otherwise alias an unrelated canonical ID.
  if (!/^[1-9]\d*$/.test(rawId)) return null;
  const profileId = Number(rawId);
  if (!Number.isSafeInteger(profileId) || profileId <= 0) return null;
  const profile = await getManagedDirectoryProfileById(profileId, input.database);
  if (!profile) return null;
  const existingMapping = await loadMappingByProfile(input.database, profileId);
  if (existingMapping && existingMapping.notion_page_id !== input.page.id) {
    throw new Error(`Psipedia profil ID ${profileId} už je prepojený s iným Notion záznamom.`);
  }
  const monitor = await getMediaSourceMonitorForEntity(input.database, "DIRECTORY_PROFILE", profile.id);
  const hash = await snapshotHash(profileSnapshot(profile, monitor?.sourceImageUrl || externalSourceImageUrl(profile.imageUrl)));
  // A stale/untrusted Notion "Sync hash" must never fabricate a common
  // baseline or connect a page with divergent editorial content.
  const notionHash = await snapshotHash(notionSnapshot(input.page));
  if (!canRecoverNotionDirectoryMapping(hash, notionHash)) {
    throw new Error("DIRECTORY_RECOVERY_BASELINE_MISMATCH");
  }
  const now = new Date().toISOString();
  await saveMapping({
    database: input.database,
    pageId: input.page.id,
    profileId,
    contentHash: hash,
    notionLastEditedTime: input.page.last_edited_time ?? null,
    psipediaUpdatedAt: profile.updatedAt,
    syncedAt: now,
  });
  return loadMappingByProfile(input.database, profileId);
}

/**
 * Targeted directory write for Gemini bridge. Never bootstraps unrelated profiles.
 * Search the existing Notion source by canonical Psipedia ID before any creation:
 * this recovers a successful remote create whose local mapping commit failed.
 *
 * If a POST may have reached Notion but returned an error, the caller must not
 * attempt another POST automatically; retry with allowCreate=false.
 */
export async function ensureDirectoryProfileInNotion(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
  profileId: number;
  allowCreate: boolean;
}) {
  const dataSourceId = input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim();
  if (!dataSourceId || !input.bindings.NOTION_API_TOKEN?.trim())
    throw new Error("GEMINI_NOTION_CONFIG_MISSING");
  if (!(await schemaReady(input.database))) throw new Error("GEMINI_NOTION_MAPPING_SCHEMA_MISSING");
  const profile = await getManagedDirectoryProfileById(input.profileId, input.database);
  if (!profile || profile.status !== "draft") throw new Error("GEMINI_NOTION_CANONICAL_DRAFT_MISSING");
  const mapped = await loadMappingByProfile(input.database, profile.id);
  if (mapped) return { notionPageId: mapped.notion_page_id, created: false };
  // This query must complete successfully before a Notion create is permitted.
  const response = await notionRequest<NotionQueryResponse>(
    input.bindings, `/data_sources/${encodeURIComponent(dataSourceId)}/query`, {
      method: "POST",
      body: JSON.stringify({
        filter: { property: "Psipedia ID", rich_text: { equals: String(profile.id) } },
        page_size: 3,
      }),
    },
  );
  if (response.has_more || (response.results?.length ?? 0) > 1)
    throw new Error("GEMINI_NOTION_AMBIGUOUS_REMOTE_MAPPING");
  const existing = response.results?.[0];
  if (existing) {
    // Recover the canonical mapping using the existing serializer and hash path.
    await writeProfileToNotion({ database: input.database, bindings: input.bindings,
      dataSourceId, profile, pageId: existing.id });
    return { notionPageId: existing.id, created: false };
  }
  if (!input.allowCreate) throw new Error("GEMINI_NOTION_REMOTE_CREATE_UNCERTAIN");
  const page = await writeProfileToNotion({
    database: input.database, bindings: input.bindings, dataSourceId, profile,
    singleAttemptCreate: true,
  });
  return { notionPageId: page.id, created: true };
}

export async function runNotionDirectoryBootstrapSweep(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
}): Promise<NotionDirectoryBootstrapSummary> {
  const enabled = notionFlagEnabled(input.bindings.NOTION_DIRECTORY_SYNC_ENABLED);
  const summary: NotionDirectoryBootstrapSummary = {
    enabled,
    schemaReady: false,
    selected: 0,
    bootstrapped: 0,
    failed: 0,
    hasMore: false,
  };
  if (!enabled) return summary;
  const dataSourceId = input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim() ?? "";
  if (!input.bindings.NOTION_API_TOKEN?.trim() || !dataSourceId) {
    summary.failed = 1;
    return summary;
  }

  summary.schemaReady = await schemaReady(input.database);
  if (!summary.schemaReady) return summary;

  const bootstrapIds = await bootstrapProfileIds(input.database);
  summary.selected = bootstrapIds.length;

  for (const profileId of bootstrapIds) {
    try {
      const profile = await getManagedDirectoryProfileById(profileId, input.database);
      if (!profile || profile.category === "chovatelske-stanice") continue;
      await writeProfileToNotion({
        database: input.database,
        bindings: input.bindings,
        dataSourceId,
        profile,
      });
      summary.bootstrapped += 1;
      await recordNotionTransfer(input.database,"directory:"+profile.category,"ADMIN_TO_NOTION",1);
    } catch {
      summary.failed += 1;
    }
  }

  summary.hasMore = (await bootstrapProfileIds(input.database)).length > 0;
  return summary;
}

async function recordDirectoryTransfer(database:D1Database,profileId:number,direction:"NOTION_TO_ADMIN"|"ADMIN_TO_NOTION"){
  try{
    const profile=await getManagedDirectoryProfileById(profileId,database);
    if(profile)await recordNotionTransfer(database,"directory:"+profile.category,direction,1);
  }catch{
    // Observation must never mark an already committed sync as failed.
  }
}

export async function runNotionDirectorySyncSweep(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
  // Optional one-page operator recovery, using the exact existing sync pipeline.
  // Never automatically invoked or used for routine sweep scheduling.
  targetPageId?: string;
  /** Direct Admin save: reconcile only an already linked canonical profile. */
  targetProfileId?: number;
  /** Actual Notion property IDs, supplied by the signed webhook. */
  changedPropertyIds?: readonly string[];
  /** Actual Admin fields changed in this explicit save action. */
  breederAdminFields?: readonly BreederEditorialField[];
  /** Confirmed one-off direction for an already linked profile. */
  manualDirection?: ManualFieldDirection;
  /** Explicit Services V3 choice save only: also reconcile its Notion relation. */
  syncServiceRelations?: boolean;
  expectedNotionRevision?: string;
  /** Authenticated owner confirmed this exact older Gemini page, never scheduled. */
  reviewedLegacy?: boolean;
}): Promise<NotionDirectorySyncSummary> {
  // One operation may target a Notion page OR a canonical Admin profile, never both.
  // This check belongs to the targeted reconciler, not the unscoped bootstrap job.
  if (input.targetPageId !== undefined && input.targetProfileId !== undefined) {
    throw new Error("NOTION_TARGET_SCOPE_AMBIGUOUS");
  }
  if(input.manualDirection && (input.targetProfileId === undefined || input.targetPageId !== undefined))
    throw Error("TRANSFER_DIRECTORY_SCOPE_INVALID");
  if (input.reviewedLegacy && (!input.targetPageId || !input.expectedNotionRevision ||
      input.targetProfileId !== undefined)) throw Error("GEMINI_LEGACY_DIRECTORY_SCOPE_INVALID");
  const enabled = notionFlagEnabled(input.bindings.NOTION_DIRECTORY_SYNC_ENABLED);
  const summary: NotionDirectorySyncSummary = {
    enabled,
    schemaReady: false,
    notionScanned: 0,
    bootstrapped: 0,
    createdFromNotion: 0,
    pulledFromNotion: 0,
    pushedToNotion: 0,
    unchanged: 0,
    failed: 0,
  };
  if (!enabled) return summary;

  const dataSourceId = input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim() ?? "";
  if (!input.bindings.NOTION_API_TOKEN?.trim() || !dataSourceId) {
    summary.failed = 1;
    return summary;
  }

  summary.schemaReady = await schemaReady(input.database);
  if (!summary.schemaReady) return summary;

  // Reuse the existing Services V3 relation reconciler for hourly runs and
  // explicit Admin service-choice saves. Ordinary profile saves do not query
  // the entire service catalog; no new cron, schema or parallel writer.
  let relationSchemaReady: Promise<boolean> | undefined;
  let lookupPromise: Promise<CatalogRelationLookup> | null = null;
  async function syncRelation(pageId: string, profileId: number, notionAdditionsOnly = false) {
    relationSchemaReady ??= input.database.prepare(
      "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='directory_service_notion_relation_sync'"
    ).first<{ok:number}>().then(Boolean);
    if (!await relationSchemaReady) return "skipped" as const;
    const profile = await getManagedDirectoryProfileById(profileId, input.database);
    if (!profile) throw new Error("SERVICES_RELATION_PROFILE_NOT_FOUND");
    lookupPromise ??= loadNotionCatalogRelationLookup(input.bindings);
    return syncProfileCatalogRelation({
      db: input.database, bindings: input.bindings, pageId, profileId,
      category: profile.category, directoryDataSourceId: dataSourceId,
      lookup: await lookupPromise, notionAdditionsOnly,
    });
  }

  // Admin -> Notion fast path: no data-source query, backfill or unrelated profiles.
  // It reuses the verified per-field reconciliation and never creates mappings.
  if (input.targetProfileId !== undefined) {
    if (!Number.isSafeInteger(input.targetProfileId) || input.targetProfileId <= 0)
      throw new Error("NOTION_TARGET_PROFILE_INVALID");
    const mapping = await loadMappingByProfile(input.database, input.targetProfileId);
    if (!mapping) return summary;
    try {
      const action = await syncMappedPage({
        database: input.database, bindings: input.bindings, dataSourceId, mapping,
        manualDirection:input.manualDirection,
        breederAdminFields: input.breederAdminFields,
      });
      if (action === "pulled") summary.pulledFromNotion++;
      else if (action === "pushed") summary.pushedToNotion++;
      else summary.unchanged++;
      if(action==="pulled"||action==="pushed")
        await recordDirectoryTransfer(input.database,input.targetProfileId,
          action==="pulled"?"NOTION_TO_ADMIN":"ADMIN_TO_NOTION");
      // Explicit Admin service choice or approved one-profile Notion→Admin
      // transfer also updates canonical service selections/legacy public text.
      // The latter imports only additions, never infers a deletion.
      if (input.syncServiceRelations || input.manualDirection === "NOTION_TO_ADMIN") {
        const relation = await syncRelation(mapping.notion_page_id, input.targetProfileId,
          input.manualDirection === "NOTION_TO_ADMIN");
        summary.serviceRelationSync = relation;
        if (relation === "skipped") summary.failed++;
      }
    } catch {
      // The canonical save has already succeeded; the hourly sweep retries it.
      summary.failed++;
    }
    return summary;
  }

  let pages: NotionPage[];
  if (input.targetPageId !== undefined) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.targetPageId))
      throw new Error("NOTION_TARGET_PAGE_INVALID");
    const targetPage = await fetchNotionPage(input.bindings, input.targetPageId);
    if (input.expectedNotionRevision && targetPage.last_edited_time !== input.expectedNotionRevision)
      throw new Error("GEMINI_SAVED_REVISION_CHANGED");
    // A matching source ID alone is insufficient: archived/trashed pages must
    // never be imported, even when called outside the signed webhook route.
    if (!notionDirectoryPageBelongsToSource(targetPage, dataSourceId))
      throw new Error("NOTION_TARGET_DATA_SOURCE_MISMATCH");
    pages = [targetPage];
  } else {
    pages = await recentNotionPages(input.bindings, dataSourceId);
    // The normal recent-page window alone can starve older Gemini drafts.
    // Drain the immutable provenance queue in bounded oldest-first batches,
    // reusing the SAME mapping/duplicate/conflict path as ordinary sync.
    const queued = await input.database.prepare(
      "SELECT notion_page_id FROM gemini_notion_created_pages " +
      "WHERE import_agenda='directory' AND notion_data_source_id=? " +
      "AND imported_at IS NULL ORDER BY registered_at ASC LIMIT 20"
    ).bind(dataSourceId).all<{ notion_page_id: string }>();
    const seen = new Set(pages.map(page => page.id));
    for (const entry of queued.results ?? []) {
      if (seen.has(entry.notion_page_id)) continue;
      try {
        const fetched = await fetchNotionPage(input.bindings, entry.notion_page_id);
        const parent = (fetched as NotionPage & { parent?: { data_source_id?: string } }).parent;
        if (parent?.data_source_id?.replaceAll("-", "").toLowerCase() !==
            dataSourceId.replaceAll("-", "").toLowerCase()) {
          summary.failed += 1;
          continue;
        }
        pages.push(fetched);
        seen.add(fetched.id);
      } catch {
        // A temporarily inaccessible page remains pending for later review.
        summary.failed += 1;
      }
    }
  }
  summary.notionScanned = pages.length;
  // A single scheduled sweep has two overlapping discovery routes: recent
  // Notion pages and canonical D1 changes. Do not PATCH or report a conflict
  // twice for the same mapped profile in one sweep. A fast-path page with no
  // actual reconcile is deliberately NOT marked, so a pending D1 change can
  // still be exported via changedProfileIds below.
  const attemptedMappedProfileIds = new Set<number>();

  for (const candidate of pages) {
    // Field-event profiles must never undergo a record-wide hourly merge.
    // Independently retry Services V3 relations for recently edited profiles:
    // missing/failed Notion relation events must not strand canonical choices.
    if (!input.targetPageId && isDirectoryFieldEventCategory(propertyText(candidate, "Kategória"))) {
      const mapped = await loadMappingByPage(input.database, candidate.id);
      if (mapped && propertyText(candidate, "Psipedia ID") === String(mapped.directory_profile_id)) {
        try {
          const relation = await syncRelation(candidate.id, mapped.directory_profile_id);
          summary.serviceRelationSync = relation;
          if (relation === "skipped") throw new Error("DIRECTORY_SERVICES_RELATION_SCHEMA_MISSING");
        } catch (error) {
          summary.failed += 1;
          await recordDirectoryNotionAlert(input.database, mapped.directory_profile_id, "pending",
            error instanceof Error ? error.message : String(error), "NOTION_TO_ADMIN");
        }
      }
      continue;
    }
    let page = candidate;
    let release: (() => Promise<void>) | null = null;
    let releaseImport: (() => Promise<void>) | null = null;
    try {
      const registered = await input.database.prepare(
        "SELECT notion_page_id FROM gemini_notion_created_pages " +
        "WHERE notion_page_id=? AND import_agenda='directory' AND stable_key=? AND notion_data_source_id=?"
      ).bind(page.id, "directory." + propertyText(page, "Kategória"), dataSourceId)
        .first<{ notion_page_id: string }>();
      const trustedGemini = Boolean(registered);
      const operatorLegacy = Boolean(input.reviewedLegacy && input.targetPageId === page.id &&
        !trustedGemini && propertyText(page, "Vytvoril") === "Gemini automatizácia" &&
        !propertyText(page, "Psipedia ID"));
      const privateImport = trustedGemini || operatorLegacy;
      if (privateImport || propertyText(page, "Vytvoril") === "Gemini automatizácia") {
        // Rejected/not-yet-approved Notion-only records cannot recover a mapping
        // or create/modify a canonical profile.
        if (!propertyText(page, "Psipedia ID") && !notionProfileReadyForCreate(page, trustedGemini) && !operatorLegacy) continue;
        release = await acquireGeminiNotionLock(input.database, page.id);
        if (!release) continue;
        page = await fetchNotionPage(input.bindings, page.id);
        if (input.targetPageId && input.expectedNotionRevision && page.last_edited_time !== input.expectedNotionRevision)
          throw new Error("GEMINI_SAVED_REVISION_CHANGED");
        if (!propertyText(page, "Psipedia ID") && !notionProfileReadyForCreate(page, trustedGemini) && !operatorLegacy) continue;
      }
      let mapping = await loadMappingByPage(input.database, page.id);
      if (!mapping) mapping = await recoverMappingFromPage({ database: input.database, page });

      // Pilot covers existing linked IDs only: never create duplicate canonical profiles.
      if (!mapping && isDirectoryEventPilotCategory(propertyText(page, "Kategória"))) continue;
      if (!mapping && (notionProfileReadyForCreate(page, trustedGemini) || operatorLegacy)) {
        if (privateImport) {
          // Serialize canonical duplicate-check + INSERT across different Notion IDs.
          releaseImport = await acquireGeminiNotionLock(input.database, "directory-import");
          if (!releaseImport) continue;
        }
        const creation = await createProfileFromNotion({
          database: input.database,
          bindings: input.bindings,
          page,
          trustedGemini: privateImport,
        });
        let created = creation.profile;
        const syncedAt = new Date().toISOString();
        const contentHash = await snapshotHash(
          profileSnapshot(created, creation.sourceImageUrl || externalSourceImageUrl(created.imageUrl)),
        );

        // Save the one-to-one mapping immediately after INSERT. Any later
        // media/GEO/Google/Notion failure must recover this same profile.
        await saveMapping({
          database: input.database,
          pageId: page.id,
          profileId: created.id,
          contentHash,
          notionLastEditedTime: page.last_edited_time ?? null,
          psipediaUpdatedAt: created.updatedAt,
          syncedAt,
        });

        if (trustedGemini) {
          const marked = await input.database.prepare(
            "UPDATE gemini_notion_created_pages SET canonical_entity_id=?,imported_at=? " +
            "WHERE notion_page_id=? AND canonical_entity_id IS NULL AND import_agenda='directory'"
          ).bind(created.id, syncedAt, page.id).run();
          if (marked.meta.changes !== 1) throw Error("GEMINI_PROVENANCE_IMPORT_CONFLICT");
        }
        // Signed provenance and review notes are recorded before ancillary
        // media/GEO/Notion operations: the native D1 concept is already usable.
        const warnings = creation.imageWarning
          ? ["Hlavný obrázok: " + creation.imageWarning] : [];
        if (privateImport) await recordGeminiImportReviewNotes(input.database, "directory",
          created.id, page.id, [...warnings, ...creation.importWarnings]).catch(() => undefined);

        try {
          if (creation.prepared && creation.sourceImageUrl) {
            await upsertMediaSourceMonitor({
              database: input.database,
              entityType: "DIRECTORY_PROFILE",
              entityId: created.id,
              sourcePageUrl: creation.sourcePageUrl,
              sourceImageUrl: creation.sourceImageUrl,
              sourceContentHash: creation.prepared.sourceContentHash,
              activeImageKey: creation.prepared.imageKey,
            });
            await cleanupNotionImageKeys(input.bindings.BUCKET, creation.prepared.replacedKeys);
          }
        } catch (error) {
          if (!privateImport) throw error;
          warnings.push("Doplnkové údaje obrázka: " +
            (error instanceof Error ? error.message : String(error)));
        }

        try {
          if (creation.verified) {
            await applyVerifiedDirectoryAddressGeo({
              profileId: created.id,
              verified: creation.verified,
              actorRef: SYSTEM_ACTOR,
              database: input.database,
            });
          }
          // Gemini/Notion imports never trigger a paid Google Places lookup.
        } catch (error) {
          if (!privateImport) throw error;
          warnings.push("GEO: " + (error instanceof Error ? error.message : String(error)));
        }
        created = await getManagedDirectoryProfileById(created.id, input.database) ?? created;

        // A human-confirmed legacy import is intentionally one-way: the
        // original evidence and private fields in Notion must not be rewritten.
        if (operatorLegacy) {
          await recordGeminiImportReviewNotes(input.database, "directory",
            created.id, page.id, [...warnings, ...creation.importWarnings,
              "Starší Gemini koncept prevzatý do Adminu. Zdrojové údaje v Notione zostali nezmenené."
            ]).catch(() => undefined);
          summary.createdFromNotion += 1;
          await recordDirectoryTransfer(input.database, created.id, "NOTION_TO_ADMIN");
          continue;
        }
        // Optional Notion write-back/catalog mirroring cannot revoke the private editor.
        try {
          await writeProfileToNotion({
            database: input.database,
            bindings: input.bindings,
            dataSourceId,
            profile: created,
            pageId: page.id,
          });
        } catch (error) {
          if (!privateImport) throw error;
          warnings.push("Spätná synchronizácia Notion: " +
            (error instanceof Error ? error.message : String(error)));
        }
        try {
          await syncRelation(page.id,created.id);
        } catch (error) {
          if (!privateImport) throw error;
          warnings.push("Katalóg služieb: " +
            (error instanceof Error ? error.message : String(error)));
        }
        await recordGeminiImportReviewNotes(input.database, "directory",
          created.id, page.id, [...warnings, ...creation.importWarnings]).catch(() => undefined);
        if (warnings.length) {
          // Best effort only: a Notion 429 must not block the verified D1 draft.
          await markPageError(input.bindings, page.id,
            new Error("Koncept je dostupný v administrácii. " + warnings.join(" | ")));
        }
        summary.createdFromNotion += 1;
        await recordNotionTransfer(input.database,"directory:"+created.category,"NOTION_TO_ADMIN",1);
        continue;
      }

      if (!mapping) continue;
      // Trust booleans and Services V3 relations are independent field events
      // for ALL directory categories. A change to either must not trigger a
      // legacy whole-profile merge, which can overwrite unrelated Admin data.
      const relationProp = page.properties?.["Služby z katalógu"] as { id?: unknown } | undefined;
      const changedIds = input.changedPropertyIds ?? [];
      const trustFields = changedTrainerTrustNotionFields(page.properties, changedIds);
      const relationChanged = changedIds.some(id =>
        id === "Služby z katalógu" || id === relationProp?.id);
      const onlyTrustOrServices = changedIds.length > 0 && changedIds.every(id =>
        id === "Služby z katalógu" || id === relationProp?.id ||
        (["verified", "featured"] as const).some(field => {
          const key = TRAINER_TRUST_NOTION_PROPERTIES[field];
          const raw = page.properties?.[key] as { id?: unknown } | undefined;
          return id === key || id === raw?.id;
        }));
      if (onlyTrustOrServices && (trustFields.length || relationChanged)) {
        let current = await getManagedDirectoryProfileById(mapping.directory_profile_id, input.database);
        if (!current || current.status === "archived" ||
            current.category !== propertyText(page, "Kategória") ||
            propertyText(page, "Psipedia ID") !== String(current.id))
          throw new NotionDirectoryUnsafeTargetError("DIRECTORY_DIRECT_FIELD_IDENTITY_MISMATCH");
        let trustUpdated = false;
        for (const field of trustFields) {
          const key = TRAINER_TRUST_NOTION_PROPERTIES[field];
          const value = property(page, key)?.checkbox;
          if (typeof value !== "boolean") throw new Error("DIRECTORY_TRUST_VALUE_INVALID: " + key);
          if (current[field] !== value) {
            current = await saveTrainerTrustField(input.database, current, field, value);
            trustUpdated = true;
          }
        }
        if (relationChanged) {
          const relation = await syncRelation(page.id, mapping.directory_profile_id, true);
          summary.serviceRelationSync = relation;
          if (relation === "skipped") throw new Error("DIRECTORY_SERVICES_RELATION_SCHEMA_MISSING");
        }
        await patchNotionPage(input.bindings, page.id, {
          "Sync stav": select("Synchronizované"),
          "Sync chyba": richText(""),
          "Posledný sync": date(new Date().toISOString()),
        });
        await recordDirectoryNotionAlert(input.database, mapping.directory_profile_id,
          "resolved", "", "NOTION_TO_ADMIN");
        if (trustUpdated || summary.serviceRelationSync === "pulled")
          summary.pulledFromNotion += 1;
        else summary.unchanged += 1;
        continue;
      }
      // Breeders and trainers are field-event driven. Do not re-merge the
      // entire mapped profile during hourly sweeps after a partial event.
      if (!input.targetPageId && isDirectoryFieldEventCategory(propertyText(page, "Kategória"))) continue;

      if (
        page.last_edited_time
        && mapping.notion_last_edited_time
        && page.last_edited_time === mapping.notion_last_edited_time
        && propertyText(page, "Sync hash") === mapping.content_hash
      ) {
        const profile = await getManagedDirectoryProfileById(mapping.directory_profile_id, input.database);
        const sourceImageUrl = externalSourceImageUrl(propertyText(page, "Hlavný obrázok URL"));
        const existingMonitor = profile
          ? await getMediaSourceMonitorForEntity(input.database, "DIRECTORY_PROFILE", profile.id)
          : null;
        if (profile && sourceImageUrl && !existingMonitor) {
          await upsertMediaSourceMonitor({
            database: input.database,
            entityType: "DIRECTORY_PROFILE",
            entityId: profile.id,
            sourcePageUrl: propertyText(page, "Zdroj obrázka") || profile.websiteUrl,
            sourceImageUrl,
            activeImageKey: profile.imageKey,
          });
        }
        continue;
      }

      if (attemptedMappedProfileIds.has(mapping.directory_profile_id)) continue;
      attemptedMappedProfileIds.add(mapping.directory_profile_id);
      const result = await syncMappedPage({
        database: input.database,
        bindings: input.bindings,
        dataSourceId,
        mapping,
        page,
        breederWebhookPropertyIds: input.changedPropertyIds,
      });
      // A signed change to the canonical relation is independent of text fields.
      // The Notion event can add verified choices without silently removing
      // older Admin YES selections. Ordinary sweeps retain 3-way reconciliation.
      if (input.changedPropertyIds === undefined || relationChanged) {
        const relation = await syncRelation(page.id, mapping.directory_profile_id, relationChanged);
        summary.serviceRelationSync = relation;
        if (relation === "skipped" && relationChanged) summary.failed++;
      }
      if (input.changedPropertyIds?.length || result !== "unchanged")
        await recordDirectoryNotionAlert(input.database, mapping.directory_profile_id, "resolved", "", "NOTION_TO_ADMIN");
      if (result === "pulled") summary.pulledFromNotion += 1;
      else if (result === "pushed") summary.pushedToNotion += 1;
      else summary.unchanged += 1;
      if(result==="pulled"||result==="pushed")
        await recordDirectoryTransfer(input.database,mapping.directory_profile_id,
          result==="pulled"?"NOTION_TO_ADMIN":"ADMIN_TO_NOTION");
    } catch (error) {
      summary.failed += 1;
      await recordDirectoryNotionAlert(input.database, mapping.directory_profile_id, "pending",
        error instanceof Error ? error.message : String(error), "NOTION_TO_ADMIN");
      // Even a diagnostic PATCH must not mutate an unrelated/moved Notion page.
      if (!(error instanceof NotionDirectoryUnsafeTargetError)) {
        await markPageError(input.bindings, page.id, error, page);
      }
      // Preserve an uncertain import lock for explicit reconciliation. Never
      // create a second profile after a lost response or mapping failure.
      release = null;
      releaseImport = null;
    } finally {
      if (releaseImport) await releaseImport();
      if (release) await release();
    }
  }

  // A targeted import must not touch unrelated canonical profiles.
  const changedIds = input.targetPageId ? [] : await changedProfileIds(input.database);
  for (const profileId of changedIds) {
    if (attemptedMappedProfileIds.has(profileId)) continue;
    const mapping = await loadMappingByProfile(input.database, profileId);
    if (!mapping) continue;
    const changedProfile = await getManagedDirectoryProfileById(profileId, input.database);
    if (changedProfile && isDirectoryFieldEventCategory(changedProfile.category)) continue;
    let page: NotionPage | undefined;
    try {
      // Load only once. The same snapshot is used for identity validation,
      // reconciliation and the conditional diagnostic marker.
      page = await fetchNotionPage(input.bindings, mapping.notion_page_id);
      const result = await syncMappedPage({
        database: input.database,
        bindings: input.bindings,
        dataSourceId,
        mapping,
        page,
        forcePsipediaPush: true,
      });
      await syncRelation(mapping.notion_page_id,profileId);
      if (result === "pulled") summary.pulledFromNotion += 1;
      else if (result === "pushed") summary.pushedToNotion += 1;
      else summary.unchanged += 1;
      if(result==="pulled"||result==="pushed")
        await recordDirectoryTransfer(input.database,mapping.directory_profile_id,
          result==="pulled"?"NOTION_TO_ADMIN":"ADMIN_TO_NOTION");
    } catch (error) {
      summary.failed += 1;
      if (!(error instanceof NotionDirectoryUnsafeTargetError)) {
        await markPageError(input.bindings, mapping.notion_page_id, error, page);
      }
    }
  }

  // A one-page Gemini save must not bootstrap unrelated canonical profiles.
  // Regular scheduled sync continues to bootstrap as before.
  const bootstrapIds = input.targetPageId ? [] : await bootstrapProfileIds(input.database);
  for (const profileId of bootstrapIds) {
    try {
      const profile = await getManagedDirectoryProfileById(profileId, input.database);
      if (!profile || ["chovatelske-stanice", "salony-a-sluzby"].includes(profile.category)) continue;
      await writeProfileToNotion({
        database: input.database,
        bindings: input.bindings,
        dataSourceId,
        profile,
      });
      summary.bootstrapped += 1;
      await recordNotionTransfer(input.database,"directory:"+profile.category,"ADMIN_TO_NOTION",1);
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
}


/** Live values only. No write/side effects; used for one-shot per-field checks. */
export async function inspectManualDirectoryProfile(input:{
  database:D1Database;bindings:NotionDirectorySyncBindings;
  profileId:number;pageId:string;scope:string;
}):Promise<{notion:Record<string,unknown>;admin:Record<string,unknown>;excluded:string[]}>{
  const profile=await getManagedDirectoryProfileById(input.profileId,input.database);
  if(!profile||"directory:"+profile.category!==input.scope)
    throw Error("TRANSFER_DIRECTORY_IDENTITY_MISMATCH");
  const mapping=await loadMappingByProfile(input.database,input.profileId);
  if(mapping?.notion_page_id!==input.pageId)throw Error("TRANSFER_IDENTITY_CHANGED");
  const page=await fetchNotionPage(input.bindings,input.pageId);
  if(page.id!==input.pageId||!notionDirectoryPageBelongsToSource(
    page,input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID??"")
    ||propertyText(page,"Psipedia ID")!==String(input.profileId))
    throw Error("TRANSFER_DIRECTORY_IDENTITY_MISMATCH");
  const geo=await loadGeoMirror(input.database,input.profileId);
  const confirmed=profile.serviceAddressConfirmation==="CONFIRMED_SERVICE_LOCATION"
    ||Boolean(geo?.google_place_id&&geo.google_place_source_fingerprint
      &&geo.source_fingerprint
      &&geo.google_place_source_fingerprint===geo.source_fingerprint);
  const media=await getMediaSourceMonitorForEntity(
    input.database,"DIRECTORY_PROFILE",input.profileId);
  return {notion:notionSnapshot(page) as unknown as Record<string,unknown>,
    admin:profileSnapshot(profile,media?.sourceImageUrl||
      externalSourceImageUrl(profile.imageUrl)) as unknown as Record<string,unknown>,
    excluded:["imageUrl","imageKey","status","slug","category","services",
      "confirmedServiceLocation","verified","featured","internalEmail",
      "qualityResolutions","qualityCheckedAt","seo.noindex",
      ...(confirmed?["region","district","city","address","postalCode",
        "street","houseNumber","addressFormat"]:[])],
  };
}
