import type { NotionPage } from "./notion-sync-shared";
import type { BreedNotionField } from "./notion-breed-field-delta";

/** 1:1 field identity, independent of Notion's opaque property IDs. */
const NOTION_TO_BREED_FIELD: Record<string,BreedNotionField> = {
  "Názov":"name","FCI skupina":"fciGroup","FCI sekcia":"fciSection",
  "FCI sekcia číslo":"fciSectionNumber","Oficiálny FCI názov":"officialFciName",
  "Platnosť FCI štandardu":"validStandardDate","Pracovná skúška":"workingTrial",
  "Krajina pôvodu":"origin","Skupina":"group","Veľkosť":"size",
  "Hmotnosť":"weight","Výška":"height","Dĺžka života":"lifespan","Srsť":"coat",
  "Energia":"energy","Trénovateľnosť":"trainability","Rodina":"family",
  "Deti":"children","Iné psy":"otherDogs","Byt":"apartment",
  "Starostlivosť o srsť":"grooming","Pĺznutie":"shedding",
  "Lovecký pud":"preyDrive","Intro":"intro","Charakter":"character",
  "Potreby":"needs","História":"history","Pohyb":"exercise",
  "Výcvik":"training","Zdravie":"health","Zdravotné riziká":"healthRisks",
  "Vhodné pre":"goodFor","Zvážiť":"consider","Zdroje":"sources",
  "SEO title":"seo.title","Meta description":"seo.description",
};

/** Use only fields actually identified by Notion's signed webhook event. */
export function breedFieldsFromNotionEvent(page:NotionPage,changedIds:readonly string[]|undefined):BreedNotionField[]{
  if(!changedIds?.length)return [];
  const ids=new Set(changedIds);
  const out=new Set<BreedNotionField>();
  for(const [notionName,fieldKey] of Object.entries(NOTION_TO_BREED_FIELD)){
    const property=page.properties?.[notionName];
    const propertyId=property&&typeof property==="object"?(property as {id?:unknown}).id:null;
    if(ids.has(notionName) || (typeof propertyId==="string"&&ids.has(propertyId)))
      out.add(fieldKey);
  }
  return [...out];
}
