import { env } from "cloudflare:workers";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { directoryCategories, directoryProfileHref, isDirectoryCategory, type DirectoryCategorySlug } from "@/lib/directory";
import { helpCategories } from "@/lib/help";
import { eventTypes, eventPortalCategory, eventHref, bratislavaDateKey, type EventType } from "@/lib/events";
import { copyFacebookProfileImage } from "@/lib/facebook-profile-image";
import { breedProfileHref, canonicalBreedIdsSql } from "@/lib/breed-canonical";
import { fciGroups } from "@/lib/content";
import { ownedBreedImage } from "@/lib/breed-image";
import { facebookShareMarkerType, readFacebookShareMarkers } from "@/lib/facebook-content-share-marker";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };
const PAGE_SIZE = 12;
type Group = "directory" | "help" | "events" | "breeds";
type ScopedCategory = { group: Group; category: string };
type PickerRow = {
  id: number; title: string; slug: string; detail: string | null; image_url: string | null;
  source_category?: string; type?: string; fci_group?: number;
};
type PickerSql = {
  select: string; table: string; where: string; bindings: (string | number)[];
  searchExpression: string; order: string;
};

function database() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error("Databáza profilov nie je dostupná.");
  return db;
}

/** The public canonical categories, not the old redirected directory aliases. */
const HELP_PICKER_CATEGORIES = [
  ...helpCategories.filter(category => category.slug === "adopcia" || category.slug === "utulky")
    .map(({ slug, label }) => ({ slug, label })),
  { slug: "stratene-psy", label: "Stratené psy" },
  { slug: "najdene-psy", label: "Nájdené psy" },
  ...helpCategories.filter(category => ["docasna-opatera", "zbierky", "dobrovolnictvo"].includes(category.slug))
    .map(({ slug, label }) => ({ slug, label })),
  { slug: "urgentne-pripady", label: "Urgentné prípady" },
];
const EVENT_PICKER_CATEGORIES = eventTypes.map(type => ({
  slug: eventPortalCategory(type).href.split("/").pop()!,
  label: eventPortalCategory(type).label,
  type,
}));
const GROUPS = [
  { id: "directory", label: "Služby pre psov", categories: directoryCategories.map(({ slug, label }) => ({ slug, label })) },
  { id: "help", label: "Pomoc psom", categories: HELP_PICKER_CATEGORIES },
  { id: "events", label: "Podujatia", categories: EVENT_PICKER_CATEGORIES.map(({slug,label}) => ({slug,label})) },
  { id: "breeds", label: "Plemená", categories: [
    { slug: "all", label: "Všetky plemená" },
    ...fciGroups.map(group => ({ slug: "fci-" + group.number, label: "FCI " + group.number + " · " + group.label })),
  ] },
] as const;

function scopeFrom(input: { get(name: string): string | null }): ScopedCategory | null {
  const group = input.get("group") || "directory";
  const category = input.get("category") || "";
  if (!GROUPS.some(item => item.id === group && item.categories.some(option => option.slug === category))) return null;
  return {group: group as Group, category};
}
function eventTypeFor(category: string): EventType | null {
  return EVENT_PICKER_CATEGORIES.find(item => item.slug === category)?.type || null;
}

function pickerSql(scope: ScopedCategory): PickerSql {
  if (scope.group === "breeds") {
    const group = scope.category === "all" ? null : Number(scope.category.slice(4));
    return {
      select: "id, name AS title, slug, fci_group, ('FCI ' || fci_group || ' · ' || COALESCE(NULLIF(origin,''), 'Pôvod neuvedený')) AS detail, image_url",
      table: "managed_breeds",
      where: "id IN (" + canonicalBreedIdsSql + ")" + (group === null ? "" : " AND fci_group = ?"),
      bindings: group === null ? [] : [group],
      searchExpression: "(name || ' ' || COALESCE(official_fci_name,''))",
      order: "name COLLATE NOCASE ASC, id ASC",
    };
  }
  if (scope.group === "directory") {
    // Keep historical schools discoverable under the canonical Trainers category.
    const schools = scope.category === "treneri";
    return {
      select: "id, name AS title, slug, city AS detail, image_url, category AS source_category",
      table: "directory_profiles",
      where: schools
        ? "status = 'published' AND category IN ('treneri', 'psie-skoly')"
        : "status = 'published' AND category = ?",
      bindings: schools ? [] : [scope.category],
      searchExpression: "name", order: "name COLLATE NOCASE ASC, id ASC",
    };
  }
  if (scope.group === "events") {
    const eventType = eventTypeFor(scope.category);
    if (!eventType) throw Error("Neplatný typ podujatia.");
    return {
      select: "id, title, slug, city AS detail, image_url",
      table: "managed_events",
      where: "status = 'published' AND cancelled = 0 AND event_type = ? AND COALESCE(end_date,start_date) >= ?",
      bindings: [eventType, bratislavaDateKey()],
      searchExpression: "title", order: "start_date ASC, id ASC",
    };
  }
  if (scope.category === "utulky") return {
    select: "id, name AS title, slug, city AS detail, image_url",
    table: "help_organizations",
    where: "status = 'PUBLISHED' AND published_at IS NOT NULL AND archived_at IS NULL",
    bindings: [], searchExpression: "name", order: "name COLLATE NOCASE ASC, id ASC",
  };
  if (scope.category === "adopcia") return {
    select: "id, name AS title, slug, city AS detail, main_image AS image_url",
    table: "adoption_dogs",
    where: "status IN ('ACTIVE','RESERVED')",
    bindings: [], searchExpression: "name", order: "COALESCE(published_at,updated_at) DESC, id DESC",
  };
  if (scope.category === "stratene-psy" || scope.category === "najdene-psy") return {
    select: "id, COALESCE(NULLIF(dog_name,''), NULLIF(breed,''), 'Pes') AS title, slug, city AS detail, main_image AS image_url, type",
    table: "lost_found_dog_reports",
    where: "type = ? AND status = 'ACTIVE' AND published_at IS NOT NULL AND duplicate_of_id IS NULL AND (expires_at IS NULL OR expires_at > ?)",
    bindings: [scope.category === "stratene-psy" ? "LOST" : "FOUND", new Date().toISOString()],
    searchExpression: "COALESCE(dog_name,breed,'Pes')", order: "event_date DESC, id DESC",
  };
  return {
    select: "id, title, slug, city AS detail, image_url",
    table: "help_cases",
    where: "status = 'published' AND resolved = 0 AND category = ?",
    bindings: [scope.category], searchExpression: "title", order: "updated_at DESC, id DESC",
  };
}

function profileUrl(scope: ScopedCategory, row: PickerRow): string {
  if (scope.group === "breeds") return breedProfileHref(row.slug, row.fci_group);
  if (scope.group === "directory") {
    const category = row.source_category || scope.category;
    if (!isDirectoryCategory(category)) throw Error("Neznáma kategória profilu.");
    return directoryProfileHref({ category: category as DirectoryCategorySlug, slug: row.slug });
  }
  if (scope.group === "events") return eventHref({ slug: row.slug });
  if (scope.category === "utulky") return "/organizacie/" + row.slug;
  if (scope.category === "adopcia") return "/pomoc-psom/adopcia/" + row.slug;
  if (scope.category === "stratene-psy" || scope.category === "najdene-psy")
    return "/pomoc-psom/" + scope.category + "/" + row.slug;
  return "/pomoc-psom/" + scope.category + "/" + row.slug;
}
function displayTitle(scope: ScopedCategory, row: PickerRow) {
  if (scope.category === "stratene-psy") return "Stratený pes: " + row.title;
  if (scope.category === "najdene-psy") return "Nájdený pes: " + row.title;
  return row.title;
}

export async function GET(request: Request) {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  const params = new URL(request.url).searchParams;
  if (params.get("catalog") === "1") return Response.json({ groups: GROUPS }, { headers: NO_STORE });
  const scope = scopeFrom(params);
  if (!scope) return Response.json({ error: "Vyber sekciu a kategóriu." }, {status: 400, headers: NO_STORE});
  const page = Math.max(1, Math.min(5000, Number.parseInt(params.get("page") || "1", 10) || 1));
  const search = (params.get("query") || "").trim().slice(0, 100);
  const sql = pickerSql(scope);
  const escaped = search.replace(/[\\%_]/g, "\\$&");
  const condition = search ? " AND LOWER(" + sql.searchExpression + ") LIKE LOWER(?) ESCAPE '\\'" : "";
  const args = search ? [...sql.bindings, "%" + escaped + "%"] : sql.bindings;
  try {
    const db = database();
    const [items, count] = await db.batch([
      db.prepare("SELECT " + sql.select + " FROM " + sql.table + " WHERE " + sql.where + condition +
        " ORDER BY " + sql.order + " LIMIT ? OFFSET ?").bind(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE),
      db.prepare("SELECT COUNT(*) AS total FROM " + sql.table + " WHERE " + sql.where + condition).bind(...args),
    ]);
    const rows = (items.results || []) as PickerRow[];
    const total = Number((count.results?.[0] as {total?:number}|undefined)?.total || 0);
    const markerType = facebookShareMarkerType(scope.group, scope.category);
    if (!markerType) throw new Error("Neplatná sekcia evidencie.");
    const markers = await readFacebookShareMarkers(markerType, rows.map(row => row.id), db);
    return Response.json({
      items: rows.map(row => ({
        id: row.id, title: displayTitle(scope, row), detail: row.detail || "",
        sharedToFacebook: markers.marked.has(row.id),
        imageUrl: scope.group === "breeds" ? ownedBreedImage(row.image_url) : row.image_url || "",
        url: "https://psipedia.sk" + profileUrl(scope,row),
      })),
      page, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      markingAvailable: markers.available,
    }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Profily sa nepodarilo načítať." }, {status: 503, headers: NO_STORE});
  }
}

/** Read a public canonical record again on selection, never trust the client-supplied link. */
export async function POST(request: Request) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const raw: unknown = await request.json().catch(() => null);
  const input = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown> : null;
  const id = input?.profileId;
  if (!Number.isSafeInteger(id) || Number(id) <= 0)
    return Response.json({ error: "Vyber platný profil." }, { status: 400, headers: NO_STORE });
  const scopeParams = new URLSearchParams({
    group: typeof input?.group === "string" ? input.group : "directory",
    category: typeof input?.category === "string" ? input.category : "",
  });
  const scope = scopeFrom(scopeParams);
  if (!scope) return Response.json({ error: "Vyber platnú sekciu a kategóriu." }, {status: 400, headers: NO_STORE});
  try {
    const sql = pickerSql(scope);
    const profile = await database().prepare("SELECT " + sql.select + " FROM " + sql.table + " WHERE " +
      sql.where + " AND id = ? LIMIT 1").bind(...sql.bindings, Number(id)).first<PickerRow>();
    if (!profile) return Response.json({error:"Profil nie je verejne dostupný alebo už nie je aktívny."},
      {status:409, headers:NO_STORE});
    let image = { imageKey: "", imageUrl: "" };
    let imageWarning = "";
    const sourceImage = scope.group === "breeds" ? ownedBreedImage(profile.image_url) : profile.image_url;
    if (sourceImage) {
      try { image = await copyFacebookProfileImage(sourceImage); }
      catch { imageWarning = "Hlavný obrázok profilu sa nepodarilo prevziať. Nahraj ho ručne."; }
    } else imageWarning = "Profil nemá hlavný obrázok. Nahraj ho ručne.";
    // The profile's canonical image_url is the only image source.
    // There is no separate required profile logo or second R2 copy.
    return Response.json({
      profile: { id: profile.id, title: displayTitle(scope, profile), url: "https://psipedia.sk" + profileUrl(scope, profile) },
      image, imageWarning,
    }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Profil sa nepodarilo načítať." }, {status:503, headers:NO_STORE});
  }
}
