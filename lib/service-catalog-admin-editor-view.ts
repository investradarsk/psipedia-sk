import {serviceCatalog,attributeCatalog} from "./service-catalog-contract.ts";
import type {AdminCatalogOptionDto,CatalogMirrorStatus,CatalogOptionStatus} from "./service-catalog-admin-api-contract.ts";
import type {ServiceFilterCategory} from "./directory-filter-contract.ts";

export type CatalogEditorItem=Readonly<{
  id:string; label:string;kind:"service"|"attribute";valueKind:"tri_state"|"single_select"|"multi_select"|"text_list";group:string;meaning:string;
  categories:readonly string[];source:"built_in"|"admin";
  status:CatalogOptionStatus|"BUILT_IN";mirror:CatalogMirrorStatus|"NOT_REQUIRED";
  version:number|null;
}>;

/** Static definitions are read-only; D1 is the authority for newly approved options. */
export function catalogEditorItems(dynamic:readonly AdminCatalogOptionDto[]):CatalogEditorItem[]{
  const builtIn:CatalogEditorItem[]=[
    ...serviceCatalog.map(option=>({
      id:option.id,label:option.label,kind:"service" as const,valueKind:"tri_state" as const,group:option.group,meaning:option.meaning,
      categories:option.categories,source:"built_in" as const,status:"BUILT_IN" as const,
      mirror:"NOT_REQUIRED" as const,version:null,
    })),
    ...attributeCatalog.map(option=>({
      id:option.id,label:option.label,kind:"attribute" as const,valueKind:option.valueKind,group:"Vlastnosti",meaning:option.meaning,
      categories:option.categories,source:"built_in" as const,status:"BUILT_IN" as const,
      mirror:"NOT_REQUIRED" as const,version:null,
    })),
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
