/**
 * Adresár SQL cutover 3/4 — forward-only transactional sidecar writes.
 *
 * Called only after the matching canonical directory_profiles INSERT/UPDATE
 * in the SAME D1 batch. Both identity revision and actor must still match.
 * Never mark a STAGED receipt VERIFIED/SQL_ONLY and never import legacy JSON.
 * No opinion about per-field Notion authority is made by this planner.
 */
import type { ImageDisplayConfig } from "./image-display";

type Identity =
  | {kind:"id"; profileId:number; updatedAt:string; actor:string}
  | {kind:"category-slug";category:string;slug:string;updatedAt:string;actor:string};
export type DirectoryStep3PresentationInput = {
  identity: Identity;
  services?: readonly string[];
  thumbnailImageDisplay?: ImageDisplayConfig | null;
  detailImageDisplay?: ImageDisplayConfig | null;
};
export type DirectoryStep3SqlStatement = {
  sql:string;
  bindings:Array<string | number>;
};

export function planDirectoryStep3PresentationSqlMirror(
  input: DirectoryStep3PresentationInput,
): DirectoryStep3SqlStatement[] {
  const id=input.identity;
  if (!id.updatedAt || !id.actor ||
      (id.kind==="id" ? !Number.isSafeInteger(id.profileId) || id.profileId<1
        : !id.category || !id.slug))
    throw new Error("DIRECTORY_STEP3_INVALID_IDENTITY");
  const where=id.kind==="id"
    ? "p.id=? AND p.updated_at=? AND p.updated_by=?"
    : "p.category=? AND p.slug=? AND p.updated_at=? AND p.updated_by=?";
  const guard:Array<string|number>=id.kind==="id"
    ? [id.profileId,id.updatedAt,id.actor]
    : [id.category,id.slug,id.updatedAt,id.actor];
  const statements:DirectoryStep3SqlStatement[]=[];

  if (input.services!==undefined) {
    if (!Array.isArray(input.services) ||
        input.services.some(x=>typeof x!=="string" || !x.trim()))
      throw new Error("DIRECTORY_STEP3_INVALID_SERVICES");
    statements.push({
      sql:"DELETE FROM directory_profile_service_texts WHERE profile_id IN ("+
        "SELECT p.id FROM directory_profiles p WHERE "+where+")",
      bindings:[...guard],
    });
    if(input.services.length) statements.push({
      sql:"INSERT INTO directory_profile_service_texts "+
        "(profile_id,item_order,service_text,updated_at,updated_by) "+
        "SELECT p.id,CAST(item.key AS INTEGER),CAST(item.value AS TEXT),?,? "+
        "FROM directory_profiles p CROSS JOIN json_each(?) AS item "+
        "WHERE "+where+" AND item.type='text' "+
        "ORDER BY CAST(item.key AS INTEGER)",
      bindings:[id.updatedAt,id.actor,JSON.stringify(input.services),...guard],
    });
  }

  for(const [context,value] of [
    ["thumbnail",input.thumbnailImageDisplay],
    ["detail",input.detailImageDisplay],
  ] as const) {
    if(value===undefined) continue;
    statements.push({
      sql:"DELETE FROM directory_profile_image_display_settings "+
        "WHERE display_context=? AND profile_id IN ("+
        "SELECT p.id FROM directory_profiles p WHERE "+where+")",
      bindings:[context,...guard],
    });
    if(value===null) continue;
    const modes=context==="thumbnail"?["auto","crop","blur"]:["natural","crop","blur"];
    if(!modes.includes(value.mode) ||
       ![value.x,value.y,value.zoom].every(Number.isFinite) ||
       value.x<0 || value.x>100 || value.y<0 || value.y>100 ||
       value.zoom<1 || value.zoom>2.5)
      throw new Error("DIRECTORY_STEP3_INVALID_IMAGE_DISPLAY");
    statements.push({
      sql:"INSERT INTO directory_profile_image_display_settings "+
        "(profile_id,display_context,display_mode,focus_x,focus_y,zoom,updated_at,updated_by) "+
        "SELECT p.id,?,?,?,?,?,?,? FROM directory_profiles p WHERE "+where,
      bindings:[context,value.mode,value.x,value.y,value.zoom,id.updatedAt,id.actor,...guard],
    });
  }
  return statements;
}
