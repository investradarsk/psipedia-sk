/** Fail-closed, offline-only Notion Organization (SHELTER) draft contract. */
import { identityPageText, normalizeIdentity } from "./gemini-notion-identity.mjs";
const fail = reason => { throw Error("GEMINI_SHELTER_" + reason); };
const val = (v,n=1600) => typeof v==="string" && v.trim().length<=n ? v.trim() : "";
const t = v => Array.from({length:Math.ceil(v.length/1800)},(_,i)=>({type:"text",text:{content:v.slice(i*1800,(i+1)*1800)}}));
const domain = v => { try { const u=new URL(v); return u.protocol==="https:" && !u.username && !u.password && !/^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname) ? u.hostname.toLowerCase().replace(/^www\./,"") : ""; } catch { return ""; } };
const normalizedName = v => normalizeIdentity(v).replace(/\b(obcianske zdruzenie|oz|o z|neziskova organizacia|utulok|utulku|zachranna organizacia|pre zvierata|pre psov|n o|no)\b/g," ").replace(/\s+/g," ").trim();
const portalHosts = new Set(["facebook.com","instagram.com","google.com","maps.google.com","zoznam.sk","azet.sk","firmy.sk","finstat.sk","orsr.sk","registeruz.sk","youtube.com"]);
const officialHost = v => {const h=domain(v);return h && !portalHosts.has(h) && ![...portalHosts].some(p=>h.endsWith("."+p)) ? h : "";};
const normalizedUrl = v => {try {const u=new URL(v);if(u.protocol!=="https:")return "";return u.origin.toLowerCase()+u.pathname.replace(/\/+$/,"").toLowerCase();}catch{return "";}};
const unsafeText = v => {
  const text=String(v??"");
  return /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text) ||
    /(?:\+421|\b0\d{3})[\s().-]*\d{3}[\s.-]*\d{3}/.test(text) ||
    /(?:\b(?:49|48|47|46|45)\.\d{3,}|\b\d{1,2}\.\d{3,})[;,\s]+(?:\d{1,3}\.\d{3,})/.test(text) ||
    /(?:\b(?:lat|lng|lon|latitude|longitude|gps|súradnice|suradnice)\b\s*[:=]?\s*[-+]?\d{1,3}[.,]\d{3,})/i.test(text) ||
    /\b(?:ulica|ulici|ul\.|adresa|sídlo|sidlo|na adrese|číslo domu|súpisné|supisne)\s*[:,-]?\s*(?:[\p{L} .-]+)\s+\d{1,4}(?:\s*\/\s*\d{1,4})?/iu.test(text) ||
    /\b[\p{Lu}][\p{L}.-]*(?:\s+[\p{Lu}][\p{L}.-]*){0,3}\s+\d{1,4}(?:\/\d{1,4})?(?:\s*,?\s*\d{3}\s?\d{2})?\b/u.test(text) ||
    /\b\d{3}\s?\d{2}\b\s*[,;-]?\s*[\p{L}]+\s+\d{1,4}/iu.test(text);
};
const unsafeUrl = v => { try {
  const u=new URL(v);
  if(!domain(v)||u.username||u.password||u.hash) return true;
  const query=decodeURIComponent(u.pathname+" "+u.search).replace(/[+_%]/g," ");
  return /(?:\b(?:lat|lng|lon|latitude|longitude|coordinates|coord|gps|address|adresa|street|house|postcode|postal|zip|phone|email|tel)\b|@[-+]?\d{1,3}\.\d{3,},[-+]?\d{1,3}\.\d{3,})/i.test(query) ||
   /\d{1,3}\.\d{3,}[,; ]+[-+]?\d{1,3}\.\d{3,}/.test(query) ||
   /\b\d{3}[- ]?\d{2}[-_/][\p{L}\d-]+/iu.test(query) ||
   unsafeText(query);
  } catch {return true;}
};
export function assertShelterSchema(properties) {
  const types={"Názov":"title","Typ":"rich_text","Stav":"select","Právny názov":"rich_text","IČO / registračné číslo":"rich_text","Psipedia ID":"rich_text","Mesto":"rich_text","Kraj":"rich_text","Web":"url","Zdroj dát":"url","Popis":"rich_text","Krátky popis":"rich_text","Facebook":"url","Instagram":"url"};
  if(!properties || Object.entries(types).some(([k,v])=>properties[k]?.type!==v)) fail("SCHEMA_INVALID");
  if(!properties.Stav.select?.options?.some(x=>x.name==="Nápad")) fail("DRAFT_OPTION_MISSING");
  if(properties["Psipedia stav"]) fail("WRONG_DATABASE");
}
export function assertShelterUnique(rows,args,scanComplete) {
  if(scanComplete!==true || !Array.isArray(rows)) fail("SCAN_INCOMPLETE");
  const names=[normalizedName(args.name),normalizedName(args.legal_name)].filter(x=>x.length>=4);
  const official=officialHost(args.website_url), reg=normalizeIdentity(args.registration_number);
  const id=normalizeIdentity(args.psipedia_id);
  const source=normalizedUrl(args.source_url);
  for(const row of rows) {
    const p=k=>identityPageText(row,k);
    const existingNames=[normalizedName(p("Názov")),normalizedName(p("Právny názov"))].filter(x=>x.length>=4);
    const knownHosts=[officialHost(p("Web"))].filter(Boolean);
    const existingReg=normalizeIdentity(p("IČO / registračné číslo"));
    const existingId=normalizeIdentity(p("Psipedia ID"));
    const sameName=names.some(a=>existingNames.some(b=>a===b || (a.length>=8&&b.length>=8&&(a.includes(b)||b.includes(a)))));
    // Shared source domains (portals/aggregators) are NOT organization identity.
    // An identical specific source page is still ambiguous and needs human review.
    const sameSource=source && source===normalizedUrl(p("Zdroj dát"));
    const sameOfficial=official && knownHosts.includes(official);
    if(sameName||sameSource||sameOfficial||
       (reg&&existingReg&&reg===existingReg)||
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
  if(sources.length>12) fail("TOO_MANY_SOURCES");
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
  if(website&&unsafeUrl(website)) fail("WEBSITE_UNSAFE");
  if(sources.some(unsafeUrl)) fail("SOURCE_PRIVATE");
  // Organization schema has no public phone/email fields. Never leak contacts into prose.
  // Avoid inferred public visitor addresses, precise GEO and personal data in any free text.
  if(["address","street","house_number","postal_code","latitude","longitude","contact","phone","email","venue"].some(k=>Boolean(args[k]))) fail("LOCATION_OR_CONTACT_UNSUPPORTED");
  if(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(summary+" "+description)||
    /(?:\+421|\b0\d{3})[\s-]?\d{3}[\s-]?\d{3}/.test(summary+" "+description)||
    /\b(?:ulica|ulici|ul\.|súpisné|číslo domu)\s+\S+\s+\d+/i.test(summary+" "+description)) fail("PRIVATE_DATA_IN_TEXT");
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
}  if([name,summary,description,args.legal_name,args.city,args.region,args.registration_number].some(unsafeText)) fail("PRIVATE_DATA_IN_TEXT");
  if([args.facebook_url,args.instagram_url].filter(Boolean).some(unsafeUrl)) fail("SOURCE_PRIVATE");
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
