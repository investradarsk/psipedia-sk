import type { GeminiEventCandidateV1 } from "./gemini-automation-event-contract.ts";
import { getGeminiCatalogItem } from "./gemini-automation-catalog.ts";
import { bratislavaDateKey, eventPortalCategory, eventTypes } from "./events.ts";
import type { GeminiD1 } from "./gemini-automation-store.ts";

export type EventDedupeStatus = "REJECTED_BEFORE" | "DUPLICATE" | "POSSIBLE_DUPLICATE" | "NEW";
export type EventDedupeDecision = {status:EventDedupeStatus;reason:string;eventId:number|null};
export type EventIdentity = {
  title:string;organizer:string;start_date:string;end_date:string|null;
  city:string|null;venue:string|null;event_url:string|null;registration_url:string|null;
};
type Existing = EventIdentity & {id:number;event_type:string;status:string;cancelled:number};
const normalize=(v:unknown) => typeof v==="string" ? v.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ") : "";
const u=(value:string|null) => {
  if(!value) return "";
  try {
    const url=new URL(value);
    if (!["http:","https:"].includes(url.protocol)) return "";
    url.hash=""; url.hostname=url.hostname.replace(/^www\./,"");
    if(url.pathname!=="/")url.pathname=url.pathname.replace(/\/+$/,"");
    return url.href;
  } catch {return "";}
};
export function eventFingerprints(v: EventIdentity): Array<{kind:string;value:string}> {
  const date=v.start_date;
  const title=normalize(v.title), organizer=normalize(v.organizer),city=normalize(v.city),venue=normalize(v.venue);
  const values=[
    {kind:"event_url_date",value:u(v.event_url) ? u(v.event_url)+"|"+date : ""},
    {kind:"registration_url_date",value:u(v.registration_url) ? u(v.registration_url)+"|"+date : ""},
    {kind:"title_date_organizer",value:title&&organizer ? [title,date,organizer].join("|") : ""},
    {kind:"title_date_location",value:title&&(venue||city) ? [title,date,venue||city].join("|") : ""},
  ];
  return values.filter(item=>Boolean(item.value));
}
export async function eventFingerprintHashes(stableKey:string, identity:EventIdentity) {
  const fingerprints=eventFingerprints(identity);
  const result: Array<{kind:string;hash:string}>=[];
  for(const item of fingerprints) {
    const bytes=new TextEncoder().encode(["gemini-event-rejection-v1",stableKey,item.kind,item.value].join("\u0000"));
    const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
    result.push({kind:item.kind,hash:[...digest].map(n=>n.toString(16).padStart(2,"0")).join("")});
  }
  return result;
}
export function eventTypeForStableKey(stableKey:string) {
  const item=getGeminiCatalogItem(stableKey);
  if (!item || item.section!=="events") throw new Error("GEMINI_EVENT_INVALID_CATEGORY");
  const type=eventTypes.find(type=>eventPortalCategory(type).href.endsWith("/"+item.subcategory));
  if(!type)throw new Error("GEMINI_EVENT_INVALID_CATEGORY");
  return type;
}
export async function wasGeminiEventRejected(db:GeminiD1,stableKey:string,v:EventIdentity) {
  for(const fp of await eventFingerprintHashes(stableKey,v)) {
    const found=await db.prepare("SELECT id FROM gemini_automation_event_rejections WHERE stable_key=? AND identity_kind=? AND identity_hash=? LIMIT 1")
      .bind(stableKey,fp.kind,fp.hash).first<{id:number}>();
    if(found)return true;
  }
  return false;
}
export async function rememberGeminiEventRejection(db:GeminiD1,stableKey:string,
  identity:EventIdentity, eventId:number, conceptId:number) {
  eventTypeForStableKey(stableKey);
  const fingerprints=await eventFingerprintHashes(stableKey,identity);
  if(!fingerprints.length)throw new Error("GEMINI_EVENT_NO_REJECTION_IDENTITY");
  const now=new Date().toISOString();
  for (const fp of fingerprints) await db.prepare(
    "INSERT INTO gemini_automation_event_rejections (stable_key,identity_kind,identity_hash,canonical_event_id,concept_id,reason_code,rejected_at,updated_at) VALUES (?,?,?,?,?,'ADMIN_REJECTED',?,?) ON CONFLICT(stable_key,identity_kind,identity_hash) DO UPDATE SET updated_at=excluded.updated_at")
    .bind(stableKey,fp.kind,fp.hash,eventId,conceptId,now,now).run();
  return fingerprints.length;
}
function isPossibleTitleMatch(a:string,b:string) {
  const left=normalize(a),right=normalize(b);
  return left.length>=6 && right.length>=6 && (left.includes(right) || right.includes(left));
}
/** Global final dedupe across ALL canonical statuses, including drafts, cancelled and old records.
 * Search is date-scoped, never truncated by the bounded pre-search memory.
 */
export async function checkGeminiEventDedupe(db:GeminiD1, stableKey:string,
  candidate:GeminiEventCandidateV1):Promise<EventDedupeDecision> {
  eventTypeForStableKey(stableKey);
  if(await wasGeminiEventRejected(db,stableKey,candidate))
    return {status:"REJECTED_BEFORE",reason:"rejection fingerprint",eventId:null};
  const list=await db.prepare(
    "SELECT id,title,organizer,start_date,end_date,venue,city,website_url AS event_url,registration_url,event_type,status,cancelled "+
    "FROM managed_events WHERE start_date=? OR (start_date<=? AND COALESCE(end_date,start_date)>=?)"
  ).bind(candidate.start_date,candidate.start_date,candidate.start_date).all<Existing>();
  let possible:Existing|null=null;
  for(const row of list.results??[]) {
    const sameDate=row.start_date===candidate.start_date;
    const sameTitle=normalize(row.title)===normalize(candidate.title);
    const sameOrg=normalize(row.organizer)===normalize(candidate.organizer);
    const sameCity=Boolean(normalize(row.city)) && normalize(row.city)===normalize(candidate.city);
    const sameVenue=Boolean(normalize(row.venue)) && normalize(row.venue)===normalize(candidate.venue);
    const sameEventUrl=Boolean(u(candidate.event_url)) && u(candidate.event_url)===u(row.event_url);
    const sameRegUrl=Boolean(u(candidate.registration_url)) && u(candidate.registration_url)===u(row.registration_url);
    if(sameDate && (sameEventUrl ||
      (sameTitle && sameOrg) || (sameTitle && (sameCity||sameVenue)))) {
      return {status:"DUPLICATE",reason:"canonical identity + date",eventId:row.id};
    }
    if ((sameDate && (sameRegUrl || isPossibleTitleMatch(row.title,candidate.title) ||
      (sameOrg && (sameCity||sameVenue)))) ||
      (!sameDate && (sameEventUrl || sameRegUrl) && isPossibleTitleMatch(row.title,candidate.title))) possible=row;
  }
  return possible
    ? {status:"POSSIBLE_DUPLICATE",reason:"ambiguous canonical match",eventId:possible.id}
    : {status:"NEW",reason:"no matching canonical event",eventId:null};
}
function dateOffset(date:string,days:number) {
  const [y,m,d]=date.split("-").map(Number);
  return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10);
}
/** Discovery optimization only. The complete same-date canonical query above is the authority. */
export async function loadGeminiEventMemory(db:GeminiD1,stableKey:string,now=bratislavaDateKey()) {
  const eventType=eventTypeForStableKey(stableKey);
  const from=dateOffset(now,-30),until=dateOffset(now,365);
  const found=await db.prepare(
    "SELECT e.id,e.title,e.organizer,e.start_date,e.end_date,e.city,e.venue,e.status,e.cancelled, "+
    "EXISTS(SELECT 1 FROM gemini_automation_event_rejections r WHERE r.canonical_event_id=e.id AND r.stable_key=?) AS rejected "+
    "FROM managed_events e WHERE e.event_type=? AND e.start_date<=? AND COALESCE(e.end_date,e.start_date)>=? "+
    "ORDER BY e.start_date DESC,e.id DESC LIMIT 120"
  ).bind(stableKey,eventType,until,from).all<Record<string,unknown>>();
  const raw=(found.results??[]).map(row=>({
    title:row.title,organizer:row.organizer,start_date:row.start_date,
    city:row.city,venue:row.venue,status:row.status,cancelled:Boolean(row.cancelled),
    rejected:Boolean(row.rejected),
  }));
  let items=raw;
  while(JSON.stringify(items).length>10_000 && items.length)items=items.slice(0,-1);
  return {serialized:JSON.stringify(items),count:items.length,truncated:items.length<raw.length};
}
