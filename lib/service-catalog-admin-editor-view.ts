import {serviceCatalog,attributeCatalog} from "./service-catalog-contract.ts";
import type {AdminCatalogOptionDto,CatalogMirrorStatus,CatalogOptionStatus} from "./service-catalog-admin-api-contract.ts";
import type {ServiceFilterCategory} from "./directory-filter-contract.ts";
import type {BuiltinCatalogOverride} from "./service-catalog-builtin-overrides.ts";

export type CatalogEditorItem=Readonly<{
  id:string; label:string;kind:"service"|"attribute";valueKind:"tri_state"|"single_select"|"multi_select"|"text_list";group:string;meaning:string;
  categories:readonly string[];source:"built_in"|"admin";
  status:CatalogOptionStatus|"BUILT_IN";mirror:CatalogMirrorStatus|"NOT_REQUIRED";
  version:number|null;
}>;

/**
 * Override only the human-editable metadata of built-in options.
 * Preserve original IDs, kind/value-kind and canonical relationship identity.
 */
export function catalogEditorItems(
  dynamic:readonly AdminCatalogOptionDto[],
  overrides:readonly BuiltinCatalogOverride[] = [],
):CatalogEditorItem[]{
  const byId=new Map(overrides.map(item=>[item.id,item]));
  const builtIn:CatalogEditorItem[]=[
    ...serviceCatalog.map(option=>{
      const current=byId.get(option.id);
      return {
        id:option.id,label:current?.label??option.label,kind:"service" as const,
        valueKind:"tri_state" as const,group:current?.group??option.group,
        meaning:current?.meaning??option.meaning,
        categories:current?.categories??option.categories,source:"built_in" as const,
        status:"BUILT_IN" as const,mirror:"NOT_REQUIRED" as const,
        version:current?.version??0,
      };
    }),
    ...attributeCatalog.map(option=>{
      const current=byId.get(option.id);
      return {
        id:option.id,label:current?.label??option.label,kind:"attribute" as const,
        valueKind:option.valueKind,group:current?.group??"Vlastnosti",
        meaning:current?.meaning??option.meaning,
        categories:current?.categories??option.categories,source:"built_in" as const,
        status:"BUILT_IN" as const,mirror:"NOT_REQUIRED" as const,
        version:current?.version??0,
      };
    }),
  ];
  return [...builtIn,...dynamic.map(item=>({
    id:item.id,label:item.label,kind:item.kind,valueKind:"tri_state" as const,group:item.group,meaning:item.meaning,
    categories:item.categories,source:"admin" as const,status:item.status,mirror:item.notionMirrorStatus,version:item.version,
  }))].sort((a,b)=>a.label.localeCompare(b.label,"sk")||a.id.localeCompare(b.id));
}

/** Never show a draft, conflicted or retired dynamic service as selectable on a profile. */
export function eligibleProfileServiceItems(items:readonly CatalogEditorItem[],category:ServiceFilterCategory):CatalogEditorItem[]{
  return items.filter(item=>item.categories.includes(category)&&(
    item.source==="built_in" || item.status==="ACTIVE"
  ));
}
