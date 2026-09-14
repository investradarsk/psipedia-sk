import { eventDateStatus, type DogEvent } from "./events";

export type AdminEventSummary = Pick<DogEvent, "id" | "slug" | "title" | "eventType" | "status" | "startDate" | "startTime" | "endDate" | "endTime" | "city" | "venue" | "region" | "organizer" | "cancelled" | "updatedAt">;
export type AdminEventFilters = { query: string; time: string; status: string; type: string; region: string; month: string; year: string; sort: string };
export const defaultEventFilters: AdminEventFilters = { query: "", time: "all", status: "all", type: "", region: "", month: "", year: "", sort: "date" };
export function normalizeEventSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("sk");
}
export function adminEventCounts(events: AdminEventSummary[], today: string) {
  const counts = { all: events.length, upcoming: 0, current: 0, past: 0, published: 0, draft: 0, cancelled: 0 };
  for (const event of events) {
    counts[event.status]++;
    if (event.cancelled) counts.cancelled++;
    else counts[eventDateStatus(event, today)]++;
  }
  return counts;
}
export function filterAdminEvents(events: AdminEventSummary[], filters: AdminEventFilters, today: string) {
  const needles = normalizeEventSearch(filters.query).trim().split(/\s+/).filter(Boolean);
  const result = events.filter((event) => {
    const haystack = normalizeEventSearch([event.title, event.city, event.venue, event.organizer, event.eventType, event.region, event.slug].join(" "));
    const dateMatches = filters.time === "all" || (filters.time === "cancelled" ? event.cancelled : !event.cancelled && eventDateStatus(event, today) === filters.time);
    return dateMatches && (filters.status === "all" || event.status === filters.status)
      && (!filters.type || event.eventType === filters.type) && (!filters.region || event.region === filters.region)
      && (!filters.month || event.startDate.slice(5, 7) === filters.month) && (!filters.year || event.startDate.slice(0, 4) === filters.year)
      && needles.every((needle) => haystack.includes(needle));
  });
  const rank = (event: AdminEventSummary) => event.cancelled ? 3 : ({ current: 0, upcoming: 1, past: 2 })[eventDateStatus(event, today)];
  return result.sort((a, b) => {
    if (filters.sort === "title") return a.title.localeCompare(b.title, "sk") || a.id - b.id;
    if (filters.sort === "updated") return b.updatedAt.localeCompare(a.updatedAt) || a.id - b.id;
    const group = rank(a) - rank(b);
    if (group) return group;
    const date = rank(a) >= 2 ? (b.endDate || b.startDate).localeCompare(a.endDate || a.startDate) : a.startDate.localeCompare(b.startDate);
    return date || a.startTime.localeCompare(b.startTime) || a.id - b.id;
  });
}

export type BulkEventSelection = { id: number; status: "draft" | "published"; updatedAt: string };
export function validateBulkEvents(value: unknown): { events: BulkEventSelection[]; status: "draft" | "published" } {
  const input = value as { events?: BulkEventSelection[]; status?: string; confirmedCount?: number } | null;
  if (!input || !Array.isArray(input.events) || !input.events.length || input.events.length > 500 || input.confirmedCount !== input.events.length || !["draft", "published"].includes(input.status || "")) throw new Error("Potvrď platný výber 1 až 500 podujatí.");
  const status = input.status as "draft" | "published";
  const seen = new Set<number>();
  for (const event of input.events) {
    if (!event || !Number.isSafeInteger(event.id) || event.id <= 0 || seen.has(event.id) || !["draft", "published"].includes(event.status) || event.status === status || typeof event.updatedAt !== "string" || !event.updatedAt.trim()) throw new Error("Výber podujatí je neplatný. Obnov zoznam.");
    seen.add(event.id);
  }
  return { events: input.events.map(({ id, status, updatedAt }) => ({ id, status, updatedAt })), status };
}

// One atomic statement: every selected row must still match the reviewed version.
// No content, slug, media, SEO or creation audit fields are touched.
export const bulkEventStatusSql = `
  WITH requested AS (
    SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.status') AS status,
           json_extract(value, '$.updatedAt') AS updated_at FROM json_each(?)
  )
  UPDATE managed_events SET status = ?, updated_at = ?, updated_by = ?,
    published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END
  WHERE id IN (SELECT id FROM requested)
    AND (SELECT COUNT(*) FROM managed_events e JOIN requested r ON e.id = r.id
         AND e.status = r.status AND e.updated_at = r.updated_at) = ?
  RETURNING id
`;
