/**
 * Read-only public detail projection of canonical Services V3 choices.
 * Keep unrelated legacy editorial labels, but never display a stale
 * canonical label when an explicit D1 YES/NO says otherwise.
 */
import {normalizeCatalogLabel} from "./service-catalog-contract.ts";
import type {ResolvedServiceDefinition} from "./service-catalog-resolved.ts";

export type PublicServiceChoice=Readonly<{option_id:string;choice:string}>;

/** Only uniquely resolved aliases may be replaced/removed. Ambiguous prose
 * is kept intact instead of guessed as belonging to a different service. */
export function canonicalPublicProfileServices(
  legacy:readonly string[],category:string,
  choices:readonly PublicServiceChoice[],
  catalog:readonly ResolvedServiceDefinition[],
):string[]{
  const current=new Map(catalog.map(x=>[x.id,x]));
  const selection=new Map(choices.map(x=>[x.option_id,x.choice]));
  const names=new Map<string,string|null>();
  for(const option of catalog){
    for(const value of [option.label,...option.aliases]){
      const key=normalizeCatalogLabel(value);
      if(!key)continue;
      const previous=names.get(key);
      names.set(key,previous===undefined?option.id:previous===option.id?option.id:null);
    }
  }
  const shown=new Set<string>();
  const result:string[]=[];
  for(const name of legacy){
    const id=names.get(normalizeCatalogLabel(name));
    const state=id?selection.get(id):undefined;
    if(!id||!state||!["yes","no"].includes(state)){
      // Notion's historical free text is not proof of a canonical choice.
      result.push(name);
      continue;
    }
    const option=current.get(id);
    if(state==="no"||!option?.categories.includes(category))continue;
    if(!shown.has(id)){result.push(option.label);shown.add(id);}
  }
  // An explicit Admin YES must be visible even if the legacy text projection
  // is pending due to a Notion or D1 compare-and-swap error.
  for(const {option_id:id,choice} of choices){
    if(choice!=="yes"||shown.has(id))continue;
    const option=current.get(id);
    if(option?.categories.includes(category)){
      result.push(option.label);
      shown.add(id);
    }
  }
  return result;
}
