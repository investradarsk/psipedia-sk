import { env } from "cloudflare:workers";
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
  description: string;
  website_url: string | null;
  image_url: string | null;
  image_key: string | null;
  online: number;
  city: string;
  service_address_confirmation: string | null;
  source_data_json: string;
};

type EventNameRow = { id: number; title: string; slug: string };
type ProfileNameRow = { id: number; name: string; slug: string; category: string };

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

export type DataQualityDashboard = {
  summary: {
    profilesWithIssues: number;
    missingDescription: number;
    missingPhone: number;
    missingEmail: number;
    missingWebsite: number;
    missingImage: number;
    incompleteAddress: number;
    mediaIssues: number;
    changedMedia: number;
    missingMediaSource: number;
  };
  profiles: DirectoryQualityItem[];
  media: MediaQualityItem[];
  monitorReady: boolean;
};

function database() {
  const db = (env as unknown as RuntimeBindings).DB;
  if (!db || typeof db.prepare !== "function") throw new Error("Databáza zatiaľ nie je pripojená.");
  return db;
}

function parseImportData(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, string | number | null>
      : null;
  } catch {
    return null;
  }
}

function placeholders(values: number[]) {
  return values.map(() => "?").join(",");
}

export async function loadDataQualityDashboard(): Promise<DataQualityDashboard> {
  const db = database();
  const profileResult = await db.prepare(`
    SELECT id, slug, name, category, status, description, website_url, image_url, image_key,
           online, city, service_address_confirmation, source_data_json
    FROM directory_profiles
    WHERE status <> 'archived'
    ORDER BY name COLLATE NOCASE ASC
  `).all<DirectoryQualityRow>();

  const monitorReady = await mediaSourceMonitorSchemaReady(db);
  const mediaIssues = monitorReady ? await listMediaSourceIssues(db, 250) : [];
  const monitorByProfile = new Map<number, MediaSourceMonitor>();
  for (const monitor of mediaIssues) {
    if (monitor.entityType === "DIRECTORY_PROFILE") monitorByProfile.set(monitor.entityId, monitor);
  }

  const summary = {
    profilesWithIssues: 0,
    missingDescription: 0,
    missingPhone: 0,
    missingEmail: 0,
    missingWebsite: 0,
    missingImage: 0,
    incompleteAddress: 0,
    mediaIssues: mediaIssues.length,
    changedMedia: mediaIssues.filter((item) => item.status === "CHANGED" || item.status === "CANDIDATE").length,
    missingMediaSource: mediaIssues.filter((item) => item.status === "MISSING" || item.status === "ERROR").length,
  };

  const profiles: DirectoryQualityItem[] = [];
  for (const row of profileResult.results ?? []) {
    const contacts = readDirectoryPublicContacts(parseImportData(row.source_data_json), row.website_url ?? "");
    const issues: DirectoryQualityItem["issues"] = [];
    if (!row.description?.trim()) {
      issues.push({ key: "description", label: "Chýba popis" });
      summary.missingDescription += 1;
    }
    if (!contacts.phone) {
      issues.push({ key: "phone", label: "Chýba telefón" });
      summary.missingPhone += 1;
    }
    if (!contacts.email) {
      issues.push({ key: "email", label: "Chýba e-mail" });
      summary.missingEmail += 1;
    }
    if (!contacts.website) {
      issues.push({ key: "website", label: "Chýba web" });
      summary.missingWebsite += 1;
    }
    if (!row.image_url?.trim()) {
      issues.push({ key: "image", label: "Chýba hlavný obrázok" });
      summary.missingImage += 1;
    }
    if (!Boolean(row.online) && (!row.city?.trim() || row.service_address_confirmation !== "CONFIRMED_SERVICE_LOCATION")) {
      issues.push({ key: "address", label: "Adresa nie je úplne potvrdená" });
      summary.incompleteAddress += 1;
    }

    const mediaMonitor = monitorByProfile.get(row.id) ?? null;
    if (mediaMonitor) {
      const label = mediaMonitor.status === "CHANGED"
        ? "Zdrojový obrázok sa zmenil"
        : mediaMonitor.status === "CANDIDATE"
          ? "Nájdený kandidát obrázka"
          : mediaMonitor.status === "MISSING"
            ? "Zdroj obrázka chýba"
            : "Kontrola obrázka zlyhala";
      issues.push({ key: "image-source", label });
    }

    if (issues.length) {
      summary.profilesWithIssues += 1;
      profiles.push({
        id: row.id,
        name: row.name,
        slug: row.slug,
        category: row.category,
        status: row.status,
        issues,
        mediaMonitor,
        href: `/admin/adresar/${row.id}`,
      });
    }
  }

  const profileMediaIds = mediaIssues
    .filter((item) => item.entityType === "DIRECTORY_PROFILE")
    .map((item) => item.entityId);
  const eventMediaIds = mediaIssues
    .filter((item) => item.entityType === "MANAGED_EVENT")
    .map((item) => item.entityId);

  const profileNames = profileMediaIds.length
    ? (await db.prepare(`SELECT id, name, slug, category FROM directory_profiles WHERE id IN (${placeholders(profileMediaIds)})`)
        .bind(...profileMediaIds).all<ProfileNameRow>()).results
    : [];
  const eventNames = eventMediaIds.length
    ? (await db.prepare(`SELECT id, title, slug FROM managed_events WHERE id IN (${placeholders(eventMediaIds)})`)
        .bind(...eventMediaIds).all<EventNameRow>()).results
    : [];

  const profileNameMap = new Map(profileNames.map((item) => [Number(item.id), item]));
  const eventNameMap = new Map(eventNames.map((item) => [Number(item.id), item]));

  const media: MediaQualityItem[] = mediaIssues.map((monitor) => {
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

  return {
    summary,
    profiles: profiles.slice(0, 300),
    media,
    monitorReady,
  };
}
