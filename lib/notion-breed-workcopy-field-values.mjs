/**
 * One signed Notion property event -> one canonical editorial value.
 * Each Admin field reads its independent physical 90-column Notion cell.
 * No receipt, baseline, other properties or publication state are consulted.
 */
import { breedWorkcopyPhysicalProperty } from "./breed-notion-workcopy-field-contract.mjs";

const JSON_ARRAY_FIELDS = new Set(["gallery","sports","editorial.heroTraits"]);
const LIST_FIELDS = new Set(["healthRisks","goodFor","consider"]);
const RELATION_FIELDS = new Set(["relatedBreedIds","relatedArticleIds","directoryProfileIds"]);
const SITE = "https://psipedia.sk";

function plain(property) {
  if (!property || typeof property !== "object") return "";
  if (property.type === "url") return property.url ?? "";
  if (property.type === "date") return property.date?.start ?? "";
  if (property.type === "select") return property.select?.name ?? "";
  if (property.type === "number") return property.number;
  if (property.type === "checkbox") return property.checkbox === true;
  const pieces=property.type==="title"?property.title:property.rich_text;
  return Array.isArray(pieces)
    ? pieces.map(item=>item.plain_text ?? item.text?.content ?? "").join("")
    : "";
}

function list(value) {
  return String(value ?? "").split(/[\r\n;]+/).map(x=>x.trim())
    .filter(Boolean);
}
function sourceList(value) {
  return list(value).map(entry=>{
    const sep=entry.lastIndexOf("|");
    const label=sep>=0?entry.slice(0,sep).trim():"";
    const raw=sep>=0?entry.slice(sep+1).trim():entry.trim();
    const url=new URL(raw);
    if (!["https:","http:"].includes(url.protocol))
      throw Error("BREED_EVENT_SOURCE_URL_INVALID");
    return {label:label||url.hostname.replace(/^www\./,""),url:url.href};
  });
}
function externalUrl(value) {
  if (!value) return "";
  const parsed=new URL(value);
  if (!["https:","http:"].includes(parsed.protocol))
    throw Error("BREED_EVENT_URL_INVALID");
  return value;
}

export function breedWorkcopyEventValues(page, changedProperties, schema) {
  const touched=new Set(changedProperties ?? []);
  const values=[];
  const failures=[];
  if (!page?.properties || !touched.size) return {values,failures};
  for (const entry of schema) {
    if (entry.mode!=="content" || RELATION_FIELDS.has(entry.id)) continue;
    const physical=breedWorkcopyPhysicalProperty(entry.notion);
    if (!physical) continue; // Historical Admin-only field, no source column.
    const property=page.properties[physical];
    if (!property || !(touched.has(physical) || touched.has(property.id))) continue;
    try {
      let raw=plain(property);
      let value=raw;
      if (entry.type==="number") {
        if (raw!==null && (typeof raw!=="number" || !Number.isFinite(raw)))
          throw Error("BREED_EVENT_NUMBER_INVALID");
      } else if (entry.type==="checkbox") {
        if (typeof raw!=="boolean") throw Error("BREED_EVENT_CHECKBOX_INVALID");
      } else if (entry.type==="url") {
        if (typeof raw!=="string") throw Error("BREED_EVENT_URL_INVALID");
        value=externalUrl(raw.trim());
        if (entry.id==="image" && value.startsWith(SITE+"/"))
          value=value.slice(SITE.length);
      } else {
        if (typeof raw!=="string") throw Error("BREED_EVENT_TEXT_INVALID");
        if (JSON_ARRAY_FIELDS.has(entry.id)) {
          value=raw.trim()?JSON.parse(raw):[];
          if (!Array.isArray(value)) throw Error("BREED_EVENT_JSON_ARRAY_INVALID");
        } else if (LIST_FIELDS.has(entry.id)) {
          value=list(raw);
        } else if (entry.id==="sources") {
          value=sourceList(raw);
        } else {
          value=raw;
        }
      }
      values.push({field:entry.id,property:physical,value});
    } catch (error) {
      failures.push({field:entry.id,code:error instanceof Error?error.message:"BREED_EVENT_PARSE_FAILED"});
    }
  }
  const fci=page.properties["FCI číslo"];
  if (fci && (touched.has("FCI číslo") || touched.has(fci.id))) {
    if (fci.type!=="number" ||
        (fci.number!==null && (!Number.isSafeInteger(fci.number) || fci.number<1)))
      failures.push({field:"fciNumber",code:"BREED_EVENT_FCI_NUMBER_INVALID"});
    else values.push({field:"fciNumber",property:"FCI číslo",value:fci.number});
  }
  return {values,failures};
}
