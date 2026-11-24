/** Shared, read-only public projection of the two intentionally separate
 * service channels: historical editorial text and explicit Services V3 IDs.
 * Both the public detail and the Admin explanation consume this resolver. */
import {normalizeCatalogLabel} from "./service-catalog-contract.ts";
import type {ResolvedServiceDefinition} from "./service-catalog-resolved.ts";

export type PublicServiceChoice=Readonly<{option_id:string;choice:string}>;
export type PublicServiceVisibleItem=Readonly<{
  label:string;
  source:"catalog"|"legacy";
  optionId?:string;
}>;
export type PublicServiceSuppressedItem=Readonly<{
  label:string;
  reason:"explicit_no"|"catalog_yes"|"different_category"|"duplicate";
  canonicalName?:string;
}>;
export type PublicServiceProjection=Readonly<{
  services:string[];
  visible:PublicServiceVisibleItem[];
  suppressed:PublicServiceSuppressedItem[];
}>;

/** Never infer an ID or YES/NO from historical prose. Only a uniquely matched
 * alias and a confirmed V3 choice can override the corresponding old label. */
export function projectPublicProfileServices(
  legacy:readonly string[],category:string|readonly string[],
  choices:readonly PublicServiceChoice[],
  catalog:readonly ResolvedServiceDefinition[],
):PublicServiceProjection {
  const profileCategories=typeof category==="string"?[category]:category;
  const current=new Map(catalog.map(option=>[option.id,option]));
  const selection=new Map(choices.map(choice=>[choice.option_id,choice.choice]));
  const aliases=new Map<string,string|null>();
  for(const option of catalog){
    for(const name of [option.label,...option.aliases]){
      const key=normalizeCatalogLabel(name);
      if(!key)continue;
      const previous=aliases.get(key);
      aliases.set(key,previous===undefined?option.id:previous===option.id?option.id:null);
    }
  }

  const visible:PublicServiceVisibleItem[]=[];
  const suppressed:PublicServiceSuppressedItem[]=[];
  const shownCatalog=new Set<string>(),shownLegacy=new Set<string>();
  for(const original of legacy){
    const label=original.trim();
    if(!label)continue;
    const normalized=normalizeCatalogLabel(label);
    const id=aliases.get(normalized);
    const choice=id?selection.get(id):undefined;
    const option=id?current.get(id):undefined;
    if(!id||!option||!["yes","no"].includes(choice??"")){
      // Ambiguous / unmatched labels stay as editorial prose; a missing choice
      // is UNKNOWN, not NO. Deduplicate the public display, not stored text.
      if(shownLegacy.has(normalized)){
        suppressed.push({label,reason:"duplicate"});
      } else {
        visible.push({label,source:"legacy"});
        shownLegacy.add(normalized);
      }
      continue;
    }
    if(choice==="no"){
      suppressed.push({label,reason:"explicit_no",canonicalName:option.label});
      continue;
    }
    if(!option.categories.some(value=>profileCategories.includes(value))){
      suppressed.push({label,reason:"different_category",canonicalName:option.label});
      continue;
    }
    if(!shownCatalog.has(id)){
      visible.push({label:option.label,source:"catalog",optionId:id});
      shownCatalog.add(id);
    }
    suppressed.push({label,reason:"catalog_yes",canonicalName:option.label});
  }
  // A confirmed YES must appear even if the old Notion text is missing.
  for(const {option_id:id,choice} of choices){
    if(choice!=="yes"||shownCatalog.has(id))continue;
    const option=current.get(id);
    if(option?.categories.some(value=>profileCategories.includes(value))){
      visible.push({label:option.label,source:"catalog",optionId:id});
      shownCatalog.add(id);
    }
  }
  return {services:visible.map(item=>item.label),visible,suppressed};
}

export function canonicalPublicProfileServices(
  legacy:readonly string[],category:string|readonly string[],
  choices:readonly PublicServiceChoice[],
  catalog:readonly ResolvedServiceDefinition[],
):string[]{
  return projectPublicProfileServices(legacy,category,choices,catalog).services;
}
