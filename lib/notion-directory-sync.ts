import { findDirectoryInboundDuplicate, type DirectoryAuditRow } from "./directory-duplicate-audit.ts";
import { rotateNotionDiscovery, mergeNotionDiscovery } from "./notion-discovery-cursor.ts";
import { directoryAuthorityWriteGuard, profileAuthorityTextFieldAllowed } from "./notion-profile-authority.ts";
import { ensureFirstProfileNotionCopy, acknowledgeInboundProfileIdentity, PROFILE_INBOUND_ID_PENDING } from "./notion-profile-first-create.ts";
import { planDirectoryAdminReceipts, directoryMetadataReceiptField } from "./notion-directory-admin-receipts.ts";
import { reserveUnifiedField, confirmUnifiedField, assertUnifiedReservationCurrent, isVerifiedAuthorityProperty, type FieldReservation } from "./notion-unified-field-transfer.ts";
import { readUnifiedAdminEdit } from "./notion-unified-admin-edits.ts";
import type { FieldIdentity, FieldObservation } from "./notion-unified-field-sync.ts";
import { assertManualRemoteIdentity } from "./notion-manual-transfer-mapping";
import { isDirectoryAdminWritebackEcho } from "./directory-notion-echo";
import { syncDirectoryReviewedWithNotion } from "./directory-notion-reviewed-sync";
import { directoryProfileNotionSyncLocked, directoryProfileOwnerUnlockPending } from "./directory-reviewed-sync-lock";
import { approvedDirectoryFactSqlSlot, directoryNotionFacetRequiresSqlMirror, planDirectory0170FactSqlMirror, planDirectory0170FilterSqlMirror } from "./directory-0170-editorial-sql-mirror";
import { planDirectory0173EditorialSqlMirror } from "./directory-0173-editorial-sql-mirror";
import { planDirectoryStep3PresentationSqlMirror } from "./directory-sql-step3-live-mirror";
import { planDirectoryExtraSqlTextMirror } from "./directory-extra-sql-mirror";
import { directoryNotionFullMirrorMismatches } from "./directory-notion-full-mirror";
import { notionPageMustSkipInboundSync } from "./admin-record-lifecycle";
import { normalizeAdditionalDirectoryCategories } from "./directory-multi-category";
import { planDirectorySecondaryCategorySqlMirror } from "./directory-secondary-category-sql";
import { isDirectoryPublicMetadataField, readDirectoryPublicMetadataValue } from "./directory-public-facts";
import { DIRECTORY_LEGACY_PUBLIC_EDITABLE_KEYS } from "./directory-detail-presentation";
import { directoryCategories } from "./directory";
import { recordNotionTransfer } from "@/lib/notion-transfer-audit";
import {recoverableDirectoryBaselineError,directoryServiceErrorCanReplace,directoryServiceSuccessCanClear,directoryEditorialEventMayClearError} from "./directory-sync-recovery-policy";
import { directoryFilterRegistry, getDirectoryFilterDefinition, normalizeDirectoryFilterValue, serviceFilterCategories, type ServiceFilterCategory } from "@/lib/directory-filter-contract";
import { recordDirectoryNotionAlert } from "@/lib/directory-notion-sync-alerts";
import { selectiveNotionProperties, sameNotionProperty } from "@/lib/notion-selective-property-patch";
import {loadNotionCatalogRelationLookup,syncProfileCatalogRelation,projectCanonicalServiceRelation,type CatalogRelationLookup}
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
  safeRemoteImageUrl,
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
  BREEDER_NOTION_EDITORIAL_FIELDS, DIRECTORY_CONTACT_EDITORIAL_PATHS, breederAdminChangedFields,
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
  NOTION_UNIFIED_FIELD_SYNC_ENABLED?: string;
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
  additionalCategories?: import("@/lib/directory").DirectoryCategorySlug[];
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
  serviceRelationSync?: "skipped" | "unchanged" | "pushed" | "pulled" | "merged";
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
    ...(profile.additionalCategories?.length ? { additionalCategories: normalizeAdditionalDirectoryCategories(profile.additionalCategories, profile.category) } : {}),
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
    // The editor reads legacy Web aliases as well as website_url. A different
    // field save must use that same effective value, never a blank column.
    websiteUrl: clean(contacts.website),
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
  const categoryOptions = property(page, "Ďalšie kategórie")?.multi_select;
  const additionalCategories = normalizeAdditionalDirectoryCategories(
    Array.isArray(categoryOptions) ? categoryOptions.map((option) => {
      const name = option && typeof option === "object" ? (option as Record<string, unknown>).name : "";
      return directoryCategories.find((item) => item.label === name)?.slug ?? name;
    }) : [],
    propertyText(page, "Kategória"),
  );
  return {
    slug: propertyText(page, "Slug"),
    name: propertyText(page, "Názov"),
    category: propertyText(page, "Kategória"),
    ...(additionalCategories.length ? { additionalCategories } : {}),
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
    "Ďalšie kategórie": { multi_select: (snapshot.additionalCategories ?? []).map((category) => ({ name: directoryCategories.find((item) => item.slug === category)?.label ?? category })) },
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
    "Web": richText(snapshot.websiteUrl),
    "Telefón": richText(snapshot.publicPhone),
    "E-mail": richText(snapshot.publicEmail),
    "Interný e-mail": richText(snapshot.internalEmail),
    "Facebook": richText(snapshot.facebookUrl),
    "Instagram": richText(snapshot.instagramUrl),
    "Hlavný obrázok URL": url(snapshot.imageUrl),
    "Kvalita · Telefón": select(qualityStatusToNotion(snapshot.qualityResolutions.phone)),
    "Kvalita · E-mail": select(qualityStatusToNotion(snapshot.qualityResolutions.email)),
    "Kvalita · Web": select(qualityStatusToNotion(snapshot.qualityResolutions.website)),
    "Kvalita · Obrázok": select(qualityStatusToNotion(snapshot.qualityResolutions.image)),
    "Kvalita · Adresa": select(qualityStatusToNotion(snapshot.qualityResolutions.address)),
    "Kvalita skontrolované": date(snapshot.qualityCheckedAt),
    // On CREATE only; existing-page review edits use the isolated CAS mirror.
    "Odkontrolované": checkbox(Boolean(profile.reviewed)),
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
  const receipt=await input.database.prepare(`
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
    WHERE directory_notion_sync.notion_page_id=excluded.notion_page_id
      AND (directory_notion_sync.content_hash<>'INBOUND_ID_PENDING' OR excluded.content_hash='INBOUND_ID_PENDING')
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
  if(!receipt.success||receipt.meta.changes!==1)throw Error("DIRECTORY_MAPPING_REASSIGNMENT_BLOCKED");
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
      rich_text?: unknown; url?: string | null; email?: string | null; phone_number?: string | null;
    } | undefined;
    // Contacts now use the same plain-text Notion payload as Popis. Do not
    // replace an already serialized rich_text value with an empty string.
    if (Array.isArray(previous?.rich_text)) continue;
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
  // A failure in Services V3 must not erase an existing editorial, address,
  // identity or unrelated field error from the same Notion record.
  if (/^(?:SERVICES_RELATION_|DIRECTORY_SERVICES_RELATION_)/.test(message)
      && (!page || page.id !== pageId ||
        !directoryServiceErrorCanReplace(propertyText(page,"Sync chyba"),message)))return;
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
  /** Admin-only D1 -> Notion rebaseline while SQL unlock_pending remains locked. */
  ownerUnlock?: boolean;
}) {
  async function assertWritePermitted() {
    if(input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text"&&!input.ownerUnlock)throw Error("PROFILE_AUTHORITY_LEGACY_TRANSFER_DISABLED");
    if (input.ownerUnlock) {
      if (!input.pageId ||
          !await directoryProfileOwnerUnlockPending(input.database, input.profile.id)) {
        throw new NotionDirectoryUnsafeTargetError("DIRECTORY_OWNER_UNLOCK_NOT_AUTHORIZED");
      }
      const current = await input.database.prepare(
        "SELECT updated_at FROM directory_profiles WHERE id=? LIMIT 1",
      ).bind(input.profile.id).first<{ updated_at: string }>();
      if (!current || current.updated_at !== input.profile.updatedAt) {
        throw new Error("DIRECTORY_OWNER_UNLOCK_PROFILE_CHANGED");
      }
    } else if (await directoryProfileNotionSyncLocked(input.database, input.profile.id)) {
      throw new NotionDirectoryUnsafeTargetError("DIRECTORY_REVIEW_LOCKED");
    }
  }
  await assertWritePermitted();
  const syncedAt = new Date().toISOString();
  const monitor = await getMediaSourceMonitorForEntity(input.database, "DIRECTORY_PROFILE", input.profile.id);
  const sourceImageUrl = monitor?.sourceImageUrl || externalSourceImageUrl(input.profile.imageUrl);
  const hash = await snapshotHash(profileSnapshot(input.profile, sourceImageUrl));
  const geo = await loadGeoMirror(input.database, input.profile.id);
  const properties = notionProfileProperties(input.profile, geo ?? null, hash, syncedAt, sourceImageUrl);
  if (input.pageId) {
    delete (properties as Partial<typeof properties>)["Vytvoril"];
    // Never overwrite a Notion review edit as a side effect of saving prose.
    delete (properties as Partial<typeof properties>)["Odkontrolované"];
  }
  const stagedUnlock=input.ownerUnlock&&input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text";
  let verifiedStructured:Record<string,unknown>|undefined;
  let page: NotionPage;
  if (input.pageId) {
    const current = await fetchNotionPage(input.bindings, input.pageId);
    if (current.id !== input.pageId || !notionDirectoryPageBelongsToSource(current, input.dataSourceId) ||
        (input.ownerUnlock && (propertyText(current, "Psipedia ID") !== String(input.profile.id) ||
         propertyCheckbox(current, "Odkontrolované")!==Boolean(stagedUnlock))))
      throw new NotionDirectoryUnsafeTargetError("NOTION_DIRECTORY_TARGET_MOVED");
    const structured=stagedUnlock?await stagedDirectoryStructuredProperties(input.database,input.bindings,input.profile,current.properties??{}):{};
    const adapted = adaptDirectoryNotionTextProperties({...properties,...structured,...(stagedUnlock?{"Odkontrolované":checkbox(true)}:{})}, current.properties ?? {});
    if(stagedUnlock){
      // Missing/truncated property is not a verified target.
      for(const [name,wanted] of Object.entries(adapted)){
        const raw=current.properties?.[name] as Record<string,unknown>|undefined,type=Object.keys(wanted as Record<string,unknown>)[0];
        if(!raw||raw.type!==type||!Object.hasOwn(raw,type)||raw.has_more===true||
          (Array.isArray(raw[type])&&(raw[type] as unknown[]).length>=25))throw Error("DIRECTORY_STRUCTURED_EXPORT_INCOMPLETE: "+name);
      }
      verifiedStructured=structured;
    }
    const patch = selectiveNotionProperties(current.properties ?? {}, adapted);
    await assertWritePermitted();
    page = patch ? await patchNotionPage(input.bindings, input.pageId, patch) : current;
    if(stagedUnlock){
      page=await fetchNotionPage(input.bindings,input.pageId);
      if(page.id!==input.pageId||!notionDirectoryPageBelongsToSource(page,input.dataSourceId))throw Error("DIRECTORY_STRUCTURED_EXPORT_IDENTITY");
      assertStagedDirectoryEcho(page,adapted);
      const latest=await getManagedDirectoryProfileById(input.profile.id,input.database);
      if(!latest||latest.updatedAt!==input.profile.updatedAt||JSON.stringify(await stagedDirectoryStructuredProperties(input.database,input.bindings,latest,page.properties??{}))!==JSON.stringify(verifiedStructured))throw Error("DIRECTORY_STRUCTURED_EXPORT_CONCURRENT_CHANGE");
      await assertWritePermitted();
    }
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

/**
 * Recover a previously reviewed SQL profile without consuming the old Notion
 * snapshot. First mirror only Odkontrolované=false, then export the canonical
 * D1 profile with the existing echo/hash and field-baseline verification.
 * The SQL pending lock remains active throughout every remote operation.
 */
export async function completeDirectoryReviewedOwnerUnlock(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
  profileId: number;
}): Promise<"unlocked" | "not_pending" | "disabled" | "unmapped"> {
  if (!notionFlagEnabled(input.bindings.NOTION_DIRECTORY_SYNC_ENABLED)) return "disabled";
  const dataSourceId = input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim() ?? "";
  if (!input.bindings.NOTION_API_TOKEN?.trim() || !dataSourceId)
    throw new Error("DIRECTORY_OWNER_UNLOCK_NOTION_CONFIG_MISSING");
  const state = await input.database.prepare(
    "SELECT p.updated_at AS profile_updated_at,p.status,s.updated_at AS review_updated_at," +
    "s.reviewed_at,s.unlock_pending FROM directory_profiles p " +
    "LEFT JOIN directory_profile_review_state s ON s.profile_id=p.id WHERE p.id=? LIMIT 1",
  ).bind(input.profileId).first<{
    profile_updated_at: string; status: string; review_updated_at: string | null;
    reviewed_at: string | null; unlock_pending: number | null;
  }>();
  if (!state || Number(state.unlock_pending) !== 1 || Boolean(state.reviewed_at?.trim()))
    return "not_pending";
  if (state.status === "archived" ||
      !await directoryProfileOwnerUnlockPending(input.database, input.profileId))
    throw new NotionDirectoryUnsafeTargetError("DIRECTORY_OWNER_UNLOCK_LOCKED_BY_OTHER_OWNER");
  const mapping = await loadMappingByProfile(input.database, input.profileId);
  if (!mapping) return "unmapped";
  if (await notionPageMustSkipInboundSync(input.database, mapping.notion_page_id))
    throw new NotionDirectoryUnsafeTargetError("DIRECTORY_OWNER_UNLOCK_NOTION_PAGE_UNAVAILABLE");

  const reviewMirror = await syncDirectoryReviewedWithNotion({
    database: input.database, bindings: input.bindings,
    profileId: input.profileId, ownerUnlock: true,
  });
  if (reviewMirror !== "unchanged" && reviewMirror !== "pushed")
    throw new Error("DIRECTORY_OWNER_UNLOCK_CHECKBOX_NOT_ACKNOWLEDGED");

  const profile = await getManagedDirectoryProfileById(input.profileId, input.database);
  if (!profile || profile.reviewed || profile.status === "archived" ||
      profile.updatedAt !== state.profile_updated_at)
    throw new Error("DIRECTORY_OWNER_UNLOCK_PROFILE_CHANGED");

  await writeProfileToNotion({
    database: input.database, bindings: input.bindings, dataSourceId, profile,
    pageId: mapping.notion_page_id, ownerUnlock: true,
  });
  // A re-review, partner claim, mapping move or concurrent Admin save must
  // keep the profile locked. The next attempt re-exports the newer D1 snapshot.
  const now = new Date().toISOString();
  const released = await input.database.prepare(`
    UPDATE directory_profile_review_state
    SET unlock_pending=0, unlock_requested_at=NULL, unlock_requested_by=NULL,
        updated_at=?, updated_by='notion-directory-sync@psipedia.sk'
    WHERE profile_id=? AND COALESCE(TRIM(reviewed_at),'')='' AND unlock_pending=1
      AND updated_at=?
      AND EXISTS (SELECT 1 FROM directory_profiles p WHERE p.id=profile_id
        AND p.updated_at=? AND p.status<>'archived')
      AND EXISTS (SELECT 1 FROM directory_notion_sync n WHERE n.directory_profile_id=profile_id
        AND n.notion_page_id=?)
      AND NOT EXISTS (SELECT 1 FROM partner_resources r
        JOIN partner_memberships m ON m.resource_id=r.id
        WHERE r.entity_type='DIRECTORY_PROFILE' AND r.directory_profile_id=profile_id
          AND m.revoked_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM admin_record_tombstones t
        WHERE t.kind='directory' AND t.record_id=profile_id)
    RETURNING profile_id
  `).bind(now, input.profileId, state.review_updated_at,
    state.profile_updated_at, mapping.notion_page_id).first<{profile_id: number}>();
  if (released?.profile_id !== input.profileId)
    throw new Error("DIRECTORY_OWNER_UNLOCK_CONCURRENT_CHANGE");
  if(input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text"){
    const flag=await syncDirectoryReviewedWithNotion({database:input.database,bindings:input.bindings,profileId:input.profileId});
    if(flag!=="pushed"&&flag!=="unchanged")throw Error("DIRECTORY_OWNER_UNLOCK_CHECKBOX_PENDING");
  }
  return "unlocked";
}

/** A previously reviewed profile remains locked until the CURRENT canonical
 * D1 snapshot has been acknowledged by its mapped Notion page. Never use
 * old Notion values or its last-edited timestamp to reopen this profile.
 */
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
    // Existing mapped profiles accept structural category edits only through the
    // dedicated webhook or canonical Admin action; ordinary text sync must not
    // clear an unrelated category selection from a stale Notion page.
    additionalCategories: current.additionalCategories ?? [],
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
    additionalCategories: desired.additionalCategories ?? [],
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

function notionProfileReadyForCreate(page: NotionPage, trustedGemini = false, staged=false) {
  if (propertyText(page, "Psipedia ID")) return false;
  const editorialState = propertyText(page, "Stav");
  // Textual creator marker is never sufficient to grant automatic import.
  if (trustedGemini)
    return ["", "Nápad", "Na kontrolu", "Ready", "Koncept"].includes(editorialState) &&
      propertyText(page, "Psipedia stav") === "Koncept";
  if (propertyText(page, "Vytvoril") === "Gemini automatizácia") return false;
  if(staged){const raw=property(page,"Psipedia ID");return raw?.type==="rich_text"&&Array.isArray(raw.rich_text)&&raw.rich_text.length===0&&["Nápad","Na kontrolu","Ready","Koncept","Publikované"].includes(editorialState)&&!!propertyText(page,"Názov");}
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
  if (input.trustedGemini || input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text") {
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
  if(input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text")throw Error("PROFILE_AUTHORITY_LEGACY_TRANSFER_DISABLED");
  if (await directoryProfileNotionSyncLocked(input.database,input.profile.id))
    throw new NotionDirectoryUnsafeTargetError("DIRECTORY_REVIEW_LOCKED");
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

    // Legacy Notion "Služby" edits update editorial fields only, never V3 choices.
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

/** Exact SQL-backed structured projection, not a second data model.
 * Only provisioned metadata fields are eligible; required registered facet,
 * relation and catalog schemas fail closed rather than exporting a partial copy. */
async function stagedDirectoryStructuredProperties(database:D1Database,bindings:NotionDirectorySyncBindings,
  profile:ManagedDirectoryProfile,schema:Record<string,unknown>):Promise<Record<string,unknown>>{
  const properties:Record<string,unknown>={};
  const type=(name:string)=>(schema[name] as {type?:unknown}|undefined)?.type;
  const required=(name:string,expected:string)=>{if(type(name)!==expected)throw Error("DIRECTORY_STRUCTURED_SCHEMA_MISSING: "+name);};
  const categories=new Set([profile.category,...(profile.additionalCategories??[])]);
  const rows=await database.prepare("SELECT category,filter_id,value_text FROM directory_profile_filter_values WHERE profile_id=? ORDER BY filter_id").bind(profile.id).all<{category:string;filter_id:string;value_text:string}>();
  if(!rows.success||!Array.isArray(rows.results))throw Error("DIRECTORY_STRUCTURED_FILTER_READ_FAILED");
  for(const def of directoryFilterRegistry.filter(def=>categories.has(def.category))){
    const name=breederFacetNotionProperties[def.id];required(name,"select");
    const matching=rows.results.filter(row=>row.filter_id===def.id&&row.category===def.category);
    if(matching.length>1)throw Error("DIRECTORY_STRUCTURED_FILTER_DUPLICATE");
    const raw=matching[0]?.value_text;
    const normalized=normalizeDirectoryFilterValue(def,raw);
    if(raw!==undefined&&normalized.status!=="known")throw Error("DIRECTORY_STRUCTURED_FILTER_INVALID");
    properties[name]=select(normalized.status==="known"?notionFacetLabel(normalized.value):"");
  }
  for(const name of PILOT_DIRECTORY_METADATA_FIELDS){
    if(!profileAuthorityTextFieldAllowed({agenda:"directory",entityId:String(profile.id),pageId:"projection",field:"meta:"+name})||Object.hasOwn(properties,name))continue;
    const kind=type(name);
    if(kind!=="rich_text"&&kind!=="url"&&kind!=="email"&&kind!=="phone_number")continue;
    if(DIRECTORY_LEGACY_PUBLIC_EDITABLE_KEYS.includes(name)&&name!=="Ordinačné hodiny"&&kind!=="rich_text")continue;
    const value=readDirectoryPublicMetadataValue(profile.importData,name);
    properties[name]=kind==="rich_text"?richText(value):{[kind]:value||null};
  }
  if(["chovatelske-stanice","chovatelske-kluby"].includes(profile.category)){
    const chosen=await getBreederRelationSelection(database,profile.id);
    const candidates=await listBreederRelationOptions(database);
    if(!chosen)throw Error("DIRECTORY_STRUCTURED_RELATION_MISSING");
    const fields:BreederRelationField[]=profile.category==="chovatelske-stanice"?["breedIds","clubIds"]:["breedIds"];
    for(const field of fields){
      const name=BREEDER_NOTION_RELATION_FIELDS[field],options=field==="breedIds"?candidates.breeds:candidates.clubs;
      required(name,"rich_text");
      if(options.length>=(field==="breedIds"?500:1000))throw Error("DIRECTORY_STRUCTURED_RELATION_OPTIONS_INCOMPLETE");
      const value=formatBreederRelationText(chosen[field],options);
      if(value===null)throw Error("DIRECTORY_STRUCTURED_RELATION_UNKNOWN_ID");
      const decoded=resolveBreederRelationText(value,options);
      if(decoded.status==="unmatched"||!sameBreederRelationIds(decoded.ids,chosen[field]))throw Error("DIRECTORY_STRUCTURED_RELATION_AMBIGUOUS");
      properties[name]=richText(value);
    }
  }
  required("Služby z katalógu","relation");
  Object.assign(properties,await projectCanonicalServiceRelation(database,bindings,profile.id,profile.category));
  return properties;
}
function assertStagedDirectoryEcho(page:NotionPage,expected:Record<string,unknown>){
  for(const [name,wanted] of Object.entries(expected)){
    const type=Object.keys(wanted as Record<string,unknown>)[0],raw=page.properties?.[name] as Record<string,unknown>|undefined;
    if(!raw||raw.type!==type||!Object.hasOwn(raw,type)||raw.has_more===true||
      (Array.isArray(raw[type])&&(raw[type] as unknown[]).length>=25)||!sameNotionProperty(raw,wanted))
      throw Error("DIRECTORY_STRUCTURED_EXPORT_UNVERIFIED: "+name);
  }
}
async function acknowledgeStagedDirectoryDraft(database:D1Database,bindings:NotionDirectorySyncBindings,sourceId:string,profile:ManagedDirectoryProfile,pageId:string){
  const all=notionProfileProperties(profile,null,"",profile.updatedAt) as Record<string,unknown>;
  await acknowledgeInboundProfileIdentity({database,bindings,agenda:"directory",id:profile.id,pageId,sourceId,revision:profile.updatedAt,
    desired:Object.fromEntries(["Psipedia ID","Slug","URL Psipedia"].map(name=>[name,all[name]]))});
}
async function createStagedDirectoryCopy(database:D1Database,bindings:NotionDirectorySyncBindings,dataSourceId:string,profileId:number,allowCreate=true){
  return ensureFirstProfileNotionCopy({database,bindings,agenda:"directory",id:profileId,sourceId:dataSourceId,allowCreate,
    async snapshot(schema){
      const profile=await getManagedDirectoryProfileById(profileId,database);
      if(!profile||profile.status==="archived")throw Error("DIRECTORY_FIRST_CREATE_MISSING");
      const monitor=await getMediaSourceMonitorForEntity(database,"DIRECTORY_PROFILE",profileId);
      const sourceImageUrl=monitor?.sourceImageUrl||externalSourceImageUrl(profile.imageUrl);
      const hash=await snapshotHash(profileSnapshot(profile,sourceImageUrl));
      const geo=await loadGeoMirror(database,profileId);
      const properties=adaptDirectoryNotionTextProperties({...notionProfileProperties(profile,geo??null,hash,profile.updatedAt,sourceImageUrl),...await stagedDirectoryStructuredProperties(database,bindings,profile,schema)},schema);
      return {revision:profile.updatedAt,hash,properties,reviewed:await directoryProfileNotionSyncLocked(database,profileId)};
    }});
}

async function bootstrapProfileIds(database: D1Database,staged=false) {
  const result = await database.prepare(`
    SELECT dp.id
    FROM directory_profiles dp
    LEFT JOIN directory_notion_sync dns ON dns.directory_profile_id = dp.id
    WHERE dns.directory_profile_id IS NULL
      AND (${staged ? "dp.status<>'archived' AND NOT EXISTS(SELECT 1 FROM notion_unified_manual_fence f WHERE f.agenda='directory' AND f.entity_id=CAST(dp.id AS TEXT)) AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones t WHERE t.kind='directory' AND t.record_id=dp.id)" : "dp.category <> 'chovatelske-stanice' AND dp.category NOT IN ('veterinari','kynologicke-kluby','fyzioterapia','dalsie-sluzby')"})
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
const breederSqlContactColumns: Partial<Record<BreederEditorialField, string>> = {
  publicPhone: "public_phone", publicEmail: "public_email",
  facebookUrl: "facebook_url", instagramUrl: "instagram_url",
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
// Exact legacy labels stay stable; the canonical filter registry supplies
// the remaining category-specific selects without a second hardcoded allowlist.
const breederFacetNotionProperties: Readonly<Record<string, string>> = {
  "veterinari.facility_type": "Typ pracoviska",
  "veterinari.emergency": "Pohotovosť",
  "veterinari.home_visits": "Návštevy doma",
  "chovatelske-stanice.visits_by_appointment": "Návštevy po dohode",
  "chovatelske-stanice.health_testing_information": "Informácie o zdravotných testoch",
  "treneri.individual_training": "Individuálny výcvik",
  "treneri.group_training": "Skupinový výcvik",
  ...Object.fromEntries(directoryFilterRegistry.map(def => [def.id, def.notion.property])),
};
type BreederFacetId = string;
const breederFacetIds = directoryFilterRegistry.map(def => def.id);
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
  reservation?: FieldReservation,
): Promise<ManagedDirectoryProfile> {
  if (!isDirectoryFieldEventCategory(current.category) || current.status === "archived" || current.reviewed)
    throw new Error("BREEDER_FIELD_WRITE_NOT_ALLOWED");
  // Pilot categories use the canonical Services V3 catalog. Their retired
  // legacy "Služby" text must not be written by any editorial event.
  if (path === "services" && isDirectoryEventPilotCategory(current.category))
    throw new Error("DIRECTORY_PILOT_LEGACY_SERVICES_READ_ONLY");
  const raw = breederReadPath(desired, path);
  const value = typeof raw === "string" ? raw : "";
  // The name is identity-critical; other editorial fields may be cleared.
  if (path === "name" && !value.trim()) throw new Error("DIRECTORY_NAME_REQUIRED");
  const assignments: string[] = [];
  const params: string[] = [];
  let editedQualifications: string[] | undefined;
  let editedServices: string[] | undefined;
  let editedTrainerServicesText: string | undefined;
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
    // The value belongs only to directory_profile_extra_fields.
    // The SQL mirror below commits it in the same batch as profile revision.
    editedTrainerServicesText = text;
  } else if (path === "services" || path === "qualifications") {
    // Breeders store free-text service lines; qualifications also remain text. 
    const items = Array.isArray(raw)
      ? raw.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      : value ? value.split(/\r?\n/).map(item => item.trim()).filter(Boolean) : [];
    if (path === "qualifications") editedQualifications = items;
    if (path === "services") editedServices = items;
  } else if (path === "addressFormat") {
    // A storage format is a technical enum, not editorial prose.
    if (!["", "STREET", "MUNICIPALITY_NUMBER"].includes(value))
      throw new Error("BREEDER_ADDRESS_FORMAT_INVALID");
    assignments.push("address_format = ?");
    params.push(value);
  } else if (contact) {
    // Contact edits change only the canonical SQL contact column.
    // Legacy aliases are no longer read by the live SQL-first profile adapter.
    if (path === "websiteUrl") {
      assignments.push("website_url = ?");
      params.push(value);
    } else {
      const column = breederSqlContactColumns[path];
      if (!column) throw new Error("DIRECTORY_SQL_CONTACT_COLUMN_MISSING");
      assignments.push(column + " = ?");
      params.push(value);
    }
  } else if (path === "seo.noindex") {
    // Checkbox false is an explicit action, never an omitted/empty string.
    if (typeof raw !== "boolean") throw new Error("DIRECTORY_NOINDEX_BOOLEAN_REQUIRED");
    // The guarded SQL owner below persists the explicit boolean.
  } else if (seoKey) {
    // The guarded SQL owner below persists this SEO field.
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
  if (await directoryProfileNotionSyncLocked(database, current.id))
    throw Error("DIRECTORY_FIELD_SYNC_LOCKED");
  const previous = Date.parse(current.updatedAt);
  const now = new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString();
  const guard=reservation?.profileAuthority?directoryAuthorityWriteGuard(reservation,current.id,path):{sql:"",params:[]};
  const guardedCategory = current.category === "chovatelske-stanice"
    ? "category = 'chovatelske-stanice'" : "category = ?";
  const categoryArg = current.category === "chovatelske-stanice" ? [] : [current.category];
  const canonical = database.prepare(
    "UPDATE directory_profiles SET " +
    (assignments.length ? assignments.join(", ") + ", " : "") +
    "updated_at = ?, updated_by = ? " +
    "WHERE id = ? AND " + guardedCategory + " AND status <> 'archived' " +
    "AND updated_at = ?" + guard.sql + " RETURNING id",
  ).bind(...params, now, SYSTEM_ACTOR, current.id, ...categoryArg, current.updatedAt,...guard.params);
  // Notion field-events must update the EXACT 0173 SQL owner inside the same
  // D1 transaction as the guarded profile revision. Otherwise a fresh Notion SEO
  // / qualification edit would be hidden by the now SQL-first public/Admin
  // reader, or a subsequent full Admin save could undo that edit.
  const mirrorIdentity = {kind:"id" as const,profileId:current.id,
    updatedAt:now,actor:SYSTEM_ACTOR};
  const seoEdited=path==="seo.noindex"||Boolean(seoKey);
  const nextSeo = seoEdited ? {...(current.seo??{})} : null;
  if(nextSeo){
    if(path==="seo.noindex") nextSeo.noindex=raw as boolean;
    else if(seoKey) (nextSeo as Record<string,string|boolean|undefined>)[seoKey]=value;
  }
  const mirror = [
    ...(editedQualifications!==undefined
      ? planDirectory0173EditorialSqlMirror({
        identity:mirrorIdentity,qualifications:editedQualifications,
      })
      : nextSeo ? planDirectory0173EditorialSqlMirror({
        identity:mirrorIdentity,seo:nextSeo,
      }) : []),
    ...(editedServices!==undefined
      ? planDirectoryStep3PresentationSqlMirror({
        identity:mirrorIdentity,services:editedServices,
      }) : []),
    ...planDirectoryExtraSqlTextMirror({
      identity:mirrorIdentity,
      fieldKey:TRAINER_SERVICES_TEXT_METADATA_KEY,
      value:editedTrainerServicesText,
    }),
  ];
  let saved:{id:number}|null = null;
  if(mirror.length){
    // A stale CAS must abort the entire D1 batch, including sidecar writes.
    // The intentionally invalid json_extract fails the transaction when the
    // canonical UPDATE affected no row.
    const verify=database.prepare(
      "SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('DIRECTORY_FIELD_CAS_CONFLICT','$.invalid') END AS verified"
    );
    const responses=await database.batch([canonical,verify,
      ...mirror.map(entry=>database.prepare(entry.sql).bind(...entry.bindings))]);
    saved=(responses[0]?.results?.[0]??null) as {id:number}|null;
  } else saved=await canonical.first<{id:number}>();
  if (!saved) throw new Error("BREEDER_FIELD_WRITE_CONFLICT");
  const updated = await getManagedDirectoryProfileById(current.id, database);
  if (!updated) throw new Error("BREEDER_FIELD_RELOAD_FAILED");
  return updated;
}

/**
 * Exact-field D1/Notion editing of operational and public legacy facts.
 * The public-fact allowlist comes from the SAME renderer contract as Admin;
 * never infer Services V3 choices or breeder relations from free text.
 */
export const PILOT_DIRECTORY_METADATA_FIELDS = [
  ...new Set([
    "Ordinačné hodiny", "Zdroj dát", "Zdroj obrázka", "Alt text obrázka",
    "Organizácia", "Zameranie",
    ...DIRECTORY_LEGACY_PUBLIC_EDITABLE_KEYS,
  ]),
] as const;
export const PUBLIC_DIRECTORY_FACT_FIELDS = ["Organizácia", "Zameranie"] as const;
export type PilotDirectoryMetadataField = (typeof PILOT_DIRECTORY_METADATA_FIELDS)[number];

function pilotChangedNotionMetadataFields(
  page: NotionPage, changedIds: readonly string[],
): PilotDirectoryMetadataField[] {
  const changed = new Set(changedIds);
  return PILOT_DIRECTORY_METADATA_FIELDS.filter(name => {
    const item = page.properties?.[name] as
      | { id?: unknown; type?: unknown; rich_text?: unknown } | undefined;
    const isNewLegacy = DIRECTORY_LEGACY_PUBLIC_EDITABLE_KEYS.includes(name) &&
      !["Ordinačné hodiny"].includes(name);
    // Legacy public facts may share a Notion name with canonical service/filter
    // selects. Only a real rich-text Notion column may edit legacy prose.
    if (isNewLegacy && item?.type !== "rich_text" && !Array.isArray(item?.rich_text))
      return false;
    return changed.has(name) || (typeof item?.id === "string" && changed.has(item.id));
  });
}

/** Save one source/hours field, preserving every unrelated JSON property. */
export async function savePilotDirectoryMetadataField(input: {
  database: D1Database;
  profileId: number;
  category: string;
  field: string;
  value: string;
  expectedValue?: string;
  adminReceiptActor?: string;
  expectedRevision?: string;
  fromNotion?: boolean;
  reservation?:FieldReservation;
}): Promise<ManagedDirectoryProfile> {
  if (!(serviceFilterCategories as readonly string[]).includes(input.category) ||
      !isDirectoryPublicMetadataField(input.field))
    throw new Error("DIRECTORY_PILOT_METADATA_SCOPE_INVALID");
  const trimmed = input.value.trim();
  // A blank value is an explicit Admin edit and must clear only this field.
  // Blank Notion webhook values are still ignored in syncBreederEvent.
  const current = await getManagedDirectoryProfileById(input.profileId, input.database);
  // This helper is also used by the authenticated Admin editor. A reviewed
  // profile may still be corrected there; only Notion-driven calls are gated
  // at the sync sweep entry points above.
  if (!current || current.category !== input.category || current.status === "archived")
    throw new Error("DIRECTORY_PILOT_METADATA_IDENTITY_MISMATCH");
  if (input.expectedRevision !== undefined && current.updatedAt !== input.expectedRevision)
    throw Error("DIRECTORY_UNIFIED_REVISION_CHANGED");
  if (input.fromNotion && await directoryProfileNotionSyncLocked(input.database, input.profileId))
    throw Error("DIRECTORY_UNIFIED_LOCKED");
  const currentValue = readDirectoryPublicMetadataValue(current.importData, input.field);
  if (input.expectedValue !== undefined &&
      currentValue !== input.expectedValue.trim() && currentValue !== trimmed) {
    throw new Error("DIRECTORY_PUBLIC_METADATA_STALE_VALUE");
  }
  if (currentValue === trimmed &&
      Object.hasOwn(current.importData ?? {}, input.field)) {
    if (input.field !== "Ordinačné hodiny") return current;
    // Explicit repeat edits can repair a missing 0173 SQL projection without
    // inferring edits to unrelated profiles or historical values.
    const rows = await input.database.prepare(
      "SELECT day_of_week,hours_text FROM directory_profile_opening_hours WHERE profile_id=?"
    ).bind(input.profileId).all<{ day_of_week: number; hours_text: string }>();
    const matches = trimmed
      ? rows.results.length === 1 &&
        rows.results[0].day_of_week === 0 && rows.results[0].hours_text === trimmed
      : rows.results.length === 0;
    if (matches) return current;
  }
  const previousTime = Date.parse(current.updatedAt);
  const now = new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
  const actor = input.adminReceiptActor ?? SYSTEM_ACTOR;
  // Explicit field-level D1 SQL write: the compatibility JSON must not be
  // recreated by an Admin or Notion metadata edit after legacy retirement.
  const authority=input.reservation?.profileAuthority?directoryAuthorityWriteGuard(input.reservation,input.profileId,"meta:"+input.field):{sql:"",params:[]};
  const canonical = input.database.prepare(
    "UPDATE directory_profiles SET updated_at = ?, updated_by = ? " +
    "WHERE id = ? AND category = ? AND status <> 'archived' " +
    "AND updated_at = ?"+authority.sql+" RETURNING id"
  ).bind(now, actor,
    input.profileId, input.category, current.updatedAt,...authority.params);
  const approved = approvedDirectoryFactSqlSlot(input.category as ServiceFilterCategory, input.field);
  const isHours = input.field === "Ordinačné hodiny";
  const mirrorIdentity = {kind:"id" as const,profileId:input.profileId,
    updatedAt:now,actor};
  const factMirror = approved ? planDirectory0170FactSqlMirror({
    profileId: input.profileId, category: input.category as ServiceFilterCategory,
    field: input.field, value: trimmed, updatedAt: now, actor,
  }) : [];
  const hoursMirror = isHours ? planDirectory0173EditorialSqlMirror({
    identity: mirrorIdentity, openingHoursText: trimmed,
  }) : [];
  const extraMirror = !approved && !isHours ? planDirectoryExtraSqlTextMirror({
    identity:mirrorIdentity,fieldKey:input.field,value:trimmed,
  }) : [];
  const guard = factMirror.length ? [] : [input.database.prepare(
    "SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('CAS_CONFLICT', char(36)) END AS cas_ok"
  )];
  const receipt = input.adminReceiptActor ? planDirectoryAdminReceipts(input.database, {
    id: input.profileId, expectedRevision: current.updatedAt, nextRevision: now,
    editor: actor, fields: [], structured: [directoryMetadataReceiptField(input.field, isHours ? "hours" : approved ? "fact" : "extra")],
  }) : { before: [], after: [] };
  const response = await input.database.batch([
    ...receipt.before, canonical, ...guard,
    ...factMirror.map(item => input.database.prepare(item.sql).bind(...item.bindings)),
    ...hoursMirror.map(item => input.database.prepare(item.sql).bind(...item.bindings)),
    ...extraMirror.map(item => input.database.prepare(item.sql).bind(...item.bindings)),
    ...receipt.after,
  ]);
  if (!(response[receipt.before.length]?.results?.[0] as { id?: number } | undefined)?.id)
    throw new Error("DIRECTORY_PILOT_METADATA_WRITE_CONFLICT");
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
  if(input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text")return false;
  if (await directoryProfileNotionSyncLocked(input.database, input.profileId)) return false;
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
  if (input.bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED === "true") {
    return syncUnifiedDirectoryOperationalFields({
      database: input.database, bindings: input.bindings, profileId: input.profileId, pageId: page.id,
      fields: PILOT_DIRECTORY_METADATA_FIELDS.filter(field => Object.hasOwn(input.changed, field))
        .map(field => ({ kind: "meta" as const, field })), direction: "push",
    });
  }
  const patch: Record<string, unknown> = {};
  for (const field of PILOT_DIRECTORY_METADATA_FIELDS) {
    if (!Object.hasOwn(input.changed, field)) continue;
    const value = input.changed[field]!.trim();
    if (propertyText(page, field) === value) continue;
    if (!Object.hasOwn(page.properties ?? {}, field)) {
      // Existing optional Organization/Focus schema remains backwards compatible.
      if ((PUBLIC_DIRECTORY_FACT_FIELDS as readonly string[]).includes(field)) continue;
      throw new Error("DIRECTORY_PILOT_METADATA_NOTION_FIELD_MISSING: " + field);
    }
    const notionField = page.properties?.[field] as
      | { type?: unknown; rich_text?: unknown } | undefined;
    if (DIRECTORY_LEGACY_PUBLIC_EDITABLE_KEYS.includes(field) &&
        field !== "Ordinačné hodiny" &&
        notionField?.type !== "rich_text" && !Array.isArray(notionField?.rich_text))
      throw new Error("DIRECTORY_PILOT_METADATA_NOTION_FIELD_NOT_RICH_TEXT: " + field);
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
 * Mirror an Admin-uploaded main image immediately for any linked directory
 * category. "Hlavný obrázok URL" is reserved for the external SOURCE image;
 * the actual published Psipedia asset belongs in "Obrázok Psipedia".
 */
export async function mirrorDirectoryMainImageToNotion(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
  profileId: number;
}): Promise<void> {
  if(input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text")return;
  if (await directoryProfileNotionSyncLocked(input.database, input.profileId)) return;
  const profile = await getManagedDirectoryProfileById(input.profileId, input.database);
  if (!profile || profile.status === "archived")
    throw new Error("DIRECTORY_IMAGE_PROFILE_UNAVAILABLE");
  const mapping = await loadMappingByProfile(input.database, input.profileId);
  if (!mapping) throw new Error("DIRECTORY_IMAGE_NOTION_UNLINKED");
  const dataSourceId = input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim();
  if (!dataSourceId || !input.bindings.NOTION_API_TOKEN?.trim())
    throw new Error("DIRECTORY_IMAGE_NOTION_DISABLED");

  const page = await fetchNotionPage(input.bindings, mapping.notion_page_id);
  if (page.id !== mapping.notion_page_id ||
      !notionDirectoryPageBelongsToSource(page, dataSourceId) ||
      propertyText(page, "Psipedia ID") !== String(input.profileId))
    throw new NotionDirectoryUnsafeTargetError("DIRECTORY_IMAGE_NOTION_TARGET_INVALID");

  const imageField = "Obrázok Psipedia";
  const keyField = "Obrázok key";
  if (!page.properties?.[imageField] || !page.properties?.[keyField])
    throw new Error("DIRECTORY_IMAGE_NOTION_FIELD_MISSING");
  const expectedUrl = absoluteAsset(profile.imageUrl);
  const expectedKey = profile.imageKey ?? "";
  const patch: Record<string, unknown> = {};
  if (propertyText(page, imageField) !== expectedUrl) patch[imageField] = url(expectedUrl);
  if (propertyText(page, keyField) !== expectedKey) patch[keyField] = richText(expectedKey);
  if (!Object.keys(patch).length) return;

  const echoed = await patchNotionPage(input.bindings, page.id, patch);
  if (echoed.id !== page.id ||
      propertyText(echoed, imageField) !== expectedUrl ||
      propertyText(echoed, keyField) !== expectedKey)
    throw new Error("DIRECTORY_IMAGE_NOTION_WRITEBACK_UNVERIFIED");
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
  if (!serviceFilterCategories.includes(current.category as ServiceFilterCategory) || current.status === "archived" || current.reviewed)
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
const UNIFIED_DIRECTORY_LOCATION_FIELDS = new Set<BreederEditorialField>([
  "region", "district", "city", "address", "postalCode", "street", "houseNumber", "addressFormat",
]);

function directoryUnifiedPropertyPresent(page: NotionPage, path: BreederEditorialField): boolean {
  return directoryUnifiedRawPropertyPresent(page, BREEDER_NOTION_EDITORIAL_FIELDS[path], path === "seo.noindex");
}

function directoryUnifiedRawPropertyPresent(page: NotionPage, name: string, checkbox = false): boolean {
  const raw = property(page, name);
  if (!raw) return false;
  if (checkbox) return typeof raw.checkbox === "boolean";
  for (const key of ["title", "rich_text"] as const) {
    if (Array.isArray(raw[key])) {
      const items = raw[key] as unknown[];
      // A capped response is not proof of a complete editable field.
      return items.length < 25 && items.every(item => item && typeof item === "object" &&
        typeof (item as Record<string, unknown>).plain_text === "string");
    }
  }
  for (const key of ["url", "email", "phone_number"] as const)
    if (Object.hasOwn(raw, key)) return raw[key] === null || typeof raw[key] === "string";
  if (Object.hasOwn(raw, "select"))
    return raw.select === null || Boolean(raw.select && typeof raw.select === "object" &&
      typeof (raw.select as Record<string, unknown>).name === "string");
  return false;
}

function directoryUnifiedObservation(snapshot: Record<string, unknown> | null,
  path: BreederEditorialField, present = true): FieldObservation {
  const value = snapshot && present ? breederReadPath(snapshot, path) : undefined;
  return value === undefined ? { present: false } : { present: true, value };
}

/** The existing mapped-page adapters remain the only canonical writers.
 * This pilot only replaces their editorial decision and acknowledgement. */
async function syncUnifiedDirectoryEditorialFields(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
  profile: ManagedDirectoryProfile;
  page: NotionPage;
  fields: readonly BreederEditorialField[];
  direction: "pull" | "push" | "observe";
}): Promise<"pulled" | "pushed" | "unchanged"> {
  const { database, bindings, profile, direction } = input;
  const id = profile.id, pageId = input.page.id;
  const sourceId = bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim();
  if (!sourceId) throw Error("DIRECTORY_UNIFIED_SOURCE_MISSING");

  async function observe(path: BreederEditorialField) {
    if (await directoryProfileNotionSyncLocked(database, id) ||
        await notionPageMustSkipInboundSync(database, pageId))
      throw Error("DIRECTORY_UNIFIED_LOCKED");
    const mapping = await loadMappingByProfile(database, id);
    if (!mapping || mapping.notion_page_id !== pageId) throw Error("DIRECTORY_UNIFIED_MAPPING_CHANGED");
    const current = await getManagedDirectoryProfileById(id, database);
    if (!current || current.category !== profile.category || current.reviewed || current.status === "archived")
      throw Error("DIRECTORY_UNIFIED_PROFILE_CHANGED");
    const geo = await loadGeoMirror(database, id);
    const monitor = await getMediaSourceMonitorForEntity(database, "DIRECTORY_PROFILE", id);
    const sourceImageUrl = monitor?.sourceImageUrl || externalSourceImageUrl(current.imageUrl);
    const page = await fetchNotionPage(bindings, pageId);
    if (page.id !== pageId || page.archived || page.in_trash ||
        !notionDirectoryPageBelongsToSource(page, sourceId!) ||
        propertyText(page, "Psipedia ID") !== String(id) ||
        propertyText(page, "Kategória") !== current.category)
      throw Error("DIRECTORY_UNIFIED_IDENTITY_MISMATCH");
    const latest = await getManagedDirectoryProfileById(id, database);
    if (!latest || latest.updatedAt !== current.updatedAt ||
        await directoryProfileNotionSyncLocked(database, id))
      throw Error("DIRECTORY_UNIFIED_REVISION_CHANGED");
    const canonical = profileSnapshot(current, sourceImageUrl) as unknown as Record<string, unknown>;
    const remote = notionSnapshot(page) as unknown as Record<string, unknown>;
    const confirmedPlace = Boolean(geo?.google_place_id && geo.google_place_source_fingerprint &&
      geo.source_fingerprint && geo.google_place_source_fingerprint === geo.source_fingerprint);
    if (path === "seo.noindex" || (UNIFIED_DIRECTORY_LOCATION_FIELDS.has(path) &&
        (confirmedPlace || current.serviceAddressConfirmation === "CONFIRMED_SERVICE_LOCATION")))
      throw Error("DIRECTORY_UNIFIED_PROTECTED_FIELD");
    return { current, page, mapping, geo, sourceImageUrl, canonical, remote,
      notion: directoryUnifiedObservation(remote, path, directoryUnifiedPropertyPresent(page, path)),
      psipedia: directoryUnifiedObservation(canonical, path) };
  }

  let changed = false;
  const failures: string[] = [];
  for (const path of [...new Set(input.fields)]) {
    try {
      const observed = await observe(path);
      const historical = await readProfileFieldBaseline({
        database, agenda: "directory", entityId: id, pageId, expectedHash: observed.mapping.content_hash,
      });
      const base = directoryUnifiedObservation(historical, path);
      const identity: FieldIdentity = { agenda: "directory", entityId: String(id), pageId, field: path };
      const rawReceipt = await readUnifiedAdminEdit(database, identity, observed.current.updatedAt);
      const receipt = rawReceipt && path === "services" && observed.current.category === "treneri" && typeof rawReceipt.value === "string"
        ? { ...rawReceipt, value: rawReceipt.value.split(/\r?\n/).map(clean).filter(Boolean) }
        : rawReceipt;
      const reservation = await reserveUnifiedField({
        database, identity, authorityBindings: bindings, authorityProperty: observed.page.properties?.[BREEDER_NOTION_EDITORIAL_FIELDS[path]], historicalBaseline: base.present
          ? { value: base.value, version: observed.mapping.content_hash } : null,
        notion: observed.notion, psipedia: observed.psipedia, psipediaEdit: receipt, direction,
      });
      if (!reservation) continue;
      const live = await getManagedDirectoryProfileById(id, database);
      if (!live || live.updatedAt !== observed.current.updatedAt ||
          await directoryProfileNotionSyncLocked(database, id))
        throw Error("DIRECTORY_UNIFIED_REVISION_CHANGED");
      const mapping = await loadMappingByProfile(database, id);
      if (mapping?.notion_page_id !== pageId) throw Error("DIRECTORY_UNIFIED_MAPPING_CHANGED");
      await assertUnifiedReservationCurrent(database,reservation);
      if (direction === "pull") {
        if(reservation.profileAuthority){
          const fresh=await observe(path);
          if(fresh.current.updatedAt!==live.updatedAt||fresh.page.last_edited_time!==observed.page.last_edited_time||
            JSON.stringify(fresh.notion)!==JSON.stringify(observed.notion)||
            JSON.stringify(property(fresh.page,BREEDER_NOTION_EDITORIAL_FIELDS[path]))!==JSON.stringify(property(observed.page,BREEDER_NOTION_EDITORIAL_FIELDS[path])))throw Error("DIRECTORY_UNIFIED_REVISION_CHANGED");
          await assertUnifiedReservationCurrent(database,reservation);
        }
        const desired = breederApplyNotionChanges(observed.canonical, observed.remote, [path]);
        await saveBreederEditorialValue(database, live, desired, path, reservation);
      } else {
        const key = BREEDER_NOTION_EDITORIAL_FIELDS[path];
        const properties = notionProfileProperties(live, observed.geo, "", new Date().toISOString(), observed.sourceImageUrl);
        const property = properties[key];
        if (property === undefined || !Object.hasOwn(observed.page.properties ?? {}, key))
          throw Error("DIRECTORY_UNIFIED_PROPERTY_MISSING");
        const reply = await patchNotionPage(bindings, pageId,
          adaptDirectoryNotionTextProperties({ [key]: property }, observed.page.properties ?? {}));
        if (reply.id !== pageId) throw Error("DIRECTORY_UNIFIED_WRITEBACK_UNVERIFIED");
      }
      const fresh = await observe(path);
      await confirmUnifiedField(database, reservation, fresh.notion, fresh.psipedia);
      changed = true;
    } catch (error) {
      failures.push(path);
      console.warn("DIRECTORY_UNIFIED_FIELD_PENDING", id, path,
        error instanceof Error ? error.message : "UNKNOWN");
    }
  }
  // Never acknowledge unrelated structural or pending editorial errors.
  if (failures.length) throw Error("DIRECTORY_UNIFIED_FIELDS_PENDING: " + failures.join(","));
  return changed ? direction === "pull" ? "pulled" : "pushed" : "unchanged";
}

type UnifiedDirectoryOperationalField =
  | { kind: "meta"; field: string }
  | { kind: "facet"; field: string };

/** Use the same field reservation/confirmation contract for facts and filters.
 * No historical baseline is invented for properties omitted from the old
 * editorial hash. Identical live values establish their first safe baseline. */
async function syncUnifiedDirectoryOperationalFields(input: {
  database: D1Database; bindings: NotionDirectorySyncBindings;
  profileId: number; pageId: string;
  fields: readonly UnifiedDirectoryOperationalField[]; direction: "pull" | "push" | "observe";
}): Promise<boolean> {
  const { database, bindings, profileId, pageId, direction } = input;
  const sourceId = bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim();
  if (!sourceId) throw Error("DIRECTORY_UNIFIED_SOURCE_MISSING");

  async function observe(item: UnifiedDirectoryOperationalField) {
    if (await directoryProfileNotionSyncLocked(database, profileId) ||
        await notionPageMustSkipInboundSync(database, pageId)) throw Error("DIRECTORY_UNIFIED_LOCKED");
    const mapping = await loadMappingByProfile(database, profileId);
    const profile = await getManagedDirectoryProfileById(profileId, database);
    if (!profile || profile.reviewed || profile.status === "archived" ||
        mapping?.notion_page_id !== pageId) throw Error("DIRECTORY_UNIFIED_MAPPING_CHANGED");
    const page = await fetchNotionPage(bindings, pageId);
    if (page.id !== pageId || page.archived || page.in_trash ||
        !notionDirectoryPageBelongsToSource(page, sourceId!) ||
        propertyText(page, "Psipedia ID") !== String(profileId) ||
        propertyText(page, "Kategória") !== profile.category)
      throw Error("DIRECTORY_UNIFIED_IDENTITY_MISMATCH");
    let key: string, remote: string | null, local: string | null, fieldKey: string;
    if (item.kind === "meta") {
      key = item.field;
      if (!PILOT_DIRECTORY_METADATA_FIELDS.includes(key) || !isDirectoryPublicMetadataField(key) ||
          !directoryUnifiedRawPropertyPresent(page, key)) throw Error("DIRECTORY_UNIFIED_METADATA_SCHEMA");
      if (DIRECTORY_LEGACY_PUBLIC_EDITABLE_KEYS.includes(key) && key !== "Ordinačné hodiny" &&
          !Array.isArray(property(page, key)?.rich_text)) throw Error("DIRECTORY_UNIFIED_METADATA_SCHEMA");
      fieldKey = "meta:" + key;
      remote = propertyText(page, key);
      local = readDirectoryPublicMetadataValue(profile.importData, key);
    } else {
      const def = getDirectoryFilterDefinition(item.field);
      if (!def || (def.category !== profile.category && !(bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text" && profile.additionalCategories?.includes(def.category)))) throw Error("DIRECTORY_UNIFIED_FILTER_SCOPE");
      key = breederFacetNotionProperties[item.field];
      if (!key || !directoryUnifiedRawPropertyPresent(page, key) || !Object.hasOwn(property(page, key) ?? {}, "select"))
        throw Error("DIRECTORY_UNIFIED_FILTER_SCHEMA");
      fieldKey = "facet:" + def.category + ":" + item.field;
      const selected = propertyText(page, key);
      const normalized = selected ? normalizeDirectoryFilterValue(def, notionFacetSourceValue(selected)) : null;
      if (normalized && normalized.status !== "known") throw Error("DIRECTORY_UNIFIED_FILTER_VALUE");
      remote = normalized?.status === "known" ? normalized.value : null;
      const row = await database.prepare(
        "SELECT value_text FROM directory_profile_filter_values WHERE profile_id=? AND category=? AND filter_id=?",
      ).bind(profileId, def.category, item.field).first<{value_text:string}>();
      local = row?.value_text ?? null;
    }
    const fresh = await getManagedDirectoryProfileById(profileId, database);
    if (!fresh || fresh.updatedAt !== profile.updatedAt ||
        await directoryProfileNotionSyncLocked(database, profileId)) throw Error("DIRECTORY_UNIFIED_REVISION_CHANGED");
    const identity: FieldIdentity = { agenda: "directory", entityId: String(profileId), pageId, field: fieldKey };
    return { profile, page, key, identity, authorityProperty:property(page,key),
      notion: { present: true as const, value: remote },
      psipedia: { present: true as const, value: local } };
  }

  let changed = false;
  const failures: string[] = [];
  for (const field of input.fields) {
    try {
      const observed = await observe(field);
      const receipt = await readUnifiedAdminEdit(database, observed.identity, observed.profile.updatedAt);
      const reservation = await reserveUnifiedField({
        database, identity: observed.identity, authorityBindings: bindings, authorityProperty:observed.authorityProperty, historicalBaseline: null,
        notion: observed.notion, psipedia: observed.psipedia, psipediaEdit: receipt, direction,
      });
      if (!reservation) continue;
      const live = await observe(field);
      if (live.profile.updatedAt !== observed.profile.updatedAt ||
          (reservation.profileAuthority&&(live.page.last_edited_time!==observed.page.last_edited_time||JSON.stringify(live.authorityProperty)!==JSON.stringify(observed.authorityProperty))) ||
          live.notion.value !== observed.notion.value || live.psipedia.value !== observed.psipedia.value)
        throw Error("DIRECTORY_UNIFIED_REVISION_CHANGED");
      await assertUnifiedReservationCurrent(database,reservation);
      if (direction === "pull") {
        if (field.kind === "meta") {
          if (typeof live.notion.value !== "string") throw Error("DIRECTORY_UNIFIED_METADATA_VALUE");
          await savePilotDirectoryMetadataField({ database, profileId, category: live.profile.category,
            field: field.field, value: live.notion.value, expectedValue: live.psipedia.value ?? "",
            expectedRevision: live.profile.updatedAt, fromNotion: true, reservation });
        } else {
          const previous = Date.parse(live.profile.updatedAt);
          const now = new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString();
          const guard=reservation.profileAuthority?directoryAuthorityWriteGuard(reservation,profileId,live.identity.field):{sql:"",params:[]};
          const facetCategory=getDirectoryFilterDefinition(field.field)?.category;
          if(!facetCategory)throw Error("DIRECTORY_UNIFIED_FILTER_SCOPE");
          const secondary=facetCategory!==live.profile.category;
          if(secondary&&!reservation.profileAuthority)throw Error("DIRECTORY_UNIFIED_FILTER_SCOPE");
          const membership=secondary?" AND EXISTS(SELECT 1 FROM directory_profile_additional_categories s WHERE s.profile_id=directory_profiles.id AND s.category=?)":"";
          const canonical = database.prepare(
            "UPDATE directory_profiles SET updated_at=?,updated_by=? WHERE id=? AND category=? AND updated_at=? AND status<>'archived'"+guard.sql+membership+" RETURNING id",
          ).bind(now, SYSTEM_ACTOR, profileId, live.profile.category, live.profile.updatedAt,...guard.params,...(secondary?[facetCategory]:[]));
          const mirror = planDirectory0170FilterSqlMirror({ profileId,
            category: facetCategory,allowSecondary:secondary,
            values: { [field.field]: live.notion.value }, updatedAt: now, actor: SYSTEM_ACTOR });
          if (await directoryProfileNotionSyncLocked(database, profileId)) throw Error("DIRECTORY_UNIFIED_LOCKED");
          const result = await database.batch([canonical, ...mirror.map(item => database.prepare(item.sql).bind(...item.bindings))]);
          if (!(result[0]?.results?.[0] as {id?:number}|undefined)?.id) throw Error("DIRECTORY_UNIFIED_FILTER_CAS");
        }
      } else {
        const value = live.psipedia.value;
        const patch = field.kind === "meta" ? richText(value ?? "") : value ? select(notionFacetLabel(value)) : { select: null };
        const reply = await patchNotionPage(bindings, pageId, { [live.key]: patch });
        if (reply.id !== pageId) throw Error("DIRECTORY_UNIFIED_WRITEBACK_UNVERIFIED");
      }
      const fresh = await observe(field);
      await confirmUnifiedField(database, reservation, fresh.notion, fresh.psipedia);
      changed = true;
    } catch (error) {
      failures.push(field.kind + ":" + field.field);
      console.warn("DIRECTORY_UNIFIED_OPERATIONAL_FIELD_PENDING", profileId, field.field,
        error instanceof Error ? error.message : "UNKNOWN");
    }
  }
  if (failures.length) throw Error("DIRECTORY_UNIFIED_OPERATIONAL_FIELDS_PENDING: " + failures.join(","));
  return changed;
}

/** Linked entities have canonical numeric IDs; text is only an exact-name
 * transport. Unknown names never become a partial or empty selection. */
async function syncUnifiedDirectoryBreederRelations(input: {
  database: D1Database; bindings: NotionDirectorySyncBindings; profileId: number;
  pageId: string; fields: readonly BreederRelationField[]; direction: "pull" | "push" | "observe";
}): Promise<boolean> {
  const {database, bindings, profileId, pageId, direction} = input;
  const sourceId = bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim();
  if (!sourceId) throw Error("DIRECTORY_UNIFIED_SOURCE_MISSING");
  async function observe(field: BreederRelationField) {
    if (await directoryProfileNotionSyncLocked(database, profileId) ||
        await notionPageMustSkipInboundSync(database, pageId)) throw Error("DIRECTORY_UNIFIED_LOCKED");
    const mapping = await loadMappingByProfile(database, profileId);
    const profile = await getManagedDirectoryProfileById(profileId, database);
    if (mapping?.notion_page_id !== pageId || !profile ||
        !["chovatelske-stanice", "chovatelske-kluby"].includes(profile.category) ||
        (profile.category === "chovatelske-kluby" && field !== "breedIds"))
      throw Error("DIRECTORY_UNIFIED_RELATION_SCOPE");
    const page = await fetchNotionPage(bindings, pageId);
    const key = BREEDER_NOTION_RELATION_FIELDS[field];
    if (page.id !== pageId || page.archived || page.in_trash ||
        !notionDirectoryPageBelongsToSource(page, sourceId!) ||
        propertyText(page, "Psipedia ID") !== String(profileId) ||
        propertyText(page, "Kategória") !== profile.category ||
        !directoryUnifiedRawPropertyPresent(page, key)) throw Error("DIRECTORY_UNIFIED_RELATION_SCHEMA");
    const selected = await getBreederRelationSelection(database, profileId);
    if (!selected) throw Error("DIRECTORY_UNIFIED_RELATION_MISSING");
    const options = await listBreederRelationOptions(database);
    const candidates = field === "breedIds" ? options.breeds : options.clubs;
    const remote = resolveBreederRelationText(propertyText(page, key), candidates);
    if (remote.status === "unmatched") throw Error("DIRECTORY_UNIFIED_RELATION_UNKNOWN_NAME");
    const fresh = await getManagedDirectoryProfileById(profileId, database);
    if (!fresh || fresh.updatedAt !== profile.updatedAt || await directoryProfileNotionSyncLocked(database, profileId))
      throw Error("DIRECTORY_UNIFIED_REVISION_CHANGED");
    return {profile, page, key, selected, candidates,
      authorityProperty:{property:property(page,key),candidates},
      notion: {present:true as const, value:[...remote.ids].sort((a,b)=>a-b)},
      psipedia: {present:true as const, value:[...selected[field]].sort((a,b)=>a-b)}};
  }
  let changed = false;
  const failures: string[] = [];
  for (const field of [...new Set(input.fields)]) {
    try {
      const observed = await observe(field);
      const identity: FieldIdentity = {agenda:"directory",entityId:String(profileId),pageId,field:"relation:"+field};
      const receipt = await readUnifiedAdminEdit(database, identity, observed.profile.updatedAt);
      const reservation = await reserveUnifiedField({database, identity, authorityBindings: bindings, authorityProperty:observed.authorityProperty, historicalBaseline:null,
        notion:observed.notion, psipedia:observed.psipedia, psipediaEdit:receipt,direction});
      if (!reservation) continue;
      const live = await observe(field);
      if (live.profile.updatedAt !== observed.profile.updatedAt ||
          (reservation.profileAuthority&&(live.page.last_edited_time!==observed.page.last_edited_time||JSON.stringify(live.authorityProperty)!==JSON.stringify(observed.authorityProperty))) ||
          !sameBreederRelationIds(live.notion.value, observed.notion.value) ||
          !sameBreederRelationIds(live.psipedia.value, observed.psipedia.value))
        throw Error("DIRECTORY_UNIFIED_REVISION_CHANGED");
      await assertUnifiedReservationCurrent(database,reservation);
      if (direction === "pull") {
        await saveBreederRelationSelection(database, profileId, {...live.selected,[field]:live.notion.value},
          SYSTEM_ACTOR,{expectedRevision:live.profile.updatedAt,fromNotion:true,
            ...(reservation.profileAuthority?{authority:{reservation,field}}:{})});
      } else {
        const text = formatBreederRelationText(live.psipedia.value, live.candidates);
        if (text === null) throw Error("DIRECTORY_UNIFIED_RELATION_UNKNOWN_ID");
        const result = await patchNotionPage(bindings,pageId,{[live.key]:richText(text)});
        if (result.id !== pageId) throw Error("DIRECTORY_UNIFIED_WRITEBACK_UNVERIFIED");
      }
      const fresh = await observe(field);
      await confirmUnifiedField(database,reservation,fresh.notion,fresh.psipedia);
      changed = true;
    } catch(error) {
      failures.push(field);
      console.warn("DIRECTORY_UNIFIED_RELATION_PENDING",profileId,field,error instanceof Error?error.message:"UNKNOWN");
    }
  }
  if (failures.length) throw Error("DIRECTORY_UNIFIED_RELATIONS_PENDING: "+failures.join(","));
  return changed;
}

/** Notion's editable source URL is not the technical public asset URL.
 * Reuse the existing R2 importer and monitor alias. One guarded D1 transaction
 * changes the image pair and source alias; a blank does not erase an unrelated
 * Admin-uploaded asset. Candidate-review ownership is never overridden. */
async function syncStagedDirectoryImageSource(input:{
  database:D1Database;bindings:NotionDirectorySyncBindings;profileId:number;pageId:string;
  direction:"observe"|"pull";
}):Promise<boolean>{
  const {database:db,bindings,profileId:id,pageId,direction}=input;
  if(bindings.NOTION_PROFILE_AUTHORITY_MODE!=="validated-text"||bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED!=="true")
    throw Error("DIRECTORY_IMAGE_AUTHORITY_DISABLED");
  const sourceId=bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim();
  const field="imageSourceUrl",name="Hlavný obrázok URL";
  const identity:FieldIdentity={agenda:"directory",entityId:String(id),pageId,field};
  async function observe(){
    if(!sourceId||await directoryProfileNotionSyncLocked(db,id)||await notionPageMustSkipInboundSync(db,pageId))
      throw Error("DIRECTORY_IMAGE_AUTHORITY_LOCKED");
    const mapping=await loadMappingByProfile(db,id);
    const profile=await getManagedDirectoryProfileById(id,db);
    if(!profile||profile.status==="archived"||mapping?.notion_page_id!==pageId)throw Error("DIRECTORY_IMAGE_AUTHORITY_MAPPING");
    const page=await fetchNotionPage(bindings,pageId);
    if(page.id!==pageId||!notionDirectoryPageBelongsToSource(page,sourceId)||
      propertyText(page,"Psipedia ID")!==String(id)||propertyText(page,"Kategória")!==profile.category)
      throw Error("DIRECTORY_IMAGE_AUTHORITY_IDENTITY");
    const raw=page.properties?.[name];
    const notion={present:Object.hasOwn(page.properties??{},name),value:propertyText(page,name)};
    if(!isVerifiedAuthorityProperty(raw,notion))throw Error("DIRECTORY_IMAGE_SOURCE_PROPERTY_INVALID");
    if(notion.value){
      const parsed=safeRemoteImageUrl(notion.value);
      if(parsed.hostname==="psipedia.sk"||parsed.hostname.endsWith(".psipedia.sk"))
        throw Error("DIRECTORY_IMAGE_SOURCE_EXPECTS_EXTERNAL_URL");
    }
    const monitor=await db.prepare("SELECT id,updated_at,source_image_url,source_content_hash,active_image_key,candidate_image_key,review_claim_token FROM media_source_monitors WHERE entity_type='DIRECTORY_PROFILE' AND entity_id=?")
      .bind(id).first<{id:number;updated_at:string;source_image_url:string|null;source_content_hash:string|null;active_image_key:string|null;candidate_image_key:string|null;review_claim_token:string|null}>();
    const latest=await getManagedDirectoryProfileById(id,db);
    if(!latest||latest.updatedAt!==profile.updatedAt||await directoryProfileNotionSyncLocked(db,id))throw Error("DIRECTORY_IMAGE_AUTHORITY_REVISION");
    const psipedia={present:true as const,value:monitor?.source_image_url??externalSourceImageUrl(profile.imageUrl)};
    return {profile,page,raw,notion,psipedia,monitor};
  }
  const before=await observe();
  const reservation=await reserveUnifiedField({database:db,identity,authorityBindings:bindings,authorityProperty:before.raw,historicalBaseline:null,notion:before.notion,psipedia:before.psipedia,direction});
  if(!reservation)return false;
  if(!reservation.profileAuthority||typeof reservation.value!=="string")throw Error("DIRECTORY_IMAGE_AUTHORITY_RESERVATION");
  if(before.monitor?.review_claim_token||before.monitor?.candidate_image_key)throw Error("DIRECTORY_IMAGE_CANDIDATE_REVIEW_PENDING");
  const value=reservation.value;
  const prepared=value?await prepareNotionMainImage({bindings,sourceUrl:value,sourcePageUrl:before.profile.websiteUrl??"",folder:"directory",
    existingImageUrl:before.profile.imageUrl,existingImageKey:before.profile.imageKey}):null;
  if(prepared&&(!prepared.imageKey||prepared.imageUrl!=="/media/"+prepared.imageKey||!prepared.imageKey.startsWith("directory/")))
    throw Error("DIRECTORY_IMAGE_PREPARATION_INVALID");
  // Do not delete an independent image when only the old source is cleared.
  const associated=before.monitor?.active_image_key===before.profile.imageKey&&Boolean(before.monitor?.source_image_url)||
    Boolean(externalSourceImageUrl(before.profile.imageUrl)&&externalSourceImageUrl(before.profile.imageUrl)===before.psipedia.value);
  const imageUrl=prepared?prepared.imageUrl:associated?null:before.profile.imageUrl;
  const imageKey=prepared?prepared.imageKey:associated?null:before.profile.imageKey;
  const live=await observe();
  if(live.profile.updatedAt!==before.profile.updatedAt||live.page.last_edited_time!==before.page.last_edited_time||
    JSON.stringify(live.raw)!==JSON.stringify(before.raw)||JSON.stringify(live.monitor)!==JSON.stringify(before.monitor)||
    JSON.stringify(live.psipedia)!==JSON.stringify(before.psipedia))throw Error("DIRECTORY_IMAGE_SOURCE_CHANGED");
  await assertUnifiedReservationCurrent(db,reservation);
  const guard=directoryAuthorityWriteGuard(reservation,id,field);
  const now=new Date(Math.max(Date.now(),(Date.parse(live.profile.updatedAt)||0)+1)).toISOString();
  const old=live.monitor;
  const monitorGuard=old?" AND EXISTS(SELECT 1 FROM media_source_monitors WHERE id=? AND updated_at=? AND review_claim_token IS NULL AND candidate_image_key IS NULL AND source_image_url IS ? AND active_image_key IS ?)":" AND NOT EXISTS(SELECT 1 FROM media_source_monitors WHERE entity_type='DIRECTORY_PROFILE' AND entity_id=directory_profiles.id)";
  const requireOne=()=>db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('DIRECTORY_IMAGE_CAS_CONFLICT','$') END");
  const statements=[
    db.prepare("UPDATE directory_profiles SET image_url=?,image_key=?,updated_at=?,updated_by=? WHERE id=? AND category=? AND updated_at=? AND status<>'archived'"+guard.sql+monitorGuard+" RETURNING id")
      .bind(imageUrl,imageKey,now,SYSTEM_ACTOR,id,live.profile.category,live.profile.updatedAt,...guard.params,...(old?[old.id,old.updated_at,old.source_image_url,old.active_image_key]:[])),
    requireOne(),
    db.prepare("INSERT INTO media_source_monitors(entity_type,entity_id,source_page_url,source_image_url,source_content_hash,active_image_key,status,created_at,updated_at) VALUES('DIRECTORY_PROFILE',?,?,?,?,?,?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET source_page_url=excluded.source_page_url,source_image_url=excluded.source_image_url,source_content_hash=excluded.source_content_hash,active_image_key=excluded.active_image_key,status=excluded.status,last_http_status=NULL,last_checked_at=NULL,issue_started_at=NULL,last_error=NULL,updated_at=excluded.updated_at WHERE review_claim_token IS NULL AND candidate_image_key IS NULL")
      .bind(id,value?live.profile.websiteUrl??null:null,value||null,prepared?.sourceContentHash??null,imageKey,value?"OK":"UNTRACKED",now,now),
    requireOne(),
  ];
  if(imageUrl!==live.profile.imageUrl||imageKey!==live.profile.imageKey)
    statements.push(db.prepare("DELETE FROM directory_profile_image_display_settings WHERE profile_id=?").bind(id));
  const result=await db.batch(statements);
  if(!result[0]?.results?.length||result.some(item=>item.success!==true))throw Error("DIRECTORY_IMAGE_ATOMIC_WRITE_FAILED");
  const verified=await observe();
  await confirmUnifiedField(db,reservation,verified.notion,verified.psipedia);
  // Keep old/staged objects for the existing safe GC path; no eager R2 deletes.
  return true;
}

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
      .filter(path => path !== "services" || !isDirectoryEventPilotCategory(input.profile.category));
    const relationFields = ["chovatelske-stanice", "chovatelske-kluby"].includes(input.profile.category)
      ? breederRelationChangedFields(page.properties, input.changedPropertyIds)
          .filter(field => input.profile.category !== "chovatelske-kluby" || field === "breedIds") : [];
    const staged=bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text";
    const facetFields = isDirectoryFieldEventCategory(input.profile.category) || staged
      ? breederChangedNotionFacets(page, input.changedPropertyIds)
          .filter(id => {const category=getDirectoryFilterDefinition(id)?.category;
            return category===input.profile.category||(staged&&!!category&&input.profile.additionalCategories?.includes(category));})
      : [];
    const trustFields = changedTrainerTrustNotionFields(page.properties, input.changedPropertyIds);
    const pilotMetaFields = isDirectoryFieldEventCategory(input.profile.category) || staged
      ? pilotChangedNotionMetadataFields(page, input.changedPropertyIds) : [];
    const imageProperty=page.properties?.["Hlavný obrázok URL"] as {id?:string}|undefined;
    const imageChanged=staged&&input.changedPropertyIds.some(id=>id==="Hlavný obrázok URL"||id===imageProperty?.id);
    if (!paths.length && !relationFields.length && !facetFields.length && !trustFields.length && !pilotMetaFields.length&&!imageChanged)
      return "unchanged";
    if (bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED === "true") {
      const failures: string[] = [];
      let updated = false;
      try {
        const result = await syncUnifiedDirectoryEditorialFields({
          database, bindings, profile: input.profile, page, fields: paths, direction: "pull",
        });
        updated = result !== "unchanged";
      } catch { failures.push("editorial"); }
      try {
        const structured: UnifiedDirectoryOperationalField[] = [
          ...pilotMetaFields.map(field => ({ kind: "meta" as const, field })),
          ...facetFields.map(field => ({ kind: "facet" as const, field })),
        ];
        updated = await syncUnifiedDirectoryOperationalFields({
          database, bindings, profileId: input.profile.id, pageId: page.id, fields: structured, direction: "pull",
        }) || updated;
      } catch { failures.push("operational"); }
      try {
        updated = await syncUnifiedDirectoryBreederRelations({
          database, bindings, profileId: input.profile.id, pageId: page.id,
          fields: relationFields, direction: "pull",
        }) || updated;
      } catch { failures.push("relations"); }
      if(imageChanged)try{updated=await syncStagedDirectoryImageSource({database,bindings,profileId:input.profile.id,pageId:page.id,direction:"pull"})||updated;}catch(error){console.warn("DIRECTORY_IMAGE_SOURCE_PENDING",input.profile.id,error instanceof Error?error.message:"UNKNOWN");failures.push("imageSourceUrl");}
      // Moderation flags remain under the canonical Admin-owned workflow.
      if (trustFields.length) {
        const latest = await getManagedDirectoryProfileById(input.profile.id, database);
        const currentPage = await fetchNotionPage(bindings, page.id);
        if (!latest || trustFields.some(field => property(currentPage, TRAINER_TRUST_NOTION_PROPERTIES[field])?.checkbox !== latest[field]))
          failures.push("protected-trust");
      }
      if (failures.length) throw Error("DIRECTORY_UNIFIED_FIELDS_PENDING: " + failures.join(","));
      return updated ? "pulled" : "unchanged";
    }
    const fromNotion = notionSnapshot(page) as unknown as Record<string, unknown>;
    let current = input.profile;
    let updated = false;
    const failures: string[] = [];
    for (const path of paths) {
      // A signed property name by itself is not the property value. A partial
      // Notion GET must not translate an absent field into an empty-string
      // deletion in D1. Keep this path pending while independent fields apply.
      const notionKey = BREEDER_NOTION_EDITORIAL_FIELDS[path];
      if (!Object.hasOwn(page.properties ?? {}, notionKey)) {
        failures.push(path);
        continue;
      }
      // The Notion address is editorial text only: never modify the Google
      // Place ID, geo_points coordinates or paid-provider verification.
      const before = profileSnapshot(current) as unknown as Record<string, unknown>;
      const desired = breederApplyNotionChanges(before, fromNotion, [path]);
      // Signed Notion edit is the latest explicit operation for this field.
      // An intentionally empty text value is a real clear, not a conflict.
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
    // Only fields explicitly reported as changed by the Notion webhook are written.
    // An empty edited text field is a real deletion and must clear the D1 value.
    let pilotMetaUpdated = false;
    for (const field of pilotMetaFields) {
      if (!Object.hasOwn(page.properties ?? {}, field)) {
        failures.push(field);
        continue;
      }
      const value = propertyText(page, field).trim();
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
      const key = breederFacetNotionProperties[id];
      // The key itself must exist on the fetched Notion page: a missing
      // property is not an explicit blank and may never delete D1 data.
      if (!key || !Object.hasOwn(page.properties ?? {}, key)) {
        failures.push(id);
        continue;
      }
      const selected = propertyText(page, key);
      const normalized = selected
        ? normalizeDirectoryFilterValue(def, notionFacetSourceValue(selected)) : null;
      // A signed blank select clears only this one structured value; it never
      // implies "no". Missing/unmentioned properties remain untouched.
      if (normalized && normalized.status !== "known") {
        failures.push(id);
        continue;
      }
      try {
        // SQL is the only filter owner: a signed Notion event changes only
        // the selected filter row, without parsing or rewriting historic JSON.
        const row = await database.prepare(`
          SELECT updated_at,
            (SELECT f.value_text FROM directory_profile_filter_values f
             WHERE f.profile_id=directory_profiles.id
               AND f.category=? AND f.filter_id=?) AS sql_filter_value
          FROM directory_profiles WHERE id=? LIMIT 1
        `).bind(current.category, id, current.id).first<{
          updated_at: string; sql_filter_value: string | null;
        }>();
        if (!row) throw new Error("DIRECTORY_FACET_PROFILE_MISSING");
        const desired = selected ? normalized!.value : null;
        if (!directoryNotionFacetRequiresSqlMirror({
          sqlValue: row.sql_filter_value, selected: desired,
        })) continue;
        const now = new Date().toISOString();
        const canonical = database.prepare(`UPDATE directory_profiles
          SET updated_at=?, updated_by=?
          WHERE id=? AND category=? AND updated_at=? AND status<>'archived' RETURNING id`)
          .bind(now, SYSTEM_ACTOR, current.id, current.category, row.updated_at);
        const mirror = planDirectory0170FilterSqlMirror({
          profileId: current.id, category: current.category as ServiceFilterCategory,
          values: { [id]: desired },
          updatedAt: now, actor: SYSTEM_ACTOR,
        });
        const response = await database.batch([
          canonical, ...mirror.map(item=>database.prepare(item.sql).bind(...item.bindings)),
        ]);
        if (!(response[0]?.results?.[0] as {id?:number}|undefined)?.id)
          throw new Error("DIRECTORY_FACET_WRITE_CONFLICT");
        current = (await getManagedDirectoryProfileById(current.id, database)) ?? current;
        facetsUpdated = true;
      } catch (error) {
        console.error("DIRECTORY_FACET_FIELD_WRITE_FAILED", current.id, id,
          error instanceof Error ? error.name : "UNKNOWN");
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
    // A verified edit of Popis does not prove an old services deletion or
    // unrelated identity conflict has been resolved. Re-read metadata before
    // acknowledging to avoid erasing a newer independent error.
    const latestMetadata = await fetchNotionPage(bindings, page.id);
    const canClearError = directoryEditorialEventMayClearError(
      propertyText(latestMetadata, "Sync chyba"), paths,
    );
    await patchNotionPage(bindings, page.id, canClearError ? {
      "Sync stav": select("Synchronizované"),
      "Sync chyba": richText(""),
      "Posledný sync": date(now),
    } : {
      "Posledný sync": date(now),
    });
    return updated || relationsUpdated || facetsUpdated || trustUpdated || pilotMetaUpdated
      ? "pulled" : "unchanged";
  }

  // One Admin Save mirrors the COMPLETE current D1 editorial snapshot.
  // Never take blank fallbacks from an earlier Notion page or dirty-field hints.
  // Services V3 and structural relations are managed by their own endpoints.
  const fields = [...new Set(input.adminChangedFields ?? [])].filter(
    (path): path is BreederEditorialField =>
      Object.hasOwn(BREEDER_NOTION_EDITORIAL_FIELDS, path) &&
      (path !== "services" || !isDirectoryEventPilotCategory(input.profile.category)),
  );
  if (!fields.length) return "unchanged";
  if (bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED === "true") {
    return syncUnifiedDirectoryEditorialFields({
      database, bindings, profile: input.profile, page, fields, direction: "push",
    });
  }
  const geo = await loadGeoMirror(database, input.profile.id);
  const monitor = await getMediaSourceMonitorForEntity(database, "DIRECTORY_PROFILE", input.profile.id);
  const sourceImageUrl = monitor?.sourceImageUrl || externalSourceImageUrl(input.profile.imageUrl);
  const allProperties = notionProfileProperties(input.profile, geo, "", now, sourceImageUrl);
  const canonical = profileSnapshot(input.profile, sourceImageUrl) as unknown as Record<string, unknown>;

  const mismatches = (candidate: NotionPage) => {
    if (candidate.id !== page.id) return fields;
    // Compare RAW Notion field text against the saved D1 fields. The inbound
    // notionSnapshot parser splits certain lists (e.g. qualifications), which
    // is suitable for Notion -> Admin but would falsely fail outbound parity.
    const actual: Record<string, unknown> = { seo: {} };
    for (const path of fields) {
      const key = BREEDER_NOTION_EDITORIAL_FIELDS[path];
      const value = path === "seo.noindex"
        ? property(candidate, key)?.checkbox : propertyText(candidate, key);
      if (path.startsWith("seo."))
        (actual.seo as Record<string, unknown>)[path.slice(4)] = value;
      else actual[path] = value;
    }
    return directoryNotionFullMirrorMismatches({
      expected: canonical,
      actual,
      presentNotionProperties: Object.keys(candidate.properties ?? {}),
      paths: fields,
    });
  };
  const ensureUnchangedD1 = async () => {
    const current = await getManagedDirectoryProfileById(input.profile.id, database);
    if (!current || current.updatedAt !== input.profile.updatedAt)
      throw new Error("DIRECTORY_ADMIN_TO_NOTION_D1_REVISION_CHANGED");
  };
  await ensureUnchangedD1();
  const desired: Record<string, unknown> = {};
  for (const path of fields)
    desired[BREEDER_NOTION_EDITORIAL_FIELDS[path]] = allProperties[BREEDER_NOTION_EDITORIAL_FIELDS[path]];

  // One PATCH for every mapped editable field, including unchanged and
  // intentionally empty values. We do not mark Notion synchronized yet.
  await patchNotionPage(bindings, page.id,
    adaptDirectoryNotionTextProperties(desired, page.properties ?? {}));
  let fresh = await fetchNotionPage(bindings, page.id);
  let failedFields = mismatches(fresh);
  if (failedFields.length) {
    // Notion may omit or reject an individual field. One retry only for those
    // fields avoids requiring the owner to manually save twice.
    const retry: Record<string, unknown> = {};
    for (const path of failedFields)
      retry[BREEDER_NOTION_EDITORIAL_FIELDS[path]] = allProperties[BREEDER_NOTION_EDITORIAL_FIELDS[path]];
    try {
      await patchNotionPage(bindings, page.id,
        adaptDirectoryNotionTextProperties(retry, fresh.properties ?? {}));
      fresh = await fetchNotionPage(bindings, page.id);
      failedFields = mismatches(fresh);
    } catch (error) {
      console.warn("DIRECTORY_ADMIN_TO_NOTION_RETRY_FAILED", input.profile.id, failedFields,
        error instanceof Error ? error.name : "UNKNOWN");
    }
  }
  if (failedFields.length) {
    console.error("DIRECTORY_ADMIN_TO_NOTION_FULL_PARITY_FAILED", input.profile.id, failedFields);
    throw new Error("DIRECTORY_ADMIN_TO_NOTION_FIELDS_PENDING: " + failedFields.join(","));
  }
  await ensureUnchangedD1();

  // The status update is a SECOND, distinct operation: only a fresh Notion
  // GET which agrees with every D1 field permits "Synchronizované".
  const canClearError = directoryEditorialEventMayClearError(
    propertyText(fresh, "Sync chyba"), fields,
  );
  const confirmedEcho = await patchNotionPage(bindings, page.id, canClearError ? {
    "Sync stav": select("Synchronizované"),
    "Sync chyba": richText(""),
    "Posledný sync": date(now),
  } : {
    "Posledný sync": date(now),
  });

  const finalPage = await fetchNotionPage(bindings, page.id);
  const finalFailed = mismatches(finalPage);
  if (finalFailed.length) {
    console.error("DIRECTORY_ADMIN_TO_NOTION_POST_STATUS_PARITY_FAILED", input.profile.id, finalFailed);
    throw new Error("DIRECTORY_ADMIN_TO_NOTION_FIELDS_PENDING: " + finalFailed.join(","));
  }
  await ensureUnchangedD1();
  if (confirmedEcho.id !== page.id || finalPage.id !== page.id ||
      !finalPage.last_edited_time ||
      (canClearError && propertyText(finalPage, "Sync stav") !== "Synchronizované"))
    throw new Error("DIRECTORY_ADMIN_TO_NOTION_FINAL_ACK_MISSING");
  // A separate pending error (Services V3, relations, etc.) must not be
  // misreported as complete success just because editorial fields match.
  if (!canClearError && propertyText(finalPage, "Sync stav") !== "Synchronizované")
    throw new Error("DIRECTORY_ADMIN_TO_NOTION_OTHER_ERROR_PENDING");

  // The revision belongs to our confirmed outbound Notion write. Its signed
  // webhook is an echo, not permission to overwrite the saved D1 form.
  await database.prepare(
    "UPDATE directory_notion_sync SET notion_last_edited_time = ? " +
    "WHERE directory_profile_id = ? AND notion_page_id = ? " +
    "AND (notion_last_edited_time IS NULL OR notion_last_edited_time <= ?)"
  ).bind(finalPage.last_edited_time, input.profile.id, page.id,
    finalPage.last_edited_time).run();
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
  if(input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text")return false;
  if (!input.fields.length ||
      await directoryProfileNotionSyncLocked(input.database, input.profileId)) return false;
  if (!notionFlagEnabled(input.bindings.NOTION_DIRECTORY_SYNC_ENABLED) ||
      !input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim() || !input.bindings.NOTION_API_TOKEN?.trim())
    throw new Error("DIRECTORY_FACET_NOTION_SYNC_DISABLED");
  const mapping = await loadMappingByProfile(input.database, input.profileId);
  const profile = await getManagedDirectoryProfileById(input.profileId, input.database);
  if (!mapping || !profile || !isDirectoryFieldEventCategory(profile.category) ||
      profile.status === "archived")
    throw new Error("DIRECTORY_FACET_NOTION_MAPPING_UNAVAILABLE");
  const page = await fetchNotionPage(input.bindings, mapping.notion_page_id);
  if (page.id !== mapping.notion_page_id ||
      !notionDirectoryPageBelongsToSource(page, input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID!) ||
      propertyText(page, "Psipedia ID") !== String(input.profileId))
    throw new NotionDirectoryUnsafeTargetError("DIRECTORY_FACET_TARGET_INVALID");

  if (input.bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED === "true") {
    return syncUnifiedDirectoryOperationalFields({
      database: input.database, bindings: input.bindings, profileId: input.profileId, pageId: page.id,
      fields: [...new Set(input.fields)].map(field => ({ kind: "facet" as const, field })), direction: "push",
    });
  }
  // One select field per PATCH, regardless of category. An unprovisioned
  // Notion property reports pending but cannot veto independent valid fields.
  const failures: string[] = [];
  let updated = false;
  for (const id of new Set(input.fields)) {
    const def = getDirectoryFilterDefinition(id);
    if (!def || def.category !== profile.category) {
      failures.push(id);
      continue;
    }
    const key = breederFacetNotionProperties[id];
    if (!key || !Object.hasOwn(page.properties ?? {}, key)) {
      failures.push(id);
      continue;
    }
    const state = normalizeDirectoryFilterValue(def, profile.importData?.[def.d1.key]);
    if (state.status !== "known" && state.status !== "missing") {
      failures.push(id);
      continue;
    }
    const expectedLabel = state.status === "known" ? notionFacetLabel(state.value) : "";
    if (propertyText(page, key) === expectedLabel) continue;
    try {
      const echoed = await patchNotionPage(input.bindings, page.id, {
        [key]: expectedLabel ? select(expectedLabel) : { select: null },
      });
      if (echoed.id !== page.id ||
          !Object.hasOwn(echoed.properties ?? {}, key) ||
          propertyText(echoed, key) !== expectedLabel) {
        const refreshed = await fetchNotionPage(input.bindings, page.id);
        if (refreshed.id !== page.id ||
            !Object.hasOwn(refreshed.properties ?? {}, key) ||
            propertyText(refreshed, key) !== expectedLabel)
          throw new Error("DIRECTORY_FACET_WRITEBACK_UNVERIFIED");
      }
      updated = true;
    } catch (error) {
      console.error("DIRECTORY_FACET_WRITEBACK_FAILED", input.profileId, id,
        error instanceof Error ? error.name : "UNKNOWN");
      failures.push(id);
    }
  }
  if (failures.length)
    throw new Error("DIRECTORY_FACET_FIELDS_PENDING: " + failures.join(","));
  if (!updated) return false;
  const latestMetadata = await fetchNotionPage(input.bindings, page.id);
  // Facet updates do not clear an unrelated editorial/services conflict.
  const canClearError = directoryEditorialEventMayClearError(
    propertyText(latestMetadata, "Sync chyba"), [],
  );
  await patchNotionPage(input.bindings, page.id, canClearError ? {
    "Sync stav": select("Synchronizované"),
    "Sync chyba": richText(""),
    "Posledný sync": date(new Date().toISOString()),
  } : {
    "Posledný sync": date(new Date().toISOString()),
  });
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
  if(input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text")return false;
  if (!input.fields.length ||
      await directoryProfileNotionSyncLocked(input.database, input.profileId)) return false;
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
  if(input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text")return false;
  if (await directoryProfileNotionSyncLocked(input.database, input.profileId)) return false;
  if (!input.fields.length || !notionFlagEnabled(input.bindings.NOTION_DIRECTORY_SYNC_ENABLED) ||
      !input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim() || !input.bindings.NOTION_API_TOKEN?.trim())
    return false;
  const mapping = await loadMappingByProfile(input.database, input.profileId);
  const profile = await getManagedDirectoryProfileById(input.profileId, input.database);
  if (!mapping || !profile || !["chovatelske-stanice", "chovatelske-kluby"].includes(profile.category)) return false;
  const page = await fetchNotionPage(input.bindings, mapping.notion_page_id);
  if (page.id !== mapping.notion_page_id ||
      !notionDirectoryPageBelongsToSource(page, input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID!)) return false;
  if (propertyText(page, "Psipedia ID") !== String(input.profileId)) return false;
  if (input.bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED === "true") {
    return syncUnifiedDirectoryBreederRelations({
      database: input.database, bindings: input.bindings, profileId: input.profileId,
      pageId: page.id, fields: input.fields, direction: "push",
    });
  }
  const selected = await getBreederRelationSelection(input.database, input.profileId);
  if (!selected) return false;
  const options = await listBreederRelationOptions(input.database);
  const patch: Record<string, unknown> = {};
  for (const field of input.fields) {
    if (profile.category === "chovatelske-kluby" && field !== "breedIds") continue;
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

/**
 * Older mapped Directory profiles can carry a stale BASELINE_UNAVAILABLE error
 * after they were migrated to immediate per-field events. Repair their common
 * receipt only when the FULL current editorial snapshots are identical.
 * A differing value, wrong owner, stale page or concurrent Admin write leaves
 * both sides and their existing error untouched.
 */
async function recoverEqualLegacyDirectoryBaseline(input:{
 database:D1Database;bindings:NotionDirectorySyncBindings;dataSourceId:string;
 page:NotionPage;mapping:DirectoryNotionMapping;profile:ManagedDirectoryProfile;
}):Promise<boolean>{
 const {database,bindings,dataSourceId,page,mapping,profile}=input;
 if(page.id!==mapping.notion_page_id||
    propertyText(page,"Psipedia ID")!==String(profile.id)||
    !notionDirectoryPageBelongsToSource(page,dataSourceId)||
    !recoverableDirectoryBaselineError(propertyText(page,"Sync stav"),propertyText(page,"Sync chyba")))
   return false;
 const monitor=await getMediaSourceMonitorForEntity(database,"DIRECTORY_PROFILE",profile.id);
 const imageUrl=monitor?.sourceImageUrl||externalSourceImageUrl(profile.imageUrl);
 const canonical=await snapshotHash(profileSnapshot(profile,imageUrl));
 if(canonical!==await snapshotHash(notionSnapshot(page)))return false;
 const latest=await fetchNotionPage(bindings,page.id);
 const current=await getManagedDirectoryProfileById(profile.id,database);
 if(!current||current.updatedAt!==profile.updatedAt||
    latest.id!==page.id||!notionDirectoryPageBelongsToSource(latest,dataSourceId)||
    propertyText(latest,"Psipedia ID")!==String(profile.id)||
    canonical!==await snapshotHash(notionSnapshot(latest))||
    canonical!==await snapshotHash(profileSnapshot(current,imageUrl)))
   return false;
 // Reuse the existing echo-verified writer: this writes only the necessary
 // metadata when content is already equal, then records its D1 field baseline.
 await writeProfileToNotion({database,bindings,dataSourceId,profile:current,pageId:page.id});
 return true;
}


/** Category memberships are structural events; never run a whole-profile import. */
function additionalCategoriesEvent(page: NotionPage, changes: readonly string[]) {
  const prop = property(page, "Ďalšie kategórie");
  return changes.some((id) => id === "Ďalšie kategórie" || id === prop?.id);
}

/** Secondary memberships are a single typed set. Keep the primary category
 * and URL immutable; a missing/invalid multi-select is not an empty set. */
async function observeUnifiedDirectoryCategories(
  database: D1Database, bindings: NotionDirectorySyncBindings, profileId: number, pageId: string,
) {
  if (await directoryProfileNotionSyncLocked(database, profileId) ||
      await notionPageMustSkipInboundSync(database, pageId))
    throw Error("DIRECTORY_UNIFIED_LOCKED");
  const mapping = await loadMappingByProfile(database, profileId);
  const profile = await getManagedDirectoryProfileById(profileId, database);
  const sourceId = bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim();
  if (!sourceId || mapping?.notion_page_id !== pageId || !profile || profile.reviewed || profile.status === "archived")
    throw Error("DIRECTORY_UNIFIED_MAPPING_CHANGED");
  const page = await fetchNotionPage(bindings, pageId);
  if (page.id !== pageId || page.archived || page.in_trash ||
      !notionDirectoryPageBelongsToSource(page, sourceId) ||
      propertyText(page, "Psipedia ID") !== String(profileId) ||
      propertyText(page, "Kategória") !== profile.category)
    throw Error("DIRECTORY_UNIFIED_IDENTITY_MISMATCH");
  const cell = property(page, "Ďalšie kategórie");
  const raw = cell?.multi_select;
  if (!Array.isArray(raw) || raw.some(option => !option || typeof option !== "object" ||
      !directoryCategories.some(c => c.slug === (option as {name?: unknown}).name ||
        c.label === (option as {name?: unknown}).name)))
    throw Error("DIRECTORY_CATEGORIES_PROPERTY_INVALID");
  const slugs=raw.map(option=>directoryCategories.find(c=>c.slug===(option as {name?:unknown}).name||c.label===(option as {name?:unknown}).name)!.slug);
  if(bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text"&&
    (cell?.type!=="multi_select"||cell.has_more===true||raw.length>=25||new Set(slugs).size!==slugs.length||slugs.includes(profile.category)))
    throw Error("DIRECTORY_CATEGORIES_PROPERTY_INVALID");
  const current = await getManagedDirectoryProfileById(profileId, database);
  if (!current || current.updatedAt !== profile.updatedAt ||
      await directoryProfileNotionSyncLocked(database, profileId))
    throw Error("DIRECTORY_UNIFIED_REVISION_CHANGED");
  return { mapping, profile, page,
    // Strictly validated registry mapping above converts display labels to canonical slugs.
    authorityProperty:{type:"multi_select",multi_select:slugs.map(name=>({name}))},
    notion: { present: true as const, value: bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text"?normalizeAdditionalDirectoryCategories(slugs,profile.category):normalizeAdditionalDirectoryCategories(notionSnapshot(page).additionalCategories ?? [], profile.category) },
    psipedia: { present: true as const, value: normalizeAdditionalDirectoryCategories(profile.additionalCategories ?? [], profile.category) },
  };
}

async function reserveUnifiedDirectoryCategories(
  database: D1Database, bindings: NotionDirectorySyncBindings, profileId: number, pageId: string,
  direction: "pull" | "push" | "observe",
) {
  const observed = await observeUnifiedDirectoryCategories(database, bindings, profileId, pageId);
  const identity: FieldIdentity = { agenda: "directory", entityId: String(profileId), pageId, field: "additionalCategories" };
  const baseline = await readProfileFieldBaseline({
    database, agenda: "directory", entityId: profileId, pageId, expectedHash: observed.mapping.content_hash,
  });
  const receipt = await readUnifiedAdminEdit(database, identity, observed.profile.updatedAt);
  const reservation = await reserveUnifiedField({
    database, identity, direction, authorityBindings: bindings,authorityProperty:observed.authorityProperty,
    historicalBaseline: baseline ? {
      value: normalizeAdditionalDirectoryCategories(baseline.additionalCategories ?? [], observed.profile.category),
      version: observed.mapping.content_hash,
    } : null,
    notion: observed.notion, psipedia: observed.psipedia,
    psipediaEdit: receipt && Array.isArray(receipt.value) ? {
      ...receipt, value: normalizeAdditionalDirectoryCategories(receipt.value, observed.profile.category),
    } : undefined,
  });
  return { ...observed, reservation };
}

async function applyNotionAdditionalCategories(input: {
  database: D1Database; bindings: NotionDirectorySyncBindings;
  dataSourceId: string; page: NotionPage; mapping: DirectoryNotionMapping;
}): Promise<boolean> {
  if (await directoryProfileNotionSyncLocked(input.database,input.mapping.directory_profile_id))
    return false;
  const page = await fetchNotionPage(input.bindings, input.page.id);
  const profile = await getManagedDirectoryProfileById(input.mapping.directory_profile_id, input.database);
  if (!profile || profile.status === "archived" || profile.reviewed) throw Error("DIRECTORY_CATEGORIES_PROFILE_UNAVAILABLE");
  if (page.id !== input.mapping.notion_page_id ||
      !notionDirectoryPageBelongsToSource(page, input.dataSourceId) ||
      propertyText(page, "Psipedia ID") !== String(profile.id) ||
      propertyText(page, "Kategória") !== profile.category ||
      !Object.hasOwn(page.properties ?? {}, "Ďalšie kategórie"))
    throw new NotionDirectoryUnsafeTargetError("DIRECTORY_CATEGORIES_IDENTITY_CONFLICT");
  const unified = input.bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED === "true";
  const planned = unified ? await reserveUnifiedDirectoryCategories(
    input.database, input.bindings, profile.id, page.id, "pull",
  ) : null;
  if (planned && !planned.reservation) return false;
  if (planned && planned.profile.updatedAt !== profile.updatedAt)
    throw Error("DIRECTORY_UNIFIED_REVISION_CHANGED");
  const desired = planned ? planned.notion.value :
    normalizeAdditionalDirectoryCategories(notionSnapshot(page).additionalCategories ?? [], profile.category);
  // A signed Notion category edit confirms SQL membership even when it is
  // equal to a legacy JSON value. An explicit [] must remain authoritative.
  if (JSON.stringify(profile.additionalCategories ?? []) === JSON.stringify(desired))
    return false;
  if (await directoryProfileNotionSyncLocked(input.database, profile.id))
    throw Error("DIRECTORY_UNIFIED_LOCKED");
  const previous = Date.parse(profile.updatedAt);
  const now = new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString();
  // The current D1 SQL category relation is authoritative. Notion only
  // triggers an explicit SQL edit; no JSON copy or confirmation flag.
  const authority=planned?.reservation?.profileAuthority===true;
  if(authority){
    const fresh=await observeUnifiedDirectoryCategories(input.database,input.bindings,profile.id,page.id);
    if(fresh.profile.updatedAt!==planned!.profile.updatedAt||fresh.page.last_edited_time!==planned!.page.last_edited_time||JSON.stringify(fresh.notion)!==JSON.stringify(planned!.notion))throw Error("DIRECTORY_UNIFIED_REVISION_CHANGED");
    await assertUnifiedReservationCurrent(input.database,planned!.reservation!);
  }
  const canonical = input.database.prepare(`
    UPDATE directory_profiles
    SET updated_at = ?, updated_by = ?
    WHERE id = ? AND category = ? AND status <> 'archived'
      AND updated_at = ?
      ${authority?`AND NOT EXISTS(SELECT 1 FROM directory_profile_review_state s WHERE s.profile_id=directory_profiles.id AND (length(trim(COALESCE(s.reviewed_at,\'\')))>0 OR s.unlock_pending=1))
      AND NOT EXISTS(SELECT 1 FROM partner_resources r JOIN partner_memberships m ON m.resource_id=r.id WHERE r.entity_type=\'DIRECTORY_PROFILE\' AND r.directory_profile_id=directory_profiles.id AND m.revoked_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones t WHERE t.kind=\'directory\' AND t.record_id=directory_profiles.id)
      AND NOT EXISTS(SELECT 1 FROM notion_unified_manual_fence f WHERE f.agenda=\'directory\' AND f.entity_id=CAST(directory_profiles.id AS TEXT))
      AND EXISTS(SELECT 1 FROM directory_notion_sync m WHERE m.directory_profile_id=directory_profiles.id AND m.notion_page_id=?)
      AND EXISTS(SELECT 1 FROM notion_unified_field_state s WHERE s.agenda=\'directory\' AND s.entity_id=CAST(directory_profiles.id AS TEXT) AND s.notion_page_id=? AND s.field_key=\'additionalCategories\' AND s.version=? AND s.status=\'PENDING\')`:``}
    RETURNING id
  `).bind(now, SYSTEM_ACTOR,
    profile.id, profile.category, profile.updatedAt,...(authority?[page.id,page.id,planned!.reservation!.version]:[]));
  const mirror = planDirectorySecondaryCategorySqlMirror({
    profileId:profile.id,primaryCategory:profile.category,submitted:desired,
    updatedAt:now,actor:SYSTEM_ACTOR,
  });
  const results = await input.database.batch([
    canonical, ...mirror.map(item=>input.database.prepare(item.sql).bind(...item.bindings)),
  ]);
  if (!(results[0]?.results?.[0] as {id?:number}|undefined)?.id)
    throw Error("DIRECTORY_CATEGORIES_SAVE_CONFLICT");
  const current = await getManagedDirectoryProfileById(profile.id, input.database);
  if (!current || JSON.stringify(current.additionalCategories ?? []) !== JSON.stringify(desired))
    throw Error("DIRECTORY_CATEGORIES_SAVE_UNCONFIRMED");
  if (planned?.reservation) {
    const fresh = await observeUnifiedDirectoryCategories(input.database, input.bindings, profile.id, page.id);
    await confirmUnifiedField(input.database, planned.reservation, fresh.notion, fresh.psipedia);
  }
  return true;
}

export async function mirrorDirectoryAdditionalCategoriesToNotion(input: {
  database: D1Database; bindings: NotionDirectorySyncBindings; profileId: number;
}): Promise<boolean> {
  if(input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text")return false;
  if (await directoryProfileNotionSyncLocked(input.database, input.profileId)) return false;
  if (!notionFlagEnabled(input.bindings.NOTION_DIRECTORY_SYNC_ENABLED) ||
      !input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim() || !input.bindings.NOTION_API_TOKEN?.trim())
    throw Error("DIRECTORY_CATEGORIES_NOTION_DISABLED");
  const profile = await getManagedDirectoryProfileById(input.profileId, input.database);
  const mapping = await loadMappingByProfile(input.database, input.profileId);
  if (!profile || !mapping || profile.status === "archived" || profile.reviewed)
    throw Error("DIRECTORY_CATEGORIES_NOTION_MAPPING_MISSING");
  const page = await fetchNotionPage(input.bindings, mapping.notion_page_id);
  if (page.id !== mapping.notion_page_id ||
      !notionDirectoryPageBelongsToSource(page, input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID!) ||
      propertyText(page, "Psipedia ID") !== String(profile.id) ||
      propertyText(page, "Kategória") !== profile.category ||
      !Object.hasOwn(page.properties ?? {}, "Ďalšie kategórie"))
    throw new NotionDirectoryUnsafeTargetError("DIRECTORY_CATEGORIES_NOTION_IDENTITY_CONFLICT");
  const unified = input.bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED === "true";
  const planned = unified ? await reserveUnifiedDirectoryCategories(
    input.database, input.bindings, profile.id, page.id, "push",
  ) : null;
  if (planned && !planned.reservation) return false;
  if (planned && planned.profile.updatedAt !== profile.updatedAt)
    throw Error("DIRECTORY_UNIFIED_REVISION_CHANGED");
  const desired = planned ? planned.psipedia.value :
    normalizeAdditionalDirectoryCategories(profile.additionalCategories ?? [], profile.category);
  if (JSON.stringify(notionSnapshot(planned?.page ?? page).additionalCategories ?? []) === JSON.stringify(desired)) return false;
  if (await directoryProfileNotionSyncLocked(input.database, profile.id))
    throw Error("DIRECTORY_UNIFIED_LOCKED");
  const payload = { "Ďalšie kategórie": { multi_select: desired.map((slug) => ({
    name: directoryCategories.find((entry) => entry.slug === slug)?.label ?? slug,
  })) } };
  const echo = await patchNotionPage(input.bindings, page.id, payload);
  const matches = (candidate: NotionPage) => candidate.id === page.id &&
    JSON.stringify(notionSnapshot(candidate).additionalCategories ?? []) === JSON.stringify(desired);
  if (!matches(echo) && !matches(await fetchNotionPage(input.bindings, page.id)))
    throw Error("DIRECTORY_CATEGORIES_NOTION_ECHO_MISMATCH");
  if (planned?.reservation) {
    const fresh = await observeUnifiedDirectoryCategories(input.database, input.bindings, profile.id, page.id);
    await confirmUnifiedField(input.database, planned.reservation, fresh.notion, fresh.psipedia);
  }
  // Do not alter the shared editorial hash or clear another field's conflict.
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
  if(input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text"){
    if(input.bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED!=="true")throw Error("PROFILE_AUTHORITY_REQUIRES_V2");
    if(input.manualDirection||input.forcePsipediaPush)throw Error("PROFILE_AUTHORITY_LEGACY_TRANSFER_DISABLED");
    if(input.breederAdminFields!==undefined)return "unchanged" as const;
  }
  if (await notionPageMustSkipInboundSync(input.database,input.mapping.notion_page_id)) return "unchanged" as const;
  if (await directoryProfileNotionSyncLocked(input.database, input.mapping.directory_profile_id))
    return "unchanged" as const;
  const profile = await getManagedDirectoryProfileById(input.mapping.directory_profile_id, input.database);
  if (!profile || profile.reviewed) return "unchanged" as const;

  let page = input.page ?? await fetchNotionPage(input.bindings, input.mapping.notion_page_id);
  if (page.id !== input.mapping.notion_page_id) {
    throw new NotionDirectoryUnsafeTargetError("IDENTITY_CONFLICT: Notion page ID nezodpovedá existujúcemu mapovaniu.");
  }
  // A mapping alone does not grant write access to a page moved out of the
  // canonical Directory data source. Never PATCH an unrelated Notion page.
  if (!notionDirectoryPageBelongsToSource(page, input.dataSourceId)) {
    throw new NotionDirectoryUnsafeTargetError("IDENTITY_CONFLICT: Notion profil už nepatrí do databázy Adresár.");
  }

  if(input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text"){
    if(propertyText(page,"Psipedia ID")!==String(profile.id)||page.archived||page.in_trash)
      throw new NotionDirectoryUnsafeTargetError("DIRECTORY_AUTHORITY_IDENTITY_MISMATCH");
    if(input.breederWebhookPropertyIds===undefined)return "unchanged" as const;
    return syncBreederEvent({database:input.database,bindings:input.bindings,page,profile,
      changedPropertyIds:input.breederWebhookPropertyIds});
  }

  // A historical missing-baseline marker is obsolete if and only if both
  // current editable snapshots already agree. Never resolve differing values.
  if(isDirectoryFieldEventCategory(profile.category)&&!input.manualDirection&&
     propertyText(page,"Sync stav")==="Chyba"&&
     propertyText(page,"Sync chyba").includes("BASELINE_UNAVAILABLE")&&
     await recoverEqualLegacyDirectoryBaseline({
       database:input.database,bindings:input.bindings,dataSourceId:input.dataSourceId,
       page,mapping:input.mapping,profile,
     }))return "pushed" as const;

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
    if (input.bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED !== "true" && profile.status !== "archived" &&
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
  if (isDirectoryFieldEventCategory(profile.category) && profile.category !== "treneri" &&
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
    if (input.bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED !== "true" && isDirectoryAdminWritebackEcho(
      page.last_edited_time, input.mapping.notion_last_edited_time,
      input.breederWebhookPropertyIds !== undefined,
    )) {
      // Identical Notion timestamps do not prove a webhook is our own echo.
      // A genuine edit can happen immediately after Admin write-back.
      // Compare the signed editorial values to the current persisted D1 values.
      const changedIds = input.breederWebhookPropertyIds ?? [];
      const paths = breederNotionChangedFields(page.properties, changedIds);
      const fromNotion = notionSnapshot(page) as unknown as Record<string, unknown>;
      const fromD1 = profileSnapshot(profile) as unknown as Record<string, unknown>;
      const editorialIds = new Set<string>();
      for (const path of Object.keys(BREEDER_NOTION_EDITORIAL_FIELDS) as BreederEditorialField[]) {
        const name = BREEDER_NOTION_EDITORIAL_FIELDS[path];
        editorialIds.add(name);
        const record = page.properties?.[name] as { id?: unknown } | undefined;
        if (typeof record?.id === "string") editorialIds.add(record.id);
      }
      // Do not discard signed filter, trainer-trust or relation events just
      // because a separate editorial field still matches D1.
      const editorialOnly = changedIds.every(id => editorialIds.has(id));
      const unchangedSignedValues = paths.length > 0 && paths.every(path =>
        JSON.stringify(breederReadPath(fromNotion, path)) ===
        JSON.stringify(breederReadPath(fromD1, path)));
      if (editorialOnly && unchangedSignedValues) return "unchanged";
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
        // A verified common snapshot proves which side actually changed.
        // Historic static "notion/admin" preferences cannot undo that one edit.
        changedSideWins: true,
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
        slug: ["Slug"], category: ["Kategória"], additionalCategories: ["Ďalšie kategórie"],
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
  if(input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text"){
    const result=await createStagedDirectoryCopy(input.database,input.bindings,dataSourceId,input.profileId,input.allowCreate);
    return {notionPageId:result.pageId,created:result.created};
  }
  const profile = await getManagedDirectoryProfileById(input.profileId, input.database);
  if (!profile || profile.status !== "draft" || profile.reviewed ||
      await directoryProfileNotionSyncLocked(input.database, input.profileId))
    throw new Error("GEMINI_NOTION_CANONICAL_DRAFT_MISSING");
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

  const bootstrapIds = await bootstrapProfileIds(input.database,input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text");
  summary.selected = bootstrapIds.length;

  for (const profileId of bootstrapIds) {
    try {
      const profile = await getManagedDirectoryProfileById(profileId, input.database);
      if(!profile)continue;
      if(input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text"){
        await createStagedDirectoryCopy(input.database,input.bindings,dataSourceId,profileId);
        summary.bootstrapped++;await recordNotionTransfer(input.database,"directory:"+profile.category,"ADMIN_TO_NOTION",1);continue;
      }
      if (profile.category === "chovatelske-stanice" || profile.reviewed) continue;
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

  summary.hasMore = (await bootstrapProfileIds(input.database,input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text")).length > 0;
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
  async function syncRelation(pageId: string, profileId: number, notionExplicitEdit = false,
    adminChoiceSave = false) {
    if(input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text"&&adminChoiceSave)return "skipped" as const;
    if (await directoryProfileNotionSyncLocked(input.database, profileId))
      return "skipped" as const;
    relationSchemaReady ??= input.database.prepare(
      "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='directory_service_notion_relation_sync'"
    ).first<{ok:number}>().then(Boolean);
    if (!await relationSchemaReady) return "skipped" as const;
    const profile = await getManagedDirectoryProfileById(profileId, input.database);
    if (!profile) throw new Error("SERVICES_RELATION_PROFILE_NOT_FOUND");
    if (profile.reviewed) return "skipped" as const;
    lookupPromise ??= loadNotionCatalogRelationLookup(input.bindings);
    return syncProfileCatalogRelation({
      db: input.database, bindings: input.bindings, pageId, profileId,
      category: profile.category, directoryDataSourceId: dataSourceId,
      lookup: await lookupPromise, notionExplicitEdit, adminChoiceSave,
      unifiedFieldPolicy: input.bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED === "true",
    });
  }

  // Admin -> Notion fast path: no data-source query, backfill or unrelated profiles.
  // It reuses the verified per-field reconciliation and never creates mappings.
  if (input.targetProfileId !== undefined) {
    if (!Number.isSafeInteger(input.targetProfileId) || input.targetProfileId <= 0)
      throw new Error("NOTION_TARGET_PROFILE_INVALID");
    const mapping = await loadMappingByProfile(input.database, input.targetProfileId);
    if (!mapping) return summary;
    // Never run the ordinary (potentially inbound) merge while an owner
    // unlock still needs its authoritative full D1 -> Notion rebaseline.
    if (await directoryProfileOwnerUnlockPending(input.database, input.targetProfileId)) {
      try {
        const completed = await completeDirectoryReviewedOwnerUnlock({
          database: input.database, bindings: input.bindings, profileId: input.targetProfileId,
        });
        if (completed === "unlocked") {
          summary.pushedToNotion++;
          await recordDirectoryTransfer(input.database, input.targetProfileId, "ADMIN_TO_NOTION");
        } else summary.failed++;
      } catch (error) {
        summary.failed++;
        console.warn("DIRECTORY_OWNER_UNLOCK_TARGET_RETRY_FAILED", input.targetProfileId,
          error instanceof Error ? error.message : String(error));
      }
      return summary;
    }
    try {
      const reviewed = await syncDirectoryReviewedWithNotion({
        database: input.database, bindings: input.bindings,
        profileId: input.targetProfileId,
      });
            if (reviewed === "pushed") summary.pushedToNotion++;
    } catch (error) {
      // The new checkbox must never prevent unrelated editorial sync.
      summary.failed++;
      console.warn("DIRECTORY_REVIEW_NOTION_TARGET_SYNC_FAILED", input.targetProfileId,
        error instanceof Error ? error.message : String(error));
    }
    if (await directoryProfileNotionSyncLocked(input.database, input.targetProfileId)) {
      summary.unchanged++;
      return summary;
    }
    // The Admin's explicit Odkontrolované marker is an immediate bidirectional
    // lock. The isolated checkbox mirror above is the only permitted Notion PATCH.
    if ((await getManagedDirectoryProfileById(input.targetProfileId, input.database))?.reviewed) {
      summary.unchanged++;
      return summary;
    }
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
      // Without a confirmed baseline, absence never implies deletion.
      if (input.syncServiceRelations || input.manualDirection === "NOTION_TO_ADMIN") {
        const relation = await syncRelation(mapping.notion_page_id, input.targetProfileId,
          input.manualDirection === "NOTION_TO_ADMIN", input.syncServiceRelations === true);
        summary.serviceRelationSync = relation;
        if (relation === "skipped") summary.failed++;
      }
    } catch (error) {
      // D1 remains committed. A failed full-profile parity check must also
      // invalidate Notion's former "Synchronizované" badge, never report a
      // successful mirror when some values are missing.
      console.error("DIRECTORY_TARGETED_NOTION_SYNC_FAILED", input.targetProfileId,
        error instanceof Error ? error.message : "UNKNOWN");
      if (error instanceof Error && error.message.startsWith("DIRECTORY_ADMIN_TO_NOTION_")) {
        try {
          const failedPage = await fetchNotionPage(input.bindings, mapping.notion_page_id);
          if (failedPage.id === mapping.notion_page_id &&
              notionDirectoryPageBelongsToSource(failedPage, dataSourceId) &&
              propertyText(failedPage, "Psipedia ID") === String(input.targetProfileId))
            await markPageError(input.bindings, failedPage.id, error, failedPage);
        } catch (markError) {
          console.warn("DIRECTORY_ADMIN_TO_NOTION_ERROR_STATUS_PENDING", input.targetProfileId,
            markError instanceof Error ? markError.name : "UNKNOWN");
        }
      }
      summary.failed++;
    }
    return summary;
  }

  // Pending unlocks have no live Notion baseline until the D1 snapshot has
  // been acknowledged. Retry independently of updated_at and category; the
  // normal changed-profile queue deliberately excludes several categories.
  const completedOwnerUnlockIds = new Set<number>();
  if (!input.targetPageId) {
    const pending = await input.database.prepare(`
      SELECT s.profile_id FROM directory_profile_review_state s
      JOIN directory_profiles p ON p.id=s.profile_id
      WHERE s.unlock_pending=1 AND COALESCE(TRIM(s.reviewed_at),'')=''
        AND p.status<>'archived'
      ORDER BY s.updated_at ASC, s.profile_id ASC LIMIT 10
    `).all<{profile_id: number}>();
    for (const row of pending.results) {
      if (!await directoryProfileOwnerUnlockPending(input.database, row.profile_id)) continue;
      try {
        const completed = await completeDirectoryReviewedOwnerUnlock({
          database: input.database, bindings: input.bindings, profileId: row.profile_id,
        });
        if (completed === "unlocked") {
          completedOwnerUnlockIds.add(row.profile_id);
          summary.pushedToNotion++;
          await recordDirectoryTransfer(input.database, row.profile_id, "ADMIN_TO_NOTION");
        } else summary.failed++;
      } catch (error) {
        summary.failed++;
        console.warn("DIRECTORY_OWNER_UNLOCK_SCHEDULED_RETRY_FAILED", row.profile_id,
          error instanceof Error ? error.message : String(error));
      }
    }
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
    if(input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text"){
      try{
        const older=await rotateNotionDiscovery<NotionPage>({
          database:input.database,bindings:input.bindings,agenda:"directory",sourceId:dataSourceId,limit:20,
        });
        pages=mergeNotionDiscovery(older,pages);
      }catch{
        // Preserve the recent safety net; surface incomplete rotation.
        summary.failed++;
        console.warn("NOTION_DISCOVERY_ROTATION_FAILED",{agenda:"directory"});
      }
    }
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
  const attemptedMappedProfileIds = new Set<number>(completedOwnerUnlockIds);

  for (const candidate of pages) {
    if (await notionPageMustSkipInboundSync(input.database,candidate.id)) continue;
    // Field-event profiles must never undergo a record-wide hourly merge.
    // Independently retry Services V3 relations for recently edited profiles:
    // missing/failed Notion relation events must not strand canonical choices.
    if (!input.targetPageId && isDirectoryFieldEventCategory(propertyText(candidate, "Kategória"))) {
      const mapped = await loadMappingByPage(input.database, candidate.id);
      if (mapped && mapped.content_hash!==PROFILE_INBOUND_ID_PENDING && propertyText(candidate, "Psipedia ID") === String(mapped.directory_profile_id)) {
        try {
          try {
            const reviewed = await syncDirectoryReviewedWithNotion({
              database: input.database, bindings: input.bindings,
              profileId: mapped.directory_profile_id, page: candidate,
            });
                        if (reviewed === "pushed") summary.pushedToNotion++;
          } catch (error) {
            summary.failed++;
            console.warn("DIRECTORY_REVIEW_NOTION_EVENT_SYNC_FAILED", mapped.directory_profile_id,
              error instanceof Error ? error.message : String(error));
          }
          if (await directoryProfileNotionSyncLocked(input.database,mapped.directory_profile_id)) {
            summary.unchanged++;
            continue;
          }
          const current=await getManagedDirectoryProfileById(mapped.directory_profile_id,input.database);
          if (current?.reviewed) { summary.unchanged++; continue; }
          if(current&&await recoverEqualLegacyDirectoryBaseline({
            database:input.database,bindings:input.bindings,dataSourceId,
            page:candidate,mapping:mapped,profile:current,
          }))summary.pushedToNotion++;
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
      const staged=input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text";
      if (privateImport || propertyText(page, "Vytvoril") === "Gemini automatizácia") {
        // Rejected/not-yet-approved Notion-only records cannot recover a mapping
        // or create/modify a canonical profile.
        if (!propertyText(page, "Psipedia ID") && !notionProfileReadyForCreate(page, trustedGemini, staged) && !operatorLegacy) continue;
        release = await acquireGeminiNotionLock(input.database, page.id);
        if (!release) continue;
        page = await fetchNotionPage(input.bindings, page.id);
        if (input.targetPageId && input.expectedNotionRevision && page.last_edited_time !== input.expectedNotionRevision)
          throw new Error("GEMINI_SAVED_REVISION_CHANGED");
        if (!propertyText(page, "Psipedia ID") && !notionProfileReadyForCreate(page, trustedGemini, staged) && !operatorLegacy) continue;
      }
      let mapping = await loadMappingByPage(input.database, page.id);
      if (!mapping) mapping = await recoverMappingFromPage({ database: input.database, page });

      // Pilot covers existing linked IDs only: never create duplicate canonical profiles.
      if (!mapping && !staged && isDirectoryEventPilotCategory(propertyText(page, "Kategória"))) continue;
      if (!mapping && (notionProfileReadyForCreate(page, trustedGemini, staged) || operatorLegacy)) {
        if (privateImport||staged) {
          // Serialize canonical duplicate-check + INSERT across different Notion IDs.
          releaseImport = await acquireGeminiNotionLock(input.database, "directory-import");
          if (!releaseImport) continue;
        }
        if(staged){
          if(!release){release=await acquireGeminiNotionLock(input.database,page.id);if(!release)continue;}
          if(await loadMappingByPage(input.database,page.id))continue;
          const fresh=await fetchNotionPage(input.bindings,page.id);
          if(fresh.last_edited_time!==page.last_edited_time||fresh.archived||fresh.in_trash||!notionDirectoryPageBelongsToSource(fresh,dataSourceId)||propertyText(fresh,"Psipedia ID")||propertyCheckbox(fresh,"Odkontrolované"))throw Error("DIRECTORY_INBOUND_IDENTITY_CHANGED");
          const desired=notionSnapshot(fresh);
          const slugDuplicate=desired.slug?await input.database.prepare("SELECT id FROM directory_profiles WHERE slug=? LIMIT 1").bind(desired.slug).first<{id:number}>():null;
          const identityRows=await input.database.prepare("SELECT id,name,category,status,city,website_url,public_phone AS phone,public_email AS email,NULL AS additional_categories_json FROM directory_profiles ORDER BY id LIMIT 5001").all<DirectoryAuditRow>();
          if(!identityRows.success||identityRows.results.length>5000)throw Error("DIRECTORY_DUPLICATE_SCAN_INCOMPLETE");
          const duplicate=findDirectoryInboundDuplicate({name:desired.name,category:desired.category,status:"draft",city:desired.city,website_url:desired.websiteUrl,phone:desired.publicPhone,email:desired.publicEmail,additional_categories_json:null},identityRows.results);
          if(slugDuplicate||duplicate)throw Error("DIRECTORY_INBOUND_DUPLICATE_REVIEW");
          page=fresh;
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
          contentHash:staged?PROFILE_INBOUND_ID_PENDING:contentHash,
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
        if(staged){
          await acknowledgeStagedDirectoryDraft(input.database,input.bindings,dataSourceId,created,page.id);
          // Initial structured fields use the SAME guarded existing adapters as ordinary edits.
          const current=await fetchNotionPage(input.bindings,page.id);
          if(additionalCategoriesEvent(current,["Ďalšie kategórie"])){
            const linked=await loadMappingByProfile(input.database,created.id);
            if(linked)await applyNotionAdditionalCategories({database:input.database,bindings:input.bindings,mapping:linked,page:current,dataSourceId});
          }
          const live=await getManagedDirectoryProfileById(created.id,input.database);
          if(!live)throw Error("DIRECTORY_INBOUND_DRAFT_MISSING");
          await syncBreederEvent({database:input.database,bindings:input.bindings,page:current,profile:live,
            changedPropertyIds:[...Object.values(breederFacetNotionProperties),...Object.values(BREEDER_NOTION_RELATION_FIELDS),...PILOT_DIRECTORY_METADATA_FIELDS]});
          await syncRelation(page.id,created.id);
          summary.createdFromNotion++;await recordDirectoryTransfer(input.database,created.id,"NOTION_TO_ADMIN");continue;
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
      if(staged&&mapping.content_hash===PROFILE_INBOUND_ID_PENDING){
        const local=await getManagedDirectoryProfileById(mapping.directory_profile_id,input.database);
        if(!local)throw Error("DIRECTORY_INBOUND_DRAFT_MISSING");
        await acknowledgeStagedDirectoryDraft(input.database,input.bindings,dataSourceId,local,page.id);
        page=await fetchNotionPage(input.bindings,page.id);
        mapping=await loadMappingByPage(input.database,page.id);if(!mapping)throw Error("DIRECTORY_INBOUND_MAPPING_MISSING");
      }
      if (propertyText(page, "Psipedia ID") === String(mapping.directory_profile_id)) {
        try {
          const reviewed = await syncDirectoryReviewedWithNotion({
            database: input.database, bindings: input.bindings,
            profileId: mapping.directory_profile_id, page,
          });
                    if (reviewed === "pushed") summary.pushedToNotion++;
        } catch (error) {
          // Do not block other per-field events when review needs retry.
          summary.failed++;
          console.warn("DIRECTORY_REVIEW_NOTION_PAGE_SYNC_FAILED", mapping.directory_profile_id,
            error instanceof Error ? error.message : String(error));
        }
      }
      if (await directoryProfileNotionSyncLocked(input.database,mapping.directory_profile_id)) {
        summary.unchanged++;
        continue;
      }
      // After mirror reconciliation, an explicit review freezes this profile
      // before any relation, trust, editorial or sync-status writeback.
      if ((await getManagedDirectoryProfileById(mapping.directory_profile_id, input.database))?.reviewed) {
        summary.unchanged++;
        continue;
      }
      // Trust booleans and Services V3 relations are independent field events
      // for ALL directory categories. A change to either must not trigger a
      // legacy whole-profile merge, which can overwrite unrelated Admin data.
      const relationProp = page.properties?.["Služby z katalógu"] as { id?: unknown } | undefined;
      const changedIds = input.changedPropertyIds ?? [];
      const reviewProperty = property(page, "Odkontrolované");
      const onlyReviewed = changedIds.length > 0 && changedIds.every((id) =>
        id === "Odkontrolované" || id === reviewProperty?.id ||
        ["Sync stav", "Sync chyba", "Posledný sync", "Sync hash"].some((key) =>
          id === key || id === property(page, key)?.id));
      if (onlyReviewed) {
        // Signed review-only webhook: do not trigger the older whole-record
        // field or hash synchronizer, which could touch unrelated content.
        summary.unchanged++;
        continue;
      }
      const additionalChanged = additionalCategoriesEvent(page, changedIds);
      let categorySaved = false;
      let categoryError: unknown;
      if (additionalChanged) {
        categorySaved = await applyNotionAdditionalCategories({
          database: input.database, bindings: input.bindings, dataSourceId,
          page, mapping,
        }).catch(error => {
          if (input.bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED !== "true" ||
              error instanceof NotionDirectoryUnsafeTargetError) throw error;
          categoryError = error;
          return false;
        });
        const metadata = ["Sync stav", "Sync chyba", "Posledný sync", "Sync hash"];
        const onlyCategory = changedIds.length > 0 && changedIds.every((id) =>
          additionalCategoriesEvent(page, [id]) ||
          metadata.some((key) => id === key || id === property(page, key)?.id));
        if (onlyCategory) {
          if (categoryError) throw categoryError;
          if (categorySaved) summary.pulledFromNotion += 1;
          else summary.unchanged += 1;
          continue;
        }
      }
      const trustFields = changedTrainerTrustNotionFields(page.properties, changedIds);
      const relationChanged = changedIds.some(id =>
        id === "Služby z katalógu" || id === relationProp?.id);
      const onlyTrustOrServices = changedIds.length > 0 && changedIds.every(id =>
        id === "Služby z katalógu" || id === relationProp?.id ||
        (["verified", "featured"] as const).some(field => {
          const key = TRAINER_TRUST_NOTION_PROPERTIES[field];
          const raw = page.properties?.[key] as { id?: unknown } | undefined;
          return id === key || id === raw?.id;
        }) ||
        // A Notion confirmation may update sync metadata alongside the
        // relation itself. These fields must never trigger a whole-profile
        // merge that can overwrite independent Admin edits.
        ["Sync stav","Sync chyba","Posledný sync","Sync hash"].some(key => {
          const raw = page.properties?.[key] as { id?: unknown } | undefined;
          return id === key || id === raw?.id;
        }));
      if (onlyTrustOrServices && (trustFields.length || relationChanged)) {
        if (input.bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED === "true" && trustFields.length) {
          const latest = await getManagedDirectoryProfileById(mapping.directory_profile_id, input.database);
          const currentPage = await fetchNotionPage(input.bindings, page.id);
          if (relationChanged) {
            const relation = await syncRelation(page.id, mapping.directory_profile_id, true);
            summary.serviceRelationSync = relation;
            if (relation === "skipped") throw Error("DIRECTORY_SERVICES_RELATION_SCHEMA_MISSING");
          }
          if (!latest || categoryError || trustFields.some(field =>
            property(currentPage, TRAINER_TRUST_NOTION_PROPERTIES[field])?.checkbox !== latest[field]))
            throw Error("DIRECTORY_UNIFIED_PROTECTED_TRUST_REVIEW");
          if (categorySaved || summary.serviceRelationSync === "pulled" || summary.serviceRelationSync === "merged") summary.pulledFromNotion++;
          else summary.unchanged++;
          continue;
        }
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
        // A successfully reconciled relation or trust checkbox does not
        // resolve independent older field errors. Keep their Notion metadata.
        if(directoryServiceSuccessCanClear(propertyText(page,"Sync chyba"))){
          await patchNotionPage(input.bindings, page.id, {
            "Sync stav": select("Synchronizované"),
            "Sync chyba": richText(""),
            "Posledný sync": date(new Date().toISOString()),
          });
          await recordDirectoryNotionAlert(input.database, mapping.directory_profile_id,
            "resolved", "", "NOTION_TO_ADMIN");
        }
        if (trustUpdated || summary.serviceRelationSync === "pulled" || summary.serviceRelationSync === "merged")
          summary.pulledFromNotion += 1;
        else summary.unchanged += 1;
        continue;
      }
      // Breeders and trainers are field-event driven. Do not re-merge the
      // entire mapped profile during hourly sweeps after a partial event.
      if (!input.targetPageId && isDirectoryFieldEventCategory(propertyText(page, "Kategória"))) continue;

      if (
        input.bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED !== "true"
        && page.last_edited_time
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
      let editorialError: unknown;
      const result = await syncMappedPage({
        database: input.database,
        bindings: input.bindings,
        dataSourceId,
        mapping,
        page,
        breederWebhookPropertyIds: input.changedPropertyIds,
      }).catch(error => {
        if (input.bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED !== "true" ||
            error instanceof NotionDirectoryUnsafeTargetError) throw error;
        editorialError = error;
        return "unchanged" as const;
      });
      // A signed change to the canonical relation is independent of text fields.
      // A confirmed relation baseline permits precise deletion of an individual
      // service ID. Without that baseline, omission cannot authorize a delete.
      if (input.changedPropertyIds === undefined || relationChanged) {
        const relation = await syncRelation(page.id, mapping.directory_profile_id, relationChanged);
        summary.serviceRelationSync = relation;
        if (relation === "skipped" && relationChanged) summary.failed++;
      }
      if (categoryError) throw categoryError;
      if (editorialError) throw editorialError;
      // Do not dismiss the profile's existing pending alert just because a
      // different field (for example Popis instead of legacy Služby) synced.
      const canResolveEditorialAlert = !isDirectoryFieldEventCategory(propertyText(page, "Kategória"))
        || directoryEditorialEventMayClearError(
          propertyText(page, "Sync chyba"),
          breederNotionChangedFields(page.properties, input.changedPropertyIds ?? []),
        );
      if ((input.changedPropertyIds?.length || result !== "unchanged") && canResolveEditorialAlert)
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
    if (!mapping || await notionPageMustSkipInboundSync(input.database,mapping.notion_page_id)) continue;
    if (await directoryProfileNotionSyncLocked(input.database,profileId)) continue;
    const changedProfile = await getManagedDirectoryProfileById(profileId, input.database);
    if (changedProfile?.reviewed || (changedProfile && isDirectoryFieldEventCategory(changedProfile.category))) continue;
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
  const bootstrapIds = input.targetPageId ? [] : await bootstrapProfileIds(input.database,input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text");
  for (const profileId of bootstrapIds) {
    try {
      const profile = await getManagedDirectoryProfileById(profileId, input.database);
      if(!profile)continue;
      if(input.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text"){
        await createStagedDirectoryCopy(input.database,input.bindings,dataSourceId,profileId);
        summary.bootstrapped++;await recordNotionTransfer(input.database,"directory:"+profile.category,"ADMIN_TO_NOTION",1);continue;
      }
      if (profile.reviewed || ["chovatelske-stanice", "salony-a-sluzby"].includes(profile.category)) continue;
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
  if(!input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim())throw Error("TRANSFER_DIRECTORY_TARGET_MISSING");
  const profile=await getManagedDirectoryProfileById(input.profileId,input.database);
  if(!profile||"directory:"+profile.category!==input.scope)
    throw Error("TRANSFER_DIRECTORY_IDENTITY_MISMATCH");
  const mapping=await loadMappingByProfile(input.database,input.profileId);
  if(mapping?.notion_page_id!==input.pageId)throw Error("TRANSFER_IDENTITY_CHANGED");
  const page=await fetchNotionPage(input.bindings,input.pageId);
  assertManualRemoteIdentity({
    page, pageId: input.pageId, profileId: input.profileId,
    belongsToSource: notionDirectoryPageBelongsToSource(page,input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID??""),
    claimedId: propertyText(page,"Psipedia ID"),
  });
  if(page.id!==input.pageId)throw Error("TRANSFER_DIRECTORY_IDENTITY_MISMATCH");
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

/** Recovery uses the exact same field-scoped observers and does not replay
 * webhook events or bypass an Admin review lock. */
export async function recoverDirectoryV2Field(database:D1Database,bindings:NotionDirectorySyncBindings,
  id:number,pageId:string,field:string,direction:"observe"|"push"|"pull"="observe") {
  if(bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED!=="true"||!notionFlagEnabled(bindings.NOTION_DIRECTORY_SYNC_ENABLED))throw Error("DIRECTORY_V2_RECOVERY_DISABLED");
  if(field==="imageSourceUrl"){
    if(direction==="push")throw Error("NOTION_AUTHORITY_PULL_REQUIRED");
    await syncStagedDirectoryImageSource({database,bindings,profileId:id,pageId,direction});return;
  }
  if(field==="additionalCategories"){
    if(direction==="push"){const mapping=await loadMappingByProfile(database,id);if(mapping?.notion_page_id!==pageId)throw Error("DIRECTORY_V2_RECOVERY_SCOPE");await mirrorDirectoryAdditionalCategoriesToNotion({database,bindings,profileId:id});}
    else if(direction==="pull"){
      const mapping=await loadMappingByProfile(database,id);
      if(!mapping||mapping.notion_page_id!==pageId||!bindings.NOTION_DIRECTORY_DATA_SOURCE_ID)throw Error("DIRECTORY_V2_RECOVERY_SCOPE");
      await applyNotionAdditionalCategories({database,bindings,mapping,page:await fetchNotionPage(bindings,pageId),dataSourceId:bindings.NOTION_DIRECTORY_DATA_SOURCE_ID});
    } else await reserveUnifiedDirectoryCategories(database,bindings,id,pageId,"observe");return;
  }
  if(field.startsWith("meta:")){
    await syncUnifiedDirectoryOperationalFields({database,bindings,profileId:id,pageId,direction,fields:[{kind:"meta",field:field.slice(5)}]});return;
  }
  if(field.startsWith("facet:")){
    const [,category,key]=field.split(":");
    const profile=await getManagedDirectoryProfileById(id,database);
    if(!profile||!key||getDirectoryFilterDefinition(key)?.category!==category||(profile.category!==category&&!(bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text"&&profile.additionalCategories?.some(c=>c===category))))throw Error("DIRECTORY_V2_RECOVERY_SCOPE");
    await syncUnifiedDirectoryOperationalFields({database,bindings,profileId:id,pageId,direction,fields:[{kind:"facet",field:key}]});return;
  }
  if(field==="relation:breedIds"||field==="relation:clubIds"){
    await syncUnifiedDirectoryBreederRelations({database,bindings,profileId:id,pageId,direction,fields:[field.slice(9) as BreederRelationField]});return;
  }
  if(!Object.hasOwn(BREEDER_NOTION_EDITORIAL_FIELDS,field))throw Error("DIRECTORY_V2_RECOVERY_SCOPE");
  const profile=await getManagedDirectoryProfileById(id,database);
  if(!profile)throw Error("DIRECTORY_V2_RECOVERY_MISSING");
  const page=await fetchNotionPage(bindings,pageId);
  await syncUnifiedDirectoryEditorialFields({database,bindings,profile,page,direction,fields:[field as BreederEditorialField]});
}

export async function directoryV2RecoveryFields(database:D1Database,id:number):Promise<string[]>{
  const profile=await getManagedDirectoryProfileById(id,database);
  if(!profile||await directoryProfileNotionSyncLocked(database,id))return [];
  const fields=Object.keys(BREEDER_NOTION_EDITORIAL_FIELDS).filter(path=>path!=="seo.noindex"&&
    (path!=="services"||!isDirectoryEventPilotCategory(profile.category)));
  return [...new Set([...fields,"additionalCategories",
    ...PILOT_DIRECTORY_METADATA_FIELDS.filter(isDirectoryPublicMetadataField).map(field=>"meta:"+field),
    ...directoryFilterRegistry.filter(def=>def.category===profile.category).map(def=>"facet:"+profile.category+":"+def.id),
    ...(["chovatelske-stanice","chovatelske-kluby"].includes(profile.category)?["relation:breedIds"]:[]),
    ...(profile.category==="chovatelske-stanice"?["relation:clubIds"]:[])])].sort();
}
