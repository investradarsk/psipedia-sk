import { commitHelpV2AdminEdit } from "./notion-help-v2-admin-receipts.ts";
import type { AdoptionD1Database, AdoptionD1Statement } from "./adoption-store.ts";

/** Only these public editorial cells can be imported. No private-details
 * column or exact-location/public-contact approval is in this allowlist. */
export const LOST_FOUND_V2_FIELDS={
  "Meno psa":["dog_name","dogName"], "Pohlavie":["sex","sex"],
  "Plemeno":["breed","breed"], "Farba":["color","color"], "Vek":["approximate_age","approximateAge"],
  "Veľkosť":["size","size"], "Krátky popis":["short_description","shortDescription"],
  "Popis":["description","description"], "Rozlišovacie znaky":["distinguishing_marks","distinguishingMarks"],
  "Obojok":["collar_description","collarDescription"], "Čip":["chipped","chipped"],
  "Hlavný obrázok":["main_image","mainImage"], "Dátum udalosti":["event_date","eventDate"],
  "Naposledy videný":["last_seen_date_time","lastSeenDateTime"],
  "Kraj":["region","region"], "Okres":["district","district"], "Mesto":["city","city"],
  "Zdroj URL":["source_url","sourceUrl"],
} as const;
export type LostFoundV2Field=keyof typeof LOST_FOUND_V2_FIELDS;
export function isLostFoundV2Field(field:string):field is LostFoundV2Field {
  return Object.hasOwn(LOST_FOUND_V2_FIELDS,field);
}
export const LOST_FOUND_V2_PROTECTED=new Set([
  "Názov","Slug","Typ","Psipedia stav","Latitude","Longitude","Presnosť lokality","Miesto",
  "Verejný kontakt","Verejný telefón","Verejný e-mail","Verejný web","Verejný Facebook","Verejný Instagram","Zdroj",
]);
export function lostFoundV2Kind(field:string):"text"|"number"|"date"|"instant"|undefined {
  if(field==="Latitude"||field==="Longitude")return "number";
  if(field==="Dátum udalosti")return "date";
  if(field==="Naposledy videný")return "instant";
  return isLostFoundV2Field(field)||LOST_FOUND_V2_PROTECTED.has(field)?"text":undefined;
}
export function lostFoundV2Value(field:LostFoundV2Field,value:unknown):string {
  const text=typeof value==="string"?value.trim():"";
  if(field==="Hlavný obrázok"&&text.startsWith("/"))return "https://psipedia.sk"+text;
  if(field==="Naposledy videný"&&text){
    const instant=new Date(text);
    return Number.isFinite(instant.getTime())?instant.toISOString():text;
  }
  return text;
}
const projection="json_object("+Object.entries(LOST_FOUND_V2_FIELDS).map(([field,[column]])=>{
  const cell="trim(COALESCE(p."+column+",''))";
  const expr=field==="Hlavný obrázok"?"CASE WHEN substr("+cell+",1,1)='/' THEN 'https://psipedia.sk'||"+cell+" ELSE "+cell+" END"
    :field==="Naposledy videný"?"COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',"+cell+"),"+cell+")":cell;
  return "'"+field+"',"+expr;
}).join(",")+")";

/** Public table only. The private encrypted write can be a companion in
 * the same transaction but is never read or copied into receipts. */
export function commitLostFoundV2AdminEdit(database:D1Database,statement:D1PreparedStatement,
  input:{id:number;expectedRevision:string;nextRevision:string;editor:string;companionStatements?:readonly D1PreparedStatement[]}){
  return commitHelpV2AdminEdit(database as unknown as AdoptionD1Database,statement as unknown as AdoptionD1Statement,
    {...input,agenda:"lost-found",table:"lost_found_dog_reports",projection});
}
