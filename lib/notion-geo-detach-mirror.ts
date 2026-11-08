import type { GeoTargetType } from "./geo";
import { loadNotionBulkEvents, loadNotionBulkOrganizations } from "./notion-bulk-sources";
import { notionGeoMirrorFields } from "./notion-geo-mirror";
import { eventReadNotionProperty } from "./notion-event-field-contract";
import { notionRequest, type NotionSyncBindings } from "./notion-sync-shared";

type Bindings = NotionSyncBindings & {
  NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED?: string;
};
type Page = { id: string; properties?: Record<string, Record<string, unknown>> };

function encode(value: unknown, raw: Record<string, unknown>) {
  const kind = raw.type;
  const str = value == null ? "" : String(value);
  if (kind === "checkbox") return { checkbox: value === true };
  if (kind === "number") return { number: typeof value === "number" ? value : null };
  if (kind === "select") return { select: str ? { name: str } : null };
  if (kind === "url") return { url: str || null };
  if (kind === "rich_text") return { rich_text: str
    ? [{ type: "text", text: { content: str.slice(0, 1900) } }] : [] };
  throw Error("GEO_NOTION_UNSUPPORTED_PROPERTY:" + String(kind));
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
  if (targetType === "DIRECTORY_PROFILE") return "unlinked";
  if (!bindings.DB || !bindings.NOTION_API_TOKEN ||
      bindings.NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED !== "true") return "disabled";
  const db = bindings.DB;
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
