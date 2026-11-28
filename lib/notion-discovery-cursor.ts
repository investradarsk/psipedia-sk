import { notionRequest, type NotionPage, type NotionSyncBindings } from "./notion-sync-shared.ts";

type Agenda = "directory" | "eshops" | "breeds" | "articles";
type Response<T> = { results?: T[]; has_more?: boolean; next_cursor?: string | null };
type Claim = { next_cursor: string | null; version: number };
const LEASE_MS = 600_000;

/** A bounded backup scan, independent of webhook delivery and field authority.
 * Uses immutable creation order, not last edit order (our own writes change it).
 * This is only candidate discovery: callers retain all ownership/import checks.
 * Cursor advances after a valid query; failed processing is revisited on wrap.
 */
export async function rotateNotionDiscovery<T extends NotionPage>(input: {
  database: D1Database; bindings: NotionSyncBindings; agenda: Agenda;
  sourceId: string; limit: number; filter?: Record<string, unknown>;
}): Promise<T[]> {
  const { database, bindings, agenda } = input;
  const source = input.sourceId.trim().replaceAll("-", "").toLowerCase();
  if (bindings.NOTION_PROFILE_AUTHORITY_MODE !== "validated-text" ||
      !/^[a-f0-9]{32}$/.test(source) || !Number.isInteger(input.limit) ||
      input.limit < 1 || input.limit > 20) throw Error("NOTION_DISCOVERY_SCOPE_INVALID");
  const now = Date.now();
  await database.prepare("INSERT OR IGNORE INTO notion_discovery_cursor(agenda,source_id) VALUES(?,?)")
    .bind(agenda,source).run();
  const claim = await database.prepare(
    "UPDATE notion_discovery_cursor SET lease_until=?,version=version+1 "+
    "WHERE agenda=? AND source_id=? AND (lease_until IS NULL OR lease_until<=?) "+
    "RETURNING next_cursor,version"
  ).bind(now+LEASE_MS,agenda,source,now).first<Claim>();
  if (!claim) return [];
  let next = claim.next_cursor;
  try {
    const response = await notionRequest<Response<T>>(bindings,
      "/data_sources/"+encodeURIComponent(input.sourceId.trim())+"/query", {
      method:"POST",body:JSON.stringify({
        sorts:[{timestamp:"created_time",direction:"ascending"}],
        page_size:input.limit,
        ...(input.filter?{filter:input.filter}:{}),
        ...(next?{start_cursor:next}:{}),
      }),
    });
    if (!Array.isArray(response.results) || response.results.length > input.limit ||
        typeof response.has_more !== "boolean" ||
        (response.has_more && (typeof response.next_cursor !== "string" ||
          !response.next_cursor || response.next_cursor.length > 2048 ||
          response.next_cursor === next)) ||
        response.results.some(page => !page || typeof page.id !== "string" ||
          !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(page.id)))
      throw Error("NOTION_DISCOVERY_QUERY_INCOMPLETE");
    next = response.has_more ? response.next_cursor! : null;
    return response.results;
  } catch (error) {
    // A stale provider cursor may become invalid after structural edits.
    // Restart on the next tick, while surfacing the error to the caller.
    if (next && error instanceof Error && /^Notion API 400:/.test(error.message)) next=null;
    throw error;
  } finally {
    const saved=await database.prepare(
      "UPDATE notion_discovery_cursor SET next_cursor=?,lease_until=NULL "+
      "WHERE agenda=? AND source_id=? AND version=?"
    ).bind(next,agenda,source,claim.version).run();
    if(!saved.success || saved.meta.changes!==1) throw Error("NOTION_DISCOVERY_LEASE_LOST");
  }
}

/** Merge remote candidates without processing a page twice in one sweep. */
export function mergeNotionDiscovery<T extends NotionPage>(...groups:T[][]):T[]{
  const pages=new Map<string,T>();
  for(const group of groups)for(const page of group){
    const key=page.id.replaceAll("-","").toLowerCase();
    if(!pages.has(key))pages.set(key,page);
  }
  return [...pages.values()];
}
