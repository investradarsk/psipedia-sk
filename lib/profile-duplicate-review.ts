import { normalizeProfileIdentity, profileIdentityWebsite } from "./directory-duplicate-audit.ts";
import { HELP_ADMIN_DOMAIN_SQL } from "./help-admin-query.ts";

export const profileDuplicateAgendas=["directory","breeds","events","organizations","adoptions","lost-found","help-cases","eshops"] as const;
export type ProfileDuplicateAgenda=typeof profileDuplicateAgendas[number];
type Identity={id?:number;name:unknown;city?:unknown;slug?:unknown;kind?:unknown;date?:unknown;organization?:unknown;venue?:unknown;website?:unknown;source?:unknown;registration?:unknown;sex?:unknown;breed?:unknown;status?:unknown};
const specs:Record<ProfileDuplicateAgenda,string>={
 directory:"SELECT id,name,city,slug,category AS kind,website_url AS website,status FROM directory_profiles",
 breeds:"SELECT id,name,slug,fci_number AS registration,status FROM managed_breeds",
 events:"SELECT id,title AS name,city,slug,start_date AS date,organizer AS organization,venue,status FROM managed_events",
 organizations:"SELECT id,name,city,slug,type AS kind,registration_number AS registration,website_url AS website,status FROM help_organizations",
 adoptions:"SELECT id,name,city,slug,birth_date AS date,organization_name AS organization,external_source_url AS source,sex,breed_name AS breed,status FROM adoption_dogs",
 "lost-found":"SELECT id,dog_name AS name,city,slug,type AS kind,event_date AS date,source_url AS source,sex,breed,status FROM lost_found_dog_reports",
 "help-cases":"SELECT id,title AS name,city,slug,category AS kind,reported_date AS date,organization,action_url AS source,status FROM help_cases WHERE "+HELP_ADMIN_DOMAIN_SQL,
 eshops:"SELECT id,name,slug,website_url AS website,status FROM managed_eshops",
};
const norm=(v:unknown)=>normalizeProfileIdentity(typeof v==="string"?v:typeof v==="number"?String(v):"");
const site=(v:unknown)=>profileIdentityWebsite(typeof v==="string"?v:null);
const equal=(a:unknown,b:unknown)=>!!norm(a)&&norm(a)===norm(b);
const registrationKey=(v:unknown)=>norm(v).replace(/ /g,"");
const sameRegistration=(a:unknown,b:unknown)=>!!registrationKey(a)&&!/^0+$/.test(registrationKey(a))&&registrationKey(a)===registrationKey(b);
const compatible=(a:unknown,b:unknown)=>!norm(a)||!norm(b)||equal(a,b);
// Source URLs retain query identifiers: two distinct records may share a path.
function sourceKey(v:unknown){
 if(typeof v!=="string"||!v.trim())return "";
 try{const u=new URL(v);if(!["http:","https:"].includes(u.protocol))return "";
 return u.hostname.toLowerCase().replace(/^www\./,"")+u.pathname.replace(/\/+$/,"")+u.search;}catch{return "";}
}
const sameSource=(a:unknown,b:unknown)=>!!sourceKey(a)&&sourceKey(a)===sourceKey(b);
export function profileDuplicateReason(agenda:ProfileDuplicateAgenda,a:Identity,b:Identity):string|null{
 if(a.id!==undefined&&a.id===b.id)return null;
 const sameName=equal(a.name,b.name),sameCity=equal(a.city,b.city),sameDate=equal(a.date,b.date);
 const sameWeb=!!site(a.website)&&site(a.website)===site(b.website);
 if(typeof a.slug==="string"&&a.slug.trim()&&a.slug.trim()===b.slug&&(!["directory","lost-found","help-cases"].includes(agenda)||equal(a.kind,b.kind)))return "Rovnaká adresa profilu";
 switch(agenda){
 case "directory":return sameName&&compatible(a.city,b.city)&&(sameCity||sameWeb)?"Rovnaký názov a lokalita alebo web":null;
 case "breeds":return sameRegistration(a.registration,b.registration)||sameName?"Rovnaký názov alebo FCI číslo":null;
 case "eshops":return sameName||sameWeb?"Rovnaký názov alebo web":null;
 case "organizations":return sameRegistration(a.registration,b.registration)||sameName&&compatible(a.city,b.city)&&(sameCity||sameWeb)?"Rovnaká registrácia alebo identita organizácie":null;
 case "events":return sameName&&sameDate&&compatible(a.city,b.city)&&(sameCity||equal(a.venue,b.venue)||equal(a.organization,b.organization))?"Rovnaké podujatie a dátum":null;
 case "adoptions":return sameName&&compatible(a.sex,b.sex)&&compatible(a.breed,b.breed)&&(sameSource(a.source,b.source)||sameDate&&equal(a.organization,b.organization))?"Zhodná identita adopcie":null;
 case "lost-found":return equal(a.kind,b.kind)&&sameDate&&sameCity&&compatible(a.sex,b.sex)&&compatible(a.breed,b.breed)&&(sameName||sameSource(a.source,b.source))?"Zhodné hlásenie a dátum":null;
 case "help-cases":return equal(a.kind,b.kind)&&sameName&&(sameSource(a.source,b.source)||sameDate&&(sameCity||equal(a.organization,b.organization)))?"Zhodný prípad pomoci":null;
 }
}
export function profileIdentityFromInput(agenda:ProfileDuplicateAgenda,input:unknown):Identity{
 const p=input&&typeof input==="object"?input as Record<string,unknown>:{};
 return {name:agenda==="events"||agenda==="help-cases"?p.title:agenda==="lost-found"?p.dogName??p.dog_name:p.name,
 city:p.city,slug:p.slug,kind:agenda==="lost-found"?p.type:p.category??p.type,
 date:agenda==="events"?p.startDate??p.start_date:agenda==="adoptions"?p.birthDate??p.birth_date:agenda==="lost-found"?p.eventDate??p.event_date:p.reportedDate??p.reported_date,
 organization:p.organizer??p.organizationName??p.organization_name??p.organization,venue:p.venue,website:p.websiteUrl??p.website_url,
 source:p.externalSourceUrl??p.external_source_url??p.sourceUrl??p.source_url??p.actionUrl??p.action_url,
 registration:agenda==="breeds"?p.fciNumber??p.fci_number:p.registrationNumber??p.registration_number,
 sex:p.sex,breed:p.breedName??p.breed_name??p.breed};
}
export async function readProfileDuplicateIdentities(db:D1Database,agenda:ProfileDuplicateAgenda){
 const r=await db.prepare(specs[agenda]+" ORDER BY id LIMIT 5001").all<Identity&{id:number}>();
 if(!r.success||!Array.isArray(r.results))throw Error("DUPLICATE_SCAN_UNAVAILABLE");
 return {rows:r.results.slice(0,5000),incomplete:r.results.length>5000};
}
export async function findProfileDuplicate(db:D1Database,agenda:ProfileDuplicateAgenda,input:Identity){
 const {rows,incomplete}=await readProfileDuplicateIdentities(db,agenda);
 if(incomplete)throw Error("DUPLICATE_SCAN_INCOMPLETE");
 for(const row of rows){const reason=profileDuplicateReason(agenda,input,row);if(reason)return {id:row.id,reason};}
 return null;
}
// Read-only existing-data audit. Group candidate identities rather than
// comparing every pair across the whole database. Never return contact data.
export async function auditProfileDuplicates(db:D1Database,agenda:ProfileDuplicateAgenda){
 const {rows,incomplete}=await readProfileDuplicateIdentities(db,agenda);
 const groups=new Map<string,typeof rows>();
 const pairs:Array<{a:number;b:number;name:string;reason:string}>=[];
 const seen=new Set<string>();let truncated=false;
 for(const row of rows){
  if(["archived","rejected"].includes(String(row.status).toLowerCase()))continue;
  const keys=[["name",norm(row.name)],["slug",norm(row.slug)],["registration",registrationKey(row.registration)],["web",site(row.website)],["source",sourceKey(row.source)]];
  for(const [type,key] of keys){
   if(!key)continue;const k=type+":"+key,list=groups.get(k)??[];
   for(const other of list){const reason=profileDuplicateReason(agenda,row,other);if(!reason)continue;
    const pair=other.id+":"+row.id;if(seen.has(pair))continue;
    if(pairs.length>=100){truncated=true;break;}
    seen.add(pair);pairs.push({a:other.id,b:row.id,name:String(row.name??other.name??""),reason});
   }
   list.push(row);groups.set(k,list);
  }
  if(truncated)break;
 }
 return {scanned:rows.length,incomplete,truncated,pairs};
}

export async function readProfileDuplicateById(db:D1Database,agenda:ProfileDuplicateAgenda,id:number){
 const {rows,incomplete}=await readProfileDuplicateIdentities(db,agenda);
 if(incomplete)throw Error("DUPLICATE_SCAN_INCOMPLETE");
 const current=rows.find(row=>row.id===id);
 if(!current)throw Error("DUPLICATE_IDENTITY_UNAVAILABLE");
 for(const row of rows){const reason=profileDuplicateReason(agenda,current,row);if(reason)return {id:row.id,reason};}
 return null;
}
