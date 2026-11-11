/**
 * Strictly allowlisted direct D1 single-field updates.
 *
 * Unlike updateManagedBreed(), these statements never rewrite a sibling,
 * never resave publication, and never delete/rebuild relation tables.
 * The caller enforces the mapped ACTIVE Notion page + Psipedia ID.
 */
export const BREED_EVENT_SCALAR_COLUMNS=Object.freeze({
  name:"name", intro:"intro", character:"character", needs:"needs",
  history:"history", exercise:"exercise", training:"training", health:"health",
  origin:"origin",group:"group_name",size:"size",weight:"weight",
  height:"height",lifespan:"lifespan",coat:"coat",accent:"accent",
  fciGroup:"fci_group",fciSection:"fci_section",
  fciSectionNumber:"fci_section_number",officialFciName:"official_fci_name",
  validStandardDate:"valid_standard_date",workingTrial:"working_trial",
  energy:"energy",trainability:"trainability",family:"family",
  children:"children",otherDogs:"other_dogs",apartment:"apartment",
  grooming:"grooming",shedding:"shedding",preyDrive:"prey_drive",
  editorialComplete:"editorial_complete",image:"image_url",
  fciNumber:"fci_number",
});
const ARRAY_COLUMNS=Object.freeze({
  gallery:"gallery_json",sports:"sports_json",
  healthRisks:"health_risks_json",goodFor:"good_for_json",
  consider:"consider_json",sources:"sources_json",
});
const JSON_ROOTS=Object.freeze({
  fciStandard:"fci_standard_json",
  editorial:"editorial_json",seo:"seo_json",
});
const JSON_KEYS=Object.freeze({
  fciStandard:new Set([
    "celkovy_vzhlad","diskvalifikacne_chyby","farba","historicky_suhrn",
    "hmotnost_pes_kg","hmotnost_suka_kg","poznamka_chov","chvost",
    "chyby","koza","krk","hlava_lebecna_cast","fci_nomenklatura_url",
    "oci","pohyb","povaha_temperament","predne_koncatiny",
    "dolezite_proporcie","fci_sekcia_nazov","fci_skupina_nazov",
    "srst","status_fci","fci_standard_pdf","telo","hlava_tvarova_cast",
    "usi","velkost_hmotnost_poznamka","vyska_pes_cm","vyska_suka_cm",
    "vyuzitie","zadne_koncatiny","zavazne_chyby","zdroj_poznamka",
  ]),
  editorial:new Set(["overview","coatCare","familyLife","otherDogsLife",
    "curiosities","commonOwnerMistakes","exerciseTip","trainingTip",
    "healthTip","coatTip","heroTraits"]),
  seo:new Set(["title","description","focusKeyword","canonicalUrl",
    "ogTitle","ogDescription","noindex"]),
});
const SEARCH_FIELDS=new Set(["name","officialFciName","origin","group","fciSection"]);
const NUMERIC_FIELDS=new Set([
  "fciNumber","fciGroup","energy","trainability","family","children",
  "otherDogs","apartment","grooming","shedding","preyDrive",
]);

/** Returns SQL fragments with positional params; never interpolate untrusted keys. */
export function breedEventD1FieldPatch(field,value,searchText) {
  if (Object.hasOwn(BREED_EVENT_SCALAR_COLUMNS,field)) {
    if (NUMERIC_FIELDS.has(field) &&
        (value!==null || field!=="fciNumber") &&
        (typeof value!=="number" || !Number.isFinite(value)))
      throw Error("BREED_EVENT_D1_NUMBER_INVALID");
    if (field==="editorialComplete" && typeof value!=="boolean")
      throw Error("BREED_EVENT_D1_CHECKBOX_INVALID");
    if (!NUMERIC_FIELDS.has(field) && field!=="editorialComplete" &&
        field!=="validStandardDate" && typeof value!=="string")
      throw Error("BREED_EVENT_D1_TEXT_INVALID");
    if (field==="validStandardDate" && value!==null && typeof value!=="string")
      throw Error("BREED_EVENT_D1_DATE_INVALID");
    const col=BREED_EVENT_SCALAR_COLUMNS[field];
    const stored=field==="editorialComplete"?(value?1:0):value;
    const assignments=[col+"=?"];
    const params=[stored];
    if (field==="image") assignments.push("image_key=NULL");
    if (SEARCH_FIELDS.has(field)) {
      if (typeof searchText!=="string") throw Error("BREED_EVENT_SEARCH_TEXT_MISSING");
      assignments.push("search_text=?");
      params.push(searchText);
    }
    return {assignments,params};
  }
  if (Object.hasOwn(ARRAY_COLUMNS,field)) {
    if (!Array.isArray(value)) throw Error("BREED_EVENT_D1_ARRAY_INVALID");
    return {assignments:[ARRAY_COLUMNS[field]+"=?"],params:[JSON.stringify(value)]};
  }
  const dot=field.indexOf(".");
  if (dot>=0) {
    const root=field.slice(0,dot), key=field.slice(dot+1);
    if (Object.hasOwn(JSON_ROOTS,root) && JSON_KEYS[root].has(key)) {
      const col=JSON_ROOTS[root];
      return {
        assignments:[col+"=json_set(COALESCE("+col+", '{}'), ?, json(?))"],
        params:["$."+key,JSON.stringify(value)],
      };
    }
  }
  throw Error("BREED_EVENT_D1_FIELD_NOT_MAPPED");
}

export function breedEventNeedsSearchRefresh(field) {
  return SEARCH_FIELDS.has(field);
}

/** Explicit route for ordinary Admin dirty fields; structural actions stay in
 * the native lifecycle/upload/relations editor. */
export function breedEventIsDirectField(field) {
  if (field==="image") return false; // Admin image upload owns the image key.
  if (Object.hasOwn(BREED_EVENT_SCALAR_COLUMNS,field) ||
      Object.hasOwn(ARRAY_COLUMNS,field)) return true;
  const dot=field.indexOf(".");
  if (dot<0) return false;
  const root=field.slice(0,dot),key=field.slice(dot+1);
  return Object.hasOwn(JSON_ROOTS,root) && JSON_KEYS[root].has(key);
}
