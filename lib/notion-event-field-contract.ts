/**
 * Podujatia: explicit editorial field events rather than whole-record replay.
 * Slug, publication, binary media and confirmed Google locations have separate owners.
 * The main image URL is mirrored as an editorial reference, not as a binary upload.
 */
export const EVENT_NOTION_FIELDS = {
  title:"Názov", eventType:"Typ podujatia",
  startDate:"Začiatok", startTime:"Čas začiatku", endDate:"Koniec", endTime:"Čas konca",
  venue:"Miesto",city:"Mesto",region:"Kraj",address:"Adresa",
  organizer:"Organizátor",excerpt:"Perex",description:"Popis",practicalInfo:"Praktické info",
  contactPhone:"Telefón organizátora", contactEmail:"E-mail organizátora",
  admissionFee:"Vstupné",websiteUrl:"Web",registrationUrl:"Registrácia",
  imageUrl:"Hlavný obrázok URL",imageAlt:"Alt text obrázka",internalNotes:"Poznámky",
  "seo.title":"SEO title","seo.description":"Meta description",
  "seo.focusKeyword":"SEO kľúčové slovo","seo.canonicalUrl":"Canonical URL",
  "seo.noindex":"Noindex","seo.ogTitle":"OG title",
  "seo.ogDescription":"OG popis","seo.ogImage":"OG obrázok",
} as const;
export type EventNotionField = keyof typeof EVENT_NOTION_FIELDS;
export const EVENT_NOTION_PATHS = Object.keys(EVENT_NOTION_FIELDS) as EventNotionField[];
export const EVENT_LOCATION_PATHS = new Set<EventNotionField>(["venue","city","region","address"]);
export const EVENT_CONTACT_BACKFILL_PATHS: EventNotionField[] = ["contactPhone","contactEmail","admissionFee"];

export function eventGetPath(value: Record<string,unknown>, path:string): unknown {
  return path.split(".").reduce<unknown>((v,k)=>
    v && typeof v==="object" ? (v as Record<string,unknown>)[k] : undefined,value);
}
function setPath(value: Record<string,unknown>,path:string,v:unknown) {
  const parts=path.split(".");
  let cursor=value;
  for(const key of parts.slice(0,-1)){
    if(!cursor[key] || typeof cursor[key]!=="object" || Array.isArray(cursor[key])) cursor[key]={};
    cursor=cursor[key] as Record<string,unknown>;
  }
  cursor[parts[parts.length-1]]=v;
}
export function eventChangedAdminFields(
  before:Record<string,unknown>,after:Record<string,unknown>,
):EventNotionField[] {
  const stable=(v:unknown)=>JSON.stringify(v==null?"":v);
  return EVENT_NOTION_PATHS.filter(path=>
    stable(eventGetPath(before,path))!==stable(eventGetPath(after,path)));
}
export function eventPreserveUneditedAdminFields(
  submitted:Record<string,unknown>,live:Record<string,unknown>,
  changed:readonly EventNotionField[],
):Record<string,unknown>{
  const result=structuredClone(submitted);
  const dirty=new Set(changed);
  for(const path of EVENT_NOTION_PATHS){
    if(dirty.has(path))continue;
    const value=eventGetPath(live,path);
    if(value!==undefined)setPath(result,path,value);
  }
  return result;
}
export function eventChangedNotionFields(
  properties:Record<string,unknown>|undefined, updated:readonly string[],
):EventNotionField[]{
  const changed=new Set(updated);
  if(!changed.size)return [];
  return EVENT_NOTION_PATHS.filter(path=>{
    const name=EVENT_NOTION_FIELDS[path];
    const raw=properties?.[name] as {id?:unknown}|undefined;
    return changed.has(name) || (typeof raw?.id==="string" && changed.has(raw.id));
  });
}
/** Notion 2025-09-03 pages may return rich_text even when the user pasted a URL.
 * A large property truncated to 25 items must never be silently overwritten.
 */
export function eventReadNotionProperty(raw:unknown):string|boolean|null{
  if(!raw || typeof raw!=="object")return null;
  const item=raw as Record<string,unknown>;
  if(typeof item.checkbox==="boolean")return item.checkbox;
  if(typeof item.url==="string")return item.url.trim();
  if(typeof item.email==="string")return item.email.trim();
  if(typeof item.phone_number==="string")return item.phone_number.trim();
  const selected=(item.select??item.status) as {name?:unknown}|null|undefined;
  if(typeof selected?.name==="string")return selected.name.trim();
  const date=item.date as {start?:unknown}|null|undefined;
  if(typeof date?.start==="string")return date.start.trim();
  const texts=Array.isArray(item.rich_text)?item.rich_text:Array.isArray(item.title)?item.title:null;
  if(!texts)return null;
  if(texts.length>=25)throw Error("NOTION_PROPERTY_REQUIRES_COMPLETE_READ");
  return texts.map(v=>{
    if(!v || typeof v!=="object")return "";
    const text=v as {plain_text?:unknown;text?:{content?:unknown}};
    return typeof text.plain_text==="string"?text.plain_text:
      typeof text.text?.content==="string"?text.text.content:"";
  }).join("").trim();
}
export function eventEmpty(value:unknown){
  return value==null || (typeof value==="string" && !value.trim());
}
export function eventValidateURL(value:unknown){
  if(typeof value!=="string" || !value.trim())throw Error("EVENT_URL_EMPTY");
  let url:URL;
  try{url=new URL(value);}catch{throw Error("EVENT_URL_INVALID");}
  if(!["https:","http:"].includes(url.protocol))throw Error("EVENT_URL_SCHEME_INVALID");
}
