import { createManagedEvent, normalizeManagedEventInput, type ManagedEventInput } from "./event-store.ts";
import { bratislavaDateKey, slovakRegions } from "./events.ts";
import { createGeminiEventRequest, parseGeminiEventEnvelope, type GeminiEventCandidateV1 } from "./gemini-automation-event-contract.ts";
import { checkGeminiEventDedupe, eventTypeForStableKey } from "./gemini-automation-event-dedupe.ts";
import { ensureManagedEventInNotion, type NotionEventsHelpSyncBindings } from "./notion-events-help-sync.ts";

type Concept = {
  id:number;stable_key:string;discovery_key:string;canonical_entity_type:string;
  canonical_entity_id:number|null;notion_page_id:string|null;
  status:"RESERVED"|"CREATING"|"DRAFT_CREATED"|"NOTION_CREATING"|"NOTION_UNCERTAIN"|"NOTION_LINKED";
};
export type GeminiEventBridgeResult = {conceptId:number;canonicalEntityId:number;notionPageId:string|null;created:boolean;status:"NOTION_LINKED"};
const ACTOR="gemini-automation@psipedia.sk";
const getConcept=(db:D1Database,stableKey:string,key:string)=>db.prepare(
  "SELECT id,stable_key,discovery_key,canonical_entity_type,canonical_entity_id,notion_page_id,status "+
  "FROM gemini_automation_concepts WHERE stable_key=? AND discovery_key=? LIMIT 1")
  .bind(stableKey,key).first<Concept>();
async function keyFor(stableKey:string,v:GeminiEventCandidateV1) {
  const identity=[stableKey,v.title.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/\s+/g," "),
    v.start_date,v.organizer.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/\s+/g," ")].join("\u0000");
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode("gemini-event-bridge-v1\u0000"+identity)));
  return [...digest].map(n=>n.toString(16).padStart(2,"0")).join("");
}
function mapInput(stableKey:string,v:GeminiEventCandidateV1,key:string):ManagedEventInput {
  const region=v.online?"Online":v.region;
  if(!region || !(slovakRegions as readonly string[]).includes(region))throw new Error("GEMINI_EVENT_REGION_REQUIRED");
  const input:ManagedEventInput={
    slug:v.title+"-"+key.slice(0,12), title:v.title,excerpt:v.description.slice(0,180),
    eventType:eventTypeForStableKey(stableKey),status:"draft",startDate:v.start_date,startTime:v.start_time??"",
    endDate:v.end_date,endTime:v.end_time,venue:v.venue??"",city:v.online?"Online":v.city??"",
    region,address:"",organizer:v.organizer,description:v.description,practicalInfo:"",
    websiteUrl:v.event_url,registrationUrl:v.registration_url,imageUrl:null,imageKey:null,cancelled:false,
  };
  // Apply the same canonical input validator before ANY D1 write.
  normalizeManagedEventInput(input);
  return input;
}
async function update(db:D1Database,id:number,status:string,eventId:number|null,pageId:string|null) {
  await db.prepare(
    "UPDATE gemini_automation_concepts SET status=?,canonical_entity_id=COALESCE(?,canonical_entity_id), "+
    "notion_page_id=COALESCE(?,notion_page_id),updated_at=? WHERE id=?"
  ).bind(status,eventId,pageId,new Date().toISOString(),id).run();
}
function snapshot(row:Concept,created:boolean):GeminiEventBridgeResult {
  if(!row.canonical_entity_id || row.status!=="NOTION_LINKED")throw new Error("GEMINI_EVENT_BRIDGE_INCOMPLETE");
  return {conceptId:row.id,canonicalEntityId:row.canonical_entity_id,notionPageId:row.notion_page_id,
    created,status:"NOTION_LINKED"};
}
/** Idempotent per stable category + exact event term; recovery never blindly repeats Notion POST. */
export async function bridgeGeminiEventToNotion(input:{
  database:D1Database;notion:NotionEventsHelpSyncBindings;stableKey:string;candidate:GeminiEventCandidateV1;
}):Promise<GeminiEventBridgeResult> {
  const request=createGeminiEventRequest({stableKey:input.stableKey,maxCandidates:1});
  const candidate=parseGeminiEventEnvelope({schema_version:1,category_key:input.stableKey,candidates:[input.candidate]},request).candidates[0];
  const key=await keyFor(input.stableKey,candidate),db=input.database;
  const payload=mapInput(input.stableKey,candidate,key);
  let row=await getConcept(db,input.stableKey,key);
  if(row?.status==="NOTION_LINKED")return snapshot(row,false);
  if(!row) {
    const decision=await checkGeminiEventDedupe(db,input.stableKey,candidate);
    if(decision.status!=="NEW")throw new Error("GEMINI_EVENT_DEDUPE_"+decision.status);
    const now=new Date().toISOString();
    await db.prepare(
      "INSERT INTO gemini_automation_concepts (stable_key,discovery_key,canonical_entity_type,status,primary_source_url,source_urls_json,discovered_at,created_at,updated_at) "+
      "VALUES (?,?,'EVENT','RESERVED',?,?,?,?,?) ON CONFLICT(stable_key,discovery_key) DO NOTHING"
    ).bind(input.stableKey,key,candidate.event_url??candidate.source_urls[0],
      JSON.stringify(candidate.source_urls),now,now,now).run();
    row=await getConcept(db,input.stableKey,key);
  }
  if(!row || row.canonical_entity_type!=="EVENT")throw new Error("GEMINI_EVENT_BRIDGE_LINKAGE_INVALID");
  let created=false;
  if(!row.canonical_entity_id) {
    if(row.status==="RESERVED") {
      const result=await db.prepare(
        "UPDATE gemini_automation_concepts SET status='CREATING',updated_at=? WHERE id=? AND status='RESERVED'"
      ).bind(new Date().toISOString(),row.id).run();
      if((result.meta.changes??0)!==1)throw new Error("GEMINI_EVENT_CONCURRENT_OPERATION");
    } else if(row.status!=="CREATING")throw new Error("GEMINI_EVENT_BRIDGE_INVALID_STATE");
    // Stable slug permits recovery after canonical create + lost concept update.
    const slug=normalizeManagedEventInput(payload).slug;
    const matches=await db.prepare("SELECT id FROM managed_events WHERE slug=? LIMIT 2")
      .bind(slug).all<{id:number}>();
    if(matches.results.length>1)throw new Error("GEMINI_EVENT_CANONICAL_AMBIGUOUS");
    let id=matches.results[0]?.id;
    if(!id) {
      // CREATING from a previous execution is uncertain; never blindly create twice.
      if(row.status==="CREATING")throw new Error("GEMINI_EVENT_CANONICAL_UNCERTAIN");
      const dedupe=await checkGeminiEventDedupe(db,input.stableKey,candidate);
      if(dedupe.status!=="NEW")throw new Error("GEMINI_EVENT_DEDUPE_"+dedupe.status);
      id=(await createManagedEvent(payload,ACTOR,db)).id;
      created=true;
    }
    await update(db,row.id,"DRAFT_CREATED",id,null);
    row=await getConcept(db,input.stableKey,key);
  }
  if(!row)throw new Error("GEMINI_EVENT_BRIDGE_LINKAGE_FAILED");
  if(row.status==="NOTION_LINKED")return snapshot(row,created);
  if(!row.canonical_entity_id)throw new Error("GEMINI_EVENT_CANONICAL_MISSING");
  if(row.status==="DRAFT_CREATED") {
    const claimed=await db.prepare(
      "UPDATE gemini_automation_concepts SET status='NOTION_CREATING',updated_at=? WHERE id=? AND status='DRAFT_CREATED'"
    ).bind(new Date().toISOString(),row.id).run();
    if((claimed.meta.changes??0)!==1)throw new Error("GEMINI_EVENT_CONCURRENT_OPERATION");
    try {
      const result=await ensureManagedEventInNotion({database:db,bindings:input.notion,eventId:row.canonical_entity_id,allowCreate:true});
      await update(db,row.id,"NOTION_LINKED",null,result.notionPageId);
    }catch(error){
      await update(db,row.id,"NOTION_UNCERTAIN",null,null);throw error;
    }
  }else if(row.status==="NOTION_CREATING" || row.status==="NOTION_UNCERTAIN") {
    const result=await ensureManagedEventInNotion({database:db,bindings:input.notion,eventId:row.canonical_entity_id,allowCreate:false});
    await update(db,row.id,"NOTION_LINKED",null,result.notionPageId);
  }else throw new Error("GEMINI_EVENT_BRIDGE_INVALID_STATE");
  const linked=await getConcept(db,input.stableKey,key);
  if(!linked)throw new Error("GEMINI_EVENT_BRIDGE_LINKAGE_FAILED");
  return snapshot(linked,created);
}
