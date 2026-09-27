import { env } from "cloudflare:workers";
import {
  ADDRESS_ENRICHMENT_CANARY_MAX_TARGETS,
  ADDRESS_ENRICHMENT_MAX_SEARCH_CALLS,
  assessDirectoryAddressCandidate,
  boundedCanarySize,
  isProtectedCanonical,
  normalizeDirectoryIdentityHints,
  type AddressCandidate,
  type DirectoryEnrichmentTarget,
} from "./address-enrichment";
import { verifyDirectoryCanonicalAddress } from "./directory-address-provider";
import { normalizeSlovakPostalCode } from "./directory-service-address";
import { normalizeAutomationExactText } from "./data-automation-identity";
import { AutomationSearchProviderError } from "./data-automation-discovery";
import { isSafeAutomationSourceUrl } from "./data-automation";
import { TavilyAutomationSearchProvider } from "./data-automation-search-tavily";
import { GeocoderProviderError } from "./geo-provider";
import { GeoapifyGeocoder } from "./geoapify-geocoder";
import { syncGeoPointAfterSourceChange } from "./geo-store";
import { readDirectoryPublicContacts } from "./directory-profile-metadata";
import { existingDirectoryAddressEvidenceCandidate } from "./address-enrichment-store";
import { SLOVAK_REGIONS, getSlovakDistricts, getSlovakMunicipalities } from "./slovakia-locations";

type DB = Pick<D1Database, "prepare">;
type Bindings = { DB?: D1Database; TAVILY_API_KEY?: string; GEOAPIFY_API_KEY?: string };
type Row = Record<string, unknown>;

export type CanaryItem = {
  target: DirectoryEnrichmentTarget;
  candidate: AddressCandidate | null;
  assessment: ReturnType<typeof assessDirectoryAddressCandidate> | null;
  extractionMethod: string | null;
  sourceUrl: string | null;
  candidateFingerprint: string | null;
  reason: string;
};

const PAGE_BYTES = 500_000;
const PAGE_TIMEOUT = 8_000;
const MAX_PAGE_FETCHES_PER_RUN = 10;

function db(input?: DB) {
  const bound = input ?? (env as unknown as Bindings).DB;
  if (!bound?.prepare) throw new Error("Address enrichment canary nemá pripojenú databázu.");
  return bound;
}
function s(v: unknown) { return typeof v === "string" ? v.trim() : ""; }
function h(v: string) { try { return new URL(v).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } }
function target(row: Row): DirectoryEnrichmentTarget {
  const meta = (() => { try { return JSON.parse(s(row.source_data_json)) as Record<string, string | number | null>; } catch { return {}; } })();
  const contacts = readDirectoryPublicContacts(meta, s(row.website_url));
  return {
    id: Number(row.id), name: s(row.name), category: s(row.category), status: s(row.status),
    region: s(row.region), district: s(row.district), city: s(row.city), postalCode: s(row.postal_code),
    street: s(row.street), houseNumber: s(row.house_number),
    addressFormat: row.address_format === "STREET" || row.address_format === "MUNICIPALITY_NUMBER" ? row.address_format : "",
    serviceAddressConfirmation: row.service_address_confirmation === "CONFIRMED_SERVICE_LOCATION"
      ? "CONFIRMED_SERVICE_LOCATION" : "LEGACY_UNCONFIRMED",
    online: Boolean(row.online), legacyAddress: s(row.address), websiteUrl: s(row.website_url),
    phone: contacts.phone, email: contacts.email, updatedAt: s(row.updated_at),
  };
}
async function targets(limit: number, database: DB, ids?: number[]) {
  if (ids?.length) {
    const use = ids.slice(0, ADDRESS_ENRICHMENT_CANARY_MAX_TARGETS);
    const q = use.map(() => "?").join(",");
    const rows = await database.prepare(`SELECT * FROM directory_profiles WHERE id IN (${q}) AND status<>'archived'`).bind(...use).all<Row>();
    const map = new Map(rows.results.map((r) => [Number(r.id), r]));
    return use.map((id) => map.get(id)).filter(Boolean).map((r) => target(r!));
  }
  const rows = await database.prepare(`SELECT * FROM directory_profiles
    WHERE status<>'archived' AND online=0
      AND (service_address_confirmation='LEGACY_UNCONFIRMED' OR TRIM(region)='' OR TRIM(district)='' OR TRIM(city)=''
        OR TRIM(postal_code)='' OR TRIM(house_number)='' OR address_format NOT IN ('STREET','MUNICIPALITY_NUMBER')
        OR (address_format='STREET' AND TRIM(street)=''))
    ORDER BY CASE WHEN status='published' THEN 0 ELSE 1 END,
      CASE WHEN website_url IS NOT NULL AND TRIM(website_url)<>'' THEN 0 ELSE 1 END, updated_at DESC,id DESC LIMIT ?`)
    .bind(limit).all<Row>();
  return rows.results.map(target);
}
function text(html: string) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();
}
function inferredLocality(city: string, regionHint: string, districtHint: string) {
  if (!city) return null;
  const regions = regionHint ? SLOVAK_REGIONS.filter((region) => region === regionHint) : [...SLOVAK_REGIONS];
  const matches: Array<{ region: string; district: string; city: string }> = [];
  for (const region of regions) {
    for (const district of getSlovakDistricts(region)) {
      if (districtHint && district !== districtHint) continue;
      if (getSlovakMunicipalities(district).includes(city)) matches.push({ region, district, city });
    }
  }
  return matches.length === 1 ? matches[0] : null;
}
async function page(url: string, fetchImpl: typeof fetch) {
  if (!isSafeAutomationSourceUrl(url)) throw new Error("address_canary_unsafe_url");
  const expected = h(url);
  let current = url;
  for (let i=0;i<4;i++) {
    const response = await fetchImpl(current,{redirect:"manual",signal:AbortSignal.timeout(PAGE_TIMEOUT),headers:{accept:"text/html","user-agent":"PsipediaAddressCanary/1.0"}});
    if ([301,302,303,307,308].includes(response.status)) {
      const loc=response.headers.get("location"); if(!loc) throw new Error("address_canary_redirect");
      const next=new URL(loc,current).toString(); if(!isSafeAutomationSourceUrl(next)||h(next)!==expected) throw new Error("address_canary_redirect");
      current=next; continue;
    }
    if(!response.ok) throw new Error(`address_canary_http_${response.status}`);
    const len=Number(response.headers.get("content-length")); if(Number.isFinite(len)&&len>PAGE_BYTES) throw new Error("address_canary_too_large");
    const body=await response.text(); if(new TextEncoder().encode(body).byteLength>PAGE_BYTES) throw new Error("address_canary_too_large");
    return {url:current,html:body};
  }
  throw new Error("address_canary_redirect");
}
export function extractOfficialAddress(html: string) {
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const stack: unknown[]=[JSON.parse(m[1])];
      while(stack.length){
        const x=stack.pop(); if(Array.isArray(x)){stack.push(...x);continue;} if(!x||typeof x!=="object")continue;
        const o=x as Record<string,unknown>, typ=Array.isArray(o["@type"])?o["@type"].join(" "):s(o["@type"]);
        if(/PostalAddress/i.test(typ)){
          const line=s(o.streetAddress), city=s(o.addressLocality), pc=normalizeSlovakPostalCode(s(o.postalCode));
          const mm=line.match(/^(.+?)\s+(\d+(?:\/\d+[A-Za-z]?)?[A-Za-z]?)$/u);
          if(mm&&city&&pc) return {raw:`${line}, ${pc} ${city}`,street:mm[1].trim(),house:mm[2],postal:pc,city,method:"JSON_LD_POSTAL_ADDRESS",confidence:.99,multiple:(html.match(/PostalAddress/gi)?.length ?? 0)>1,legalSeatOnly:false};
        }
        stack.push(...Object.values(o).filter((v)=>v&&typeof v==="object"));
      }
    } catch {}
  }
  const t=text(html);
  const m=t.match(/(?:adresa|kontakt|prevádzka|ambulancia|klinika|salón|škola|hotel|centrum)\s*:?\s*([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][\p{L} .'-]{1,80})\s+(\d+(?:\/\d+[A-Za-z]?)?[A-Za-z]?)\s*,?\s*(\d{3}\s?\d{2})\s+([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][\p{L} .'-]{1,60})/iu);
  return m ? {raw:`${m[1]} ${m[2]}, ${normalizeSlovakPostalCode(m[3])} ${m[4]}`,street:m[1].trim(),house:m[2],postal:normalizeSlovakPostalCode(m[3]),city:m[4].trim(),method:"LABELED_CONTACT_ADDRESS",confidence:.97,multiple:(t.match(/(?:adresa|kontakt|prevádzka|ambulancia|klinika|salón|škola|hotel|centrum)\s*:?/giu)?.length ?? 0)>1,legalSeatOnly:/\b(sídlo|fakturačn)/iu.test(t.slice(Math.max(0,(m.index ?? 0)-120),(m.index ?? 0)+220))} : null;
}
function identity(t: DirectoryEnrichmentTarget, sourceUrl: string, html: string) {
  const a=normalizeDirectoryIdentityHints({name:t.name,domain:t.websiteUrl,phone:t.phone,email:t.email,city:t.city});
  const body=normalizeAutomationExactText(text(html).slice(0,8000));
  const signals:string[]=[];
  if(t.websiteUrl&&h(t.websiteUrl)===h(sourceUrl))signals.push("official_domain");
  if(a.name&&body.includes(a.name))signals.push("name");
  if(a.city&&body.includes(a.city))signals.push("city");
  if(a.phone&&normalizeAutomationExactText(text(html)).includes(normalizeAutomationExactText(a.phone)))signals.push("phone");
  if(a.email&&body.includes(a.email))signals.push("email");
  return {confidence:(signals.includes("official_domain")||signals.includes("phone")||signals.includes("email")||(signals.includes("name")&&signals.includes("city")))?"HIGH" as const:signals.length?"MEDIUM" as const:"LOW" as const,signals};
}
function candidate(t: DirectoryEnrichmentTarget, sourceUrl:string, html:string, x:NonNullable<ReturnType<typeof extractOfficialAddress>>):AddressCandidate{
  const id=identity(t,sourceUrl,html);
  const city=x.city||t.city;
  const locality=inferredLocality(city,t.region,t.district);
  return {targetType:"DIRECTORY_PROFILE",targetId:t.id,evidence:{sourceUrl,sourceLabel:h(sourceUrl),sourceRole:"OFFICIAL_WEBSITE",authorityScore:t.websiteUrl&&h(t.websiteUrl)===h(sourceUrl)?100:90},
    rawAddressText:x.raw,region:locality?.region??t.region,district:locality?.district??t.district,city:locality?.city??city,postalCode:x.postal,street:x.street,houseNumber:x.house,addressFormat:x.street?"STREET":"MUNICIPALITY_NUMBER",
    entityMatchConfidence:id.confidence,entityMatchSignals:id.signals,addressExtractionConfidence:x.confidence,serviceLocationConfidence:x.legalSeatOnly?0.5:x.confidence,providerVerification:"NOT_RUN",
    multipleCompetingAddresses:Boolean(x.multiple),legalSeatOnly:Boolean(x.legalSeatOnly)};
}
async function verify(c:AddressCandidate,p:GeoapifyGeocoder){
  try{
    if(!c.addressFormat) return c;
    const v=await verifyDirectoryCanonicalAddress({region:c.region,district:c.district,city:c.city,street:c.street,houseNumber:c.houseNumber,addressFormat:c.addressFormat,provider:p});
    return {...c,region:v.region,district:v.district,city:v.city,postalCode:v.postalCode,street:v.street,houseNumber:v.houseNumber,addressFormat:v.addressFormat,providerVerification:"VERIFIED_EXACT" as const};
  }catch(e){
    if(e instanceof GeocoderProviderError&&e.code==="RATE_LIMITED")throw e;
    const m=e instanceof Error?e.message.toLowerCase():"";
    return {...c,providerVerification:(m.includes("jednozna")?"AMBIGUOUS":"REJECTED") as "AMBIGUOUS"|"REJECTED"};
  }
}
async function fingerprint(t:DirectoryEnrichmentTarget,c:AddressCandidate){
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify({id:t.id,updatedAt:t.updatedAt,source:c.evidence.sourceUrl,raw:c.rawAddressText,region:c.region,district:c.district,city:c.city,postal:c.postalCode,street:c.street,house:c.houseNumber,format:c.addressFormat,provider:c.providerVerification})));
  return [...new Uint8Array(bytes)].map((b)=>b.toString(16).padStart(2,"0")).join("");
}
function officialPageUrls(value: string) {
  if (!value || !isSafeAutomationSourceUrl(value)) return [];
  try {
    const root = new URL(value);
    const urls = [root.toString()];
    if (root.pathname === "/" || !root.pathname) {
      urls.push(new URL("/kontakt", root).toString());
      urls.push(new URL("/contact", root).toString());
    }
    return [...new Set(urls)];
  } catch {
    return [];
  }
}
async function tavilyUrl(t:DirectoryEnrichmentTarget,p:TavilyAutomationSearchProvider){
  const results=await p.search({query:`${t.name} ${t.city} Slovensko oficiálna stránka kontakt adresa`,country:"SK",locale:"sk-SK",maxResults:5});
  const n=normalizeAutomationExactText(t.name),c=normalizeAutomationExactText(t.city);
  return results.find((r)=>{const x=normalizeAutomationExactText(`${r.title} ${r.snippet??""}`);return n&&x.includes(n)&&(!c||x.includes(c));})?.url??null;
}
export async function previewLiveDirectoryAddressCanary(input:{limit?:unknown;targetIds?:number[];database?:DB;fetchImpl?:typeof fetch;geoProvider?:GeoapifyGeocoder;searchProvider?:TavilyAutomationSearchProvider}={}){
  const database=db(input.database),limit=boundedCanarySize(input.limit), list=await targets(limit,database,input.targetIds);
  const runtime=env as unknown as Bindings, fetchImpl=input.fetchImpl??fetch, geo=input.geoProvider??new GeoapifyGeocoder({bindings:runtime}), search=input.searchProvider??new TavilyAutomationSearchProvider({apiKey:runtime.TAVILY_API_KEY});
  let searchCalls=0,providerCalls=0,pageFetches=0,stoppedByRateLimit:null|"TAVILY"|"GEOAPIFY"=null;
  const items:CanaryItem[]=[];
  for(const t of list){
    if(stoppedByRateLimit){items.push({target:t,candidate:null,assessment:null,extractionMethod:null,sourceUrl:null,candidateFingerprint:null,reason:`run_stopped_${stoppedByRateLimit}`});continue;}
    if(isProtectedCanonical(t)){items.push({target:t,candidate:null,assessment:null,extractionMethod:null,sourceUrl:null,candidateFingerprint:null,reason:"protected_complete_canonical"});continue;}
    let source: string | null = null;
    let extractionMethod: string | null = null;
    let c = await existingDirectoryAddressEvidenceCandidate(t, database);
    if (c) {
      source = c.evidence.sourceUrl ?? null;
      extractionMethod = "EXISTING_AUTOMATION_EVIDENCE";
    }

    if (!c && t.websiteUrl) {
      for (const url of officialPageUrls(t.websiteUrl)) {
        if (pageFetches >= MAX_PAGE_FETCHES_PER_RUN) break;
        try {
          pageFetches += 1;
          const r = await page(url, fetchImpl);
          const extracted = extractOfficialAddress(r.html);
          if (!extracted) continue;
          source = r.url;
          c = candidate(t, source, r.html, extracted);
          extractionMethod = extracted.method;
          break;
        } catch {}
      }
    }

    if(!c&&searchCalls<ADDRESS_ENRICHMENT_MAX_SEARCH_CALLS&&search.credentialConfigured){
      try{
        searchCalls++;
        const u=await tavilyUrl(t,search);
        if(u&&pageFetches<MAX_PAGE_FETCHES_PER_RUN){
          pageFetches++;
          const r=await page(u,fetchImpl);
          const extracted=extractOfficialAddress(r.html);
          if(extracted){
            source=r.url;
            c=candidate(t,source,r.html,extracted);
            extractionMethod=extracted.method;
          }
        }
      } catch(e){
        if(e instanceof AutomationSearchProviderError&&e.message==="RATE_LIMITED")stoppedByRateLimit="TAVILY";
      }
    }
    if(!c){items.push({target:t,candidate:null,assessment:null,extractionMethod:null,sourceUrl:source,candidateFingerprint:null,reason:stoppedByRateLimit?"search_rate_limited":"no_usable_address"});continue;}
    try{providerCalls++;c=await verify(c,geo);}catch(e){if(e instanceof GeocoderProviderError&&e.code==="RATE_LIMITED")stoppedByRateLimit="GEOAPIFY";}
    const assessment=assessDirectoryAddressCandidate(t,c), fp=await fingerprint(t,c);
    items.push({target:t,candidate:c,assessment,extractionMethod,sourceUrl:source,candidateFingerprint:fp,reason:assessment.reason});
  }
  return {mode:"LIVE_CANARY_PREVIEW" as const,scanned:items.length,candidatesFound:items.filter((x)=>x.candidate).length,autoApplyCandidates:items.filter((x)=>x.assessment?.decision==="AUTO_APPLY").length,
    reviewCandidates:items.filter((x)=>x.assessment?.decision==="REVIEW").length,noMatch:items.filter((x)=>!x.candidate||x.assessment?.decision==="NO_MATCH").length,searchCalls,providerCalls,pageFetches,productionWrites:0 as const,stoppedByRateLimit,
    limits:{entitiesPerRun:limit,searchCallsPerRun:ADDRESS_ENRICHMENT_MAX_SEARCH_CALLS,providerCallsPerRun:ADDRESS_ENRICHMENT_CANARY_MAX_TARGETS,pageFetchesPerRun:MAX_PAGE_FETCHES_PER_RUN},items};
}
export function validateAddressCanarySelection(value:unknown){
  if(!Array.isArray(value)||value.length<1||value.length>ADDRESS_ENRICHMENT_CANARY_MAX_TARGETS)throw new Error("Address canary apply vyžaduje 1 až 5 kandidátov.");
  const seen=new Set<number>();
  return value.map((v)=>{if(!v||typeof v!=="object"||Array.isArray(v))throw new Error("Neplatný selection.");const r=v as Row,id=Number(r.targetId),updatedAt=s(r.updatedAt),candidateFingerprint=s(r.candidateFingerprint);
    if(!Number.isSafeInteger(id)||id<=0||!updatedAt||!/^[a-f0-9]{64}$/.test(candidateFingerprint)||seen.has(id))throw new Error("Neplatný canary selection.");seen.add(id);return{targetId:id,updatedAt,candidateFingerprint};});
}
export async function applyDirectoryAddressCanary(input:{selections:Array<{targetId:number;updatedAt:string;candidateFingerprint:string}>;actorRef:string;database?:DB;fetchImpl?:typeof fetch;geoProvider?:GeoapifyGeocoder;searchProvider?:TavilyAutomationSearchProvider}){
  const database=db(input.database), selections=validateAddressCanarySelection(input.selections);
  const preview=await previewLiveDirectoryAddressCanary({limit:selections.length,targetIds:selections.map((x)=>x.targetId),database,fetchImpl:input.fetchImpl,geoProvider:input.geoProvider,searchProvider:input.searchProvider});
  if(preview.stoppedByRateLimit)throw new Error(`Apply zablokovaný po ${preview.stoppedByRateLimit} rate limite.`);
  const byId=new Map(preview.items.map((x)=>[x.target.id,x])),applied:Row[]=[],blocked:Row[]=[];
  for(const sel of selections){
    const item=byId.get(sel.targetId);
    if(!item?.candidate||item.assessment?.decision!=="AUTO_APPLY"||item.candidate.providerVerification!=="VERIFIED_EXACT"){blocked.push({targetId:sel.targetId,reason:"not_auto_apply"});continue;}
    if(item.target.updatedAt!==sel.updatedAt||item.candidateFingerprint!==sel.candidateFingerprint){blocked.push({targetId:sel.targetId,reason:"STALE"});continue;}
    const c=item.candidate,now=new Date().toISOString(),before={region:item.target.region,district:item.target.district,city:item.target.city,postalCode:item.target.postalCode,street:item.target.street,houseNumber:item.target.houseNumber,addressFormat:item.target.addressFormat};
    const result=await database.prepare(`UPDATE directory_profiles SET region=?,district=?,city=?,postal_code=?,street=?,house_number=?,address_format=?,service_address_confirmation='CONFIRMED_SERVICE_LOCATION',updated_at=? WHERE id=? AND updated_at=? AND status<>'archived'`)
      .bind(c.region,c.district,c.city,c.postalCode,c.street,c.houseNumber,c.addressFormat,now,item.target.id,item.target.updatedAt).run();
    const changes=Number((result as {meta?:{changes?:number}}).meta?.changes??0);if(changes!==1){blocked.push({targetId:sel.targetId,reason:"STALE_OPTIMISTIC_LOCK"});continue;}
    await database.prepare(`INSERT INTO moderation_events (
      id,submission_id,resource_type,subject_id,action,actor_type,actor_ref,from_status,to_status,
      reason_code,changed_fields_json,request_id,created_at
    ) VALUES (?,NULL,'DIRECTORY_PROFILE',?,'ADDRESS_ENRICHMENT_CANARY_APPLY','ADMIN',?,NULL,NULL,?,?,?,?)`)
      .bind(
        crypto.randomUUID(),
        String(item.target.id),
        input.actorRef,
        item.assessment.reason,
        JSON.stringify(["region","district","city","postal_code","street","house_number","address_format","service_address_confirmation"]),
        item.candidateFingerprint,
        now,
      ).run();
    let geoReconciled=false;try{await syncGeoPointAfterSourceChange("DIRECTORY_PROFILE",item.target.id,database as D1Database);geoReconciled=true;}catch{}
    const after={region:c.region,district:c.district,city:c.city,postalCode:c.postalCode,street:c.street,houseNumber:c.houseNumber,addressFormat:c.addressFormat,serviceAddressConfirmation:"CONFIRMED_SERVICE_LOCATION"};
    console.info(JSON.stringify({event:"address_enrichment_canary_applied",actorRef:input.actorRef,targetId:item.target.id,before,after,sourceUrl:item.sourceUrl,extractionMethod:item.extractionMethod,entityMatchSignals:c.entityMatchSignals,providerResult:c.providerVerification,decision:item.assessment.decision,candidateFingerprint:item.candidateFingerprint,timestamp:now,geoReconciled}));
    applied.push({targetId:item.target.id,before,after,geoReconciled});
  }
  return {requested:selections.length,applied:applied.length,blocked:blocked.length,canonicalWrites:applied.length,directGeoWrites:0,appliedItems:applied,blockedItems:blocked,providerCalls:preview.providerCalls,searchCalls:preview.searchCalls};
}
