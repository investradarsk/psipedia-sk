import { BREED_NOTION_SCHEMA } from "./notion-breed-property-registry.ts";
import {
  notionPropertyRecord, notionRichTextProperty, notionUrlProperty,
  notionRequest, type NotionPage, type NotionSyncBindings,
} from "./notion-sync-shared.ts";
import type { NotionFieldMode } from "./notion-field-authority";

/** Notion-only metadata also has an editable Admin representation. */
export const BREED_EXTRA_FIELDS = BREED_NOTION_SCHEMA.filter(e=>e.mode==="extra");
export type BreedExtraField = (typeof BREED_EXTRA_FIELDS)[number]["id"];

function extraField(field:string){
  return BREED_EXTRA_FIELDS.find(e=>e.id===field);
}
export function extraValueFromNotion(page:NotionPage,field:string):unknown {
  const spec=extraField(field);
  if(!spec)return undefined;
  if(spec.type==="checkbox")return notionPropertyRecord(page,spec.notion)?.checkbox===true;
  if(spec.type==="url")return notionUrlProperty(page,spec.notion);
  return notionRichTextProperty(page,spec.notion);
}
export function extraNotionPatch(field:string,value:unknown):Record<string,unknown> {
  const spec=extraField(field);
  if(!spec)throw new Error("BREED_EXTRA_UNSUPPORTED");
  if(spec.type==="checkbox"){
    if(typeof value!=="boolean")throw new Error("BREED_EXTRA_VALUE_INVALID");
    return {[spec.notion]:{checkbox:value}};
  }
  if(typeof value!=="string" || value.length>10000)throw new Error("BREED_EXTRA_VALUE_INVALID");
  if(spec.type==="url"){
    if(value && (!/^https:\/\//i.test(value) || value.length>700))
      throw new Error("BREED_EXTRA_URL_INVALID");
    return {[spec.notion]:{url:value||null}};
  }
  const chars=Array.from(value);
  const richText=[];
  for(let i=0;i<chars.length;i+=1800){
    richText.push({type:"text",text:{content:chars.slice(i,i+1800).join("")}});
  }
  return {[spec.notion]:{rich_text:richText}};
}
export async function readBreedExtraFields(db:D1Database,breedId:number):Promise<Record<string,unknown>> {
  const rows=await db.prepare("SELECT field_key,value_json FROM breed_notion_extra_fields WHERE breed_id=?")
    .bind(breedId).all<{field_key:string;value_json:string}>();
  const values:Record<string,unknown>={};
  for(const row of rows.results??[]){
    if(!extraField(row.field_key))continue;
    try{values[row.field_key]=JSON.parse(row.value_json);}catch{/* Invalid legacy value is absent. */}
  }
  return values;
}
export async function saveBreedExtraFields(db:D1Database,breedId:number,fields:Record<string,unknown>) {
  const keys=Object.keys(fields).filter(key=>extraField(key));
  if(!keys.length)return;
  const now=new Date().toISOString();
  await db.batch(keys.map(field=>db.prepare(
    "INSERT INTO breed_notion_extra_fields (breed_id,field_key,value_json,updated_at) "+
    "VALUES (?,?,?,?) ON CONFLICT(breed_id,field_key) DO UPDATE SET "+
    "value_json=excluded.value_json,updated_at=excluded.updated_at"
  ).bind(breedId,field,JSON.stringify(fields[field]),now)));
}
/**
 * Read-only input for Notion; writes only to the local mirror unless an explicit
 * Admin priority requires an outbound Notion update. No editorial field blocks
 * its siblings. The remote edits are issued as one Notion PATCH.
 */
export async function reconcileBreedExtraFields(args:{
  db:D1Database;bindings:NotionSyncBindings;page:NotionPage;breedId:number;
  priority:Readonly<Record<string,NotionFieldMode>>;
}):Promise<void> {
  const local=await readBreedExtraFields(args.db,args.breedId);
  const toD1:Record<string,unknown>={};
  const toNotion:Record<string,unknown>={};
  for(const spec of BREED_EXTRA_FIELDS){
    const remote=extraValueFromNotion(args.page,spec.id);
    if(!Object.prototype.hasOwnProperty.call(local,spec.id)){
      toD1[spec.id]=remote;continue;
    }
    if(JSON.stringify(local[spec.id])===JSON.stringify(remote))continue;
    if(args.priority[spec.id]==="admin"){
      Object.assign(toNotion,extraNotionPatch(spec.id,local[spec.id]));
    }else{
      toD1[spec.id]=remote;
    }
  }
  if(Object.keys(toNotion).length)await notionRequest(args.bindings,
    "/pages/"+encodeURIComponent(args.page.id),{
      method:"PATCH",body:JSON.stringify({properties:toNotion}),
    });
  if(Object.keys(toD1).length)await saveBreedExtraFields(args.db,args.breedId,toD1);
}
/** An explicit Admin edit may be sent outward without changing other Notion cells. */
export async function writeBreedExtraField(args:{
  db:D1Database;bindings:NotionSyncBindings;page:NotionPage;breedId:number;
  field:string;value:unknown;
}) {
  const properties=extraNotionPatch(args.field,args.value);
  const written=await notionRequest<NotionPage>(args.bindings,
    "/pages/"+encodeURIComponent(args.page.id),{
      method:"PATCH",body:JSON.stringify({properties}),
    });
  if(written.id!==args.page.id ||
     JSON.stringify(extraValueFromNotion(written,args.field))!==JSON.stringify(args.value))
    throw new Error("BREED_EXTRA_WRITE_UNCONFIRMED");
  await saveBreedExtraFields(args.db,args.breedId,{[args.field]:args.value});
}
