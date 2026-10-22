import { env } from "cloudflare:workers";
import { TavilyAutomationSearchProvider } from "./data-automation-search-tavily.ts";
import { isSafeAutomationSourceUrl, normalizeAutomationIdentity } from "./data-automation.ts";
import { mergeDirectoryPublicContactData, readDirectoryPublicContacts, type DirectoryImportData } from "./directory-profile-metadata.ts";

export type QualityArea = "services" | "events" | "help";
type Kind = "DIRECTORY" | "EVENT" | "ORGANIZATION" | "ADOPTION" | "FOSTER" | "HELP_ITEM" | "LOST_FOUND";
type Database = D1Database;
type Row = Record<string, unknown>;
type Field = { key: string; column?: string; label: string; group: string; contact?: "phone"|"email"|"facebook"|"instagram" };
type Found = { field: Field; value: string; source: string | null };
type Profile = { area: QualityArea; kind: Kind; index: number; id: number; row: Row; label: string; missing: Field[] };

const field = (key: string, column: string | undefined, label: string, group: string, contact?: Field["contact"]): Field =>
  ({ key, column, label, group, contact });
const website = field("websiteUrl","website_url","Web","web");
const photo = (column: string) => field("imageUrl",column,"Obrázok","image");
const phone = (column: string) => field("publicPhone",column,"Telefón","phone");
const email = (column: string) => field("publicEmail",column,"E-mail","email");
const address = field("address","address","Adresa","address");
const social = [field("facebookUrl","facebook_url","Facebook","social"),field("instagramUrl","instagram_url","Instagram","social")];
const SPECS: Record<Kind,{table:string;fields:Field[];label:string}> = {
  DIRECTORY: {table:"directory_profiles",label:"name",fields:[
    website,photo("image_url"),address,
    field("publicPhone",undefined,"Telefón","phone","phone"),
    field("publicEmail",undefined,"E-mail","email","email"),
    field("facebookUrl",undefined,"Facebook","social","facebook"),
    field("instagramUrl",undefined,"Instagram","social","instagram"),
  ]},
  EVENT: {table:"managed_events",label:"title",fields:[
    website,photo("image_url"),address,
    field("registrationUrl","registration_url","Registrácia","registration"),
    field("startTime","start_time","Čas začiatku","date"),
    field("venue","venue","Miesto","address"),
    field("organizer","organizer","Organizátor","other"),
  ]},
  ORGANIZATION: {table:"help_organizations",label:"name",fields:[
    website,photo("image_url"),phone("public_phone"),email("public_email"),...social,
    field("registrationNumber","registration_number","Registračné číslo","other"),
  ]},
  ADOPTION: {table:"adoption_dogs",label:"name",fields:[
    photo("main_image"),field("contactUrl","contact_url","Odkaz na kontakt","web"),
    field("contactPhone","contact_phone","Telefón","phone"),
    field("contactEmail","contact_email","E-mail","email"),
    field("externalSourceUrl","external_source_url","Zdroj ponuky","web"),
  ]},
  FOSTER: {table:"help_cases",label:"title",fields:[
    photo("image_url"),field("actionUrl","action_url","Odkaz na výzvu","web"),
  ]},
  HELP_ITEM: {table:"help_cases",label:"title",fields:[
    photo("image_url"),field("actionUrl","action_url","Odkaz na výzvu","web"),
  ]},
  LOST_FOUND: {table:"lost_found_dog_reports",label:"dog_name",fields:[
    photo("main_image"),field("sourceUrl","source_url","Pôvodné hlásenie","web"),
    field("contactPhone","contact_phone","Telefón","phone"),
    field("contactEmail","contact_email","E-mail","email"),
  ]},
};
const AREA_KINDS: Record<QualityArea,Kind[]> = {
  services:["DIRECTORY"],events:["EVENT"],help:["ORGANIZATION","ADOPTION","FOSTER","HELP_ITEM","LOST_FOUND"],
};
const AREA_LABELS:Record<QualityArea,string> = {services:"Služby pre psov",events:"Podujatia",help:"Pomoc psom"};
function missing(value: unknown) { return value === null || value === undefined || (typeof value === "string" && !value.trim()); }
function sourceData(value:unknown): DirectoryImportData {
  try { return JSON.parse(typeof value==="string"?value:"{}") as DirectoryImportData; } catch { return {}; }
}
function fieldValue(kind:Kind,row:Row,f:Field) {
  if(kind==="DIRECTORY"&&f.key==="websiteUrl") {
    const contacts=readDirectoryPublicContacts(sourceData(row.source_data_json),String(row.website_url??""));
    return contacts.website;
  }
  if(kind==="DIRECTORY"&&f.contact){
    const contacts=readDirectoryPublicContacts(sourceData(row.source_data_json),String(row.website_url??""));
    return contacts[f.contact];
  }
  return f.column ? row[f.column] : null;
}
function title(kind:Kind,row:Row) {
  const label=String(row[SPECS[kind].label]??"").trim();
  return label || (kind==="LOST_FOUND" ? `Hlásenie #${row.id}` : "");
}
function eligible(area:QualityArea,kind:Kind,index:number,row:Row):Profile|null {
  const label=title(kind,row);
  if(!label) return null;
  const pending=SPECS[kind].fields.filter(f=>missing(fieldValue(kind,row,f)));
  if(!pending.length) return null;
  return {area,kind,index,id:Number(row.id),row,label,missing:pending};
}
function allowedPage(url:unknown) { return typeof url==="string" && isSafeAutomationSourceUrl(url) ? url : null; }
function idMatches(label:string,city:string,result:{title:string;snippet?:string|null}) {
  const needle=normalizeAutomationIdentity(label);
  const hay=normalizeAutomationIdentity(result.title+" "+(result.snippet??""));
  const parts=needle.split(/\s+/).filter(x=>x.length>=4&&!["veterinarna","ambulancia","salon","utulok","hotel","podujatie"].includes(x));
  if (!parts.length || !parts.some(part=>hay.includes(part))) return false;
  // City narrows ambiguous businesses; the user makes the final accept/reject decision.
  const normalizedCity=normalizeAutomationIdentity(city);
  return !normalizedCity || hay.includes(normalizedCity) || hay.includes(needle);
}
function snippetField(s:string,regex:RegExp) { return s.match(regex)?.[1]?.trim().slice(0,200)??null; }
function discover(profile:Profile,results:Array<{url:string;title:string;snippet?:string|null}>,images:string[]):Found[] {
  const found:Found[]=[];
  const city=String(profile.row.city??"");
  const matched=results.filter(r=>idMatches(profile.label,city,r));
  for(const f of profile.missing) {
    let value:string|null=null; let source:string|null=null;
    if(f.group==="image") {
      value=matched.length ? images.map(allowedPage).find((x):x is string=>Boolean(x))??null : null;
      source=matched[0]?.url??null;
    } else if(f.key==="websiteUrl"||f.key==="externalSourceUrl"||f.key==="sourceUrl"||f.key==="contactUrl"||f.key==="actionUrl"||f.key==="registrationUrl") {
      const candidates=matched.filter(r=>allowedPage(r.url));
      const pattern=f.key==="registrationUrl"?/registr|prihl|vstup|entry|ticket/i:/./;
      const chosen=candidates.find(r=>pattern.test(r.url)&&
        (f.key==="websiteUrl"? !/facebook\.com|instagram\.com|google\.|firmy\.|zoznam\.|azet\.|youtube\.com/i.test(new URL(r.url).hostname):true));
      value=chosen?.url??null;source=chosen?.url??null;
    } else if(f.group==="social") {
      const host=f.key==="facebookUrl"?"facebook.com":"instagram.com";
      const result=matched.find(r=>{try{return new URL(r.url).hostname.endsWith(host)}catch{return false}});
      value=result?.url??null;source=result?.url??null;
    } else {
      for(const r of matched) {
        const s=r.snippet??"";
        if(f.group==="email") value=snippetField(s,/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
        if(f.group==="phone") value=snippetField(s,/((?:\+421|0)[\s\-()]*(?:\d[\s\-()]*){8,9})/i)?.replace(/\s+/g," ").trim()??null;
        if(f.key==="startTime") value=snippetField(s,/(?:začiatok|od|štart)\s*[:–-]?\s*(\d{1,2}:\d{2})/i);
        if(f.key==="organizer") value=snippetField(s,/(?:organizátor|organizuje)\s*[:–-]\s*([^.;\n]{4,80})/i);
        if(f.key==="venue") value=snippetField(s,/(?:miesto konania)\s*[:–-]\s*([^.;\n]{4,100})/i);
        if(f.key==="address") value=snippetField(s,/(?:adresa|sídlo)\s*[:–-]\s*([^.;\n]{8,100})/i);
        if(f.key==="registrationNumber") value=snippetField(s,/(?:IČO)\s*[:–-]?\s*(\d{8})/i);
        if(value){source=r.url;break;}
      }
    }
    if(!value||!value.trim()) continue;
    if((f.group==="web"||f.group==="image"||f.group==="social"||f.group==="registration")&&!allowedPage(value)) continue;
    found.push({field:f,value:value.trim().slice(0,2048),source});
  }
  return found;
}
async function nextProfile(db:Database,area:QualityArea) {
  const state=await db.prepare("SELECT type_index,entity_id FROM quality_missing_cursors WHERE area=?").bind(area).first<{type_index:number;entity_id:number}>();
  const kinds=AREA_KINDS[area];
  const start=Math.max(0,Math.min(kinds.length-1,Number(state?.type_index??0)));
  for(let i=start;i<kinds.length;i++){
    const kind=kinds[i],spec=SPECS[kind];
    let after=i===start?Number(state?.entity_id??0):0;
    // Process a bounded page and advance beyond complete profiles without a Tavily request.
    for(let page=0;page<10;page++){
      const scope=kind==="FOSTER"?" AND category='docasna-opatera'"
        :kind==="HELP_ITEM"?" AND category<>'docasna-opatera'":"";
      const rows=await db.prepare(`SELECT * FROM ${spec.table} WHERE id>?${scope} ORDER BY id ASC LIMIT 250`).bind(after).all<Row>();
      if(!rows.results.length) break;
      for(const row of rows.results) {
        const profile=eligible(area,kind,i,row);
        if(!profile) continue;
        // An existing open proposal means the same missing field already awaits the user.
        const opened=await db.prepare("SELECT field_key FROM quality_missing_proposals WHERE entity_type=? AND entity_id=? AND status='OPEN'")
          .bind(kind,profile.id).all<{field_key:string}>();
        const awaiting=new Set(opened.results.map(x=>x.field_key));
        profile.missing=profile.missing.filter(f=>!awaiting.has(f.key));
        if(profile.missing.length) return profile;
      }
      after=Number(rows.results[rows.results.length-1].id);
      if(rows.results.length<250) break;
      if(page===9) return {skipped:true,index:i,id:after} as const;
    }
  }
  return null;
}
export async function runQualityMissingHourly(input:{database:Database;tavilyApiKey?:string;now?:Date}) {
  const db=input.database,now=input.now??new Date(),at=now.toISOString(),hour=at.slice(0,13);
  if(!input.tavilyApiKey) return {enabled:false,scanned:0,found:0};
  const provider=new TavilyAutomationSearchProvider({apiKey:input.tavilyApiKey});
  let scanned=0,found=0;
  try{
    for(const area of ["services","events","help"] as const) {
      const claimed=await db.prepare("INSERT OR IGNORE INTO quality_missing_scans(area,hour,scanned_at) VALUES(?,?,?)")
        .bind(area,hour,at).run();
      if(!claimed.meta.changes) continue;
      const profile=await nextProfile(db,area);
      if(profile && "skipped" in profile){
        await db.prepare("UPDATE quality_missing_cursors SET type_index=?,entity_id=?,updated_at=? WHERE area=?")
          .bind(profile.index,profile.id,at,area).run();
        continue;
      }
      if(!profile){
        await db.prepare("UPDATE quality_missing_cursors SET type_index=0,entity_id=0,updated_at=? WHERE area=?").bind(at,area).run();
        continue;
      }
      await db.prepare("UPDATE quality_missing_cursors SET type_index=?,entity_id=?,updated_at=? WHERE area=?")
        .bind(profile.index,profile.id,at,area).run();
      await db.prepare("UPDATE quality_missing_scans SET entity_type=?,entity_id=? WHERE area=? AND hour=?")
        .bind(profile.kind,profile.id,area,hour).run();
      scanned++;
      const terms=area==="events"?"registrácia dátum čas miesto plagát":area==="help"?"kontakt email telefón web facebook fotografia":"kontakt telefón email web facebook instagram fotografia";
      const city=String(profile.row.city??"").trim();
      const query=[profile.label,city,terms].filter(Boolean).join(" ").slice(0,500);
      try {
        const search=await provider.searchWithImages({query,maxResults:5,locale:"sk-SK",country:"SK"});
        const foundFields=discover(profile,search.results,search.images);
        for(const item of foundFields){
          const written=await db.prepare(`INSERT OR IGNORE INTO quality_missing_proposals
            (area,entity_type,entity_id,profile_label,field_key,field_label,field_group,value,source_url,found_at)
            VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(
              area,profile.kind,profile.id,profile.label,item.field.key,item.field.label,
              item.field.group,item.value,item.source,at,
            ).run();
          found+=Number(written.meta.changes??0);
        }
      }catch(error){
        // Provider failures (including exhausted credits) never stop other Psipedia jobs.
        console.info(JSON.stringify({event:"quality_missing_tavily_unavailable",area,error:error instanceof Error?error.name:"provider_error"}));
      }
    }
    return {enabled:true,scanned,found};
  }catch(error) {
    if(/no such table:\s*quality_missing_/i.test(String(error)))return {enabled:false,schemaReady:false,scanned,found};
    throw error;
  }
}
export type MissingQualityProposal = {
  id:number;area:QualityArea;entity_type:Kind;entity_id:number;profile_label:string;
  field_key:string;field_label:string;field_group:string;value:string;source_url:string|null;found_at:string;
};
export type MissingQualityDashboard = {
  pending:MissingQualityProposal[]; total:number; monthly:Record<QualityArea,number>; truncated:boolean;schemaReady:boolean;
};
export async function loadMissingQualityDashboard(db:Database):Promise<MissingQualityDashboard>{
  const monthly={services:0,events:0,help:0};
  try{
    const [rows,counts,runCounts]=await Promise.all([
      db.prepare("SELECT id,area,entity_type,entity_id,profile_label,field_key,field_label,field_group,value,source_url,found_at FROM quality_missing_proposals WHERE status='OPEN' ORDER BY id DESC LIMIT 1000").all<MissingQualityProposal>(),
      db.prepare("SELECT COUNT(*) AS n FROM quality_missing_proposals WHERE status='OPEN'").first<{n:number}>(),
      db.prepare("SELECT area,COUNT(*) AS n FROM quality_missing_scans WHERE scanned_at>=? AND entity_id IS NOT NULL GROUP BY area")
        .bind(new Date().toISOString().slice(0,7)+"-01").all<{area:QualityArea;n:number}>(),
    ]);
    for(const r of runCounts.results)if(r.area in monthly) monthly[r.area]=Number(r.n);
    const total=Number(counts?.n??0);
    return {pending:rows.results,total,monthly,truncated:total>rows.results.length,schemaReady:true};
  }catch(error){
    if(/no such table:\s*quality_missing_/i.test(String(error)))return {pending:[],total:0,monthly,truncated:false,schemaReady:false};
    throw error;
  }
}
export async function reviewMissingQualityProposal(db:Database,id:number,action:"accept"|"reject",actor:string) {
  const p=await db.prepare("SELECT * FROM quality_missing_proposals WHERE id=? AND status='OPEN'")
    .bind(id).first<MissingQualityProposal>();
  if(!p) throw new Error("Návrh už bol spracovaný. Obnov stránku.");
  const at=new Date().toISOString();
  if(action==="reject"){
    const r=await db.prepare("UPDATE quality_missing_proposals SET status='REJECTED',decided_by=?,decided_at=? WHERE id=? AND status='OPEN'")
      .bind(actor,at,id).run();
    if(!r.meta.changes)throw new Error("Návrh už bol spracovaný.");
    return;
  }
  const config=SPECS[p.entity_type],f=config.fields.find(x=>x.key===p.field_key);
  if(!f)throw new Error("Tento údaj sa nedá automaticky prevziať.");
  if(["web","image","social","registration"].includes(f.group)&&!allowedPage(p.value))
    throw new Error("Neplatný externý odkaz.");
  const row=await db.prepare(`SELECT * FROM ${config.table} WHERE id=?`).bind(p.entity_id).first<Row>();
  if(!row||!missing(fieldValue(p.entity_type,row,f)))throw new Error("Údaj už bol medzičasom vyplnený.");
  const updatedAt=String(row.updated_at??"");
  let update:D1PreparedStatement;
  if(p.entity_type==="DIRECTORY"&&f.contact){
    const patch:Parameters<typeof mergeDirectoryPublicContactData>[1]={};
    if(f.contact==="phone")patch.publicPhone=p.value;
    if(f.contact==="email")patch.publicEmail=p.value;
    if(f.contact==="facebook")patch.facebookUrl=p.value;
    if(f.contact==="instagram")patch.instagramUrl=p.value;
    const data=mergeDirectoryPublicContactData(sourceData(row.source_data_json),patch);
    update=db.prepare(`UPDATE directory_profiles SET source_data_json=?,updated_at=?,updated_by=?
      WHERE id=? AND updated_at=? AND EXISTS (SELECT 1 FROM quality_missing_proposals WHERE id=? AND status='OPEN')`)
      .bind(JSON.stringify(data),at,actor,p.entity_id,updatedAt,p.id);
  }else{
    if(!f.column)throw new Error("Chýba mapovanie poľa.");
    // Field column is always from the static allowlist above, never from user input.
    const by=p.entity_type==="LOST_FOUND"?"":",updated_by=?";
    update=db.prepare(`UPDATE ${config.table} SET ${f.column}=?,updated_at=?${by}
      WHERE id=? AND updated_at=? AND (${f.column} IS NULL OR TRIM(${f.column})='')
      AND EXISTS (SELECT 1 FROM quality_missing_proposals WHERE id=? AND status='OPEN')`)
      .bind(...(p.entity_type==="LOST_FOUND"?[p.value,at,p.entity_id,updatedAt,p.id]:[p.value,at,actor,p.entity_id,updatedAt,p.id]));
  }
  const decision=db.prepare(`UPDATE quality_missing_proposals
    SET status='ACCEPTED',decided_by=?,decided_at=?
    WHERE id=? AND status='OPEN'
      AND EXISTS (SELECT 1 FROM ${config.table} WHERE id=? AND updated_at=?)`)
    .bind(actor,at,p.id,p.entity_id,at);
  const [result,decisionResult]=await db.batch([update,decision]);
  if(!result.meta.changes || !decisionResult.meta.changes)throw new Error("Záznam sa medzičasom zmenil. Obnov stránku.");
}
export function getQualityMissingDatabase(){
  const db=(env as unknown as {DB?:D1Database}).DB;
  if(!db)throw new Error("Chýba databáza Kvality údajov.");
  return db;
}
export {AREA_LABELS};
