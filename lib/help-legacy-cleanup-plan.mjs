// This is a guard for the FINAL historical SQL cleanup, NOT a SQL migration.
// Technical JSON columns and canonical adoption/organization tables are out of scope.
export const HELP_LEGACY_APPROVED_REMOVALS = Object.freeze([
  "ceskoslovensky-kastracny-program",
  "pomoc-mesto-dolny-kubin",
  "pomoc-mesto-handlova",
  "pomoc-mesto-malacky",
  "pomoc-mesto-martin-mestsky-urad-martin",
  "pomoc-mesto-mestsky-urad-kolarovo",
  "pomoc-mesto-revuca",
  "pomoc-mesto-skalica",
  "pomoc-obec-priepasne",
  "pomoc-td-s-r-o"
]);
export const HELP_LEGACY_EXPECTED = Object.freeze({adopcia:36,utulky:104,"stratene-a-najdene":0});
export const HELP_LEGACY_CLEANUP_CONFIRMATION = "VYMAZAT 140 HISTORICKYCH KOPII";

export function assessHelpLegacyCleanup(summary) {
  const blockers=[];
  const count=(key)=>Number.isSafeInteger(summary[key])&&summary[key]>=0?summary[key]:null;
  const adoption=count("adoption"),shelters=count("shelters"),lost=count("lost");
  const adoptionDone=count("adoptionDone"),sheltersDone=count("sheltersDone");
  if([adoption,shelters,lost,adoptionDone,sheltersDone].some(x=>x===null))
    blockers.push("UNKNOWN_COUNTS");
  else {
    if(adoption+adoptionDone!==36 || shelters+sheltersDone!==104 || lost!==0)
      blockers.push("LEGACY_COHORT_CHANGED");
  }
  for(const key of ["unmapped","unmatchedAdoptions","unexpectedShelters",
    "duplicateSlugs","partnerClaimReferences","unsupportedStatuses",
    "conflictingTombstones","notionTargetMissing"]) {
    if(count(key)!==0) blockers.push("UNSAFE_"+key.toUpperCase());
  }
  if(count("approvedRemoved")!==10) blockers.push("APPROVED_REMOVALS_CHANGED");
  const remaining=(adoption??0)+(shelters??0);
  const completed=(adoptionDone??0)+(sheltersDone??0);
  return {ready:blockers.length===0,blockers,remaining,completed,total:140};
}
