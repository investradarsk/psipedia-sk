/** Known historical workcopy concatenation only. Never strip unknown or changed
 * content. All suffixes must already survive in independent canonical fields;
 * mapped Notion siblings must also contain the exact same value. */
const suffixes = Object.freeze({
  "editorial.coatCare":{"Praktický tip k srsti":"editorial.coatTip"},
  exercise:{"Praktický tip k pohybu":"editorial.exerciseTip"},
  training:{"Pôvodné využitie podľa FCI":"fciStandard.vyuzitie","Pracovná skúška":"workingTrial","Praktický tip k výcviku":"editorial.trainingTip"},
  "fciStandard.hlava_lebecna_cast":{"Oči podľa FCI":"fciStandard.oci","Tvárová časť podľa FCI":"fciStandard.hlava_tvarova_cast","Uši podľa FCI":"fciStandard.usi"},
  "fciStandard.telo":{"Chvost podľa FCI":"fciStandard.chvost","Krk podľa FCI":"fciStandard.krk"},
  "fciStandard.zdroj_poznamka":{"Chov podľa FCI":"fciStandard.poznamka_chov","FCI nomenklatúra – zdroj":"fciStandard.fci_nomenklatura_url","Názov skupiny FCI":"fciStandard.fci_skupina_nazov","Stav plemena podľa FCI":"fciStandard.status_fci","Veľkosť a hmotnosť podľa FCI":"fciStandard.velkost_hmotnost_poznamka","Dátum platnosti štandardu FCI":"validStandardDate"},
});
const historical=new Set(["editorial.coatTip","editorial.exerciseTip","editorial.trainingTip","workingTrial","validStandardDate"]);
export function isLegacyBreedDuplicate(field,remote,local,canonical,notionSiblings) {
  if(!Object.hasOwn(suffixes,field)||typeof local!=="string"||!local.trim()||typeof remote!=="string"||!remote.startsWith(local+" — "))return false;
  const parts=remote.slice(local.length+3).split(" — ");
  const used=new Set();
  for(const part of parts){
    const index=part.indexOf(": ");
    if(index<1)return false;
    const label=part.slice(0,index), value=part.slice(index+2), target=suffixes[field][label];
    if(!Object.hasOwn(suffixes[field],label)||used.has(target)||!value.trim()||canonical[target]!==value)return false;
    if(!historical.has(target)&&notionSiblings[target]!==value)return false;
    used.add(target);
  }
  return used.size>0;
}
