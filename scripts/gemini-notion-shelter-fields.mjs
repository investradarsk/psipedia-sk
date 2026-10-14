/** Fail-closed, offline-only Notion Organization (SHELTER) draft contract. */
import { identityPageText, normalizeIdentity } from "./gemini-notion-identity.mjs";
const fail = reason => { throw Error("GEMINI_SHELTER_" + reason); };
const val = (v,n=1600) => typeof v==="string" && v.trim().length<=n ? v.trim() : "";
const t = v => [{type:"text",text:{content:v}}];
const domain = v => { try { const u=new URL(v); return u.protocol==="https:" && !u.username && !u.password && !/^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname) ? u.hostname.toLowerCase().replace(/^www\./,"") : ""; } catch { return ""; } };
export function assertShelterSchema(properties) {
  const types={"Názov":"title","Typ":"rich_text","Stav":"select","Právny názov":"rich_text","IČO / registračné číslo":"rich_text","Psipedia ID":"rich_text","Mesto":"rich_text","Kraj":"rich_text","Web":"url","Zdroj dát":"url","Popis":"rich_text","Krátky popis":"rich_text","Facebook":"url","Instagram":"url"};
  if(!properties || Object.entries(types).some(([k,v])=>properties[k]?.type!==v)) fail("SCHEMA_INVALID");
  if(!properties.Stav.select?.options?.some(x=>x.name==="Nápad")) fail("DRAFT_OPTION_MISSING");
  if(properties["Psipedia stav"]) fail("WRONG_DATABASE");
}
export function assertShelterUnique(rows,args,scanComplete) {
  if(scanComplete!==true || !Array.isArray(rows)) fail("SCAN_INCOMPLETE");
  const name=normalizeIdentity(args.name),legal=normalizeIdentity(args.legal_name);
  const site=domain(args.website_url), reg=normalizeIdentity(args.registration_number);
  const id=normalizeIdentity(args.psipedia_id);
  for(const row of rows) {
    const p=k=>identityPageText(row,k);
    const names=[normalizeIdentity(p("Názov")),normalizeIdentity(p("Právny názov"))].filter(Boolean);
    const knownDomain=domain(p("Web"));
    const existingReg=normalizeIdentity(p("IČO / registračné číslo"));
    const existingId=normalizeIdentity(p("Psipedia ID"));
    // Deliberately ambiguous name/domain matches fail closed, even when city differs.
    if((name && names.includes(name))||(legal&&names.includes(legal))||
      (site&&knownDomain&&site===knownDomain)||(reg&&existingReg&&reg===existingReg)||
      (id&&existingId&&id===existingId)) fail("DUPLICATE_OR_AMBIGUOUS");
  }
}
export function buildShelterDraft({args,properties,rows,scanComplete,groundedSources}) {
  assertShelterSchema(properties);
  if(!args || typeof args!=="object") fail("INVALID_INPUT");
  const name=val(args.name,180),source=val(args.source_url,2048),website=val(args.website_url,2048);
  const summary=val(args.summary,700),description=val(args.description,1500);
  if(!name||!summary||description.length<30||!domain(source)) fail("CONTENT_OR_SOURCE_MISSING");
  const sources=[source,...(Array.isArray(args.source_urls)?args.source_urls:[])];
  if(!Array.isArray(groundedSources)||sources.some(s=>!domain(s)||!groundedSources.includes(new URL(s).toString()))) fail("SOURCE_UNGROUNDED");
  const evidence=args.evidence;
  if(!Array.isArray(evidence)||!evidence.length||evidence.length>12) fail("EVIDENCE_REQUIRED");
  const supported=new Set();
  for(const item of evidence) {
    if(!item||!sources.includes(item.source_url)||!Array.isArray(item.fields)||!item.fields.length) fail("EVIDENCE_INVALID");
    item.fields.forEach(f=>supported.add(f));
  }
  for(const f of ["name","summary","description"]) if(!supported.has(f)) fail("EVIDENCE_INCOMPLETE");
  for(const [key,field] of [["legal_name","legal_name"],["registration_number","registration_number"],["city","city"],["region","region"],["website_url","website_url"],["facebook_url","facebook_url"],["instagram_url","instagram_url"]]) {
    if(args[key]&&!supported.has(field)) fail("UNVERIFIED_FIELD");
  }
  if(website&&!domain(website)) fail("WEBSITE_UNSAFE");
  // Organization schema has no public phone/email fields. Never leak contacts into prose.
  // Avoid inferred public visitor addresses, precise GEO and personal data in any free text.
  if(["address","street","house_number","postal_code","latitude","longitude","contact","phone","email","venue"].some(k=>Boolean(args[k]))) fail("LOCATION_OR_CONTACT_UNSUPPORTED");
  if(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(summary+" "+description)||
    /(?:\+421|\b0\d{3})[\s-]?\d{3}[\s-]?\d{3}/.test(summary+" "+description)||
    /\b(?:ulica|ul\.|súpisné|číslo domu)\s+\S+\s+\d+/i.test(summary+" "+description)) fail("PRIVATE_DATA_IN_TEXT");
  assertShelterUnique(rows,args,scanComplete);
  const result={"Názov":{title:t(name)},"Typ":{rich_text:t("SHELTER")},"Stav":{select:{name:"Nápad"}},
    "Krátky popis":{rich_text:t(summary)},
    "Popis":{rich_text:t(description+"\n\nZdroje a dôkazy:\n"+evidence.map(e=>e.fields.join(", ")+": "+e.source_url).join("\n"))},
    "Zdroj dát":{url:source}};
  for(const [arg,prop,type] of [["legal_name","Právny názov","rich_text"],["registration_number","IČO / registračné číslo","rich_text"],["city","Mesto","rich_text"],["region","Kraj","rich_text"],["website_url","Web","url"],["facebook_url","Facebook","url"],["instagram_url","Instagram","url"]]){
    const value=val(args[arg],type==="url"?2048:240);
    if(value) {if(type==="url"&&!domain(value)) fail("UNSAFE_SOCIAL_URL");result[prop]=type==="url"?{url:value}:{rich_text:t(value)};}
  }
  return result;
}
