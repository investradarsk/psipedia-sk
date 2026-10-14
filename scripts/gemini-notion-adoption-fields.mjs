/** Strict draft-only Adopcie contract for external Gemini -> Notion worker. No network. */
import { identityPageText, normalizeIdentity } from "./gemini-notion-identity.mjs";
const fail = code => { throw Error("GEMINI_ADOPTION_" + code); };
const txt = (x,max=1500)=>typeof x==="string"&&x.trim().length<=max?x.trim():"";
const rich = x=>({rich_text:[{type:"text",text:{content:x}}]});
const normal = x=>normalizeIdentity(x).replace(/\s+/g," ").trim();
const privateText = x=>/[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+421|\b0\d{3})[\s().-]*\d{3}[\s.-]*\d{3}|\b(?:gps|latitude|longitude|súradnice|suradnice)\s*[:=]?\s*-?\d{1,3}[.,]\d{3,}|\b(?:ulica|ul\.|adresa|sídlo|sidlo|na adrese)\s*[:,-]?\s*[\p{L} .-]+\s+\d{1,4}/iu.test(String(x??""));
function sourceUrl(value) {
  try {
    const u=new URL(txt(value,2048)),h=u.hostname.toLowerCase();
    if(u.protocol!=="https:"||u.username||u.password||u.hash||!h.includes(".")||
      /(?:^|\.)(localhost|local|internal)$/.test(h)||/^(\d+\.|\[|0x)/i.test(h)||
      h==="psipedia.sk"||h.endsWith(".psipedia.sk")||h==="vertexaisearch.cloud.google.com"||
      /\b(?:lat|lng|lon|latitude|longitude|gps|address|adresa|phone|email|contact|tel)\b/i.test(
        decodeURIComponent(u.pathname+" "+u.search).replace(/[+_%]/g," ")))fail("SOURCE_UNSAFE");
    return u.href;
  }catch{fail("SOURCE_UNSAFE");}
}
export function assertAdoptionSchema(p) {
  const fields={"Meno":"title","Stav":"select","Organizácia":"rich_text",
    "Krátky popis":"rich_text","Popis":"rich_text","Mesto":"rich_text",
    "Kraj":"rich_text","Zdroj dát":"url","Psipedia ID":"rich_text","Slug":"rich_text"};
  if(!p||p["Názov"]||p["Psipedia stav"]||
     Object.entries(fields).some(([key,type])=>p[key]?.type!==type))fail("SCHEMA_INVALID");
  if(!p.Stav.select?.options?.some(o=>o.name==="Nápad"))fail("DRAFT_OPTION_MISSING");
}
export function assertAdoptionUnique(rows,candidate,complete){
  if(complete!==true||!Array.isArray(rows))fail("SCAN_INCOMPLETE");
  const dog=normal(candidate.name),org=normal(candidate.organization),source=sourceUrl(candidate.source_url);
  if(!dog||!org)fail("IDENTITY_MISSING");
  for(const row of rows) {
    const previousName=normal(identityPageText(row,"Meno"));
    const previousOrg=normal(identityPageText(row,"Organizácia"));
    const previousSource=identityPageText(row,"Zdroj dát");
    let sourceMatch=false;try{sourceMatch=Boolean(previousSource)&&sourceUrl(previousSource)===source;}catch{}
    if(sourceMatch||(previousName===dog&&(!previousOrg||previousOrg===org)))fail("DUPLICATE_OR_AMBIGUOUS");
  }
}
export function buildAdoptionDraft({args,properties,rows,scanComplete,groundedSources}) {
  assertAdoptionSchema(properties);
  if(!args||typeof args!=="object"||Array.isArray(args))fail("INPUT_INVALID");
  const name=txt(args.name,160),org=txt(args.organization,240),
    summary=txt(args.summary,420),description=txt(args.description,1450),
    city=txt(args.city,120),region=txt(args.region,120);
  if(!name||!org||!summary||description.length<35)fail("CONTENT_INCOMPLETE");
  if(["address","street","house_number","postal_code","phone","email","contact","latitude",
      "longitude","venue","legal_name","registration_number","psipedia_id","slug"].some(k=>args[k]!==undefined&&args[k]!==null&&args[k]!=="")||
      [name,org,summary,description,city,region].some(privateText))fail("PRIVATE_OR_UNSUPPORTED_FIELD");
  const sources=[args.source_url,...(Array.isArray(args.source_urls)?args.source_urls:[])];
  if(sources.length>8)fail("TOO_MANY_SOURCES");
  const normalized=sources.map(sourceUrl),grounded=new Set(Array.isArray(groundedSources)?groundedSources:[]);
  if(normalized.some(u=>!grounded.has(u)))fail("UNVERIFIED_SOURCE");
  const evidence=args.evidence,allowed=new Set(["name","organization","summary","description","city","region","source_url"]);
  if(!Array.isArray(evidence)||!evidence.length||evidence.length>8)fail("EVIDENCE_MISSING");
  const covered=new Set();
  for(const e of evidence){
    if(!e||!normalized.includes(sourceUrl(e.source_url))||!Array.isArray(e.fields)||
       !e.fields.length||e.fields.length>allowed.size||e.fields.some(f=>typeof f!=="string"||!allowed.has(f)))fail("EVIDENCE_INVALID");
    e.fields.forEach(f=>covered.add(f));
  }
  if(["name","organization","summary","description"].some(f=>!covered.has(f))||
     (city&&!covered.has("city"))||(region&&!covered.has("region")))fail("EVIDENCE_INCOMPLETE");
  assertAdoptionUnique(rows,{name,organization:org,source_url:normalized[0]},scanComplete);
  const notes=evidence.map(e=>e.fields.join(", ")+": "+sourceUrl(e.source_url)).join("\n");
  return {"Meno":{title:[{type:"text",text:{content:name}}]},
    "Stav":{select:{name:"Nápad"}},"Organizácia":rich(org),
    "Krátky popis":rich(summary),"Popis":rich(description+"\n\nZdroje a dôkazy:\n"+notes),
    "Zdroj dát":{url:normalized[0]},
    ...(city?{"Mesto":rich(city)}:{}),...(region?{"Kraj":rich(region)}:{})};
}
