import type { GeminiD1 } from "./gemini-automation-store.ts";
import { eventTypeForStableKey } from "./gemini-automation-event-dedupe.ts";
import { checkGeminiEventDedupe } from "./gemini-automation-event-dedupe.ts";
import type { GeminiEventCandidateV1 } from "./gemini-automation-event-contract.ts";

type Identity={name:string;city:string;website:string;source:string;start_date:string;organizer:string;venue:string;type:string};
type Entity="EVENT"|"ORGANIZATION"|"HELP_ITEM"|"FOSTER"|"ADOPTION"|"LOST_FOUND";
type FieldMap=Record<string,string>;
type Result={status:"REVIEW_SUBMITTED"|"NO_CHANGES"|"BLOCKED";httpStatus:number};
const blocked=(code=200):Result=>({status:"BLOCKED",httpStatus:code});
type Mapping={entity:Entity; table:string; fields:FieldMap};
const models:Record<string,Mapping>={
  "help.docasna-opatera":{entity:"FOSTER",table:"help_cases",fields:{excerpt:"excerpt",actionUrl:"action_url"}},
  "help.zbierky":{entity:"HELP_ITEM",table:"help_cases",fields:{excerpt:"excerpt",actionUrl:"action_url"}},
  "help.dobrovolnictvo":{entity:"HELP_ITEM",table:"help_cases",fields:{excerpt:"excerpt",actionUrl:"action_url"}},
  "help.utulky":{entity:"ORGANIZATION",table:"help_organizations",fields:{shortDescription:"short_description",websiteUrl:"website_url"}},
  "help.adopcia":{entity:"ADOPTION",table:"adoption_dogs",fields:{shortDescription:"short_description",breedName:"breed_name",color:"color"}},
  "help.stratene-a-najdene":{entity:"LOST_FOUND",table:"lost_found_dog_reports",fields:{dogName:"dog_name",breed:"breed",color:"color"}},
};
const eventFields:FieldMap={excerpt:"excerpt",websiteUrl:"website_url",registrationUrl:"registration_url"};
const clean=(s:unknown)=>typeof s==="string"?s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," "):"";
const equal=(a:unknown,b:unknown)=>Boolean(clean(a)&&clean(a)===clean(b));
const url=(v:unknown)=>{if(typeof v!=="string"||!v||v.length>2048)return null;
 try{const x=new URL(v);if(!["https:","http:"].includes(x.protocol)||x.username||x.password||
 /^(localhost|.*\.(?:local|localhost|internal))$/i.test(x.hostname)||/^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(x.hostname))return null;
 x.hash="";x.hostname=x.hostname.replace(/^www\./,"");x.pathname=x.pathname.replace(/\/+$/,"")||"/";return x.href;}catch{return null}};
function publicText(value:unknown,max:number) {
  if(typeof value!=="string"||!value.trim()||value.length>max)return null;
  // Never accept unreviewed personal contact, GPS or physical location details.
  if(/(?:\+?\d[\d\s()./-]{7,}\d|\bGPS\b|\b(?:súradnice|rodné číslo|číslo domu|súkromn[áýé])\b|\b\d{2}[.,]\d{4,}\b)/i.test(value))return null;
  return value.trim();
}
export function safeGeminiFeedQualityFields(stableKey:string,value:unknown):Record<string,string>|null {
  const mapping=stableKey.startsWith("events.")?eventFields:models[stableKey]?.fields;
  if(!mapping||!value||typeof value!=="object"||Array.isArray(value))return null;
  const src=value as Record<string,unknown>;if(Object.keys(src).length>5||
    Object.keys(src).some(k=>!Object.hasOwn(mapping,k)))return null;
  const out:Record<string,string>={};
  for(const [key,raw] of Object.entries(src)){
    if(typeof raw!=="string"||raw.length>2048)return null;
    if(!raw.trim())continue;
    const sanitized=/Url$/.test(key)?url(raw):publicText(raw,key==="excerpt"||key==="shortDescription"?1000:160);
    if(!sanitized)return null;
    out[key]=sanitized;
  }
  return out;
}
const sha=async(s:string)=>{const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")};
const stable=(v:Record<string,unknown>)=>JSON.stringify(Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))));
type Match={id:number;entity:Entity;table:string;row:Record<string,unknown>;fields:FieldMap};
async function exact(db:GeminiD1,key:string,c:Identity):Promise<Match|null>{
 let entity:Entity,table:string,fields:FieldMap,sql:string,args:(string|number)[];
 const source=url(c.source),site=url(c.website);
 if(!source)return null;
 if(key.startsWith("events.")){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(c.start_date)||!c.organizer.trim())return null;
  entity="EVENT";table="managed_events";fields=eventFields;
  const event:GeminiEventCandidateV1={title:c.name,organizer:c.organizer,start_date:c.start_date,
    start_time:null,end_date:null,end_time:null,all_day:false,venue:c.venue||null,city:c.city||null,
    region:null,online:false,event_url:site,registration_url:null,description:"",source_urls:[source],evidence:[],cancelled:false};
  const d=await checkGeminiEventDedupe(db,key,event);
  if(d.status!=="DUPLICATE"||!d.eventId)return null;
  sql="SELECT id,title,organizer,start_date,city,event_type,excerpt,website_url,registration_url FROM managed_events WHERE id=? LIMIT 1";
  args=[d.eventId];
 }else{
  const conf=models[key];if(!conf)return null;
  ({entity,table,fields}=conf);
  if(key==="help.utulky"){
    if(!site||!c.city.trim())return null;
    sql="SELECT id,name,city,website_url,source_url,short_description FROM help_organizations WHERE name=? COLLATE NOCASE AND city=? COLLATE NOCASE AND (website_url=? OR source_url=?) LIMIT 2";
    args=[c.name,c.city,site,source];
  }else if(key==="help.adopcia"){
    if(!c.organizer.trim())return null;
    sql="SELECT id,name,organization_name,external_source_url,city,short_description,breed_name,color FROM adoption_dogs WHERE name=? COLLATE NOCASE AND organization_name=? COLLATE NOCASE AND external_source_url=? LIMIT 2";
    args=[c.name,c.organizer,source];
  }else if(key==="help.stratene-a-najdene"){
    if(!["LOST","FOUND"].includes(c.type)||!c.city||!/^\d{4}-\d{2}-\d{2}$/.test(c.start_date))return null;
    sql="SELECT id,type,event_date,city,source_url,dog_name,breed,color FROM lost_found_dog_reports WHERE type=? AND event_date=? AND city=? COLLATE NOCASE AND source_url=? LIMIT 2";
    args=[c.type,c.start_date,c.city,source];
  }else{
    sql="SELECT id,title,category,city,organization,action_url,excerpt FROM help_cases WHERE title=? COLLATE NOCASE AND category=? AND action_url=? LIMIT 2";
    args=[c.name,key.slice(5),source];
  }
 }
 const rows=(await db.prepare(sql).bind(...args).all<Record<string,unknown>>()).results;
 if(rows?.length!==1)return null;
 const row=rows[0];
 if(key.startsWith("events.")&&( !equal(row.title,c.name)||!equal(row.organizer,c.organizer)||
    row.start_date!==c.start_date || String(row.event_type)!==eventTypeForStableKey(key)))return null;
 if(key==="help.utulky"&&(!equal(row.name,c.name)||!equal(row.city,c.city)))return null;
 if(key==="help.adopcia"&&(!equal(row.name,c.name)||!equal(row.organization_name,c.organizer)))return null;
 if(key==="help.stratene-a-najdene"&&(row.type!==c.type||row.event_date!==c.start_date||!equal(row.city,c.city)))return null;
 return {id:Number(row.id),entity,table,row,fields};
}
/** Existing source provenance is mandatory. Never synthesize source rows or impersonate
 * a feed just to make a proposal eligible for the Data Quality review UI. */
async function evidence(db:GeminiD1,entity:Entity,id:number,sourceUrl:string){
 const rows=(await db.prepare(
   "SELECT DISTINCT s.id,o.id AS observation_id FROM automation_sources s "+
   "JOIN automation_observations o ON o.source_id=s.id "+
   "JOIN canonical_external_provenance p ON p.entity_type=s.entity_type "+
   "AND p.canonical_entity_id=? AND p.external_source_url=COALESCE(o.source_url,'') "+
   "AND p.external_record_id=o.source_record_id "+
   "WHERE s.entity_type=? AND s.enabled=1 AND s.review_status='APPROVED' "+
   "AND o.source_url=? LIMIT 2")
  .bind(id,entity,sourceUrl).all<{id:number;observation_id:number}>()).results;
 return rows?.length===1?rows[0]:null;
}
export async function submitGeminiFeedQualityProposal(input:{
 db:GeminiD1;key:string;candidate:Identity;proposal:unknown;now:number;
}):Promise<Result>{
 const fields=safeGeminiFeedQualityFields(input.key,input.proposal);
 if(!fields)return blocked(400);
 if(!Object.keys(fields).length)return {status:"NO_CHANGES",httpStatus:200};
 try{
  const canonical=await exact(input.db,input.key,input.candidate);
  if(!canonical)return blocked();
  const source=url(input.candidate.source);
  if(!source)return blocked();
  const provenance=await evidence(input.db,canonical.entity,canonical.id,source);
  if(!provenance)return blocked(); // Missing or ambiguous source history => no write.
  const before:Record<string,unknown>={},proposed:Record<string,unknown>={},diff:Record<string,{before:unknown;after:unknown}>={};
  for(const [key,value] of Object.entries(fields)){
    const old=canonical.row[canonical.fields[key]];
    if(old!=null&&String(old).trim()===value)continue;
    if(key.endsWith("Url")&&url(old)===url(value))continue;
    before[key]=old??null;proposed[key]=value;diff[key]={before:old??null,after:value};
  }
  if(!Object.keys(diff).length)return {status:"NO_CHANGES",httpStatus:200};
  const identity=stable({entity:canonical.entity,id:canonical.id,source,proposal:proposed});
  const fingerprint=await sha("gemini-quality-feed-v1|"+identity);
  const detected=new Date(input.now).toISOString();
  const payload=stable(proposed);
  // A value-versioned finding cannot reopen an already reviewed proposal.
  await input.db.prepare(
   "INSERT INTO automation_findings (source_id,observation_id,entity_type,finding_type,"+
   "canonical_entity_id,canonical_entity_key,match_quality,source_url,source_timestamp,"+
   "reason,before_json,proposed_json,diff_json,payload_hash,fingerprint,priority,"+
   "review_status,first_detected_at,last_detected_at) "+
   "VALUES (?,? ,?,'POSSIBLE_UPDATE',?,NULL,'EXACT_SOURCE_ID',?,NULL,"+
   "'GEMINI_SIGNED_REVIEW_ONLY',?,?,?,?,?,'MEDIUM','NEW',?,?) "+
   "ON CONFLICT(fingerprint) DO NOTHING")
    .bind(provenance.id,provenance.observation_id,canonical.entity,canonical.id,source,
      JSON.stringify(before),JSON.stringify(proposed),JSON.stringify(diff),
      await sha(payload),fingerprint,detected,detected).run();
  return {status:"REVIEW_SUBMITTED",httpStatus:200};
 }catch{return blocked(503)}
}
