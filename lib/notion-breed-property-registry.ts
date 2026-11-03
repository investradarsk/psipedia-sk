/**
 * Exact 109-property Notion Plemená schema snapshot (2026-11-03).
 * This registry is shared by Admin settings, the per-field sync engine and
 * schema drift checks. System fields are always visible but never overwritten
 * by the editorial priority selector.
 *
 * content = real managed_breeds property (may be nested e.g. fciStandard.oci)
 * extra   = workflow/media metadata mirrored into D1's sync companion store
 * aggregate = JSON exchange view; leaf subfields have the actual priority
 * system  = identity, publication or synchronization output
 */
export const BREED_NOTION_SCHEMA = [
  {
    "notion": "Alt text obrázka",
    "id": "extra.imageAlt",
    "type": "text",
    "mode": "extra"
  },
  {
    "notion": "Byt",
    "id": "apartment",
    "type": "number",
    "mode": "content"
  },
  {
    "notion": "Deti",
    "id": "children",
    "type": "number",
    "mode": "content"
  },
  {
    "notion": "Dĺžka života",
    "id": "lifespan",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Editorial complete",
    "id": "editorialComplete",
    "type": "checkbox",
    "mode": "content"
  },
  {
    "notion": "Energia",
    "id": "energy",
    "type": "number",
    "mode": "content"
  },
  {
    "notion": "Farba akcentu",
    "id": "accent",
    "type": "select",
    "mode": "content"
  },
  {
    "notion": "FCI celkový vzhľad",
    "id": "fciStandard.celkovy_vzhlad",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI číslo",
    "id": "system.FCI číslo",
    "type": "number",
    "mode": "system"
  },
  {
    "notion": "FCI diskvalifikačné chyby",
    "id": "fciStandard.diskvalifikacne_chyby",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI farba",
    "id": "fciStandard.farba",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI historický súhrn",
    "id": "fciStandard.historicky_suhrn",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI hmotnosť pes kg",
    "id": "fciStandard.hmotnost_pes_kg",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI hmotnosť suka kg",
    "id": "fciStandard.hmotnost_suka_kg",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI chov poznámka",
    "id": "fciStandard.poznamka_chov",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI chvost",
    "id": "fciStandard.chvost",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI chyby",
    "id": "fciStandard.chyby",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI koža",
    "id": "fciStandard.koza",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI krk",
    "id": "fciStandard.krk",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI lebka",
    "id": "fciStandard.hlava_lebecna_cast",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI nomenklatúra URL",
    "id": "fciStandard.fci_nomenklatura_url",
    "type": "url",
    "mode": "content"
  },
  {
    "notion": "FCI oči",
    "id": "fciStandard.oci",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI pohyb",
    "id": "fciStandard.pohyb",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI povaha a temperament",
    "id": "fciStandard.povaha_temperament",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI predné končatiny",
    "id": "fciStandard.predne_koncatiny",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI proporcie",
    "id": "fciStandard.dolezite_proporcie",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI sekcia",
    "id": "fciSection",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI sekcia číslo",
    "id": "fciSectionNumber",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI sekcia názov",
    "id": "fciStandard.fci_sekcia_nazov",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI skupina",
    "id": "fciGroup",
    "type": "number",
    "mode": "content"
  },
  {
    "notion": "FCI skupina názov",
    "id": "fciStandard.fci_skupina_nazov",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI srsť",
    "id": "fciStandard.srst",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI status",
    "id": "fciStandard.status_fci",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI štandard JSON",
    "id": "fciStandard",
    "type": "text",
    "mode": "aggregate"
  },
  {
    "notion": "FCI štandard PDF",
    "id": "fciStandard.fci_standard_pdf",
    "type": "url",
    "mode": "content"
  },
  {
    "notion": "FCI telo",
    "id": "fciStandard.telo",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI tvár",
    "id": "fciStandard.hlava_tvarova_cast",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI uši",
    "id": "fciStandard.usi",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI veľkosť a hmotnosť poznámka",
    "id": "fciStandard.velkost_hmotnost_poznamka",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI výška pes cm",
    "id": "fciStandard.vyska_pes_cm",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI výška suka cm",
    "id": "fciStandard.vyska_suka_cm",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI využitie",
    "id": "fciStandard.vyuzitie",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI zadné končatiny",
    "id": "fciStandard.zadne_koncatiny",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI závažné chyby",
    "id": "fciStandard.zavazne_chyby",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "FCI zdroj poznámka",
    "id": "fciStandard.zdroj_poznamka",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Galéria JSON",
    "id": "gallery",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "História",
    "id": "history",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Hlavný obrázok URL",
    "id": "image",
    "type": "url",
    "mode": "content"
  },
  {
    "notion": "Hmotnosť",
    "id": "weight",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Charakter",
    "id": "character",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Import kľúč",
    "id": "system.Import kľúč",
    "type": "text",
    "mode": "system"
  },
  {
    "notion": "Iné psy",
    "id": "otherDogs",
    "type": "number",
    "mode": "content"
  },
  {
    "notion": "Intro",
    "id": "intro",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Krajina pôvodu",
    "id": "origin",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Lovecký pud",
    "id": "preyDrive",
    "type": "number",
    "mode": "content"
  },
  {
    "notion": "Meta description",
    "id": "seo.description",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Názov",
    "id": "name",
    "type": "title",
    "mode": "content"
  },
  {
    "notion": "Odborný reaudit 2026",
    "id": "extra.odbornyReaudit",
    "type": "checkbox",
    "mode": "extra"
  },
  {
    "notion": "Oficiálny FCI názov",
    "id": "officialFciName",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Platnosť FCI štandardu",
    "id": "validStandardDate",
    "type": "date",
    "mode": "content"
  },
  {
    "notion": "Pĺznutie",
    "id": "shedding",
    "type": "number",
    "mode": "content"
  },
  {
    "notion": "Pohyb",
    "id": "exercise",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Posledný sync",
    "id": "system.Posledný sync",
    "type": "date",
    "mode": "system"
  },
  {
    "notion": "Potreby",
    "id": "needs",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Poznámky",
    "id": "extra.poznamky",
    "type": "text",
    "mode": "extra"
  },
  {
    "notion": "Pracovná skúška",
    "id": "workingTrial",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Profil skvalitnený",
    "id": "extra.profilSkvalitneny",
    "type": "checkbox",
    "mode": "extra"
  },
  {
    "notion": "Psipedia ID",
    "id": "system.Psipedia ID",
    "type": "text",
    "mode": "system"
  },
  {
    "notion": "Redakcia hlavné vlastnosti JSON",
    "id": "editorial.heroTraits",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Redakcia chyby majiteľov",
    "id": "editorial.commonOwnerMistakes",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Redakcia prehľad",
    "id": "editorial.overview",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Redakcia spolužitie so psami",
    "id": "editorial.otherDogsLife",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Redakcia starostlivosť o srsť",
    "id": "editorial.coatCare",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Redakcia tip pohyb",
    "id": "editorial.exerciseTip",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Redakcia tip srsť",
    "id": "editorial.coatTip",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Redakcia tip výcvik",
    "id": "editorial.trainingTip",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Redakcia tip zdravie",
    "id": "editorial.healthTip",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Redakcia zaujímavosti",
    "id": "editorial.curiosities",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Redakcia život v rodine",
    "id": "editorial.familyLife",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Redakčné sekcie JSON",
    "id": "editorial",
    "type": "text",
    "mode": "aggregate"
  },
  {
    "notion": "Rodina",
    "id": "family",
    "type": "number",
    "mode": "content"
  },
  {
    "notion": "SEO canonical URL",
    "id": "seo.canonicalUrl",
    "type": "url",
    "mode": "content"
  },
  {
    "notion": "SEO focus keyword",
    "id": "seo.focusKeyword",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "SEO noindex",
    "id": "seo.noindex",
    "type": "checkbox",
    "mode": "content"
  },
  {
    "notion": "SEO OG description",
    "id": "seo.ogDescription",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "SEO OG title",
    "id": "seo.ogTitle",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "SEO title",
    "id": "seo.title",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Skupina",
    "id": "group",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Slug",
    "id": "system.Slug",
    "type": "text",
    "mode": "system"
  },
  {
    "notion": "Srsť",
    "id": "coat",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Starostlivosť o srsť",
    "id": "grooming",
    "type": "number",
    "mode": "content"
  },
  {
    "notion": "Stav",
    "id": "system.Stav",
    "type": "select",
    "mode": "system"
  },
  {
    "notion": "Súvisiace články ID",
    "id": "relatedArticleIds",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Súvisiace plemená ID",
    "id": "relatedBreedIds",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Súvisiace profily služieb ID",
    "id": "directoryProfileIds",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Sync chyba",
    "id": "system.Sync chyba",
    "type": "text",
    "mode": "system"
  },
  {
    "notion": "Sync stav",
    "id": "system.Sync stav",
    "type": "select",
    "mode": "system"
  },
  {
    "notion": "Športy JSON",
    "id": "sports",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Trénovateľnosť",
    "id": "trainability",
    "type": "number",
    "mode": "content"
  },
  {
    "notion": "URL Psipedia",
    "id": "system.URL Psipedia",
    "type": "url",
    "mode": "system"
  },
  {
    "notion": "Veľkosť",
    "id": "size",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Vhodné pre",
    "id": "goodFor",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Výcvik",
    "id": "training",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Výška",
    "id": "height",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Zdravie",
    "id": "health",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Zdravotné riziká",
    "id": "healthRisks",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Zdroj obrázka",
    "id": "extra.imageSourceUrl",
    "type": "url",
    "mode": "extra"
  },
  {
    "notion": "Zdroje",
    "id": "sources",
    "type": "text",
    "mode": "content"
  },
  {
    "notion": "Zvážiť",
    "id": "consider",
    "type": "text",
    "mode": "content"
  }
] as const;

export type BreedNotionEntry = (typeof BREED_NOTION_SCHEMA)[number];
export type BreedNotionEditableEntry = Extract<BreedNotionEntry,{mode:"content"|"extra"}>;
export const BREED_NOTION_PRIORITY_FIELDS = BREED_NOTION_SCHEMA
  .filter(e => e.mode==="content" || e.mode==="extra");
export const BREED_NOTION_SYSTEM_FIELDS = BREED_NOTION_SCHEMA
  .filter(e => e.mode==="system" || e.mode==="aggregate");
export function breedNotionByField(field:string) {
  return BREED_NOTION_SCHEMA.find(e=>e.id===field);
}
export function breedNotionByProperty(property:string) {
  return BREED_NOTION_SCHEMA.find(e=>e.notion===property);
}
export const BREED_FCI_COLUMNS = [
  [
    "status_fci",
    "FCI status"
  ],
  [
    "historicky_suhrn",
    "FCI historický súhrn"
  ],
  [
    "celkovy_vzhlad",
    "FCI celkový vzhľad"
  ],
  [
    "dolezite_proporcie",
    "FCI proporcie"
  ],
  [
    "povaha_temperament",
    "FCI povaha a temperament"
  ],
  [
    "hlava_lebecna_cast",
    "FCI lebka"
  ],
  [
    "hlava_tvarova_cast",
    "FCI tvár"
  ],
  [
    "oci",
    "FCI oči"
  ],
  [
    "usi",
    "FCI uši"
  ],
  [
    "krk",
    "FCI krk"
  ],
  [
    "telo",
    "FCI telo"
  ],
  [
    "chvost",
    "FCI chvost"
  ],
  [
    "predne_koncatiny",
    "FCI predné končatiny"
  ],
  [
    "zadne_koncatiny",
    "FCI zadné končatiny"
  ],
  [
    "pohyb",
    "FCI pohyb"
  ],
  [
    "koza",
    "FCI koža"
  ],
  [
    "srst",
    "FCI srsť"
  ],
  [
    "farba",
    "FCI farba"
  ],
  [
    "vyska_pes_cm",
    "FCI výška pes cm"
  ],
  [
    "vyska_suka_cm",
    "FCI výška suka cm"
  ],
  [
    "hmotnost_pes_kg",
    "FCI hmotnosť pes kg"
  ],
  [
    "hmotnost_suka_kg",
    "FCI hmotnosť suka kg"
  ],
  [
    "velkost_hmotnost_poznamka",
    "FCI veľkosť a hmotnosť poznámka"
  ],
  [
    "chyby",
    "FCI chyby"
  ],
  [
    "zavazne_chyby",
    "FCI závažné chyby"
  ],
  [
    "diskvalifikacne_chyby",
    "FCI diskvalifikačné chyby"
  ],
  [
    "poznamka_chov",
    "FCI chov poznámka"
  ],
  [
    "vyuzitie",
    "FCI využitie"
  ],
  [
    "fci_skupina_nazov",
    "FCI skupina názov"
  ],
  [
    "fci_sekcia_nazov",
    "FCI sekcia názov"
  ],
  [
    "zdroj_poznamka",
    "FCI zdroj poznámka"
  ],
  [
    "fci_nomenklatura_url",
    "FCI nomenklatúra URL"
  ],
  [
    "fci_standard_pdf",
    "FCI štandard PDF"
  ]
] as const;
export const BREED_EDITORIAL_COLUMNS = [
  [
    "overview",
    "Redakcia prehľad"
  ],
  [
    "coatCare",
    "Redakcia starostlivosť o srsť"
  ],
  [
    "familyLife",
    "Redakcia život v rodine"
  ],
  [
    "otherDogsLife",
    "Redakcia spolužitie so psami"
  ],
  [
    "curiosities",
    "Redakcia zaujímavosti"
  ],
  [
    "commonOwnerMistakes",
    "Redakcia chyby majiteľov"
  ],
  [
    "exerciseTip",
    "Redakcia tip pohyb"
  ],
  [
    "trainingTip",
    "Redakcia tip výcvik"
  ],
  [
    "healthTip",
    "Redakcia tip zdravie"
  ],
  [
    "coatTip",
    "Redakcia tip srsť"
  ]
] as const;
