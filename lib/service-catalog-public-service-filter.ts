/**
 * Read-only Services V3 public filter adapter.
 * Explicit canonical D1 YES only: never infer from free text, missing row,
 * legacy source_data_json or a Notion mirror. Public read gating defaults OFF.
 */
import {serviceCatalog} from "./service-catalog-contract.ts";
import {serviceFilterCategories} from "./directory-filter-contract.ts";

const dynamicId=/^svc\.admin\.[a-f0-9]{32}$/;
const categories=new Set<string>(serviceFilterCategories);

export type CanonicalPublicServiceOption=Readonly<{id:string;label:string}>;
export type CanonicalPublicServiceRow={
  optionId:string;
  label:string|null;
  kind:string|null;
  status:string|null;
  mirrorStatus:string|null;
  categoriesJson:string|null;
  builtinLabel?:string|null;
  builtinCategoriesJson?:string|null;
};

function isAllowedCategory(category:string):boolean{return categories.has(category);}
function builtIn(id:string){
  return serviceCatalog.find(s=>s.id===id);
}

/**
 * An invalid/rejected requested filter NEVER degrades to an unfiltered query.
 * The outer query remains category-scoped and published-only.
 */
export function canonicalPublicServiceWhere(
  category:string,raw:string,enabled:boolean,profileAlias:"directory_profiles"|"d"="directory_profiles",
  builtinOverridesReady=false,
):{clauses:string[];bindings:string[]}{
  const profileId=profileAlias==="d"?"d.id":"directory_profiles.id";
  if(!raw)return {clauses:[],bindings:[]};
  if(!enabled||!isAllowedCategory(category)||raw.length>100)
    return {clauses:["1=0"],bindings:[]};
  const option=builtIn(raw);
  if(option&&!builtinOverridesReady){
    // Safe during a code-first deploy: retain the original behavior until the
    // additive override table exists in production D1.
    if(!option.categories.includes(category as typeof serviceFilterCategories[number]))
      return {clauses:["1=0"],bindings:[]};
    return {
      clauses:[`EXISTS (SELECT 1 FROM service_profile_option_choices AS svc_choice
        WHERE svc_choice.profile_id=${profileId} AND svc_choice.option_id=? AND svc_choice.choice='yes')`],
      bindings:[raw],
    };
  }
  if(option)return {
    clauses:[`EXISTS (
      SELECT 1 FROM service_profile_option_choices AS svc_choice
      WHERE svc_choice.profile_id=${profileId} AND svc_choice.option_id=?
        AND svc_choice.choice='yes'
        AND (
          EXISTS (
            SELECT 1 FROM service_catalog_builtin_overrides AS builtin
            WHERE builtin.option_id=?
              AND EXISTS (SELECT 1 FROM json_each(builtin.categories_json) WHERE value=?)
          )
          OR (
            NOT EXISTS (SELECT 1 FROM service_catalog_builtin_overrides AS builtin WHERE builtin.option_id=?)
            AND ?='1'
          )
        )
    )`],
    bindings:[raw,raw,category,raw,option.categories.includes(category as typeof serviceFilterCategories[number])?"1":"0"]
  };
  if(!dynamicId.test(raw))return {clauses:["1=0"],bindings:[]};
  return {
    clauses:[`EXISTS (
      SELECT 1 FROM service_profile_option_choices AS svc_choice
      JOIN service_catalog_admin_options AS svc_option ON svc_option.id=svc_choice.option_id
      WHERE svc_choice.profile_id=${profileId} AND svc_choice.option_id=?
        AND svc_choice.choice='yes'
        AND svc_option.kind='service' AND svc_option.status='ACTIVE'
        
        AND EXISTS (SELECT 1 FROM json_each(svc_option.categories_json) AS cat WHERE cat.value=?)
    )`],
    bindings:[raw,category]
  };
}

/** Labels only for YES on published profiles in the requested category. */
export function canonicalPublicServiceOptions(
  category:string,rows:readonly CanonicalPublicServiceRow[]
):CanonicalPublicServiceOption[]{
  if(!isAllowedCategory(category))return [];
  const out=new Map<string,string>();
  for(const row of rows){
    const id=row.optionId;
    const staticOption=builtIn(id);
    if(staticOption){
      let selectedCategories:unknown=staticOption.categories;
      if(row.builtinCategoriesJson){
        try{selectedCategories=JSON.parse(row.builtinCategoriesJson);}catch{continue;}
      }
      if(!Array.isArray(selectedCategories)||!selectedCategories.includes(category))continue;
      const label=row.builtinLabel?.trim()||staticOption.label;
      out.set(id,label);
      continue;
    }
    if(!dynamicId.test(id)||row.kind!=="service"||row.status!=="ACTIVE"||
       typeof row.label!=="string"||
       row.label.trim().length<3)continue;
    let cats:unknown;
    try{cats=JSON.parse(row.categoriesJson??"");}catch{continue;}
    if(!Array.isArray(cats)||!cats.includes(category))continue;
    out.set(id,row.label.trim());
  }
  return [...out].map(([id,label])=>({id,label}))
    .sort((a,b)=>a.label.localeCompare(b.label,"sk")||a.id.localeCompare(b.id));
}
