import { areaOfManualTransferScope, normalizeManualPageId, validManualPageId, type NotionManualTransferArea } from "./notion-manual-transfer-contract.ts";
import { helpAdminDomainSql, isHelpAdminDedicatedCategory } from "./help-admin-query.ts";
import { isAdminNotionSyncLocked, readAdminNotionReviewLocks, type LockableAgenda } from "./admin-notion-review-lock.ts";
import { readDirectoryReviewLock, readDirectoryReviewLocks, directoryReviewLockedFromProjection } from "./directory-reviewed-sync-lock.ts";

/** Static SQL registry; no caller-supplied table/column names. */
const specs = [
  { kind: "breeds", table: "managed_breeds", name: "name", mapping: "breed_notion_workcopy_links", id: "breed_id", page: "work_notion_page_id", editor: "/admin/plemena" },
  { kind: "directory", table: "directory_profiles", name: "name", mapping: "directory_notion_sync", id: "directory_profile_id", page: "notion_page_id", editor: "/admin/adresar" },
  { kind: "events", table: "managed_events", name: "title", mapping: "event_notion_sync", id: "event_id", page: "notion_page_id", editor: "/admin/podujatia" },
  { kind: "eshops", table: "managed_eshops", name: "name", mapping: "eshop_notion_sync", id: "eshop_id", page: "notion_page_id", editor: "/admin/recenzie/eshopy" },
  { kind: "organizations", table: "help_organizations", name: "name", mapping: "notion_agenda_sync", id: "entity_id", page: "notion_page_id", editor: "/admin/organizacie" },
  { kind: "adoptions", table: "adoption_dogs", name: "name", mapping: "notion_agenda_sync", id: "entity_id", page: "notion_page_id", editor: "/admin/adopcie" },
  { kind: "help-cases", table: "help_cases", name: "title", mapping: "notion_agenda_sync", id: "entity_id", page: "notion_page_id", editor: "/admin/pomoc" },
  { kind: "lost-found", table: "lost_found_dog_reports", name: "dog_name", mapping: "notion_agenda_sync", id: "entity_id", page: "notion_page_id", editor: "/admin/stratene-najdene" },
] as const;
type Spec = (typeof specs)[number];
type MappingLink = { scope: string; profile_id: number; notion_page_id: string };

function lockableAgenda(kind:string):kind is LockableAgenda {
  return ["events","organizations","adoptions","help-cases","lost-found"].includes(kind);
}

function kindOf(scope: string) {
  return scope.startsWith("directory:") ? "directory" : scope;
}
function specFor(scope: string) {
  return specs.find(spec => spec.kind === kindOf(scope));
}
function eligibleId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}
export { normalizeManualPageId, validManualPageId } from "./notion-manual-transfer-contract.ts";
export function manualMappingEditorHref(scope: string, id: unknown): string | null {
  const spec = specFor(scope);
  return spec && eligibleId(id) ? spec.editor + "/" + id : null;
}

const pageKey = "lower(replace(page_id,'-',''))";
const mapped = specs.map(spec => {
  const condition = spec.mapping === "notion_agenda_sync" ? " WHERE agenda='" + spec.kind + "'" : "";
  const state = spec.kind === "breeds"
    ? "CASE WHEN status='ACTIVE' AND NULLIF(TRIM(work_sync_receipt),'') IS NOT NULL THEN 1 ELSE 0 END"
    : "1";
  return "SELECT '" + spec.kind + "' AS kind," + spec.id + " AS profile_id," +
    spec.page + " AS page_id," + state + " AS eligible FROM " + spec.mapping + condition;
}).join(" UNION ALL ");
const mappingCte = "WITH mapped AS (" + mapped + ")";

/** Check across all supported manual-transfer agendas. Equal numeric IDs in
 * different canonical tables are NOT an identity collision. */
export async function assertManualMappingsUnique(db: D1Database, links: readonly MappingLink[]) {
  const response = await db.prepare(mappingCte +
    " SELECT kind,profile_id,NULL AS page_key FROM mapped WHERE eligible=1" +
    " GROUP BY kind,profile_id HAVING COUNT(*)>1" +
    " UNION ALL SELECT NULL,NULL," + pageKey + " FROM mapped WHERE eligible=1 AND page_id IS NOT NULL" +
    " GROUP BY " + pageKey + " HAVING COUNT(*)>1")
    .all<{ kind: string | null; profile_id: number | null; page_key: string | null }>();
  if (!response.success || !Array.isArray(response.results)) throw Error("TRANSFER_MAPPING_CHECK_UNAVAILABLE");
  const ambiguous = new Set(response.results.filter(row => row.kind !== null)
    .map(row => row.kind + ":" + row.profile_id));
  const duplicatePages = new Set(response.results.map(row => row.page_key).filter(Boolean));
  for (const link of links) {
    if (ambiguous.has(kindOf(link.scope) + ":" + link.profile_id))
      throw Error("TRANSFER_PROFILE_AMBIGUOUS");
    const key = normalizeManualPageId(link.notion_page_id);
    if (key && duplicatePages.has(key)) throw Error("TRANSFER_DUPLICATE_NOTION_PAGE");
  }
}

export type ManualMappingIssue = "MAPPING_MISSING" | "PROFILE_ID_INVALID" | "PAGE_ID_MISSING" |
  "PAGE_ID_INVALID" | "PAGE_ID_FORMAT_UNSUPPORTED" | "CANONICAL_MISSING" |
  "MAPPING_INACTIVE" | "PAGE_DUPLICATE" | "PROFILE_AMBIGUOUS" | "CATEGORY_UNSUPPORTED" |
  "PROFILE_ARCHIVED" | "PROFILE_REVIEWED" | "PARTNER_MANAGED" | "UNLOCK_PENDING" |
  "DELETION_PENDING" | "LOCK_CHECK_UNAVAILABLE";

export type ManualMappingDiagnostic = {
  scope: string; profileId: number | null; name: string; editorHref: string | null;
  mappingTable: string; canonicalStatus: string | null; category: string | null; expectedSource: string; issues: ManualMappingIssue[];
  relatedMappings: Array<{kind:string;profileId:number|null}>;
  relatedMappingsTruncated: boolean;
  remote: "NOT_CHECKED" | "VERIFIED" | "BLOCKED" | "UNAVAILABLE" | "IDENTITY_MISMATCH" |
    "SOURCE_MISMATCH" | "PAGE_ARCHIVED" | "PAGE_INACCESSIBLE";
};

type DiagnosticRow = {
  kind: string; scope: string; profile_id: number | null; name: string | null;
  canonical_status: string | null; canonical_exists: number; mapping_exists: number;
  category: string | null; domain_allowed: number;
  page_id: string | null; eligible: number | null; identity_count: number; page_count: number;
};

function expectedSource(kind: string) {
  const labels: Record<string,string> = {
    breeds: "Plemená — aktívna pracovná kópia", directory: "Adresár", events: "Podujatia",
    eshops: "E-shopy", organizations: "Organizácie", adoptions: "Adopcie",
    "help-cases": "Pomoc psom — prípady", "lost-found": "Stratené a nájdené",
  };
  return labels[kind] ?? "Neznámy zdroj";
}

function canonicalSelect(spec: Spec) {
  const scope = spec.kind === "directory" ? "'directory:' || p.category" : "'" + spec.kind + "'";
  const category = spec.kind === "directory" || spec.kind === "help-cases" ? "p.category" : "NULL";
  const domain = spec.kind === "help-cases" ? "CASE WHEN " + helpAdminDomainSql("p.category") + " THEN 1 ELSE 0 END" : "1";
  return "SELECT '" + spec.kind + "' AS kind," + scope + " AS scope,p.id AS profile_id,p." +
    spec.name + " AS name,p.status AS canonical_status," + category + " AS category," +
    domain + " AS domain_allowed FROM " + spec.table + " p";
}

export function classifyManualMapping(row: DiagnosticRow, allowedScopes: ReadonlySet<string>): ManualMappingIssue[] {
  const issues: ManualMappingIssue[] = [];
  if (!eligibleId(row.profile_id)) issues.push("PROFILE_ID_INVALID");
  if (!row.canonical_exists) issues.push("CANONICAL_MISSING");
  if (row.canonical_exists && (!allowedScopes.has(row.scope) || !row.domain_allowed)) issues.push("CATEGORY_UNSUPPORTED");
  if (!row.mapping_exists) issues.push("MAPPING_MISSING");
  else {
    if (row.page_id === null || (typeof row.page_id === "string" && !row.page_id.trim())) issues.push("PAGE_ID_MISSING");
    else if (!normalizeManualPageId(row.page_id)) issues.push("PAGE_ID_INVALID");
    else if (!validManualPageId(row.scope, row.page_id)) issues.push("PAGE_ID_FORMAT_UNSUPPORTED");
    if (!row.eligible) issues.push("MAPPING_INACTIVE");
    if (row.identity_count > 1) issues.push("PROFILE_AMBIGUOUS");
    if (row.page_count > 1) issues.push("PAGE_DUPLICATE");
  }
  if (row.canonical_status?.toLowerCase() === "archived") issues.push("PROFILE_ARCHIVED");
  return issues;
}

export const MANUAL_MAPPING_DIAGNOSTIC_LIMIT = 50;

/** Pure D1 SELECTs. No queue creation, provider call or mapping changes.
 * Scan canonical records and orphaned mappings, including unmapped profiles. */
export async function readManualMappingDiagnostics(
  db: D1Database,
  input: { area: NotionManualTransferArea; scope?: string; profileId?: number; offset: number },
  allowedScopes: ReadonlySet<string>,
) {
  const selected = specs.filter(spec => input.scope
    ? kindOf(input.scope) === spec.kind
    : spec.kind === input.area || areaOfManualTransferScope(spec.kind) === input.area);
  if (!selected.length || !Number.isSafeInteger(input.offset) || input.offset < 0 || input.offset > 10000)
    throw Error("TRANSFER_DIAGNOSTIC_REQUEST_INVALID");
  const canonical = selected.map(canonicalSelect).join(" UNION ALL ");
  const kindList = selected.map(spec => "'" + spec.kind + "'").join(",");
  const sql = mappingCte + ", canonical AS (" + canonical + "), rows AS (" +
    " SELECT c.kind,c.scope,c.profile_id,c.name,c.canonical_status,c.category,c.domain_allowed,1 AS canonical_exists," +
    " CASE WHEN m.kind IS NULL THEN 0 ELSE 1 END AS mapping_exists,m.page_id,m.eligible" +
    " FROM canonical c LEFT JOIN mapped m ON m.kind=c.kind AND m.profile_id=c.profile_id" +
    " UNION ALL SELECT m.kind,m.kind,m.profile_id,NULL,NULL,NULL,0,0,1,m.page_id,m.eligible" +
    " FROM mapped m WHERE m.kind IN (" + kindList + ") AND NOT EXISTS" +
    " (SELECT 1 FROM canonical c WHERE c.kind=m.kind AND c.profile_id=m.profile_id)" +
    "), identities AS (SELECT kind,profile_id,COUNT(*) AS n FROM mapped WHERE eligible=1 GROUP BY kind,profile_id)," +
    " pages AS (SELECT " + pageKey + " AS page_key,COUNT(*) AS n FROM mapped WHERE eligible=1 GROUP BY " + pageKey + ")" +
    " SELECT r.*,COALESCE(i.n,0) AS identity_count,COALESCE(p.n,0) AS page_count" +
    " FROM rows r LEFT JOIN identities i ON i.kind=r.kind AND i.profile_id=r.profile_id" +
    " LEFT JOIN pages p ON p.page_key=lower(replace(r.page_id,'-',''))" +
    " WHERE (r.domain_allowed=1 OR r.mapping_exists=1) AND (? IS NULL OR r.scope=?) AND (? IS NULL OR r.profile_id=?)" +
    " ORDER BY r.kind,r.profile_id,r.page_id LIMIT ? OFFSET ?";
  const response = await db.prepare(sql).bind(
    input.scope ?? null,input.scope ?? null,input.profileId ?? null,input.profileId ?? null,
    MANUAL_MAPPING_DIAGNOSTIC_LIMIT + 1,input.offset,
  ).all<DiagnosticRow>();
  if (!response.success || !Array.isArray(response.results)) throw Error("TRANSFER_MAPPING_CHECK_UNAVAILABLE");
  const rows = response.results.slice(0, MANUAL_MAPPING_DIAGNOSTIC_LIMIT);
  const directoryIds=rows.filter(row=>row.kind==="directory"&&row.canonical_exists&&eligibleId(row.profile_id)).map(row=>row.profile_id!);
  const locks=await readDirectoryReviewLocks(db,directoryIds).catch(()=>null);
  const agendaLocks=new Map<string,Awaited<ReturnType<typeof readAdminNotionReviewLocks>>|null>();
  for(const kind of new Set(rows.map(row=>row.kind))){
    if(!lockableAgenda(kind))continue;
    const ids=rows.filter(row=>row.kind===kind&&row.canonical_exists&&eligibleId(row.profile_id)).map(row=>row.profile_id!);
    agendaLocks.set(kind,await readAdminNotionReviewLocks(db,kind,ids).catch(()=>null));
  }
  // Show the other typed identities behind a duplicate without disclosing raw UUIDs.
  const duplicateKeys=[...new Set(rows.filter(row=>row.page_count>1).map(row=>normalizeManualPageId(row.page_id)).filter((key):key is string=>key!==null))];
  const related=new Map<string,Array<{kind:string;profileId:number|null}>>();
  if(duplicateKeys.length){
    const matches=await db.prepare(mappingCte+
      " SELECT kind,profile_id,page_key FROM (SELECT kind,profile_id,"+pageKey+" AS page_key,"+
      " ROW_NUMBER() OVER (PARTITION BY "+pageKey+" ORDER BY kind,profile_id) AS rank"+
      " FROM mapped WHERE eligible=1 AND "+pageKey+" IN ("+duplicateKeys.map(()=>"?").join(",")+")) WHERE rank<=12")
      .bind(...duplicateKeys).all<{kind:string;profile_id:number|null;page_key:string}>();
    if(!matches.success||!Array.isArray(matches.results))throw Error("TRANSFER_MAPPING_CHECK_UNAVAILABLE");
    for(const match of matches.results){
      const list=related.get(match.page_key)??[];
      list.push({kind:match.kind,profileId:eligibleId(match.profile_id)?match.profile_id:null});
      related.set(match.page_key,list);
    }
  }
  const result = rows.map(row => {
    const issues = classifyManualMapping(row, allowedScopes);
    if (row.kind === "directory" && row.canonical_exists && eligibleId(row.profile_id)) {
      try {
        const lock = locks?.get(row.profile_id);
        if (!lock) issues.push("LOCK_CHECK_UNAVAILABLE");
        else {
          if (lock.sql_reviewed_at?.trim()) issues.push("PROFILE_REVIEWED");
          if (Number(lock.partner_active) === 1) issues.push("PARTNER_MANAGED");
          if (Number(lock.sql_unlock_pending) === 1) issues.push("UNLOCK_PENDING");
          if (Number(lock.deletion_pending) === 1) issues.push("DELETION_PENDING");
          if (directoryReviewLockedFromProjection(lock) && !issues.length)
            issues.push("LOCK_CHECK_UNAVAILABLE");
        }
      } catch {
        issues.push("LOCK_CHECK_UNAVAILABLE");
      }
    }
    if(lockableAgenda(row.kind)&&row.canonical_exists&&eligibleId(row.profile_id)){
      const lock=agendaLocks.get(row.kind)?.get(row.profile_id);
      if(!lock)issues.push("LOCK_CHECK_UNAVAILABLE");
      else {
        if(Number(lock.reviewed)===1)issues.push("PROFILE_REVIEWED");
        if(Number(lock.owned)===1)issues.push("PARTNER_MANAGED");
      }
    }
    const diagnostic: ManualMappingDiagnostic = {
      scope: row.scope,
      profileId: eligibleId(row.profile_id) ? row.profile_id : null,
      name: row.name ?? "",
      editorHref: row.canonical_exists && row.domain_allowed ? manualMappingEditorHref(row.scope, row.profile_id) : null,
      mappingTable: specFor(row.kind)!.mapping,
      canonicalStatus: row.canonical_status,
      category: row.category,
      expectedSource: expectedSource(row.kind),
      relatedMappings: related.get(normalizeManualPageId(row.page_id)??"")??[],
      relatedMappingsTruncated: row.page_count>12,
      issues,
      remote: "NOT_CHECKED",
    };
    return { diagnostic, pageId: row.page_id };
  });
  return { result, offset: input.offset, hasMore: response.results.length > MANUAL_MAPPING_DIAGNOSTIC_LIMIT };
}

/** Re-check canonical existence and archive/lock state before each preview or
 * execution. The existing adapters remain responsible for remote identity and writes. */
export async function assertManualMappingEligible(db: D1Database, link: MappingLink) {
  if (!eligibleId(link.profile_id) || !validManualPageId(link.scope,link.notion_page_id))
    throw Error("TRANSFER_MAPPING_INVALID");
  const spec = specFor(link.scope);
  if (!spec) throw Error("TRANSFER_SCOPE_UNSUPPORTED");
  const category = spec.kind === "directory" || spec.kind === "help-cases" ? ",category" : "";
  const row = await db.prepare("SELECT status" + category + " FROM " + spec.table + " WHERE id=?")
    .bind(link.profile_id).first<{status: string;category?:string}>();
  if (!row) throw Error("TRANSFER_CANONICAL_MISSING");
  if (spec.kind === "directory" && "directory:" + row.category !== link.scope)
    throw Error("TRANSFER_CATEGORY_MISMATCH");
  if (spec.kind === "help-cases" && (!row.category || isHelpAdminDedicatedCategory(row.category)))
    throw Error("TRANSFER_CATEGORY_MISMATCH");
  if (row.status.toLowerCase() === "archived") throw Error("TRANSFER_PROFILE_ARCHIVED");
  if (spec.kind === "directory" &&
    directoryReviewLockedFromProjection(await readDirectoryReviewLock(db,link.profile_id)))
    throw Error("TRANSFER_PROFILE_LOCKED");
  if(lockableAgenda(spec.kind)&&await isAdminNotionSyncLocked(db,spec.kind,link.profile_id))
    throw Error("TRANSFER_PROFILE_LOCKED");
  await assertManualMappingsUnique(db,[link]);
}

export function manualRemoteDiagnostic(error: unknown): ManualMappingDiagnostic["remote"] {
  const code = error instanceof Error ? error.message : "";
  if (code === "TRANSFER_CATEGORY_MISMATCH") return "IDENTITY_MISMATCH";
  if (code === "TRANSFER_REMOTE_SOURCE_MISMATCH") return "SOURCE_MISMATCH";
  if (code === "TRANSFER_REMOTE_PAGE_ARCHIVED") return "PAGE_ARCHIVED";
  if (/^Notion API (?:403|404):/.test(code)) return "PAGE_INACCESSIBLE";
  if (/^(?:TRANSFER_REMOTE_IDENTITY_MISMATCH|TRANSFER_(?:DIRECTORY|ESHOP|EVENTS_HELP)_IDENTITY_MISMATCH|BREED_WORKCOPY_ID_MISMATCH|TRANSFER_IDENTITY_CHANGED)$/.test(code))
    return "IDENTITY_MISMATCH";
  return "UNAVAILABLE";
}

export function assertManualRemoteIdentity(input: {
  page: { id: string; archived?: boolean; in_trash?: boolean };
  pageId: string; belongsToSource: boolean; claimedId: string; profileId: number;
}) {
  if (input.page.archived || input.page.in_trash) throw Error("TRANSFER_REMOTE_PAGE_ARCHIVED");
  if (normalizeManualPageId(input.page.id) !== normalizeManualPageId(input.pageId) ||
    !normalizeManualPageId(input.pageId) || input.claimedId !== String(input.profileId))
    throw Error("TRANSFER_REMOTE_IDENTITY_MISMATCH");
  if (!input.belongsToSource) throw Error("TRANSFER_REMOTE_SOURCE_MISMATCH");
}
