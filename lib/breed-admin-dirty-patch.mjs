/**
 * Same principle as breeder editors: an old full form is NOT an instruction
 * to overwrite every D1 field. Send and persist only actually edited paths.
 */
const ROOT_FIELDS=new Set([
  "name","slug","status","image","imageKey","gallery","fciNumber",
  "fciGroup","fciSection","fciSectionNumber","officialFciName",
  "validStandardDate","workingTrial","importKey","editorialComplete",
  "origin","group","size","weight","height","lifespan","coat",
  "energy","trainability","family","children","otherDogs","apartment",
  "grooming","shedding","preyDrive","intro","character","needs",
  "history","exercise","training","health","healthRisks","goodFor",
  "consider","sports","relatedBreedIds","relatedArticleIds",
  "directoryProfileIds","sources","accent",
]);
const NESTED={
  seo:new Set(["title","description","focusKeyword","canonicalUrl",
    "ogTitle","ogDescription","ogImage","noindex"]),
  editorial:new Set(["overview","coatCare","familyLife","otherDogsLife",
    "curiosities","commonOwnerMistakes","exerciseTip","trainingTip",
    "healthTip","coatTip","heroTraits"]),
  fciStandard:new Set([
    "celkovy_vzhlad","dolezite_proporcie","povaha_temperament",
    "hlava_lebecna_cast","hlava_tvarova_cast","oci","usi","krk","telo",
    "chvost","predne_koncatiny","zadne_koncatiny","pohyb","koza","srst",
    "farba","vyska_pes_cm","vyska_suka_cm","hmotnost_pes_kg",
    "hmotnost_suka_kg","velkost_hmotnost_poznamka","chyby",
    "zavazne_chyby","diskvalifikacne_chyby","historicky_suhrn",
    "status_fci","poznamka_chov","vyuzitie","fci_skupina_nazov",
    "fci_sekcia_nazov","zdroj_poznamka","fci_standard_pdf",
    "fci_nomenklatura_url",
  ]),
};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function breedAdminDirtyPaths(before,after) {
  const changed=[];
  for(const key of ROOT_FIELDS)
    if (!same(before?.[key],after?.[key])) changed.push(key);
  for(const [root,allowed] of Object.entries(NESTED)) {
    for(const key of allowed) {
      if (!same(before?.[root]?.[key],after?.[root]?.[key]))
        changed.push(root+"."+key);
    }
  }
  return changed;
}

export function breedAdminSparseEdit(payload,changedKeys) {
  if (!Array.isArray(changedKeys) || changedKeys.length>160 ||
      changedKeys.some(key=>typeof key!=="string"))
    throw Error("BREED_ADMIN_DIRTY_KEYS_INVALID");
  const out={};
  for(const field of new Set(changedKeys)) {
    const dot=field.indexOf(".");
    if(dot<0) {
      if (!ROOT_FIELDS.has(field) || !Object.hasOwn(payload,field))
        throw Error("BREED_ADMIN_DIRTY_FIELD_UNKNOWN");
      out[field]=payload[field];
      continue;
    }
    const root=field.slice(0,dot),key=field.slice(dot+1);
    if (!Object.hasOwn(NESTED,root) || !NESTED[root].has(key) ||
        !Object.hasOwn(payload?.[root]??{},key))
      throw Error("BREED_ADMIN_DIRTY_FIELD_UNKNOWN");
    out[root]??={};
    out[root][key]=payload[root][key];
  }
  return out;
}
