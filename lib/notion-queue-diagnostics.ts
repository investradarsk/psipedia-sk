import { manualMappingEditorHref } from "./notion-manual-transfer-mapping.ts";

type QueueState = "PENDING" | "PROCESSING" | "REVIEW";
type Mapping = {agenda:string;entity_id:number};
export type NotionQueueIssue = {
  source:"webhook"|"article"; agenda:string|null; entityId:number|null;
  editorHref:string|null; state:QueueState; reason:string; attempts:number|null;
  updatedAt:string|null; nextAttemptAt:string|null;
};
export type NotionQueueDiagnostics = {
  inbox:{pending:number;processing:number;review:number;deleted:number;expired:number}|null;
  articles:{pending:number;processing:number;expired:number}|null;
  issues:NotionQueueIssue[]; truncated:boolean; mappingAvailable:boolean;
};
const iso=(n:unknown)=>typeof n==="number"&&Number.isSafeInteger(n)&&n>=0&&n<253402300799
  ?new Date(n*1000).toISOString():null;
const timestamp=(s:unknown)=>typeof s==="string"&&Number.isFinite(Date.parse(s))?s:null;
const safeCode=(s:unknown)=>typeof s==="string"&&/^[A-Z][A-Z0-9_]{1,100}$/.test(s)?s:"UNCLASSIFIED";
const safeId=(n:unknown):n is number=>typeof n==="number"&&Number.isSafeInteger(n)&&n>0;
const count=(n:unknown)=>{if(typeof n!=="number"||!Number.isSafeInteger(n)||n<0)throw Error("INVALID_COUNT");return n;};
const editors=(agenda:string,id:number)=>agenda==="articles"?"/admin/clanky/"+id:manualMappingEditorHref(agenda,id);
const mappingSpecs=[
  ["directory","directory_notion_sync","directory_profile_id","notion_page_id"],
  ["events","event_notion_sync","event_id","notion_page_id"],
  ["breeds","breed_notion_sync","breed_id","notion_page_id"],
  ["breeds","breed_notion_workcopy_links","breed_id","work_notion_page_id"],
  ["breeds","breed_notion_workcopy_links","breed_id","original_notion_page_id"],
  ["eshops","eshop_notion_sync","eshop_id","notion_page_id"],
  ["articles","article_notion_sync","article_id","notion_page_id"],
] as const;

/** No remote calls, raw values, payloads or Notion IDs leave this function.
 * Each evidence source fails independently rather than implying a zero queue.
 */
export async function readNotionQueueDiagnostics(db:D1Database,now=Date.now()):Promise<NotionQueueDiagnostics>{
  const result:NotionQueueDiagnostics={inbox:null,articles:null,issues:[],truncated:false,mappingAvailable:false};
  const seconds=Math.floor(now/1000),stamp=new Date(now).toISOString();
  let mappingSql:string|null=null;
  try{
    const tables=await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{name:string}>();
    if(!tables.success)throw Error("SCHEMA_UNAVAILABLE");
    const names=new Set(tables.results.map(row=>row.name));
    const pieces=mappingSpecs.filter(([,table])=>names.has(table)).map(([agenda,table,id,page])=>
      "SELECT '"+agenda+"' AS agenda,"+id+" AS entity_id,"+page+" AS page_id FROM "+table);
    if(names.has("notion_agenda_sync"))pieces.push("SELECT agenda,entity_id,notion_page_id AS page_id FROM notion_agenda_sync WHERE agenda IN ('organizations','adoptions','help-cases','lost-found')");
    // If a mapping table is unavailable, do not assert identity uniqueness.
    if(pieces.length===mappingSpecs.length+1){mappingSql=pieces.join(" UNION ALL ");result.mappingAvailable=true;}
  }catch{/* counts can still be available */}
  try{
    const counts=await db.prepare("SELECT COUNT(CASE WHEN status='PENDING' THEN 1 END) AS pending,"+
      "COUNT(CASE WHEN status='PROCESSING' THEN 1 END) AS processing,"+
      "COUNT(CASE WHEN status='REVIEW' THEN 1 END) AS review,"+
      "COUNT(CASE WHEN status='REVIEW' AND (event_type='page.deleted' OR last_error_code='NOTION_REMOTE_DELETED') AND outcome IN ('remote-deleted','review-required') THEN 1 END) AS deleted,"+
      "COUNT(CASE WHEN status='PROCESSING' AND lease_until<=? THEN 1 END) AS expired FROM notion_webhook_inbox").bind(seconds)
      .first<Record<string,unknown>>();
    if(!counts)throw Error("INBOX_UNAVAILABLE");
    const totals={pending:count(counts.pending),processing:count(counts.processing),review:count(counts.review),deleted:count(counts.deleted),expired:count(counts.expired)};
    const rows=await db.prepare("SELECT page_id,event_type,status,attempts,updated_at,next_attempt_at,lease_until,outcome,last_error_code "+
      "FROM notion_webhook_inbox WHERE status IN ('PENDING','PROCESSING','REVIEW') "+
      "ORDER BY CASE WHEN status='REVIEW' AND (event_type='page.deleted' OR last_error_code='NOTION_REMOTE_DELETED') THEN 0 WHEN status='REVIEW' THEN 1 ELSE 2 END,updated_at DESC LIMIT 51")
      .all<{page_id:string;event_type:string;status:QueueState;attempts:number;updated_at:number;next_attempt_at:number;lease_until:number|null;outcome:string|null;last_error_code:string|null}>();
    if(!rows.success)throw Error("INBOX_UNAVAILABLE");
    const visible=rows.results.slice(0,50);
    // One bounded mapping query for all visible rows; never return remote IDs.
    const ids=[...new Set(visible.map(row=>row.page_id.replaceAll("-","").toLowerCase()))];
    const byPage=new Map<string,Mapping[]>();
    if(mappingSql&&ids.length){
      try{
        const mapped=await db.prepare("WITH mapped AS ("+mappingSql+") SELECT DISTINCT agenda,entity_id,lower(replace(page_id,'-','')) AS page_key FROM mapped WHERE lower(replace(page_id,'-','')) IN ("+ids.map(()=>"?").join(",")+")").bind(...ids).all<Mapping&{page_key:string}>();
        if(!mapped.success)throw Error("MAPPING_UNAVAILABLE");
        for(const m of mapped.results){
          const list=byPage.get(m.page_key)??[];list.push(m);byPage.set(m.page_key,list);
        }
      }catch{result.mappingAvailable=false;}
    }
    for(const row of visible){
      const mapped=byPage.get(row.page_id.replaceAll("-","").toLowerCase())??[];
      const m=result.mappingAvailable&&mapped.length===1&&safeId(mapped[0].entity_id)?mapped[0]:null;
      const deleted=row.status==="REVIEW"&&(row.outcome==="remote-deleted"||row.event_type==="page.deleted"&&row.outcome==="review-required");
      const reason=deleted?"NOTION_REMOTE_DELETED":row.status==="PROCESSING"&&row.lease_until!==null&&row.lease_until<=seconds?"LEASE_EXPIRED":
        row.status==="REVIEW"&&row.attempts>=12&&row.last_error_code==="DISPATCH_FAILED"?"RETRY_EXHAUSTED":
        row.last_error_code?safeCode(row.last_error_code):row.status==="PENDING"?"AWAITING_CONFIRMATION":row.status==="PROCESSING"?"PROCESSING":"NEEDS_REVIEW";
      result.issues.push({source:"webhook",agenda:m?.agenda??null,entityId:m?.entity_id??null,editorHref:m?editors(m.agenda,m.entity_id):null,
        state:row.status,reason,attempts:safeId(row.attempts)||row.attempts===0?row.attempts:null,updatedAt:iso(row.updated_at),nextAttemptAt:row.status==="PENDING"?iso(row.next_attempt_at):null});
    }
    result.inbox=totals;
    result.truncated=rows.results.length>50;
  }catch{/* unavailable is not empty */}
  try{
    const totals=await db.prepare("SELECT COUNT(CASE WHEN lease_until IS NULL THEN 1 END) AS pending,"+
      "COUNT(CASE WHEN lease_until>? THEN 1 END) AS processing,COUNT(CASE WHEN lease_until<=? THEN 1 END) AS expired FROM article_notion_editorial_outbox").bind(stamp,stamp).first<Record<string,unknown>>();
    if(!totals)throw Error("ARTICLE_OUTBOX_UNAVAILABLE");
    const counts={pending:count(totals.pending),processing:count(totals.processing),expired:count(totals.expired)};
    const rows=await db.prepare("SELECT article_id,lease_until,updated_at FROM article_notion_editorial_outbox ORDER BY updated_at ASC LIMIT 51").all<{article_id:number;lease_until:string|null;updated_at:string}>();
    if(!rows.success)throw Error("ARTICLE_OUTBOX_UNAVAILABLE");
    for(const row of rows.results.slice(0,50)){
      if(!safeId(row.article_id))continue;
      const expired=row.lease_until!==null&&row.lease_until<=stamp;
      result.issues.push({source:"article",agenda:"articles",entityId:row.article_id,editorHref:editors("articles",row.article_id),state:row.lease_until&&!expired?"PROCESSING":"PENDING",reason:expired?"LEASE_EXPIRED":row.lease_until?"PROCESSING":"AWAITING_CONFIRMATION",attempts:null,updatedAt:timestamp(row.updated_at),nextAttemptAt:null});
    }
    result.articles=counts;
    result.truncated ||= rows.results.length>50;
  }catch{/* unavailable is not empty */}
  return result;
}
