import type { ManagedDirectoryProfile } from "@/lib/directory";
import {
  archiveManagedDirectoryProfile,
  createManagedDirectoryProfile,
  getManagedDirectoryProfileById,
  restoreManagedDirectoryProfile,
  updateManagedDirectoryProfile,
  type ManagedDirectoryProfileInput,
} from "@/lib/directory-store";
import {
  directoryQualityCheckedAtSummary,
  directoryQualityFields,
  readDirectoryPublicContacts,
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
import { autoAssignGooglePlaceForDirectoryProfile } from "@/lib/google-place-canary";
import { SITE_URL } from "@/config/public-site";

export type NotionDirectorySyncBindings = NotionSyncBindings & {
  NOTION_DIRECTORY_SYNC_ENABLED?: string;
  NOTION_DIRECTORY_DATA_SOURCE_ID?: string;
};

type NotionPage = {
  id: string;
  url?: string;
  last_edited_time?: string;
  properties?: Record<string, unknown>;
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
    services: profile.services.map(clean).filter(Boolean),
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
    services: splitList(propertyText(page, "Služby")),
    qualifications: splitList(propertyText(page, "Kvalifikácie")),
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
  const googleCurrent = Boolean(
    geo?.google_place_id
    && geo.google_place_source_fingerprint
    && geo.source_fingerprint
    && geo.google_place_source_fingerprint === geo.source_fingerprint,
  );
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
    "Interný e-mail": email(snapshot.internalEmail),
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
    "Latitude": { number: geo?.latitude ?? null },
    "Longitude": { number: geo?.longitude ?? null },
    "GEO stav": richText(geo?.geocode_status ?? ""),
    "GEO provider": richText(geo?.provider ?? ""),
    "Google Place ID": richText(geo?.google_place_id ?? ""),
    "Google miesto aktuálne": checkbox(googleCurrent),
    "Google Maps netreba": checkbox(geo?.google_maps_action === "GOOGLE_MAPS_NOT_REQUIRED"),
    "Google Maps cieľ": richText(googleCurrent ? "PLACE" : geo?.geocode_status === "RESOLVED" ? "COORDINATES" : ""),
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

async function createNotionPage(
  bindings: NotionDirectorySyncBindings,
  dataSourceId: string,
  properties: Record<string, unknown>,
  singleAttempt = false,
) {
  return notionRequest<NotionPage>(
    bindings,
    "/pages",
    {
      method: "POST",
      body: JSON.stringify({
        parent: { type: "data_source_id", data_source_id: dataSourceId },
        properties,
      }),
    },
    { retryTransient: !singleAttempt },
  );
}

async function markPageError(
  bindings: NotionDirectorySyncBindings,
  pageId: string,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error);
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
  const page = input.pageId
    ? await patchNotionPage(input.bindings, input.pageId, properties)
    : await createNotionPage(input.bindings, input.dataSourceId, properties, input.singleAttemptCreate === true);

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

  await saveMapping({
    database: input.database,
    pageId: page.id,
    profileId: input.profile.id,
    contentHash: hash,
    notionLastEditedTime: page.last_edited_time ?? syncedAt,
    psipediaUpdatedAt: input.profile.updatedAt,
    syncedAt,
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
    internalEmail: desired.internalEmail || null,
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
    status: "published",
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
    internalEmail: desired.internalEmail || null,
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

function notionProfileReadyForCreate(page: NotionPage) {
  if (propertyText(page, "Psipedia ID")) return false;
  const editorialState = propertyText(page, "Stav");
  return editorialState === "Ready" || editorialState === "Publikované";
}

async function createProfileFromNotion(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
  page: NotionPage;
}) {
  const desired = notionSnapshot(input.page);
  const sourceImageUrl = externalSourceImageUrl(desired.imageUrl);
  const sourcePageUrl = propertyText(input.page, "Zdroj obrázka") || desired.websiteUrl || "";
  const imageAltText = propertyText(input.page, "Alt text obrázka") || desired.name;
  const prepared = sourceImageUrl
    ? await prepareNotionMainImage({
        bindings: input.bindings,
        sourceUrl: sourceImageUrl,
        sourcePageUrl,
        altText: imageAltText,
        folder: "directory",
        existingImageUrl: null,
        existingImageKey: null,
      })
    : null;

  try {
    let payload = newProfileInput(
      desired,
      prepared ? { imageUrl: prepared.imageUrl, imageKey: prepared.imageKey } : null,
    );
    let verified = null;

    if (desired.confirmedServiceLocation) {
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
      payload = { ...payload, clearServiceAddressConfirmation: true };
    }

    const created = await createManagedDirectoryProfile(payload, SYSTEM_ACTOR, input.database);
    return {
      profile: created,
      verified,
      prepared,
      sourceImageUrl,
      sourcePageUrl,
    };
  } catch (error) {
    if (prepared?.uploadedKey) {
      await cleanupNotionImageKeys(input.bindings.BUCKET, [prepared.uploadedKey]);
    }
    throw error;
  }
}

async function applyNotionToProfile(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
  page: NotionPage;
  profile: ManagedDirectoryProfile;
}) {
  const desired = notionSnapshot(input.page);
  let current = input.profile;

  if (desired.status === "archived") {
    const archived = await archiveManagedDirectoryProfile(current.id, SYSTEM_ACTOR, new Date(), input.database);
    if (!archived) throw new Error("Profil sa pri synchronizácii nepodarilo archivovať.");
    return archived;
  }

  if (current.status === "archived") {
    const restored = await restoreManagedDirectoryProfile(current.id, SYSTEM_ACTOR, new Date(), input.database);
    if (!restored) throw new Error("Archivovaný profil sa pri synchronizácii nepodarilo obnoviť.");
    current = restored;
  }

  const sourceImageUrl = externalSourceImageUrl(desired.imageUrl);
  const sourcePageUrl = propertyText(input.page, "Zdroj obrázka") || desired.websiteUrl || current.websiteUrl || "";
  const imageAltText = propertyText(input.page, "Alt text obrázka") || desired.name || current.name;
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

  let payload = fullProfileInput(
    desired,
    current,
    prepared ? { imageUrl: prepared.imageUrl, imageKey: prepared.imageKey } : null,
  );
  const addressChanged = directoryPhysicalAddressChanged(current, payload);
  const needsFreshAddressVerification = (
    addressChanged
    || (desired.confirmedServiceLocation && current.serviceAddressConfirmation !== "CONFIRMED_SERVICE_LOCATION")
  );

  let verified = null;
  if (needsFreshAddressVerification) {
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
  } else if (desired.confirmedServiceLocation) {
    payload = { ...payload, confirmServiceAddress: true };
  } else {
    payload = { ...payload, clearServiceAddressConfirmation: true };
  }

  try {
    const updated = await updateManagedDirectoryProfile(
      current.id,
      payload,
      SYSTEM_ACTOR,
      current,
      input.database,
    );
    if (!updated) throw new Error("Profil sa pri synchronizácii nepodarilo uložiť.");

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
      await cleanupNotionImageKeys(input.bindings.BUCKET, prepared.replacedKeys);
    }

    if (verified) {
      await applyVerifiedDirectoryAddressGeo({
        profileId: updated.id,
        verified,
        actorRef: SYSTEM_ACTOR,
        database: input.database,
      });
    }

    await autoAssignGooglePlaceForDirectoryProfile({
      targetId: updated.id,
      database: input.database,
    });

    return await getManagedDirectoryProfileById(updated.id, input.database) ?? updated;
  } catch (error) {
    if (prepared?.uploadedKey) {
      await cleanupNotionImageKeys(input.bindings.BUCKET, [prepared.uploadedKey]);
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
    WHERE dns.directory_profile_id IS NULL
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
    WHERE COALESCE(dns.psipedia_updated_at, '') <> dp.updated_at
       OR (gp.updated_at IS NOT NULL AND gp.updated_at > dns.last_synced_at)
       OR EXISTS (
         SELECT 1 FROM moderation_events m
         WHERE m.resource_type='GEO_POINT'
           AND m.subject_id=CAST(gp.id AS TEXT)
           AND m.action IN ('GOOGLE_MAPS_NOT_REQUIRED', 'GOOGLE_MAPS_REQUIRED_AGAIN')
           AND m.created_at > dns.last_synced_at
       )
    ORDER BY dp.updated_at ASC, dp.id ASC
    LIMIT ?
  `).bind(CHANGED_PROFILE_BATCH).all<{ id: number }>();
  return (result.results ?? []).map((row) => Number(row.id)).filter(Number.isSafeInteger);
}

async function syncMappedPage(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
  dataSourceId: string;
  mapping: DirectoryNotionMapping;
  page?: NotionPage;
  forcePsipediaPush?: boolean;
}) {
  const profile = await getManagedDirectoryProfileById(input.mapping.directory_profile_id, input.database);
  if (!profile) return "unchanged" as const;

  const page = input.page ?? await fetchNotionPage(input.bindings, input.mapping.notion_page_id);

  // A mapping can already exist when the first Notion write-back failed.
  // Restore the canonical Psipedia ID/status before ordinary conflict resolution.
  if (propertyText(page, "Psipedia ID") !== String(profile.id)) {
    await writeProfileToNotion({
      database: input.database,
      bindings: input.bindings,
      dataSourceId: input.dataSourceId,
      profile,
      pageId: page.id,
    });
    return "pushed" as const;
  }

  const existingMonitor = await getMediaSourceMonitorForEntity(input.database, "DIRECTORY_PROFILE", profile.id);
  const currentSourceImageUrl = existingMonitor?.sourceImageUrl || externalSourceImageUrl(profile.imageUrl);
  const profileHash = await snapshotHash(profileSnapshot(profile, currentSourceImageUrl));
  const pageHash = await snapshotHash(notionSnapshot(page));
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
    return "unchanged" as const;
  }

  let notionWins = notionChanged && !profileChanged;
  if (notionChanged && profileChanged) {
    const notionTime = Date.parse(page.last_edited_time ?? "");
    const profileTime = Date.parse(profile.updatedAt);
    notionWins = Number.isFinite(notionTime) && (!Number.isFinite(profileTime) || notionTime > profileTime);
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
  const profileId = Number.parseInt(rawId, 10);
  if (!Number.isSafeInteger(profileId) || profileId <= 0) return null;
  const profile = await getManagedDirectoryProfileById(profileId, input.database);
  if (!profile) return null;
  const existingMapping = await loadMappingByProfile(input.database, profileId);
  if (existingMapping && existingMapping.notion_page_id !== input.page.id) {
    throw new Error(`Psipedia profil ID ${profileId} už je prepojený s iným Notion záznamom.`);
  }
  const monitor = await getMediaSourceMonitorForEntity(input.database, "DIRECTORY_PROFILE", profile.id);
  const hash = await snapshotHash(profileSnapshot(profile, monitor?.sourceImageUrl || externalSourceImageUrl(profile.imageUrl)));
  const now = new Date().toISOString();
  await saveMapping({
    database: input.database,
    pageId: input.page.id,
    profileId,
    contentHash: propertyText(input.page, "Sync hash") || hash,
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
      if (!profile) continue;
      await writeProfileToNotion({
        database: input.database,
        bindings: input.bindings,
        dataSourceId,
        profile,
      });
      summary.bootstrapped += 1;
    } catch {
      summary.failed += 1;
    }
  }

  summary.hasMore = (await bootstrapProfileIds(input.database)).length > 0;
  return summary;
}

export async function runNotionDirectorySyncSweep(input: {
  database: D1Database;
  bindings: NotionDirectorySyncBindings;
}): Promise<NotionDirectorySyncSummary> {
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

  const pages = await recentNotionPages(input.bindings, dataSourceId);
  summary.notionScanned = pages.length;

  for (const page of pages) {
    try {
      let mapping = await loadMappingByPage(input.database, page.id);
      if (!mapping) mapping = await recoverMappingFromPage({ database: input.database, page });

      if (!mapping && notionProfileReadyForCreate(page)) {
        const creation = await createProfileFromNotion({
          database: input.database,
          bindings: input.bindings,
          page,
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

        if (creation.verified) {
          await applyVerifiedDirectoryAddressGeo({
            profileId: created.id,
            verified: creation.verified,
            actorRef: SYSTEM_ACTOR,
            database: input.database,
          });
        }

        await autoAssignGooglePlaceForDirectoryProfile({
          targetId: created.id,
          database: input.database,
        });
        created = await getManagedDirectoryProfileById(created.id, input.database) ?? created;

        await writeProfileToNotion({
          database: input.database,
          bindings: input.bindings,
          dataSourceId,
          profile: created,
          pageId: page.id,
        });
        summary.createdFromNotion += 1;
        continue;
      }

      if (!mapping) continue;

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

      const result = await syncMappedPage({
        database: input.database,
        bindings: input.bindings,
        dataSourceId,
        mapping,
        page,
      });
      if (result === "pulled") summary.pulledFromNotion += 1;
      else if (result === "pushed") summary.pushedToNotion += 1;
      else summary.unchanged += 1;
    } catch (error) {
      summary.failed += 1;
      await markPageError(input.bindings, page.id, error);
    }
  }

  const changedIds = await changedProfileIds(input.database);
  for (const profileId of changedIds) {
    const mapping = await loadMappingByProfile(input.database, profileId);
    if (!mapping) continue;
    try {
      const result = await syncMappedPage({
        database: input.database,
        bindings: input.bindings,
        dataSourceId,
        mapping,
        forcePsipediaPush: true,
      });
      if (result === "pulled") summary.pulledFromNotion += 1;
      else if (result === "pushed") summary.pushedToNotion += 1;
      else summary.unchanged += 1;
    } catch (error) {
      summary.failed += 1;
      await markPageError(input.bindings, mapping.notion_page_id, error);
    }
  }

  const bootstrapIds = await bootstrapProfileIds(input.database);
  for (const profileId of bootstrapIds) {
    try {
      const profile = await getManagedDirectoryProfileById(profileId, input.database);
      if (!profile) continue;
      await writeProfileToNotion({
        database: input.database,
        bindings: input.bindings,
        dataSourceId,
        profile,
      });
      summary.bootstrapped += 1;
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
}
