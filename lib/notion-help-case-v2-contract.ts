import { commitHelpV2AdminEdit } from "./notion-help-v2-admin-receipts.ts";
import type { ManagedHelpCaseInput } from "./help-store.ts";
import type { AdoptionD1Database, AdoptionD1Statement } from "./adoption-store.ts";
import { notionSeoPropertyNames } from "./notion-seo-contract.ts";

/** Existing generic Help mirror; category, publication and explicit closure
 * remain Admin-owned. Organization is a text field, not an organization FK. */
export const HELP_CASE_V2_FIELDS={
  "Názov":["title","title"],"Perex":["excerpt","excerpt"],"Popis":["description","description"],
  "Organizácia":["organization","organization"],"Pes":["dog_name","dogName"],"Plemeno":["breed","breed"],
  "Vek":["age_note","ageNote"],"Mesto":["city","city"],"Kraj":["region","region"],"Miesto":["location_note","locationNote"],
  "Dátum hlásenia":["reported_date","reportedDate"],"Deadline":["deadline_date","deadlineDate"],
  "CTA text":["action_label","actionLabel"],"CTA URL":["action_url","actionUrl"],"Kontakt":["contact_note","contactNote"],
  "Cieľ":["goal_amount","goalAmount"],"Vyzbierané":["raised_amount","raisedAmount"],"Obrázok":["image_url","imageUrl"],
  "Urgentné":["urgent","urgent"],
} as const satisfies Record<string,readonly [string,keyof ManagedHelpCaseInput]>;
export type HelpCaseV2Field=keyof typeof HELP_CASE_V2_FIELDS;
export const HELP_CASE_V2_SEO=Object.fromEntries(Object.entries(notionSeoPropertyNames["help-cases"])
  .filter(([key])=>key!=="noindex").map(([key,field])=>[field,key])) as Record<string,string>;
export const HELP_CASE_V2_PROTECTED=new Set(["Slug","Kategória","Psipedia stav","Vyriešené","Noindex"]);
export function isHelpCaseV2Field(field:string):field is HelpCaseV2Field{return Object.hasOwn(HELP_CASE_V2_FIELDS,field);}
export function isHelpCaseV2SeoField(field:string){return Object.hasOwn(HELP_CASE_V2_SEO,field);}
export function helpCaseV2Kind(field:string):"text"|"number"|"date"|"checkbox"|undefined{
  if(field==="Cieľ"||field==="Vyzbierané")return "number";
  if(field==="Dátum hlásenia"||field==="Deadline")return "date";
  if(field==="Urgentné"||field==="Vyriešené"||field==="Noindex")return "checkbox";
  return isHelpCaseV2Field(field)||isHelpCaseV2SeoField(field)||HELP_CASE_V2_PROTECTED.has(field)?"text":undefined;
}
export function helpCaseV2Value(field:string,value:unknown):unknown{
  if(field==="Cieľ"||field==="Vyzbierané")return value==null||value===""?null:Number(value);
  if(field==="Urgentné"||field==="Vyriešené"||field==="Noindex")return value===true||value===1;
  const text=typeof value==="string"?value.trim():"";
  return (field==="Obrázok"||field==="OG obrázok")&&text.startsWith("/")?"https://psipedia.sk"+text:text;
}
function imageExpression(cell:string){
  return "CASE WHEN substr("+cell+",1,1)='/' THEN 'https://psipedia.sk'||"+cell+" ELSE "+cell+" END";
}
const seoDocument="CASE WHEN json_valid(p.seo_json) THEN p.seo_json ELSE '{}' END";
const projection="json_object("+[
  ...Object.entries(HELP_CASE_V2_FIELDS).map(([field,[column]])=>{
    const cell="p."+column,trimmed="trim(COALESCE("+cell+",''))";
    const expr=field==="Urgentné"?"json(CASE WHEN "+cell+"=1 THEN 'true' ELSE 'false' END)"
      :field==="Cieľ"||field==="Vyzbierané"?cell:field==="Obrázok"?imageExpression(trimmed):trimmed;
    return "'"+field+"',"+expr;
  }),
  ...Object.entries(HELP_CASE_V2_SEO).map(([field,key])=>{
    const cell="trim(COALESCE(json_extract("+seoDocument+",'$."+key+"'),''))";
    return "'"+field+"',"+(field==="OG obrázok"?imageExpression(cell):cell);
  }),
].join(",")+")";
export function commitHelpCaseV2AdminEdit(database:D1Database,statement:D1PreparedStatement,input:{
  id:number;expectedRevision:string;nextRevision:string;editor:string
}){
  return commitHelpV2AdminEdit(database as unknown as AdoptionD1Database,statement as unknown as AdoptionD1Statement,{
    ...input,agenda:"help-cases",table:"help_cases",projection,
  });
}
