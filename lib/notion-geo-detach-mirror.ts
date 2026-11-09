import type { GeoTargetType } from "./geo";
import { loadNotionBulkEvents, loadNotionBulkOrganizations } from "./notion-bulk-sources";
import { notionGeoMirrorFields, notionGeoMirrorProperties } from "./notion-geo-mirror";
import { notionDirectoryPageBelongsToSource } from "./notion-directory-update-safety";
import { eventReadNotionProperty } from "./notion-event-field-contract";
import { notionFlagEnabled, notionRequest, type NotionSyncBindings } from "./notion-sync-shared";

type Bindings = NotionSyncBindings & {
  NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED?: string;
  NOTION_DIRECTORY_SYNC_ENABLED?: string;
  NOTION_DIRECTORY_DATA_SOURCE_ID?: string;
};
type Page = {
  id: string;
  parent?: { type?: string; data_source_id?: string };
  archived?: boolean;
  in_trash?: boolean;
  properties?: Record<string, Record<string, unknown>>;
};

function encode(value: unknown, raw: Record<string, unknown>) {
  const kind = raw.type;
  const str = value == null ? "" : String(value);
  if (kind === "checkbox") return { checkbox: value === true };
  if (kind === "number") return { number: typeof value === "number" ? value : null };
  if (kind === "select") return { select: str ? { name: str } : null };
  if (kind === "status") return { status: str ? { name: str } : null };
  if (kind === "url") return { url: str || null };
  if (kind === "rich_text") return { rich_text: str
    ? [{ type: "text", text: { content: str.slice(0, 1900) } }] : [] };
  throw Error("GEO_NOTION_UNSUPPORTED_PROPERTY:" + String(kind));
}


/**
 * Directory shares the GEO unlink operation with events and organizations,
 * but its Notion page mapping/identity and feature flag are independent.
 * Patch only D1-owned GEO mirror columns. Never write the editorial address,
 * location confirmation, field baselines, or whole-profile sync state.
 */
async function syncDirectoryGeoMirrorAfterDetach(
  db: D1Database,
  targetId: number,
  bindings: Bindings,
): Promise<"synced" | "unlinked" | "disabled"> {
  const dataSourceId = bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim() ?? "";
  if (!notionFlagEnabled(bindings.NOTION_DIRECTORY_SYNC_ENABLED) ||
      !dataSourceId || !bindings.NOTION_API_TOKEN?.trim()) return "disabled";

  const mapping = await db.prepare(
    "SELECT notion_page_id FROM directory_notion_sync WHERE directory_profile_id=? LIMIT 1"
  ).bind(targetId).first<{ notion_page_id: string }>();
  if (!mapping?.notion_page_id) return "unlinked";

  const profile = await db.prepare(
    "SELECT id, category, slug FROM directory_profiles WHERE id=? LIMIT 1"
  ).bind(targetId).first<{ id: number; category: string; slug: string }>();
  if (!profile) return "unlinked";

  // Match the canonical GEO projection used by events/organizations.
  const sql = `
    SELECT geocode_status AS geo_status, public_visibility AS geo_public_visibility,
      public_precision AS geo_public_precision, latitude AS geo_latitude,
      longitude AS geo_longitude, provider AS geo_provider,
      google_place_id AS geo_google_place_id,
      source_fingerprint AS geo_source_fingerprint,
      google_place_source_fingerprint AS geo_google_place_source_fingerprint,
      updated_at AS geo_updated_at,
      (SELECT m.action FROM moderation_events m
       WHERE m.resource_type='GEO_POINT' AND m.subject_id=CAST(geo_points.id AS TEXT)
         AND m.action IN ('GOOGLE_MAPS_NOT_REQUIRED','GOOGLE_MAPS_REQUIRED_AGAIN')
       ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS google_maps_action
    FROM geo_points WHERE target_type='DIRECTORY_PROFILE' AND directory_profile_id=?
    LIMIT 1
  `;
  const geo = await db.prepare(sql).bind(targetId).first<Record<string, unknown>>();
  if (!geo || geo.geo_provider === "google_places" || geo.geo_google_place_id) {
    throw Error("GEO_DIRECTORY_UNLINK_STATE_CHANGED");
  }

  const page = await notionRequest<Page>(bindings, "/pages/" + encodeURIComponent(mapping.notion_page_id));
  if (page.id !== mapping.notion_page_id ||
      !notionDirectoryPageBelongsToSource(page, dataSourceId)) {
    throw Error("GEO_NOTION_DIRECTORY_TARGET_INVALID");
  }
  if (eventReadNotionProperty(page.properties?.["Psipedia ID"]) !== String(profile.id)) {
    throw Error("GEO_NOTION_DIRECTORY_ID_MISMATCH");
  }
  const expectedUrl = `https://psipedia.sk/adresar/${profile.category}/${profile.slug}`;
  const actualUrl = eventReadNotionProperty(page.properties?.["URL Psipedia"]);
  if (actualUrl && actualUrl !== expectedUrl) {
    throw Error("GEO_NOTION_DIRECTORY_URL_MISMATCH");
  }

  const desired = notionGeoMirrorProperties(geo);
  const patch: Record<string, unknown> = {};
  for (const name of notionGeoMirrorFields) {
    const raw = page.properties?.[name];
    if (!raw) throw Error("GEO_NOTION_DIRECTORY_FIELD_MISSING:" + name);
    patch[name] = encode(desired[name], raw);
  }

  // Preserve unrelated editorial sync errors; only obsolete location locks
  // are cleared in the same way as for events and organizations.
  const syncError = eventReadNotionProperty(page.properties?.["Sync chyba"]);
  const outstanding = typeof syncError === "string" && syncError.startsWith("POLIA: ")
    ? syncError.slice(7).split(", ").filter(v => v && !v.includes("GOOGLE_PLACE_LOCATION_LOCKED"))
    : syncError ? [syncError] : [];
  if (page.properties?.["Sync chyba"] &&
      outstanding.length === 0 && syncError) {
    patch["Sync chyba"] = encode("", page.properties["Sync chyba"]);
  }
  if (!outstanding.length && page.properties?.["Sync stav"]) {
    patch["Sync stav"] = encode("Synchronizované", page.properties["Sync stav"]);
  }
  if (!outstanding.length && page.properties?.["Posledný sync"]) {
    patch["Posledný sync"] = { date: { start: new Date().toISOString() } };
  }

  // A subsequent owner change must not be overwritten by a stale Notion PATCH.
  const latest = await db.prepare(
    "SELECT updated_at, provider, google_place_id FROM geo_points " +
    "WHERE target_type='DIRECTORY_PROFILE' AND directory_profile_id=? LIMIT 1"
  ).bind(targetId).first<{ updated_at: string; provider: string | null; google_place_id: string | null }>();
  if (!latest || latest.updated_at !== geo.geo_updated_at ||
      latest.provider === "google_places" || latest.google_place_id) {
    throw Error("GEO_DIRECTORY_UNLINK_STATE_CHANGED");
  }

  const echoed = await notionRequest<Page>(bindings, "/pages/" + encodeURIComponent(page.id), {
    method: "PATCH", body: JSON.stringify({ properties: patch }),
  });
  if (echoed.id !== page.id) throw Error("GEO_NOTION_DIRECTORY_PATCH_UNVERIFIED");
  return "synced";
}

/** The unlink itself remains authoritative in D1. Notion receives only a
 * read-only map mirror and a clean sync status; editorial address stays intact.
 */
export async function syncNotionGeoMirrorAfterDetach(input: {
  targetType: GeoTargetType;
  targetId: number;
  bindings: Bindings & { DB?: D1Database };
}): Promise<"synced" | "unlinked" | "disabled" | "pending"> {
  const { targetType, targetId, bindings } = input;
  if (!bindings.DB || !bindings.NOTION_API_TOKEN) return "disabled";
  const db = bindings.DB;
  if (targetType === "DIRECTORY_PROFILE") {
    return syncDirectoryGeoMirrorAfterDetach(db, targetId, bindings);
  }
  if (bindings.NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED !== "true") return "disabled";
  const organizationId = targetType === "ORGANIZATION_LOCATION"
    ? (await db.prepare("SELECT organization_id FROM organization_locations WHERE id=?")
        .bind(targetId).first<{ organization_id: number }>())?.organization_id : undefined;
  const entityId = targetType === "MANAGED_EVENT" ? targetId : organizationId;
  if (!entityId) return "unlinked";
  const mapping = targetType === "MANAGED_EVENT"
    ? await db.prepare("SELECT notion_page_id FROM event_notion_sync WHERE event_id=? LIMIT 1")
        .bind(entityId).first<{ notion_page_id: string }>()
    : await db.prepare("SELECT notion_page_id FROM notion_agenda_sync WHERE agenda='organizations' AND entity_id=? LIMIT 1")
        .bind(entityId).first<{ notion_page_id: string }>();
  if (!mapping?.notion_page_id) return "unlinked";
  const source = (targetType === "MANAGED_EVENT"
    ? await loadNotionBulkEvents(db, entityId)
    : await loadNotionBulkOrganizations(db, entityId))[0];
  if (!source) return "unlinked";
  const page = await notionRequest<Page>(bindings, "/pages/" + encodeURIComponent(mapping.notion_page_id));
  if (page.id !== mapping.notion_page_id) throw Error("GEO_NOTION_PAGE_MISMATCH");
  const actualId = eventReadNotionProperty(page.properties?.["Psipedia ID"]);
  const actualUrl = eventReadNotionProperty(page.properties?.["URL Psipedia"]);
  if (actualId !== null && String(actualId) !== String(source.id)) throw Error("GEO_NOTION_ID_MISMATCH");
  if (actualUrl !== null && actualUrl !== source.url) throw Error("GEO_NOTION_URL_MISMATCH");

  const patch: Record<string, unknown> = {};
  for (const name of notionGeoMirrorFields) {
    const raw = page.properties?.[name];
    if (!raw || !Object.hasOwn(source.properties, name)) continue;
    patch[name] = encode(source.properties[name], raw);
  }
  // Old Google Place locks describe successful owner protection, not failures.
  const syncError = eventReadNotionProperty(page.properties?.["Sync chyba"]);
  const outstanding = typeof syncError === "string" && syncError.startsWith("POLIA: ")
    ? syncError.slice(7).split(", ").filter(v => v && !v.includes("GOOGLE_PLACE_LOCATION_LOCKED"))
    : syncError ? [syncError] : [];
  if (page.properties?.["Sync chyba"])
    patch["Sync chyba"] = encode(outstanding.length ? "POLIA: " + outstanding.join(", ") : "",
      page.properties["Sync chyba"]);
  if (page.properties?.["Sync stav"] && !outstanding.length)
    patch["Sync stav"] = encode("Synchronizované", page.properties["Sync stav"]);
  if (page.properties?.["Posledný sync"] && !outstanding.length)
    patch["Posledný sync"] = { date: { start: new Date().toISOString() } };
  if (!Object.keys(patch).length) return "unlinked";
  await notionRequest<Page>(bindings, "/pages/" + encodeURIComponent(page.id), {
    method: "PATCH", body: JSON.stringify({ properties: patch }),
  });
  return "synced";
}
