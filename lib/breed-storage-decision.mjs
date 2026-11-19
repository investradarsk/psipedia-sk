/** 
 * Psipedia Plemená — step 2/6, proposed canonical SQL/JSON allocation.
 *
 * DECISION ONLY. Never import this module to rewrite existing D1 rows.
 * The current physical D1 schema does not yet contain most targets.
 * The step-3 migration and step-4/5 read/write cutover must precede any
 * drop of the historic JSON columns. Each editable Notion property has one
 * target; storage type is not a separate second source of truth.
 */
export const BREED_STORAGE_VERSION = 2;
export const BREED_CANONICAL_DATABASE = "Cloudflare D1";
export const BREED_NOTION_FIELD_DESTINATIONS = Object.freeze({
  "Časté chyby majiteľov": {
    "kind": "sql",
    "table": "breed_editorial_text",
    "column": "common_owner_mistakes"
  },
  "Ďalšie fotografie": {
    "kind": "json",
    "table": "managed_breeds",
    "column": "gallery_json"
  },
  "Dĺžka života do": {
    "kind": "sql",
    "table": "breed_public_facts",
    "column": "lifespan_max_years"
  },
  "Dĺžka života od": {
    "kind": "sql",
    "table": "breed_public_facts",
    "column": "lifespan_min_years"
  },
  "Editorial complete – redakčne overený profil": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "editorial_complete"
  },
  "Energia": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "energy"
  },
  "FCI celkový vzhľad": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_celkovy_vzhlad"
  },
  "FCI číslo": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "fci_number"
  },
  "FCI diskvalifikačné chyby": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_diskvalifikacne_chyby"
  },
  "FCI farba": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_farba"
  },
  "FCI historický súhrn": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_historicky_suhrn"
  },
  "FCI hmotnosť pes kg": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_hmotnost_pes_kg"
  },
  "FCI hmotnosť suka kg": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_hmotnost_suka_kg"
  },
  "FCI chov poznámka": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_poznamka_chov"
  },
  "FCI chvost": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_chvost"
  },
  "FCI chyby": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_chyby"
  },
  "FCI koža": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_koza"
  },
  "FCI krk": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_krk"
  },
  "FCI lebka": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_hlava_lebecna_cast"
  },
  "FCI nomenklatúra URL": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_fci_nomenklatura_url"
  },
  "FCI oči": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_oci"
  },
  "FCI pohyb": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_pohyb"
  },
  "FCI povaha a temperament": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_povaha_temperament"
  },
  "FCI predné končatiny": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_predne_koncatiny"
  },
  "FCI proporcie": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_dolezite_proporcie"
  },
  "FCI sekcia": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "fci_section_number"
  },
  "FCI sekcia názov": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_fci_sekcia_nazov"
  },
  "FCI skupina": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "fci_group"
  },
  "FCI skupina názov": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_fci_skupina_nazov"
  },
  "FCI srsť": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_srst"
  },
  "FCI status": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_status_fci"
  },
  "FCI štandard PDF": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_fci_standard_pdf"
  },
  "FCI telo": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_telo"
  },
  "FCI tvár": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_hlava_tvarova_cast"
  },
  "FCI uši": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_usi"
  },
  "FCI veľkosť a hmotnosť poznámka": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_velkost_hmotnost_poznamka"
  },
  "FCI výška pes cm": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_vyska_pes_cm"
  },
  "FCI výška suka cm": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_vyska_suka_cm"
  },
  "FCI využitie": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_vyuzitie"
  },
  "FCI zadné končatiny": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_zadne_koncatiny"
  },
  "FCI závažné chyby": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_zavazne_chyby"
  },
  "FCI zdroj poznámka": {
    "kind": "sql",
    "table": "breed_fci_standard",
    "column": "fci_zdroj_poznamka"
  },
  "História a pôvod plemena": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "history"
  },
  "Historické číslo FCI skupiny": {
    "kind": "notion-only",
    "table": null,
    "column": null,
    "notes": "Historické alebo identifikačné/metadátové pole – neduplikuje sa v novom verejnom D1 modeli"
  },
  "Historický opis dĺžky života": {
    "kind": "notion-only",
    "table": null,
    "column": null,
    "notes": "Historické alebo identifikačné/metadátové pole – neduplikuje sa v novom verejnom D1 modeli"
  },
  "Historický opis FCI sekcie": {
    "kind": "notion-only",
    "table": null,
    "column": null,
    "notes": "Historické alebo identifikačné/metadátové pole – neduplikuje sa v novom verejnom D1 modeli"
  },
  "Historický opis hmotnosti": {
    "kind": "notion-only",
    "table": null,
    "column": null,
    "notes": "Historické alebo identifikačné/metadátové pole – neduplikuje sa v novom verejnom D1 modeli"
  },
  "Historický opis krajiny pôvodu": {
    "kind": "notion-only",
    "table": null,
    "column": null,
    "notes": "Historické alebo identifikačné/metadátové pole – neduplikuje sa v novom verejnom D1 modeli"
  },
  "Historický opis veľkosti": {
    "kind": "notion-only",
    "table": null,
    "column": null,
    "notes": "Historické alebo identifikačné/metadátové pole – neduplikuje sa v novom verejnom D1 modeli"
  },
  "Historický opis výšky": {
    "kind": "notion-only",
    "table": null,
    "column": null,
    "notes": "Historické alebo identifikačné/metadátové pole – neduplikuje sa v novom verejnom D1 modeli"
  },
  "Hmotnosť do": {
    "kind": "sql",
    "table": "breed_public_facts",
    "column": "weight_max_kg"
  },
  "Hmotnosť od": {
    "kind": "sql",
    "table": "breed_public_facts",
    "column": "weight_min_kg"
  },
  "Každodenné potreby plemena": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "needs"
  },
  "Krajiny pôvodu": {
    "kind": "json",
    "table": "breed_public_facts",
    "column": "origin_countries_json"
  },
  "Krátky úvod v hero (2–4 vety)": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "intro"
  },
  "Lovecký inštinkt": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "prey_drive"
  },
  "Meta description": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "seo_description"
  },
  "Na čo si dať pozor — jedna položka na riadok": {
    "kind": "json",
    "table": "managed_breeds",
    "column": "consider_json"
  },
  "Náročnosť starostlivosti": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "grooming"
  },
  "Názov plemena": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "name"
  },
  "Oficiálny FCI názov": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "official_fci_name"
  },
  "Opis srsti": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "coat"
  },
  "Pĺznutie": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "shedding"
  },
  "Potreba pohybu": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "exercise"
  },
  "Povaha a temperament": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "character"
  },
  "Pre koho sa hodí — jedna položka na riadok": {
    "kind": "json",
    "table": "managed_breeds",
    "column": "good_for_json"
  },
  "Prehľad plemena": {
    "kind": "sql",
    "table": "breed_editorial_text",
    "column": "overview"
  },
  "Psipedia ID": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "id"
  },
  "SEO title": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "seo_title"
  },
  "Spolužitie so psami": {
    "kind": "sql",
    "table": "breed_editorial_text",
    "column": "other_dogs_life"
  },
  "Starostlivosť o srsť": {
    "kind": "sql",
    "table": "breed_editorial_text",
    "column": "coat_care"
  },
  "Športy a aktivity": {
    "kind": "json",
    "table": "managed_breeds",
    "column": "sports_json"
  },
  "Titulná fotografia (JPG, PNG, WebP alebo AVIF do 8 MB)": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "image_url"
  },
  "Trénovateľnosť": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "trainability"
  },
  "Typ srsti": {
    "kind": "json",
    "table": "breed_public_facts",
    "column": "coat_types_json"
  },
  "Typické zdravotné riziká — jedna položka na riadok": {
    "kind": "json",
    "table": "managed_breeds",
    "column": "health_risks_json"
  },
  "URL profil / slug": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "slug"
  },
  "Veľkosť": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "size"
  },
  "Vhodnosť do bytu": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "apartment"
  },
  "Výcvik": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "training"
  },
  "Výška do": {
    "kind": "sql",
    "table": "breed_public_facts",
    "column": "height_max_cm"
  },
  "Výška od": {
    "kind": "sql",
    "table": "breed_public_facts",
    "column": "height_min_cm"
  },
  "Využitie": {
    "kind": "json",
    "table": "breed_public_facts",
    "column": "use_types_json"
  },
  "Vzťah k deťom": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "children"
  },
  "Vzťah k iným psom": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "other_dogs"
  },
  "Zaujímavosti": {
    "kind": "sql",
    "table": "breed_editorial_text",
    "column": "curiosities"
  },
  "Zdravie a prevencia": {
    "kind": "sql",
    "table": "managed_breeds",
    "column": "health"
  },
  "Zdroje": {
    "kind": "json",
    "table": "managed_breeds",
    "column": "sources_json"
  },
  "Zdrojový profil Notion": {
    "kind": "notion-only",
    "table": null,
    "column": null,
    "notes": "Historické alebo identifikačné/metadátové pole – neduplikuje sa v novom verejnom D1 modeli"
  },
  "Život v rodine": {
    "kind": "sql",
    "table": "breed_editorial_text",
    "column": "family_life"
  }
});
export const BREED_JSON_COLUMN_DECISIONS = Object.freeze({
  "gallery_json": {
    "action": "retain-json",
    "reason": "Gallery is empty today but upload/editor/public feature remains active; keep functionality."
  },
  "fci_standard_json": {
    "action": "move-to-sql",
    "target": "breed_fci_standard",
    "reason": "33 independently editable FCI keys; Notion field-level sync"
  },
  "editorial_json": {
    "action": "move-to-sql",
    "target": "breed_editorial_text",
    "reason": "Six public editorial keys independently editable; five legacy keys require reader audit before retire"
  },
  "sports_json": {
    "action": "retain-json",
    "reason": "333 items; one list field in Notion, save as complete list"
  },
  "related_breeds_json": {
    "action": "move-to-relations",
    "target": "breed_related_breeds",
    "reason": "6 existing edges need id-preserving transfer"
  },
  "health_risks_json": {
    "action": "retain-json",
    "reason": "706 list entries; complete-list editing"
  },
  "good_for_json": {
    "action": "retain-json",
    "reason": "657 list entries; complete-list editing"
  },
  "consider_json": {
    "action": "retain-json",
    "reason": "633 list entries; complete-list editing"
  },
  "sources_json": {
    "action": "retain-json",
    "reason": "25 source entries; complete-list editing"
  },
  "seo_json": {
    "action": "move-to-sql",
    "target": "managed_breeds.seo_*",
    "reason": "Noindex and canonical affect SQL eligibility and indexability"
  }
});
export const BREED_ADDITIONAL_CANONICAL_SQL_FIELDS = Object.freeze({
  "managed_breeds": [
    "id",
    "slug",
    "name",
    "status",
    "image_url",
    "image_key",
    "fci_number",
    "fci_group",
    "fci_section_number",
    "official_fci_name",
    "valid_standard_date",
    "working_trial",
    "import_key",
    "search_text",
    "editorial_complete",
    "origin",
    "group_name",
    "size",
    "weight",
    "height",
    "lifespan",
    "coat",
    "energy",
    "trainability",
    "family",
    "children",
    "other_dogs",
    "apartment",
    "grooming",
    "shedding",
    "prey_drive",
    "intro",
    "character",
    "needs",
    "history",
    "exercise",
    "training",
    "health",
    "accent",
    "created_at",
    "updated_at",
    "published_at",
    "created_by",
    "updated_by",
    "seo_title",
    "seo_description",
    "seo_focus_keyword",
    "seo_canonical_url",
    "seo_og_title",
    "seo_og_description",
    "seo_noindex"
  ],
  "breed_editorial_text": [
    "overview",
    "coat_care",
    "family_life",
    "other_dogs_life",
    "curiosities",
    "common_owner_mistakes"
  ],
  "breed_fci_standard": [
    "fci_status_fci",
    "fci_historicky_suhrn",
    "fci_celkovy_vzhlad",
    "fci_dolezite_proporcie",
    "fci_povaha_temperament",
    "fci_hlava_lebecna_cast",
    "fci_hlava_tvarova_cast",
    "fci_oci",
    "fci_usi",
    "fci_krk",
    "fci_telo",
    "fci_chvost",
    "fci_predne_koncatiny",
    "fci_zadne_koncatiny",
    "fci_pohyb",
    "fci_koza",
    "fci_srst",
    "fci_farba",
    "fci_vyska_pes_cm",
    "fci_vyska_suka_cm",
    "fci_hmotnost_pes_kg",
    "fci_hmotnost_suka_kg",
    "fci_velkost_hmotnost_poznamka",
    "fci_chyby",
    "fci_zavazne_chyby",
    "fci_diskvalifikacne_chyby",
    "fci_poznamka_chov",
    "fci_vyuzitie",
    "fci_fci_skupina_nazov",
    "fci_fci_sekcia_nazov",
    "fci_zdroj_poznamka",
    "fci_fci_nomenklatura_url",
    "fci_fci_standard_pdf"
  ],
  "breed_public_facts": [
    "height_min_cm",
    "height_max_cm",
    "weight_min_kg",
    "weight_max_kg",
    "lifespan_min_years",
    "lifespan_max_years"
  ]
});
export const BREED_CANONICAL_JSON_FIELDS = Object.freeze({
  "managed_breeds": [
    "gallery_json",
    "sports_json",
    "health_risks_json",
    "good_for_json",
    "consider_json",
    "sources_json"
  ],
  "breed_public_facts": [
    "origin_countries_json",
    "coat_types_json",
    "use_types_json"
  ]
});
export const BREED_RELATIONAL_FIELDS = Object.freeze({
  "relatedBreedIds": {
    "table": "breed_related_breeds",
    "key": "breed_id",
    "targetKey": "related_breed_id",
    "position": "position",
    "source": "managed_breeds.related_breeds_json (6 current edges)"
  },
  "relatedArticleIds": {
    "table": "breed_article_relations",
    "key": "breed_id",
    "targetKey": "article_id",
    "existing": true
  },
  "directoryProfileIds": {
    "table": "breed_directory_relations",
    "key": "breed_id",
    "targetKey": "profile_id",
    "existing": true
  }
});
export const BREED_SYNC_CUTOVER_POLICY = Object.freeze({
identity:"Psipedia ID; verify signed Notion workcopy page link, slug/FCI are editable attributes",
authority:"D1 holds public canonical values; Notion/Admin are per-field writers",
conflicts:"Newest verified per-field change wins; no whole-record overwrites",
missingNotionField:"Leave D1 value unchanged, never clear a field merely because a Notion property is absent",
emptyNotionField:"Only explicit verified edit may clear a value; distinguish missing from intentional empty",
jsonArrayWrite:"Replace only the named list field, with per-field revision/check to prevent sibling overwrite",
jsonObjectWrite:"For staged legacy SEO/FCI/editorial JSON, JSON_SET on one verified path, not rewrite whole blob",
syncReceipts:"Keep retry/ack/revision metadata separate; not a second public value source",
controlled:"Resolve 12 controlled properties into one D1 canonical destination; retire controlled values_json canonical duplication only after cutover",
preserve347:"Do not delete extra 3 D1 rows during the 344 Notion-linked import; reconcile identity first",
deployOrder:["additive SQL schema","shadow backfill/read-only parity","switch public readers","switch Admin and Notion field writers","verify live end-to-end","drop duplicated legacy columns and fallbacks"],
});
