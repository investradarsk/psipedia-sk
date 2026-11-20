/** Explicit free-text extra Directory SQL write. Never import stale JSON.
 * One relational row is authoritative even for an explicit empty string.
 * Omitted fields are not mirrored.
 */
type Identity =
 | {kind:"id";profileId:number;updatedAt:string;actor:string}
 | {kind:"category-slug";category:string;slug:string;updatedAt:string;actor:string};
export function planDirectoryExtraSqlTextMirror(input:{
  identity:Identity;fieldKey:string;value:string|undefined;
}) {
  if(input.value===undefined)return [] as {sql:string;bindings:Array<string|number>}[];
  if(typeof input.value!=="string"||input.value.length>120000||
    !input.fieldKey||input.fieldKey.length>200)
    throw Error("DIRECTORY_EXTRA_SQL_INVALID_VALUE");
  const id=input.identity;
  if(!id.actor||!id.updatedAt||
    (id.kind==="id" ? !Number.isSafeInteger(id.profileId)||id.profileId<1
      : !id.category||!id.slug))throw Error("DIRECTORY_EXTRA_SQL_INVALID_IDENTITY");
  const guard=id.kind==="id"
    ? "p.id=? AND p.updated_at=? AND p.updated_by=?"
    : "p.category=? AND p.slug=? AND p.updated_at=? AND p.updated_by=?";
  const args:Array<string|number>=id.kind==="id"
    ? [id.profileId,id.updatedAt,id.actor]
    : [id.category,id.slug,id.updatedAt,id.actor];
  return [{
    sql:"INSERT INTO directory_profile_extra_fields "+
      "(profile_id,field_key,value_kind,text_value,number_value,updated_at,updated_by) "+
      "SELECT p.id,?,'text',?,NULL,?,? FROM directory_profiles p WHERE "+guard+" "+
      "ON CONFLICT(profile_id,field_key) DO UPDATE SET "+
      "value_kind=excluded.value_kind,text_value=excluded.text_value,"+
      "number_value=NULL,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
    bindings:[input.fieldKey,input.value,id.updatedAt,id.actor,...args],
  }];
}
