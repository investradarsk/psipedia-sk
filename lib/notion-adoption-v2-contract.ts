import type { AdoptionD1Database, AdoptionD1Statement } from "./adoption-store.ts";
import type { ManagedAdoptionInput } from "./adoption.ts";
import { commitHelpV2AdminEdit } from "./notion-help-v2-admin-receipts.ts";

/** All existing mirrored adoption fields, except Admin-owned slug/status.
 * Column names are static; relation IDs and dependent media/search fields are
 * handled by the canonical writer, never accepted as arbitrary Notion keys. */
export const ADOPTION_V2_FIELDS = {
  "Meno": ["name","name"], "Dátum narodenia": ["birth_date","birthDate"],
  "Vek mesiace": ["approximate_age_months","approximateAgeMonths"],
  "Pohlavie": ["sex","sex"], "Veľkosť": ["size","size"], "Hmotnosť": ["weight","weight"],
  "Plemeno": ["breed_name","breedName"], "Kríženec": ["breed_mix","breedMix"],
  "Farba": ["color","color"], "Mesto": ["city","city"], "Okres": ["district","district"],
  "Kraj": ["region","region"], "Organizácia": ["organization_name","organizationName"],
  "Krátky popis": ["short_description","shortDescription"], "Popis": ["description","description"],
  "Povaha": ["temperament","temperament"], "Aktivita": ["activity_level","activityLevel"],
  "Zdravotné poznámky": ["health_notes","healthNotes"], "Špeciálne potreby": ["special_needs","specialNeeds"],
  "Vhodný k deťom": ["suitable_for_children","suitableForChildren"],
  "Vhodný k psom": ["suitable_for_dogs","suitableForDogs"],
  "Vhodný k mačkám": ["suitable_for_cats","suitableForCats"],
  "Vhodný k iným zvieratám": ["suitable_for_other_animals","suitableForOtherAnimals"],
  "Očkovanie": ["vaccination_status","vaccinationStatus"], "Podmienky adopcie": ["adoption_requirements","adoptionRequirements"],
  "Kontaktný e-mail": ["contact_email","contactEmail"], "Kontaktný telefón": ["contact_phone","contactPhone"],
  "Kontaktný odkaz": ["contact_url","contactUrl"], "Hlavný obrázok URL": ["main_image","mainImage"],
  "Zdroj dát": ["external_source_url","externalSourceUrl"],
} as const satisfies Record<string,readonly [string,keyof ManagedAdoptionInput]>;
export type AdoptionV2Field=keyof typeof ADOPTION_V2_FIELDS;
export function isAdoptionV2Field(field:string):field is AdoptionV2Field {return Object.hasOwn(ADOPTION_V2_FIELDS,field);}
export function adoptionV2Value(field:AdoptionV2Field,value:unknown):unknown {
  if(field==="Vek mesiace"||field==="Hmotnosť")return value==null||value===""?null:Number(value);
  if(field==="Kríženec")return value===true||value===1||value==="1";
  const text=typeof value==="string"?value.trim():value==null?"":String(value).trim();
  return field==="Hlavný obrázok URL"&&text.startsWith("/")?"https://psipedia.sk"+text:text;
}
const projection="json_object("+Object.entries(ADOPTION_V2_FIELDS).map(([field,[column]])=>{
  const cell="p."+column, trimmed="trim(COALESCE("+cell+",''))";
  const expression=field==="Kríženec"?"json(CASE WHEN "+cell+"=1 THEN 'true' ELSE 'false' END)"
    :field==="Vek mesiace"||field==="Hmotnosť"?cell
    :field==="Hlavný obrázok URL"?"CASE WHEN substr("+trimmed+",1,1)='/' THEN 'https://psipedia.sk'||"+trimmed+" ELSE "+trimmed+" END"
    :trimmed;
  return "'"+field+"',"+expression;
}).join(",")+")";

export function commitAdoptionV2AdminEdit(database:AdoptionD1Database,statement:AdoptionD1Statement,
  input:{id:number;expectedRevision:string;nextRevision:string;editor:string;companionStatements?:readonly D1PreparedStatement[]}) {
  return commitHelpV2AdminEdit(database,statement,{...input,agenda:"adoptions",table:"adoption_dogs",projection});
}
