import { directoryCategories } from "@/lib/directory";
import { BREED_NOTION_EDITABLE_FIELDS } from "@/lib/notion-breed-field-delta";
import { agendaEditableFields } from "@/lib/notion-events-help-adapters";

/** Hardcoded allowlist. Values are NEVER untrusted database field names. */
export const NOTION_FIELD_MODES = ["safe", "notion", "admin", "latest"] as const;
export type NotionFieldMode = (typeof NOTION_FIELD_MODES)[number];
export type NotionAuthorityGroup = {
  scope: string; title: string; family: string; active: boolean;
  fields: ReadonlyArray<{ id: string; label: string; notionLabel?: string; locked?: boolean; note?: string }>;
};

const breedLabels: Record<string, string> = {
  name:"Názov", fciGroup:"FCI skupina", fciSection:"FCI sekcia",
  fciSectionNumber:"FCI sekcia číslo", officialFciName:"Oficiálny FCI názov",
  validStandardDate:"Platnosť FCI štandardu", workingTrial:"Pracovná skúška",
  origin:"Krajina pôvodu", group:"Skupina", size:"Veľkosť",
  weight:"Hmotnosť", height:"Výška", lifespan:"Dĺžka života",
  coat:"Srsť", energy:"Energia", trainability:"Trénovateľnosť",
  family:"Rodina", children:"Deti", otherDogs:"Iné psy",
  apartment:"Byt", grooming:"Starostlivosť o srsť", shedding:"Pĺznutie",
  preyDrive:"Lovecký pud", intro:"Úvod", character:"Charakter",
  needs:"Potreby", history:"História", exercise:"Pohyb", training:"Výcvik",
  health:"Zdravie", healthRisks:"Zdravotné riziká",
  goodFor:"Vhodné pre", consider:"Zvážiť", sources:"Zdroje",
  "seo.title":"SEO title", "seo.description":"Meta description",
};
const directoryLabels: Record<string, string> = {
  name:"Názov", excerpt:"Krátky popis", description:"O službe",
  qualifications:"Kvalifikácie", region:"Kraj", district:"Okres",
  city:"Mesto", address:"Adresa", postalCode:"PSČ",
  street:"Ulica", houseNumber:"Číslo domu", addressFormat:"Formát adresy",
  priceNote:"Cena a poznámka", websiteUrl:"Web",
  publicPhone:"Telefón", publicEmail:"E-mail",
  facebookUrl:"Facebook", instagramUrl:"Instagram",
  "seo.title":"SEO title", "seo.description":"Meta description",
};
const directoryNotionNames: Record<string,string> = {
  name:"Názov",excerpt:"Perex",description:"Popis",
  qualifications:"Kvalifikácie",region:"Kraj",district:"Okres",
  city:"Mesto",address:"Adresa",postalCode:"PSČ",street:"Ulica",
  houseNumber:"Číslo domu",addressFormat:"Formát adresy",
  priceNote:"Cena / poznámka",websiteUrl:"Web",
  publicPhone:"Telefón",publicEmail:"E-mail",facebookUrl:"Facebook",
  instagramUrl:"Instagram","seo.title":"SEO title","seo.description":"SEO popis",
};
const lockedDirectoryFields = [
  {id:"slug", label:"Slug a identita",locked:true,note:"Nemenná identita profilu"},
  {id:"status",label:"Publikovanie",locked:true,note:"Výhradne Admin"},
  {id:"services",label:"Katalóg poskytovaných služieb V3",locked:true,note:"Výhradne Admin/D1"},
  {id:"googlePlaceId",label:"Potvrdený Google Place ID",locked:true,note:"Google Maps má prednosť"},
] as const;
export const NOTION_AUTHORITY_GROUPS: readonly NotionAuthorityGroup[] = [
  {scope:"breeds",title:"Plemená",family:"Obsah",active:true,
    fields:BREED_NOTION_EDITABLE_FIELDS.map(id=>({id,label:breedLabels[id]??id,
      notionLabel:id==='intro'?'Intro':breedLabels[id]??id}))},
  ...directoryCategories.map(category=>({
    scope:"directory:"+category.slug,title:category.label,family:"Služby pre psov",active:true,
    fields:[...Object.entries(directoryLabels).map(([id,label])=>({id,label,notionLabel:directoryNotionNames[id]??label})), ...lockedDirectoryFields],
  })),
  {scope:"service-catalog",title:"Katalóg služieb V3",family:"Služby pre psov",active:false,
    fields:["Option ID","Verzia","Typ","Názov","Skupina","Význam","Hlavná kategória","Kategórie","Druh hodnoty"]
      .map(name=>({id:name,label:name,notionLabel:name,locked:true,note:"Jednosmerné Admin/D1 → Notion"}))},
  ...([
    ["articles","Články","Obsah",["Názov","Slug","Kategória","Podsekcia","Typ obsahu","Stav",
      "Odoslať na Psipedia","Obsah (bloky stránky)","Intro","SEO title","Meta description",
      "Hlavné kľúčové slovo","Popis na sociálne siete","Titulný obrázok","Hlavný obrázok URL",
      "Psipedia ID","Sync stav","Sync chyba"]],
    ["eshops","E-shopy","Recenzie a testy",["Názov","Slug","Psipedia stav","Web","Popis",
      "Zdroj","Logo URL","Psipedia ID","Počet hodnotení","Sync stav","Sync chyba"]],
    ["facebook-images","Facebook obrázky","Facebook",["Názov","Text na Facebook","Obrázok",
      "Stav","Povoliť publikovanie","Súhlas majiteľa – priame publikovanie",
      "Dátum a čas publikovania","Publikované o","Facebook Post ID","Facebook URL",
      "Chyba publikovania"]],
  ] as const).map(([scope,title,family,names])=>({
    scope,title,family,active:false,
    fields:names.map(name=>({id:name,label:name,notionLabel:name,locked:true,
      note:scope==="articles"&&name==="Obsah (bloky stránky)"?"Obsah tvoria samostatné Notion bloky":undefined})),
  })),
  ...([
    ["events","Podujatia","Podujatia"],
    ["organizations","Organizácie","Pomoc psom"],
    ["adoptions","Adopcie","Pomoc psom"],
    ["help-cases","Pomoc psom – prípady","Pomoc psom"],
    ["lost-found","Stratené a nájdené","Pomoc psom"],
  ] as const).map(([scope,title,family])=>({
    scope,title,family,active:false,
    fields:agendaEditableFields[scope].map(name=>({
      id:name,label:name,notionLabel:name,locked:true,
      note:"Mapované pole; pravidlá synchronizácie určuje existujúci synchronizátor",
    })),
  })),
];

export function editableNotionField(scope:string,field:string) {
  const group=NOTION_AUTHORITY_GROUPS.find(g=>g.scope===scope && g.active);
  return Boolean(group?.fields.some(f=>f.id===field&&!f.locked));
}
export function validNotionMode(value:unknown): value is NotionFieldMode {
  return typeof value==="string" && (NOTION_FIELD_MODES as readonly string[]).includes(value);
}
export async function readNotionFieldAuthorities(
  db:D1Database,scope:string,
):Promise<Record<string,NotionFieldMode>> {
  if (!NOTION_AUTHORITY_GROUPS.some(g=>g.scope===scope&&g.active)) return {};
  // Before migration 0147, keep existing safe behavior; settings API reports not ready.
  const exists=await db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type='table' AND name='notion_field_authority' LIMIT 1").first();
  if (!exists) return {};
  const rows=await db.prepare("SELECT field_key,mode FROM notion_field_authority WHERE scope=?").bind(scope)
    .all<{field_key:string;mode:string}>();
  const result:Record<string,NotionFieldMode>={};
  for (const row of rows.results??[]) if (editableNotionField(scope,row.field_key)&&validNotionMode(row.mode)) result[row.field_key]=row.mode;
  return result;
}
