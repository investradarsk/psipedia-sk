/**
 * Persistent Admin metadata overrides for original Services V3 definitions.
 *
 * Built-in option IDs remain immutable. Values on profiles and the historical
 * facet mappings continue referring to the same IDs after an Admin edit.
 * Only display metadata and category membership can change; no new option,
 * deletion, kind/valueKind mutation, or Notion origin claim is made here.
 */
import {serviceCatalog, attributeCatalog, providerTypeCatalog, normalizeCatalogLabel} from "./service-catalog-contract.ts";
import {serviceFilterCategories} from "./directory-filter-contract.ts";
import {ServiceCatalogConflictError, ServiceCatalogInputError, ServiceCatalogSchemaError} from "./service-catalog-admin-store.ts";

type DB = Pick<D1Database, "prepare">;
type Row = {
  option_id:string; label:string; normalized_label:string; categories_json:string;
  group_name:string; meaning:string; version:number;
};
export type BuiltinCatalogOverride = Readonly<{
  id:string; label:string; categories:readonly string[]; group:string; meaning:string; version:number;
}>;
type EditableOption = {
  id:string; label:string; categories:readonly string[]; group:string; meaning:string;
  kind:"service"|"attribute";
};
const aliases = (option: {label:string; aliases?:readonly string[]}) => [option.label, ...(option.aliases??[])];
function baseOption(id:string):EditableOption|null{
  const service = serviceCatalog.find(item=>item.id===id);
  if(service)return {...service, kind:"service"};
  const attribute = attributeCatalog.find(item=>item.id===id);
  if(attribute)return {
    id:attribute.id, label:attribute.label, categories:attribute.categories,
    group:"Vlastnosti", meaning:attribute.meaning, kind:"attribute",
  };
  return null;
}
function mapRow(row:Row):BuiltinCatalogOverride{
  const categories:unknown = JSON.parse(row.categories_json);
  if(!Array.isArray(categories)||!categories.every(x=>typeof x==="string"))
    throw new ServiceCatalogSchemaError("Invalid built-in catalog override categories.");
  return {
    id:row.option_id, label:row.label, categories,
    group:row.group_name, meaning:row.meaning, version:row.version,
  };
}
function failSchema(error:unknown):never{
  const message = error instanceof Error?error.message:String(error);
  if(/no such table|no such column/i.test(message))
    throw new ServiceCatalogSchemaError("Built-in catalog overrides migration 0149 is missing.");
  if(/UNIQUE constraint|constraint failed/i.test(message))
    throw new ServiceCatalogConflictError("This option name is already used.");
  throw error;
}
export async function listBuiltinCatalogOverrides(db:DB):Promise<BuiltinCatalogOverride[]>{
  try{
    const rows = await db.prepare("SELECT * FROM service_catalog_builtin_overrides ORDER BY option_id")
      .all<Row>();
    return rows.results.filter(row=>baseOption(row.option_id)!==null).map(mapRow);
  }catch(error){return failSchema(error);}
}
export async function updateBuiltinCatalogOption(db:DB,id:string,raw:unknown,actorRaw:string,now=new Date()){
  const base=baseOption(id);
  if(!base)throw new ServiceCatalogInputError("Only an existing built-in service or property can be edited.");
  const actor=actorRaw.trim().toLowerCase();
  if(!actor||actor.length>254||!actor.includes("@"))
    throw new ServiceCatalogInputError("Authenticated Admin actor missing.");
  if(!raw||typeof raw!=="object"||Array.isArray(raw))
    throw new ServiceCatalogInputError("Invalid built-in edit payload.");
  const input=raw as Record<string,unknown>;
  if(Object.keys(input).some(key=>!["action","expectedVersion","name","categories","group","meaning"].includes(key)))
    throw new ServiceCatalogInputError("Unsupported or server-controlled lifecycle fields.");
  if(input.action!=="edit"||!Number.isSafeInteger(input.expectedVersion)||(input.expectedVersion as number)<0)
    throw new ServiceCatalogInputError("Invalid built-in edit version or action.");
  if(typeof input.name!=="string"||typeof input.group!=="string"||
    typeof input.meaning!=="string"||!Array.isArray(input.categories)||
    !input.categories.every(x=>typeof x==="string"))
    throw new ServiceCatalogInputError("Invalid built-in edit fields.");
  const label=input.name.normalize("NFC").trim().replace(/\s+/g," ");
  const group=input.group.normalize("NFC").trim().replace(/\s+/g," ");
  const meaning=input.meaning.normalize("NFC").trim().replace(/\s+/g," ");
  const categories=input.categories as string[];
  if(label.length<3||label.length>100||group.length<2||group.length>80||
    meaning.length<10||meaning.length>500||
    categories.length<1||new Set(categories).size!==categories.length||
    !categories.every(category=>(serviceFilterCategories as readonly string[]).includes(category)))
    throw new ServiceCatalogInputError("Invalid option name, categories, group or meaning.");

  // Built-in names and aliases are reserved even if another option is edited.
  const normalized=normalizeCatalogLabel(label);
  if([...serviceCatalog,...attributeCatalog,...providerTypeCatalog].some(option=>
    option.id!==id&&aliases(option).some(name=>normalizeCatalogLabel(name)===normalized)))
    throw new ServiceCatalogConflictError("A canonical option with this name or alias already exists.");

  try{
    const [current, otherOverride, otherDynamic] = await Promise.all([
      db.prepare("SELECT * FROM service_catalog_builtin_overrides WHERE option_id=?1")
        .bind(id).first<Row>(),
      db.prepare("SELECT option_id FROM service_catalog_builtin_overrides WHERE normalized_label=?1 AND option_id<>?2 LIMIT 1")
        .bind(normalized,id).first<{option_id:string}>(),
      db.prepare("SELECT id FROM service_catalog_admin_options WHERE normalized_label=?1 LIMIT 1")
        .bind(normalized).first<{id:string}>(),
    ]);
    if(otherOverride||otherDynamic)
      throw new ServiceCatalogConflictError("A catalog option with this name already exists.");
    const version=current?.version??0;
    if(version!==input.expectedVersion)
      throw new ServiceCatalogConflictError("Option changed concurrently; reload before saving.");
    const existing=current?mapRow(current):base;
    if(existing.label===label&&existing.group===group&&existing.meaning===meaning&&
      JSON.stringify([...existing.categories].sort())===JSON.stringify([...categories].sort()))
      throw new ServiceCatalogInputError("No actual changes to save.");
    const stamp=now.toISOString();
    if(current){
      const changed=await db.prepare(
        "UPDATE service_catalog_builtin_overrides "+
        "SET label=?1,normalized_label=?2,categories_json=?3,group_name=?4,meaning=?5,"+
        "version=version+1,updated_at=?6,updated_by=?7 "+
        "WHERE option_id=?8 AND version=?9 RETURNING option_id,version"
      ).bind(label,normalized,JSON.stringify(categories),group,meaning,stamp,actor,id,version)
        .first<{option_id:string;version:number}>();
      if(!changed)throw new ServiceCatalogConflictError("Option changed concurrently; reload before saving.");
      return {id:changed.option_id,version:changed.version};
    }
    const inserted=await db.prepare(
      "INSERT INTO service_catalog_builtin_overrides "+
      "(option_id,label,normalized_label,categories_json,group_name,meaning,version,created_at,updated_at,created_by,updated_by) "+
      "VALUES (?1,?2,?3,?4,?5,?6,1,?7,?7,?8,?8) "+
      "ON CONFLICT(option_id) DO NOTHING RETURNING option_id,version"
    ).bind(id,label,normalized,JSON.stringify(categories),group,meaning,stamp,actor)
      .first<{option_id:string;version:number}>();
    if(!inserted)throw new ServiceCatalogConflictError("Option changed concurrently; reload before saving.");
    return {id:inserted.option_id,version:inserted.version};
  }catch(error){return failSchema(error);}
}
export function isEditableBuiltinCatalogOption(id:string):boolean{
  return baseOption(id)!==null;
}
