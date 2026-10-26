import { env } from "cloudflare:workers";
import { TavilyAutomationSearchProvider } from "./data-automation-search-tavily.ts";
import { AutomationSearchProviderError } from "./data-automation-discovery.ts";
import { isSafeAutomationSourceUrl, normalizeAutomationIdentity } from "./data-automation.ts";
import { mergeDirectoryPublicContactData, readDirectoryPublicContacts, type DirectoryImportData } from "./directory-profile-metadata.ts";
import { buildQualityTavilyQuery, qualityMayResearch, qualityTodayInSlovakia } from "./data-quality-tavily-query.ts";

export type QualityArea = "services" | "events" | "help";
type Kind = "DIRECTORY" | "EVENT" | "ORGANIZATION" | "ADOPTION" | "FOSTER" | "HELP_ITEM" | "LOST_FOUND";
type Database = D1Database;
type Row = Record<string, unknown>;
type Field = { key: string; column?: string; label: string; group: string; contact?: "phone"|"email"|"facebook"|"instagram" };
type Found = { field: Field; value: string; source: string | null };
const QUALITY_CANDIDATE_PREFIX = "quality-missing-candidate:";

// Candidate image bytes are held privately in R2 until an administrator approves them.
// Never allow an arbitrary D1 string to select a bucket object.
export function qualityMissingCandidateKey(value: string): string | null {
  if (!value.startsWith(QUALITY_CANDIDATE_PREFIX)) return null;
  const key = value.slice(QUALITY_CANDIDATE_PREFIX.length);
  return /^quality-missing-candidates\/[0-9]{4}\/[0-9a-f-]{36}\.(?:jpg|png|webp|avif)$/.test(key) ? key : null;
}
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
    // Report contacts live in a separate encrypted private-details table;
    // never attempt an unsafe direct column update or expose those values.
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
function eligible(area:QualityArea,kind:Kind,index:number,row:Row,today:string):Profile|null {
  if(!qualityMayResearch(kind,row,today)) return null;
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
// Tavily and Facebook CDN links can expire between discovery and the administrator's review.
// Persist a validated, optimized PRIVATE R2 copy before the proposal is created.
// No public profile field is changed by discovery; unavailable images are simply skipped.
async function discoverWithStagedImage(
  db:Database, profile:Profile,
  results:Array<{url:string;title:string;snippet?:string|null}>, images:string[],
):Promise<Found[]> {
  const findings=discover(profile,results,[]);
  const imageField=profile.missing.find(f=>f.group==="image");
  if(!imageField || !results.some(r=>idMatches(profile.label,String(profile.row.city??""),r))) return findings;
  const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;
  if(!bucket) return findings;
  const past=await db.prepare("SELECT value,source_url FROM quality_missing_proposals WHERE entity_type=? AND entity_id=? AND field_key='imageUrl'")
    .bind(profile.kind,profile.id).all<{value:string;source_url:string|null}>();
  const alreadySeen=new Set(past.results.map(p=>qualityMissingCandidateKey(p.value)?p.source_url:p.value).filter(Boolean));
  const {downloadRemoteImage,optimizeRemoteImageForStorage}=await import("./notion-sync-shared.ts");
  // Bounded: at most three image fetches; invalid/expired Facebook URLs never become proposals.
  for(const source of images.slice(0,3)) {
    if(!allowedPage(source)||alreadySeen.has(source)) continue;
    let key:string|null=null;
    try {
      const remote=await downloadRemoteImage(source);
      const stored=await optimizeRemoteImageForStorage(
        env as unknown as {BUCKET?:R2Bucket;IMAGES?:import("@/lib/private-media").ImagesBindingLike},remote);
      key="quality-missing-candidates/"+new Date().getUTCFullYear()+"/"+crypto.randomUUID()+"."+stored.extension;
      await bucket.put(key,stored.bytes,{
        httpMetadata:{contentType:stored.contentType,cacheControl:"private, no-store"},
        customMetadata:{source:"quality-missing-unapproved",sourceImageUrl:remote.finalUrl.slice(0,400)},
      });
      findings.unshift({field:imageField,value:QUALITY_CANDIDATE_PREFIX+key,source:remote.finalUrl});
      break;
    } catch {
      if(key) await bucket.delete(key).catch(()=>undefined);
      // A social network may return HTML/login instead of image bytes. Try next candidate.
    }
  }
  return findings;
}

async function insertQualityFinding(db:Database,profile:Profile,item:Found,now:string) {
  const candidateKey=qualityMissingCandidateKey(item.value);
  try {
    const written=await db.prepare("INSERT OR IGNORE INTO quality_missing_proposals"+
      "(area,entity_type,entity_id,profile_label,field_key,field_label,field_group,value,source_url,found_at)"+
      " VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(profile.area,profile.kind,profile.id,profile.label,item.field.key,item.field.label,
        item.field.group,item.value,item.source,now).run();
    if(!written.meta.changes&&candidateKey)
      await (env as unknown as {BUCKET?:R2Bucket}).BUCKET?.delete(candidateKey).catch(()=>undefined);
    return Number(written.meta.changes??0);
  } catch(error) {
    if(candidateKey)await (env as unknown as {BUCKET?:R2Bucket}).BUCKET?.delete(candidateKey).catch(()=>undefined);
    throw error;
  }
}

async function nextProfile(db:Database,area:QualityArea,today:string) {
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
        const profile=eligible(area,kind,i,row,today);
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
type ScanStatus = "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED" | "UNKNOWN";
type QualityScanCount = { total: number; successful: number; failed: number; unknown: number; running: number };
type QualityScanLast = { status: ScanStatus; errorCode: string | null } | null;
const QUALITY_AREAS: QualityArea[] = ["services", "events", "help"];

function emptyScanCount(): QualityScanCount {
  return { total: 0, successful: 0, failed: 0, unknown: 0, running: 0 };
}

async function hasScanStatusColumns(db: Database): Promise<boolean> {
  try {
    await db.prepare("SELECT status,error_code FROM quality_missing_scans LIMIT 1").all();
    return true;
  } catch (error) {
    if (/no such (table|column):/i.test(String(error))) return false;
    throw error;
  }
}

function qualityFailureCode(error: unknown): string {
  if (!(error instanceof AutomationSearchProviderError)) return "INTERNAL_ERROR";
  if (error.code === "PROVIDER_ERROR") {
    if (error.httpStatus !== null) return `HTTP_${error.httpStatus}`;
    if (error.transportFailure) return "NETWORK_ERROR";
  }
  return error.code;
}

function qualityFailureLabel(code: string): string {
  if (/^HTTP_5\d{2}$/.test(code)) return `Tavily vrátilo HTTP ${code.slice(5)} (chyba servera)`;
  return QUALITY_ERROR_LABELS[code] ?? QUALITY_ERROR_LABELS.INTERNAL_ERROR;
}

const QUALITY_ERROR_LABELS: Record<string, string> = {
  AUTH_FAILED: "Autorizácia Tavily bola zamietnutá",
  RATE_LIMITED: "Tavily odmietlo požiadavku pre limit",
  CREDITS_EXHAUSTED: "Vyčerpaný kredit alebo rozpočtový limit Tavily",
  INVALID_REQUEST: "Tavily odmietlo parametre vyhľadávania",
  TIMEOUT: "Vyhľadávanie prekročilo časový limit",
  PROVIDER_ERROR: "Externá vyhľadávacia služba odpovedala chybou",
  NETWORK_ERROR: "Spojenie Cloudflare s Tavily zlyhalo",
  INVALID_RESPONSE: "Tavily vrátilo neplatnú odpoveď",
  CONFIG_MISSING: "Chyba konfigurácie vyhľadávania",
  INTERNAL_ERROR: "Chyba spracovania alebo uloženia údajov",
};

export async function runQualityMissingHourly(input: { database: Database; tavilyApiKey?: string; now?: Date }) {
  const db = input.database;
  const now = input.now ?? new Date();
  const at = now.toISOString();
  const hour = at.slice(0, 13);
  if (!input.tavilyApiKey) return { enabled: false, schemaReady: true, scanned: 0, found: 0, failed: 0 };
  // A pending migration must not make the scheduled cron fail or produce misleading counts.
  if (!(await hasScanStatusColumns(db))) {
    return { enabled: false, schemaReady: false, scanned: 0, found: 0, failed: 0 };
  }

  const provider = new TavilyAutomationSearchProvider({ apiKey: input.tavilyApiKey });
  const today = qualityTodayInSlovakia(now);
  let scanned = 0;
  let found = 0;
  let failed = 0;

  for (const area of QUALITY_AREAS) {
    // Read the preceding completed attempt BEFORE claiming the current hour.
    const previous = await db.prepare(
      "SELECT status,error_code FROM quality_missing_scans WHERE area=? AND status IN ('SUCCESS','FAILED') ORDER BY scanned_at DESC LIMIT 1"
    ).bind(area).first<{ status: ScanStatus; error_code: string | null }>();
    const claimed = await db.prepare(
      "INSERT OR IGNORE INTO quality_missing_scans(area,hour,scanned_at,status) VALUES(?,?,?,'RUNNING')"
    ).bind(area, hour, at).run();
    if (!claimed.meta.changes) continue;

    const profile = await nextProfile(db, area, today);
    if (profile && "skipped" in profile) {
      await db.prepare("UPDATE quality_missing_cursors SET type_index=?,entity_id=?,updated_at=? WHERE area=?")
        .bind(profile.index, profile.id, at, area).run();
      await db.prepare("UPDATE quality_missing_scans SET status='SKIPPED' WHERE area=? AND hour=?")
        .bind(area, hour).run();
      continue;
    }
    if (!profile) {
      await db.prepare("UPDATE quality_missing_cursors SET type_index=0,entity_id=0,updated_at=? WHERE area=?")
        .bind(at, area).run();
      await db.prepare("UPDATE quality_missing_scans SET status='SKIPPED' WHERE area=? AND hour=?")
        .bind(area, hour).run();
      continue;
    }

    await db.prepare("UPDATE quality_missing_scans SET entity_type=?,entity_id=? WHERE area=? AND hour=?")
      .bind(profile.kind, profile.id, area, hour).run();
    scanned++;

    const query = buildQualityTavilyQuery(profile);
    const beforeFound = found;

    try {
      const search = await provider.searchWithImages({ query, maxResults: 5, locale: "sk-SK", country: "SK" });
      const foundFields = await discoverWithStagedImage(db,profile,search.results,search.images);
      for (const item of foundFields) found += await insertQualityFinding(db,profile,item,at);

      await db.prepare("UPDATE quality_missing_scans SET status='SUCCESS',error_code=NULL WHERE area=? AND hour=?")
        .bind(area, hour).run();
      // Move the cursor only AFTER the provider succeeds and proposals have been persisted.
      await db.prepare("UPDATE quality_missing_cursors SET type_index=?,entity_id=?,updated_at=? WHERE area=?")
        .bind(profile.index, profile.id, at, area).run();

      if (found > beforeFound) {
        try {
          await (await import("./admin-notifications.ts")).enqueueAdminNotificationEvent(db, {
            eventType: "quality_missing_found", sourceType: "QUALITY_MISSING",
            resourceType: area, resourceRef: profile.id, actorType: "AUTOMATION",
            actorRef: "tavily-quality", targetUrl: "/admin/kvalita",
            title: "Nájdené nové údaje – " + AREA_LABELS[area],
            body: profile.label + ": " + (found - beforeFound) + " návrhov na schválenie",
            tag: "quality-" + area + "-" + hour,
            dedupeKey: "quality/found/" + area + "/" + hour,
          }, now);
        } catch { /* Notification errors must not undo successful research. */ }
      }
    } catch (error) {
      // A rejected provider request or D1 write is retryable in the NEXT hour.
      // Do not move the cursor and do not erase the original missing fields.
      failed++;
      const errorCode = qualityFailureCode(error);
      await db.prepare("UPDATE quality_missing_scans SET status='FAILED',error_code=? WHERE area=? AND hour=?")
        .bind(errorCode, area, hour).run();
      console.error(JSON.stringify({ event: "quality_missing_search_failed", area, reason: errorCode }));

      // Notify only on a new incident or changed reason, not every hour.
      if (previous?.status !== "FAILED" || previous.error_code !== errorCode) {
        try {
          await (await import("./admin-notifications.ts")).enqueueAdminNotificationEvent(db, {
            eventType: "quality_missing_failed", sourceType: "QUALITY_MISSING",
            resourceType: area, resourceRef: profile.id, actorType: "AUTOMATION",
            actorRef: "tavily-quality", targetUrl: "/admin/kvalita",
            title: "Tavily – vyhľadávanie sa nepodarilo dokončiť",
            body: "Oblasť: " + AREA_LABELS[area] + ". Dôvod: " +
              qualityFailureLabel(errorCode) + ".",
            tag: "quality-failed-" + area + "-" + hour,
            dedupeKey: "quality/failed/" + area + "/" + hour,
          }, now);
        } catch { /* Notification delivery must never stop other areas. */ }
      }
    }
  }
  return { enabled: true, schemaReady: true, scanned, found, failed };
}


export type ManualQualityGroup = "address" | "image" | "web" | "phone" | "email" | "social" | "registration" | "date" | "other" | "all";
export type ManualQualityMode = "profiles" | "free" | "alternative";
export type ManualQualityCursor = { index: number; id: number };
export type ManualQualityInput = {
  area: QualityArea; group: ManualQualityGroup; mode: ManualQualityMode;
  query?: string; cursor?: ManualQualityCursor;
  entityType?: Kind; entityId?: number;
};
export type ManualQualityHistory = {
  id:string; area:QualityArea; search_group:string; mode:string; profile_label:string|null;
  created_at:string; status:string; found:number; error_code:string|null;
};
export type ManualQualityResponse = {
  inspected:number; found:number; cursor:ManualQualityCursor|null; finished:boolean;
  profileLabel:string|null; estimatedCredits:number;
  results?:Array<{title:string;url:string;snippet:string|null}>;
  images?:string[];
};

const MANUAL_GROUPS:readonly ManualQualityGroup[]=["address","image","web","phone","email","social","registration","date","other","all"];
const MANUAL_MODES:readonly ManualQualityMode[]=["profiles","free","alternative"];
export function validManualQualityRequest(input:ManualQualityInput) {
  if(!QUALITY_AREAS.includes(input.area)||!MANUAL_GROUPS.includes(input.group)||!MANUAL_MODES.includes(input.mode)) {
    throw new Error("Neplatné nastavenie ručného vyhľadávania.");
  }
  if(input.cursor && (!Number.isSafeInteger(input.cursor.index)||input.cursor.index<0||
    !Number.isSafeInteger(input.cursor.id)||input.cursor.id<0)) throw new Error("Neplatná pozícia vyhľadávania.");
  if(input.mode==="free" && (typeof input.query!=="string"||input.query.trim().length<3||
    input.query.length>250)) throw new Error("Zadaj hľadaný výraz (3 až 250 znakov).");
  if(input.mode==="alternative" && (input.group!=="image"||
    !input.entityType||!AREA_KINDS[input.area].includes(input.entityType)||
    !Number.isSafeInteger(input.entityId)||Number(input.entityId)<1)) {
    throw new Error("Neplatný profil pre hľadanie iného obrázka.");
  }
}

export async function qualityManualSchemaReady(db:Database) {
  const row=await db.prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='quality_missing_manual_attempts'")
    .first<{ok:number}>();
  return Boolean(row?.ok);
}

export async function listManualQualityHistory(db:Database):Promise<ManualQualityHistory[]> {
  if(!await qualityManualSchemaReady(db)) return [];
  const rows=await db.prepare("SELECT id,area,search_group,mode,profile_label,created_at,status,found,error_code " +
    "FROM quality_missing_manual_attempts ORDER BY created_at DESC LIMIT 20").all<ManualQualityHistory>();
  return rows.results;
}

async function nextManualQualityProfile(db:Database, input:ManualQualityInput,today:string):Promise<Profile|null> {
  const kinds=AREA_KINDS[input.area];
  const exact=input.mode==="alternative";
  const selectedKinds=exact?[input.entityType as Kind]:kinds;
  const startIndex=exact?0:Math.min(kinds.length-1,input.cursor?.index??0);
  for(let local=0;local<selectedKinds.length;local++) {
    const kind=selectedKinds[local];
    const index=kinds.indexOf(kind);
    if(!exact && index<startIndex) continue;
    const spec=SPECS[kind];
    let after=exact?Number(input.entityId)-1:index===startIndex?(input.cursor?.id??0):0;
    for(let page=0;page<(exact?1:10);page++) {
      const scope=kind==="FOSTER"?" AND category='docasna-opatera'"
        :kind==="HELP_ITEM"?" AND category<>'docasna-opatera'":"";
      const query=exact?"SELECT * FROM "+spec.table+" WHERE id=?"+scope+" LIMIT 1":
        "SELECT * FROM "+spec.table+" WHERE id>?"+scope+" ORDER BY id ASC LIMIT 250";
      const rows=await db.prepare(query).bind(exact?input.entityId:after).all<Row>();
      for(const row of rows.results) {
        const profile=eligible(input.area,kind,index,row,today);
        if(!profile) continue;
        profile.missing=profile.missing.filter(f=>input.group==="all"||f.group===input.group);
        if(!profile.missing.length) continue;
        if(!exact) {
          const pending=await db.prepare("SELECT field_key FROM quality_missing_proposals "+
            "WHERE entity_type=? AND entity_id=? AND status='OPEN'").bind(kind,profile.id).all<{field_key:string}>();
          const opened=new Set(pending.results.map(x=>x.field_key));
          profile.missing=profile.missing.filter(f=>!opened.has(f.key));
        }
        if(profile.missing.length) return profile;
      }
      if(exact||rows.results.length<250) break;
      after=Number(rows.results[rows.results.length-1].id);
    }
  }
  return null;
}

export async function runManualQualitySearch(
  db:Database, input:ManualQualityInput, actor:string, apiKey?:string
):Promise<ManualQualityResponse> {
  validManualQualityRequest(input);
  if(!await qualityManualSchemaReady(db)) throw new Error(
    "Ručné vyhľadávanie vyžaduje databázovú migráciu 0143. Automatická kontrola zostáva zapnutá."
  );
  if(!apiKey?.trim()) throw new Error("Tavily nie je nakonfigurované.");
  const profile=input.mode==="free"?null:await nextManualQualityProfile(db,input,qualityTodayInSlovakia());
  if(input.mode!=="free"&&!profile) return {
    inspected:0,found:0,cursor:null,finished:true,profileLabel:null,estimatedCredits:0,
  };
  const now=new Date().toISOString();
  const id=crypto.randomUUID();
  const cursor=profile?{index:profile.index,id:profile.id}:null;
  const query=input.mode==="free"?input.query!.trim():buildQualityTavilyQuery(profile!);
  const claimed=await db.prepare(
    "INSERT INTO quality_missing_manual_attempts"+
    "(id,area,search_group,mode,entity_type,entity_id,profile_label,created_at,status,actor)"+
    " VALUES(?,?,?,?,?,?,?,?,?,?)"
  ).bind(id,input.area,input.group,input.mode,profile?.kind??null,profile?.id??null,
    profile?.label??null,now,"RUNNING",actor.slice(0,200)).run();
  if(claimed.meta.changes!==1) throw new Error("Kontrolu sa nepodarilo zapísať.");
  let found=0;
  try {
    const provider=new TavilyAutomationSearchProvider({apiKey});
    const search=await provider.searchWithImages({query,maxResults:5,locale:"sk-SK",country:"SK"},
      input.group==="all"||input.group==="image");
    if(profile) {
      const discovered=(await discoverWithStagedImage(db,profile,search.results,search.images))
        .filter(x=>input.group==="all"||x.field.group===input.group);
      for(const item of discovered) found+=await insertQualityFinding(db,profile,item,now);
    }
    await db.prepare("UPDATE quality_missing_manual_attempts SET status='SUCCESS',found=?,finished_at=? WHERE id=?")
      .bind(found,new Date().toISOString(),id).run();
    return {
      inspected:profile?1:0,found,cursor,finished:input.mode!=="free"&&!profile,
      profileLabel:profile?.label??null,estimatedCredits:1,
      ...(input.mode==="free"?{
        results:search.results.map(r=>({title:r.title,url:r.url,snippet:r.snippet??null})),
        images:search.images,
      }:{}),
    };
  } catch(error) {
    const code=qualityFailureCode(error);
    await db.prepare("UPDATE quality_missing_manual_attempts SET status='FAILED',error_code=?,finished_at=? WHERE id=?")
      .bind(code,new Date().toISOString(),id).run();
    console.error(JSON.stringify({event:"quality_missing_manual_failed",area:input.area,reason:code}));
    throw new Error("Ručné vyhľadávanie zlyhalo: "+qualityFailureLabel(code));
  }
}

export type MissingQualityProposal = {
  id:number;area:QualityArea;entity_type:Kind;entity_id:number;profile_label:string;
  field_key:string;field_label:string;field_group:string;value:string;source_url:string|null;found_at:string;
};
export type MissingQualityDashboard = {
  pending: MissingQualityProposal[];
  manualHistory: ManualQualityHistory[];
  manualReady: boolean;
  total: number;
  monthly: Record<QualityArea, number>;
  outcomes: Record<QualityArea, QualityScanCount>;
  last: Record<QualityArea, QualityScanLast>;
  truncated: boolean;
  schemaReady: boolean;
};
export async function loadMissingQualityDashboard(db: Database): Promise<MissingQualityDashboard> {
  const monthly = { services: 0, events: 0, help: 0 };
  const outcomes: Record<QualityArea, QualityScanCount> = {
    services: emptyScanCount(), events: emptyScanCount(), help: emptyScanCount(),
  };
  const last: Record<QualityArea, QualityScanLast> = { services: null, events: null, help: null };
  if (!(await hasScanStatusColumns(db))) {
    return { pending: [], manualHistory: [], manualReady: false, total: 0, monthly, outcomes, last, truncated: false, schemaReady: false };
  }
  const manualReady=await qualityManualSchemaReady(db);
  const manualHistory=manualReady?await listManualQualityHistory(db):[];
  const since = new Date().toISOString().slice(0, 7) + "-01";
  const [rows, counts, runCounts, latest] = await Promise.all([
    db.prepare("SELECT id,area,entity_type,entity_id,profile_label,field_key,field_label,field_group,value,source_url,found_at FROM quality_missing_proposals WHERE status='OPEN' ORDER BY id DESC LIMIT 1000").all<MissingQualityProposal>(),
    db.prepare("SELECT COUNT(*) AS n FROM quality_missing_proposals WHERE status='OPEN'").first<{ n: number }>(),
    db.prepare("SELECT area,status,COUNT(*) AS n FROM quality_missing_scans WHERE scanned_at>=? AND entity_id IS NOT NULL GROUP BY area,status")
      .bind(since).all<{ area: QualityArea; status: ScanStatus; n: number }>(),
    db.prepare(
      "SELECT scans.area,scans.status,scans.error_code FROM quality_missing_scans scans " +
      "JOIN (SELECT area,MAX(scanned_at) AS latest FROM quality_missing_scans GROUP BY area) last " +
      "ON scans.area=last.area AND scans.scanned_at=last.latest"
    ).all<{ area: QualityArea; status: ScanStatus; error_code: string | null }>(),
  ]);
  for (const row of runCounts.results) {
    if (!QUALITY_AREAS.includes(row.area)) continue;
    const stats = outcomes[row.area];
    stats.total += Number(row.n);
    if (row.status === "SUCCESS") stats.successful += Number(row.n);
    else if (row.status === "FAILED") stats.failed += Number(row.n);
    else if (row.status === "RUNNING") stats.running += Number(row.n);
    else stats.unknown += Number(row.n);
  }
  for (const area of QUALITY_AREAS) monthly[area] = outcomes[area].total;
  for (const row of latest.results) {
    if (QUALITY_AREAS.includes(row.area)) last[row.area] = { status: row.status, errorCode: row.error_code };
  }
  const total = Number(counts?.n ?? 0);
  return { pending: rows.results, manualHistory, manualReady, total, monthly, outcomes, last,
    truncated: total > rows.results.length, schemaReady: true };
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
    const staged=qualityMissingCandidateKey(p.value);
    if(staged)await (env as unknown as {BUCKET?:R2Bucket}).BUCKET?.delete(staged).catch(()=>undefined);
    return;
  }
  const config=SPECS[p.entity_type],f=config.fields.find(x=>x.key===p.field_key);
  if(!f)throw new Error("Tento údaj sa nedá automaticky prevziať.");
  const stagedKey=f.group==="image"?qualityMissingCandidateKey(p.value):null;
  if(["web","image","social","registration"].includes(f.group)&&!stagedKey&&!allowedPage(p.value))
    throw new Error("Neplatný externý odkaz.");
  const row=await db.prepare(`SELECT * FROM ${config.table} WHERE id=?`).bind(p.entity_id).first<Row>();
  if(!row||!missing(fieldValue(p.entity_type,row,f)))throw new Error("Údaj už bol medzičasom vyplnený.");
  const updatedAt=String(row.updated_at??"");
  let reviewedImage:{key:string;url:string}|null=null;
  if(f.group==="image") {
    const bindings=env as unknown as {BUCKET?:R2Bucket;IMAGES?:import("@/lib/private-media").ImagesBindingLike};
    if(!bindings.BUCKET) throw new Error("Cloudflare R2 nie je dostupné. Obrázok nebol schválený.");
    const {downloadRemoteImage,optimizeRemoteImageForStorage}=await import("./notion-sync-shared.ts");
    let bytes:Uint8Array;
    let extension:string;
    let contentType:string;
    let sourceUrl=p.source_url??p.value;
    if(stagedKey) {
      const staged=await bindings.BUCKET.get(stagedKey);
      if(!staged)throw new Error("Pripravený obrázok už nie je v úložisku. Vyhľadaj iný obrázok.");
      bytes=new Uint8Array(await staged.arrayBuffer());
      extension=stagedKey.split(".").pop()!;
      contentType=staged.httpMetadata?.contentType??"image/webp";
    } else {
      // Legacy proposals are still external URLs. A Facebook link can expire at any time.
      let remote:Awaited<ReturnType<typeof downloadRemoteImage>>;
      try { remote=await downloadRemoteImage(p.value); }
      catch(error) {
        const hostname=new URL(p.value).hostname.toLowerCase();
        if(hostname.endsWith("facebook.com")||hostname.endsWith("fbcdn.net")||hostname.endsWith("fbsbx.com"))
          throw new Error("Facebook už neposkytuje platný obrázok na tejto adrese. Zvoľ Hľadať iný obrázok.");
        throw error;
      }
      const stored=await optimizeRemoteImageForStorage(bindings,remote);
      bytes=stored.bytes;extension=stored.extension;contentType=stored.contentType;
      sourceUrl=remote.finalUrl;
    }
    const folder=p.entity_type==="DIRECTORY"?"directory":p.entity_type==="EVENT"?"events":
      p.entity_type==="ADOPTION"?"adoptions":p.entity_type==="LOST_FOUND"?"lost-found":"help";
    const key=folder+"/"+new Date().getUTCFullYear()+"/"+crypto.randomUUID()+"."+extension;
    await bindings.BUCKET.put(key,bytes,{
      httpMetadata:{contentType,cacheControl:"public, max-age=31536000, immutable"},
      customMetadata:{source:"quality-missing-approved",sourceUrl:sourceUrl.slice(0,400)},
    });
    reviewedImage={key,url:"/media/"+key};
  }
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
    const imageKeyColumn=reviewedImage?
      ("image_key" in row?"image_key":"main_image_key" in row?"main_image_key":null):null;
    const value=reviewedImage?.url??p.value;
    const keyClause=imageKeyColumn?", "+imageKeyColumn+"=?":"";
    const sql="UPDATE "+config.table+" SET "+f.column+"=?,updated_at=?"+by+keyClause+
      " WHERE id=? AND updated_at=? AND ("+f.column+" IS NULL OR TRIM("+f.column+")='')"+
      " AND EXISTS (SELECT 1 FROM quality_missing_proposals WHERE id=? AND status='OPEN')";
    const values:(string|number)[]=p.entity_type==="LOST_FOUND"?[value,at]:[value,at,actor];
    if(imageKeyColumn) values.push(reviewedImage!.key);
    update=db.prepare(sql).bind(...values,p.entity_id,updatedAt,p.id);
  }
  const decision=db.prepare(`UPDATE quality_missing_proposals
    SET status='ACCEPTED',decided_by=?,decided_at=?
    WHERE id=? AND status='OPEN'
      AND EXISTS (SELECT 1 FROM ${config.table} WHERE id=? AND updated_at=?)`)
    .bind(actor,at,p.id,p.entity_id,at);
  let canonicalUpdated=false;
  try{
    const [result,decisionResult]=await db.batch([update,decision]);
    canonicalUpdated=Boolean(result.meta.changes);
    if(!canonicalUpdated || !decisionResult.meta.changes)
      throw new Error("Záznam sa medzičasom zmenil. Obnov stránku.");
  }catch(error){
    // Do not delete an image already referenced by a canonical record.
    if(reviewedImage&&!canonicalUpdated)
      await (env as unknown as {BUCKET?:R2Bucket}).BUCKET?.delete(reviewedImage.key).catch(()=>{});
    throw error;
  }
  if(stagedKey)await (env as unknown as {BUCKET?:R2Bucket}).BUCKET?.delete(stagedKey).catch(()=>undefined);
}
export function getQualityMissingDatabase(){
  const db=(env as unknown as {DB?:D1Database}).DB;
  if(!db)throw new Error("Chýba databáza Kvality údajov.");
  return db;
}
export {AREA_LABELS};
