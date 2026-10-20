import { checkExternalGeminiIdentity } from "./gemini-external-dedupe.ts";
import { checkGeminiCandidateDedupe } from "./gemini-automation-dedupe.ts";
import { getGeminiCatalogItem } from "./gemini-automation-catalog.ts";
import { readDirectoryPublicContacts } from "./directory-profile-metadata.ts";
import { directoryActionableProposal } from "./data-automation-directory-diff.ts";
import { upsertDirectEntityUpdateSuggestion } from "./data-automation-product-store.ts";
import type { GeminiD1 } from "./gemini-automation-store.ts";
import type { GeminiDiscoveryCandidateV1 } from "./gemini-automation-discovery-contract.ts";
import type { AutomationDiff } from "./data-automation.ts";

type Bindings = { GEMINI_AGENT_CALLBACK_SECRET?: string; GEMINI_EXTERNAL_AGENT_ENABLED?: string };
type PublicIdentity = {
  name: string; city: string; website: string; source: string;
  start_date: string; organizer: string; venue: string; type: string;
};
const FIELDS = ["websiteUrl", "publicPhone", "publicEmail", "facebookUrl", "instagramUrl"] as const;
type Field = typeof FIELDS[number];
type Result = {status:"REVIEW_SUBMITTED"|"NO_CHANGES"|"BLOCKED";httpStatus:number};
const blocked = (httpStatus=200):Result => ({status:"BLOCKED",httpStatus});
const record = (v:unknown):v is Record<string,unknown> => Boolean(v && typeof v==="object" && !Array.isArray(v));
const normalize=(s:unknown)=>typeof s==="string"?s.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," "):"";
function publicUrl(v:string,domain?:string):string|null {
  if (!v || v.length>2048) return null;
  try {
    const u=new URL(v);
    if (!["http:","https:"].includes(u.protocol) || u.username || u.password ||
        /^(?:localhost|.*\.(?:local|localhost|internal))$/i.test(u.hostname) ||
        /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname)) return null;
    if (domain && !(u.hostname===domain || u.hostname.endsWith("."+domain)))return null;
    return u.href;
  }catch{return null}
}
function safeFields(value:unknown):Partial<Record<Field,string>>|null {
  if (!record(value) || Object.keys(value).length>FIELDS.length ||
      Object.keys(value).some(key=>!FIELDS.includes(key as Field)))return null;
  const result:Partial<Record<Field,string>>={};
  for(const field of FIELDS){
    const raw=value[field];
    if(raw===undefined)continue;
    if(typeof raw!=="string"||raw.length>2048)return null;
    const v=raw.trim();if(!v)continue;
    let cleaned:string|null=v;
    if(field==="websiteUrl")cleaned=publicUrl(v);
    if(field==="facebookUrl")cleaned=publicUrl(v,"facebook.com");
    if(field==="instagramUrl")cleaned=publicUrl(v,"instagram.com");
    if(field==="publicEmail")cleaned=v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)?v:null;
    if(field==="publicPhone")cleaned=v.length<=80&&v.replace(/\D/g,"").length>=7&&
      /^[+\d\s()\-./]+$/.test(v)?v:null;
    if(!cleaned)return null;
    result[field]=cleaned;
  }
  return result;
}
async function sign(body:string,secret:string) {
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const digest=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body)));
  return "sha256="+[...digest].map(n=>n.toString(16).padStart(2,"0")).join("");
}
function asCandidate(stableKey:string,c:PublicIdentity):GeminiDiscoveryCandidateV1 {
  const source=publicUrl(c.source)||publicUrl(c.website)!;
  const website=publicUrl(c.website);
  return {
    name:c.name,primary_url:website,source_urls:[source],description:null,
    location:{country:"Slovakia",region:null,district:null,city:c.city,address:null},
    contacts:{phone:null,email:null,website,facebook:null,instagram:null},
    confidence:1,evidence:[{source_url:source,fields:["name"]}],
  };
}

/** Signed manual-review intake, never a canonical profile mutation.
 * Only exact Directory matches with stable name+city qualify. Unknown or
 * ambiguous identity, contacts, schema and API results fail closed.
 */
export async function submitGeminiDirectoryQualityProposal(input:{
  db:GeminiD1;env:Bindings;body:string;signature:string|null;now?:number;
}):Promise<Result> {
  const secret=input.env.GEMINI_AGENT_CALLBACK_SECRET??"";
  if(!secret||!["1","true"].includes(input.env.GEMINI_EXTERNAL_AGENT_ENABLED??"")||
    !input.signature||!/^sha256=[a-f0-9]{64}$/.test(input.signature)||input.body.length>6400)
    return blocked(401);
  let value:unknown;
  try{value=JSON.parse(input.body)}catch{return blocked(400)}
  if(!record(value)||Object.keys(value).length!==5||
    !["job_id","stable_key","issued_at","candidate","proposal"].every(x=>Object.hasOwn(value,x))||
    !record(value.candidate))return blocked(400);
  const fields=safeFields(value.proposal);
  if(!fields)return blocked(400);
  // Authenticate the *entire* payload before deriving a second signed
  // read-only gate request. This cannot authorize an arbitrary job or identity.
  if(await sign(input.body,secret)!==input.signature)return blocked(401);
  const scoped=JSON.stringify({
    job_id:value.job_id,stable_key:value.stable_key,issued_at:value.issued_at,candidate:value.candidate,
  });
  const verdict=await checkExternalGeminiIdentity({
    db:input.db,env:input.env,body:scoped,signature:await sign(scoped,secret),now:input.now,
  });
  if(verdict.status!=="DUPLICATE"||verdict.httpStatus!==200)return blocked(verdict.httpStatus);
  const key=String(value.stable_key);
  const category=getGeminiCatalogItem(key);
  if(!category||category.section!=="directory")return blocked();
  const candidate=value.candidate as PublicIdentity;
  const source=publicUrl(candidate.source)||publicUrl(candidate.website);
  if(!source||!candidate.city.trim())return blocked();
  try{
    const match=await checkGeminiCandidateDedupe(input.db,{
      stableKey:key,section:"directory",subcategory:category.subcategory,
      candidate:asCandidate(key,candidate),
    });
    if(match.status!=="DUPLICATE"||!match.matchedEntityId)return blocked();
    const row=await input.db.prepare("SELECT id,category,name,city,website_url,source_data_json FROM directory_profiles WHERE id=? LIMIT 1")
      .bind(match.matchedEntityId).first<{
        id:number;category:string;name:string;city:string;website_url:string|null;source_data_json:string|null;
      }>();
    // Rebrands, category shifts, branch changes and unknown locations require
    // manual identity review; never attach proposals to an uncertain profile.
    if(!row||row.category!==category.subcategory||
      !normalize(row.name)||normalize(row.name)!==normalize(candidate.name)||
      !normalize(row.city)||normalize(row.city)!==normalize(candidate.city))return blocked();
    const current=readDirectoryPublicContacts(JSON.parse(row.source_data_json||"{}"),row.website_url||"");
    const before:Record<string,unknown>={
      websiteUrl:row.website_url||current.website||null,
      publicPhone:current.phone||null,publicEmail:current.email||null,
      facebookUrl:current.facebook||null,instagramUrl:current.instagram||null,
    };
    const updates=directoryActionableProposal(fields,before);
    if(!Object.keys(updates).length)return {status:"NO_CHANGES",httpStatus:200};
    const diff:AutomationDiff={};
    for(const [field,after] of Object.entries(updates))diff[field]={before:before[field]??null,after};
    await upsertDirectEntityUpdateSuggestion({
      entityType:"DIRECTORY",canonicalEntityId:row.id,
      categorySlug:category.subcategory==="veterinari"?"veterinari":"psie-sluzby",
      externalSourceUrl:source,externalRecordId:"gemini:"+key+":"+row.id,
      suggestionType:"POSSIBLE_UPDATE",before,proposed:updates,diff,
      detectedAt:new Date(input.now??Date.now()).toISOString(),
    },input.db as Parameters<typeof upsertDirectEntityUpdateSuggestion>[1]);
    return {status:"REVIEW_SUBMITTED",httpStatus:200};
  }catch{return blocked(503)}
}
