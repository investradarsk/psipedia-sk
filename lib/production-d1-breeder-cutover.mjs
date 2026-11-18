/** Temporary, explicit maintenance guard, never part of automatic deployment. */
const category = "('chovatelske-stanice','chovatelske-kluby')";
const scope = row => `EXISTS (SELECT 1 FROM directory_profiles WHERE id=${row}.profile_id AND category IN ${category})`;
const blocked = "BEGIN SELECT RAISE(ABORT,'BREEDER_RELATIONS_CUTOVER_FROZEN'); END";
const trigger = (name, timing, table, when) => ({
  name, table, sql:`CREATE TRIGGER ${name} BEFORE ${timing} ON ${table}${when ? " WHEN "+when : ""} ${blocked}`,
});
const legacy = row => `CASE WHEN json_valid(${row}.source_data_json) THEN json_extract(${row}.source_data_json,'$."_psipedia_breeder_club_profile_ids"') ELSE NULL END`;
export const FREEZE_TRIGGERS = Object.freeze([
  trigger("psipedia_breeder_cutover_breed_insert","INSERT","breed_directory_relations",scope("NEW")),
  trigger("psipedia_breeder_cutover_breed_update","UPDATE","breed_directory_relations",scope("OLD")+" OR "+scope("NEW")),
  trigger("psipedia_breeder_cutover_club_insert","INSERT","directory_breeder_club_relations",""),
  trigger("psipedia_breeder_cutover_club_update","UPDATE","directory_breeder_club_relations",""),
  trigger("psipedia_breeder_cutover_legacy_update","UPDATE OF source_data_json","directory_profiles",
    "(OLD.category='chovatelske-stanice' OR NEW.category='chovatelske-stanice') AND ("+legacy("OLD")+") IS NOT ("+legacy("NEW")+")"),
  trigger("psipedia_breeder_cutover_legacy_insert","INSERT","directory_profiles",
    "NEW.category='chovatelske-stanice' AND ("+legacy("NEW")+") IS NOT NULL"),
]);
export const SCOPE = "SELECT id FROM directory_profiles WHERE category IN ('chovatelske-stanice','chovatelske-kluby')";
const snapshot = predicate => "SELECT COALESCE(json_group_array(json_array(breed_id,profile_id,relation_type,source,created_at,created_by)),'[]') FROM (SELECT breed_id,profile_id,relation_type,source,created_at,created_by FROM breed_directory_relations WHERE "+predicate+" ORDER BY profile_id,breed_id)";
export const SNAPSHOT = snapshot("profile_id IN ("+SCOPE+")");
export const OUTSIDE = snapshot("profile_id NOT IN ("+SCOPE+")");
export const GUARDED_RESET_SQL = "DELETE FROM breed_directory_relations WHERE profile_id IN ("+SCOPE+") AND (SELECT COUNT(*) FROM directory_breeder_club_relations)=0 AND ("+SNAPSHOT+")=? AND ("+OUTSIDE+")=?";
const canonical = s => String(s??"").trim().replace(/;\s*$/,"").replace(/\s+/g," ");
export function inspectFreeze(rows) {
  const byName=new Map(FREEZE_TRIGGERS.map(t=>[t.name,t]));
  for(const r of rows){
    const expected=byName.get(r.name);
    if(!expected || r.tbl_name!==expected.table || canonical(r.sql)!==canonical(expected.sql))
      throw Error("UNEXPECTED_CUTOVER_TRIGGER");
  }
  return FREEZE_TRIGGERS.filter(t=>!rows.some(r=>r.name===t.name));
}
