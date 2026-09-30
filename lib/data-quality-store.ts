import { env } from "cloudflare:workers";
import {
  readAdminAutomationData,
  summarizeAdminAutomationReads,
  type AdminAutomationReadAvailabilityStatus,
  type AdminAutomationReliabilitySummary,
} from "@/lib/admin-automation-reliability";
import { readDirectoryPublicContacts } from "@/lib/directory-profile-metadata";
import {
  listMediaSourceIssues,
  mediaSourceMonitorSchemaReady,
  type MediaSourceMonitor,
} from "@/lib/media-source-monitor";

type RuntimeBindings = { DB?: D1Database };

type DirectoryQualityRow = {
  id: number;
  slug: string;
  name: string;
  category: string;
  status: string;
  description: string | null;
  website_url: string | null;
  image_url: string | null;
  image_key: string | null;
  online: number | null;
  city: string | null;
  service_address_confirmation: string | null;
  source_data_json: string | null;
};

type ProfileSummaryRow = {
  total_profiles: number;
  profiles_with_issues: number;
  missing_description: number;
  missing_phone: number;
  missing_email: number;
  missing_website: number;
  missing_image: number;
  incomplete_address: number;
};

type MediaSummaryRow = {
  media_issues: number;
  changed_media: number;
  missing_media_source: number;
};

type EventNameRow = { id: number; title: string; slug: string };
type ProfileNameRow = { id: number; name: string; slug: string; category: string };

export const DATA_QUALITY_D1_MAX_BOUND_PARAMS = 100;
export const DATA_QUALITY_LOOKUP_CHUNK_SIZE = 90;
export const DATA_QUALITY_PROFILE_PAGE_SIZE = 50;
export const DATA_QUALITY_MEDIA_PAGE_SIZE = 50;

const VALID_SOURCE_DATA_SQL =
  "CASE WHEN json_valid(COALESCE(source_data_json, '')) THEN source_data_json ELSE '{}' END";
const MISSING_DESCRIPTION_SQL = "trim(COALESCE(description, '')) = ''";
const MISSING_PHONE_SQL = `trim(COALESCE(
  CAST(json_extract(${VALID_SOURCE_DATA_SQL}, '$."Telefón"') AS TEXT),
  CAST(json_extract(${VALID_SOURCE_DATA_SQL}, '$."Telefon"') AS TEXT),
  CAST(json_extract(${VALID_SOURCE_DATA_SQL}, '$."phone"') AS TEXT),
  ''
)) = ''`;
const MISSING_EMAIL_SQL = `trim(COALESCE(
  CAST(json_extract(${VALID_SOURCE_DATA_SQL}, '$."E-mail"') AS TEXT),
  CAST(json_extract(${VALID_SOURCE_DATA_SQL}, '$."Email"') AS TEXT),
  CAST(json_extract(${VALID_SOURCE_DATA_SQL}, '$."email"') AS TEXT),
  ''
)) = ''`;
const MISSING_WEBSITE_SQL = `trim(COALESCE(
  CAST(json_extract(${VALID_SOURCE_DATA_SQL}, '$."Web"') AS TEXT),
  CAST(json_extract(${VALID_SOURCE_DATA_SQL}, '$."Webstránka"') AS TEXT),
  website_url,
  ''
)) = ''`;
const MISSING_IMAGE_SQL = "trim(COALESCE(image_url, '')) = ''";
const INCOMPLETE_ADDRESS_SQL = `COALESCE(online, 0) = 0 AND (
  trim(COALESCE(city, '')) = ''
  OR COALESCE(service_address_confirmation, '') <> 'CONFIRMED_SERVICE_LOCATION'
)`;
const PROFILE_ISSUE_SQL = `(
  ${MISSING_DESCRIPTION_SQL}
  OR ${MISSING_PHONE_SQL}
  OR ${MISSING_EMAIL_SQL}
  OR ${MISSING_WEBSITE_SQL}
  OR ${MISSING_IMAGE_SQL}
  OR (${INCOMPLETE_ADDRESS_SQL})
)`;

export type DataQualityIssueKey =
  | "description"
  | "phone"
  | "email"
  | "website"
  | "image"
  | "address"
  | "image-source";

export type DirectoryQualityItem = {
  id: number;
  name: string;
  slug: string;
  category: string;
  status: string;
  issues: Array<{ key: DataQualityIssueKey; label: string }>;
  mediaMonitor: MediaSourceMonitor | null;
  href: string;
};

export type MediaQualityItem = {
  monitor: MediaSourceMonitor;
  label: string;
  href: string;
};

export type DataQualityPagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  from: number;
  to: number;
};

type NullableProfileSummary = {
  totalProfiles: number | null;
  profilesWithIssues: number | null;
  missingDescription: number | null;
  missingPhone: number | null;
  missingEmail: number | null;
  missingWebsite: number | null;
  missingImage: number | null;
  incompleteAddress: number | null;
};

type NullableMediaSummary = {
  mediaIssues: number | null;
  changedMedia: number | null;
  missingMediaSource: number | null;
};

type AvailabilitySection = {
  status: AdminAutomationReadAvailabilityStatus;
  errorRef: string | null;
};

export type DataQualityDashboard = {
  summary: NullableProfileSummary & NullableMediaSummary;
  profiles: DirectoryQualityItem[];
  media: MediaQualityItem[];
  monitorReady: boolean;
  profilePagination: DataQualityPagination;
  mediaPagination: DataQualityPagination;
  availability: AdminAutomationReliabilitySummary;
  sections: {
    profiles: AvailabilitySection;
    media: AvailabilitySection;
    lookups: AvailabilitySection;
  };
};

type ProfileReadData = {
  summary: ExcludeNulls<NullableProfileSummary>;
  profiles: DirectoryQualityItem[];
  pagination: DataQualityPagination;
};

type MediaReadData = {
  summary: ExcludeNulls<NullableMediaSummary>;
  monitors: MediaSourceMonitor[];
  pagination: DataQualityPagination;
  monitorReady: boolean;
};

type ExcludeNulls<T> = { [K in keyof T]: Exclude<T[K], null> };

function database() {
  const db = (env as unknown as RuntimeBindings).DB;
  if (!db || typeof db.prepare !== "function") throw new Error("Databáza zatiaľ nie je pripojená.");
  return db;
}

function parseImportData(value: string | null) {
  try {
    const parsed = JSON.parse(value ?? "");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, string | number | null>
      : null;
  } catch {
    return null;
  }
}

function safePage(value: number | undefined) {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : 1;
}

function pagination(page: number, pageSize: number, totalItems: number): DataQualityPagination {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const boundedPage = Math.min(Math.max(1, page), totalPages);
  const from = totalItems === 0 ? 0 : ((boundedPage - 1) * pageSize) + 1;
  const to = totalItems === 0 ? 0 : Math.min(totalItems, boundedPage * pageSize);
  return { page: boundedPage, pageSize, totalItems, totalPages, from, to };
}

function emptyPagination(page: number, pageSize: number) {
  return pagination(page, pageSize, 0);
}

function directoryIssues(row: DirectoryQualityRow) {
  const contacts = readDirectoryPublicContacts(parseImportData(row.source_data_json), row.website_url ?? "");
  const issues: DirectoryQualityItem["issues"] = [];
  if (!row.description?.trim()) issues.push({ key: "description", label: "Chýba popis" });
  if (!contacts.phone) issues.push({ key: "phone", label: "Chýba telefón" });
  if (!contacts.email) issues.push({ key: "email", label: "Chýba e-mail" });
  if (!contacts.website) issues.push({ key: "website", label: "Chýba web" });
  if (!row.image_url?.trim()) issues.push({ key: "image", label: "Chýba hlavný obrázok" });
  if (!Boolean(row.online) && (!row.city?.trim() || row.service_address_confirmation !== "CONFIRMED_SERVICE_LOCATION")) {
    issues.push({ key: "address", label: "Adresa nie je úplne potvrdená" });
  }
  return issues;
}

async function loadProfileQualityPage(requestedPage: number): Promise<ProfileReadData> {
  const db = database();
  const summaryRow = await db.prepare(`
    SELECT
      COUNT(*) AS total_profiles,
      SUM(CASE WHEN ${PROFILE_ISSUE_SQL} THEN 1 ELSE 0 END) AS profiles_with_issues,
      SUM(CASE WHEN ${MISSING_DESCRIPTION_SQL} THEN 1 ELSE 0 END) AS missing_description,
      SUM(CASE WHEN ${MISSING_PHONE_SQL} THEN 1 ELSE 0 END) AS missing_phone,
      SUM(CASE WHEN ${MISSING_EMAIL_SQL} THEN 1 ELSE 0 END) AS missing_email,
      SUM(CASE WHEN ${MISSING_WEBSITE_SQL} THEN 1 ELSE 0 END) AS missing_website,
      SUM(CASE WHEN ${MISSING_IMAGE_SQL} THEN 1 ELSE 0 END) AS missing_image,
      SUM(CASE WHEN ${INCOMPLETE_ADDRESS_SQL} THEN 1 ELSE 0 END) AS incomplete_address
    FROM directory_profiles
    WHERE status <> 'archived'
  `).first<ProfileSummaryRow>();

  const summary = {
    totalProfiles: Number(summaryRow?.total_profiles ?? 0),
    profilesWithIssues: Number(summaryRow?.profiles_with_issues ?? 0),
    missingDescription: Number(summaryRow?.missing_description ?? 0),
    missingPhone: Number(summaryRow?.missing_phone ?? 0),
    missingEmail: Number(summaryRow?.missing_email ?? 0),
    missingWebsite: Number(summaryRow?.missing_website ?? 0),
    missingImage: Number(summaryRow?.missing_image ?? 0),
    incompleteAddress: Number(summaryRow?.incomplete_address ?? 0),
  };
  const paging = pagination(requestedPage, DATA_QUALITY_PROFILE_PAGE_SIZE, summary.profilesWithIssues);
  const offset = (paging.page - 1) * paging.pageSize;
  const result = await db.prepare(`
    SELECT id, slug, name, category, status, description, website_url, image_url, image_key,
           online, city, service_address_confirmation, source_data_json
    FROM directory_profiles
    WHERE status <> 'archived'
      AND ${PROFILE_ISSUE_SQL}
    ORDER BY name COLLATE NOCASE ASC, id ASC
    LIMIT ? OFFSET ?
  `).bind(paging.pageSize, offset).all<DirectoryQualityRow>();

  const profiles = (result.results ?? []).map((row) => ({
    id: Number(row.id),
    name: row.name || `Profil #${row.id}`,
    slug: row.slug ?? "",
    category: row.category ?? "",
    status: row.status ?? "",
    issues: directoryIssues(row),
    mediaMonitor: null,
    href: `/admin/adresar/${row.id}`,
  }));

  return { summary, profiles, pagination: paging };
}

async function loadMediaQualityPage(requestedPage: number): Promise<MediaReadData> {
  const db = database();
  if (!await mediaSourceMonitorSchemaReady(db)) {
    const error = new Error("Voliteľný monitoring obrázkov nie je v tejto schéme dostupný.");
    error.name = "OptionalDataQualitySourceUnavailable";
    throw error;
  }

  const summaryRow = await db.prepare(`
    SELECT
      COUNT(*) AS media_issues,
      SUM(CASE WHEN status IN ('CHANGED','CANDIDATE') THEN 1 ELSE 0 END) AS changed_media,
      SUM(CASE WHEN status IN ('MISSING','ERROR') THEN 1 ELSE 0 END) AS missing_media_source
    FROM media_source_monitors
    WHERE status IN ('CANDIDATE','CHANGED','MISSING','ERROR')
  `).first<MediaSummaryRow>();
  const summary = {
    mediaIssues: Number(summaryRow?.media_issues ?? 0),
    changedMedia: Number(summaryRow?.changed_media ?? 0),
    missingMediaSource: Number(summaryRow?.missing_media_source ?? 0),
  };
  const paging = pagination(requestedPage, DATA_QUALITY_MEDIA_PAGE_SIZE, summary.mediaIssues);
  const offset = (paging.page - 1) * paging.pageSize;
  const monitors = await listMediaSourceIssues(db, paging.pageSize, offset);
  return { summary, monitors, pagination: paging, monitorReady: true };
}

function uniqueIds(monitors: readonly MediaSourceMonitor[], entityType: MediaSourceMonitor["entityType"]) {
  return [...new Set(
    monitors
      .filter((item) => item.entityType === entityType)
      .map((item) => Number(item.entityId))
      .filter((id) => Number.isSafeInteger(id) && id > 0),
  )].sort((a, b) => a - b);
}

function chunks<T>(values: readonly T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function loadProfileNames(db: D1Database, ids: readonly number[]) {
  const rows: ProfileNameRow[] = [];
  for (const batch of chunks(ids, DATA_QUALITY_LOOKUP_CHUNK_SIZE)) {
    if (!batch.length) continue;
    const placeholders = batch.map(() => "?").join(",");
    const result = await db.prepare(
      `SELECT id, name, slug, category FROM directory_profiles WHERE id IN (${placeholders}) ORDER BY id ASC`,
    ).bind(...batch).all<ProfileNameRow>();
    rows.push(...(result.results ?? []));
  }
  return rows;
}

async function loadEventNames(db: D1Database, ids: readonly number[]) {
  const rows: EventNameRow[] = [];
  for (const batch of chunks(ids, DATA_QUALITY_LOOKUP_CHUNK_SIZE)) {
    if (!batch.length) continue;
    const placeholders = batch.map(() => "?").join(",");
    const result = await db.prepare(
      `SELECT id, title, slug FROM managed_events WHERE id IN (${placeholders}) ORDER BY id ASC`,
    ).bind(...batch).all<EventNameRow>();
    rows.push(...(result.results ?? []));
  }
  return rows;
}

function fallbackMediaItems(monitors: readonly MediaSourceMonitor[]): MediaQualityItem[] {
  return monitors.map((monitor) => ({
    monitor,
    label: monitor.entityType === "DIRECTORY_PROFILE"
      ? `Profil #${monitor.entityId}`
      : `Podujatie #${monitor.entityId}`,
    href: monitor.entityType === "DIRECTORY_PROFILE"
      ? `/admin/adresar/${monitor.entityId}`
      : `/admin/podujatia/${monitor.entityId}`,
  }));
}

export async function resolveDataQualityMediaItems(
  db: D1Database,
  monitors: readonly MediaSourceMonitor[],
): Promise<MediaQualityItem[]> {
  const profileIds = uniqueIds(monitors, "DIRECTORY_PROFILE");
  const eventIds = uniqueIds(monitors, "MANAGED_EVENT");
  const profileNames = await loadProfileNames(db, profileIds);
  const eventNames = await loadEventNames(db, eventIds);
  const profileNameMap = new Map(profileNames.map((item) => [Number(item.id), item]));
  const eventNameMap = new Map(eventNames.map((item) => [Number(item.id), item]));

  return monitors.map((monitor) => {
    if (monitor.entityType === "DIRECTORY_PROFILE") {
      const profile = profileNameMap.get(monitor.entityId);
      return {
        monitor,
        label: profile?.name ?? `Profil #${monitor.entityId}`,
        href: `/admin/adresar/${monitor.entityId}`,
      };
    }
    const event = eventNameMap.get(monitor.entityId);
    return {
      monitor,
      label: event?.title ?? `Podujatie #${monitor.entityId}`,
      href: `/admin/podujatia/${monitor.entityId}`,
    };
  });
}

const unavailableProfileSummary: NullableProfileSummary = {
  totalProfiles: null,
  profilesWithIssues: null,
  missingDescription: null,
  missingPhone: null,
  missingEmail: null,
  missingWebsite: null,
  missingImage: null,
  incompleteAddress: null,
};

const unavailableMediaSummary: NullableMediaSummary = {
  mediaIssues: null,
  changedMedia: null,
  missingMediaSource: null,
};

export async function loadDataQualityDashboard(input: {
  profilePage?: number;
  mediaPage?: number;
} = {}): Promise<DataQualityDashboard> {
  const requestedProfilePage = safePage(input.profilePage);
  const requestedMediaPage = safePage(input.mediaPage);

  const profileRead = await readAdminAutomationData({
    key: "data-quality:profiles",
    load: () => loadProfileQualityPage(requestedProfilePage),
    fallback: {
      summary: {
        totalProfiles: 0,
        profilesWithIssues: 0,
        missingDescription: 0,
        missingPhone: 0,
        missingEmail: 0,
        missingWebsite: 0,
        missingImage: 0,
        incompleteAddress: 0,
      },
      profiles: [],
      pagination: emptyPagination(requestedProfilePage, DATA_QUALITY_PROFILE_PAGE_SIZE),
    },
    empty: (value) => value.summary.totalProfiles === 0,
  });

  const mediaRead = await readAdminAutomationData({
    key: "data-quality:media",
    load: () => loadMediaQualityPage(requestedMediaPage),
    fallback: {
      summary: { mediaIssues: 0, changedMedia: 0, missingMediaSource: 0 },
      monitors: [],
      pagination: emptyPagination(requestedMediaPage, DATA_QUALITY_MEDIA_PAGE_SIZE),
      monitorReady: false,
    },
    empty: (value) => value.summary.mediaIssues === 0,
  });

  const lookupRead = await readAdminAutomationData({
    key: "data-quality:entity-lookups",
    load: async () => {
      if (mediaRead.status === "UNAVAILABLE") {
        const error = new Error("Media údaje pre lookup nie sú dostupné.");
        error.name = "DataQualityLookupDependencyUnavailable";
        throw error;
      }
      if (!mediaRead.data.monitors.length) return [];
      return resolveDataQualityMediaItems(database(), mediaRead.data.monitors);
    },
    fallback: fallbackMediaItems(mediaRead.data.monitors),
    empty: (value) => value.length === 0,
  });

  const availability = summarizeAdminAutomationReads([profileRead, mediaRead, lookupRead]);
  return {
    summary: {
      ...(profileRead.status === "UNAVAILABLE" ? unavailableProfileSummary : profileRead.data.summary),
      ...(mediaRead.status === "UNAVAILABLE" ? unavailableMediaSummary : mediaRead.data.summary),
    },
    profiles: profileRead.data.profiles,
    media: lookupRead.data,
    monitorReady: mediaRead.data.monitorReady,
    profilePagination: profileRead.data.pagination,
    mediaPagination: mediaRead.data.pagination,
    availability,
    sections: {
      profiles: { status: profileRead.status, errorRef: profileRead.errorRef },
      media: { status: mediaRead.status, errorRef: mediaRead.errorRef },
      lookups: { status: lookupRead.status, errorRef: lookupRead.errorRef },
    },
  };
}
