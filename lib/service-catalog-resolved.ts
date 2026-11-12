/**
 * Read-only canonical Services V3 definitions.
 *
 * The original service IDs and aliases are immutable. D1 Admin overrides are
 * the source of current display names and category memberships; newly created
 * ACTIVE options share this same view. Notion is only a mirror.
 */
import {serviceCatalog,normalizeCatalogLabel} from "./service-catalog-contract.ts";
import type {BuiltinCatalogOverride} from "./service-catalog-builtin-overrides.ts";

type DB=Pick<D1Database,"prepare">;
type OverrideRow={option_id:string;label:string;categories_json:string;group_name:string;meaning:string;version:number};
type DynamicRow={id:string;label:string;categories_json:string;group_name:string;meaning:string;version:number};
export type ResolvedServiceDefinition=Readonly<{
  id:string;
  label:string;
  aliases:readonly string[];
  categories:readonly string[];
  group:string;
  meaning:string;
  version:number;
  source:"built_in"|"admin";
  overridden:boolean;
}>;

export function resolveBuiltInServiceDefinitions(
  overrides:readonly Pick<BuiltinCatalogOverride,"id"|"label"|"categories"|"group"|"meaning"|"version">[]=[],
):ResolvedServiceDefinition[]{
  const byId=new Map(overrides.map(row=>[row.id,row]));
  return serviceCatalog.map(service=>{
    const override=byId.get(service.id);
    const label=override?.label??service.label;
    // Keep original names readable during migration from historical Notion
    // rich text, and treat old labels as aliases after Admin renames.
    const aliases=[...new Set([
      ...service.aliases,
      ...(normalizeCatalogLabel(label)!==normalizeCatalogLabel(service.label)?[service.label]:[]),
    ].filter(x=>normalizeCatalogLabel(x)!==normalizeCatalogLabel(label)))];
    return {
      id:service.id,label,aliases,
      categories:override?.categories??service.categories,
      group:override?.group??service.group,
      meaning:override?.meaning??service.meaning,
      version:override?.version??0,
      source:"built_in" as const,overridden:!!override,
    };
  });
}

function checkedCategories(json:string,id:string):string[]{
  let value:unknown;
  try{value=JSON.parse(json);}catch{throw Error("SERVICE_CATALOG_INVALID_CATEGORIES:"+id);}
  if(!Array.isArray(value)||value.length===0||value.some(x=>typeof x!=="string"))
    throw Error("SERVICE_CATALOG_INVALID_CATEGORIES:"+id);
  return value as string[];
}

/** Code-first rollout still works while the additive 0149 table is missing. */
export async function loadResolvedBuiltinServiceOverrides(db:DB):Promise<ResolvedServiceDefinition[]>{
  let rows:OverrideRow[];
  try{
    const read=await db.prepare(
      "SELECT option_id,label,categories_json,group_name,meaning,version FROM service_catalog_builtin_overrides"
    ).all<OverrideRow>();
    rows=read.results??[];
  }catch(error){
    if(/no such table: service_catalog_builtin_overrides/i.test(String(error)))return [];
    throw error;
  }
  const known=new Set(serviceCatalog.map(x=>x.id));
  const overrides=rows.filter(row=>known.has(row.option_id)).map(row=>({
    id:row.option_id,label:row.label,categories:checkedCategories(row.categories_json,row.option_id),
    group:row.group_name,meaning:row.meaning,version:row.version,
  }));
  return resolveBuiltInServiceDefinitions(overrides).filter(x=>x.overridden);
}

/** One source for profile projection, Notion relation eligibility and Admin-facing data. */
export async function loadResolvedServiceDefinitions(db:DB,category?:string):Promise<ResolvedServiceDefinition[]>{
  const builtins=resolveBuiltInServiceDefinitions(await loadResolvedBuiltinServiceOverrides(db));
  const result=await db.prepare(
    "SELECT id,label,categories_json,group_name,meaning,version FROM service_catalog_admin_options "+
    "WHERE kind='service' AND status='ACTIVE'"
  ).all<DynamicRow>();
  const dynamic=(result.results??[]).map(row=>({
    id:row.id,label:row.label,aliases:[] as readonly string[],
    categories:checkedCategories(row.categories_json,row.id),
    group:row.group_name,meaning:row.meaning,version:row.version,
    source:"admin" as const,overridden:false,
  }));
  const all=[...builtins,...dynamic];
  return category?all.filter(service=>service.categories.includes(category)):all;
}
