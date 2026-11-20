/** Read the current Directory presentation directly from D1 SQL owners.
 * The query has no legacy JSON fallbacks or writes. A missing setting means
 * the default image presentation; [] means no free-text services.
 */
import type { ImageDisplayConfig } from "./image-display";

export type DirectoryPresentationSqlRead = {
  services: string[];
  thumbnailImageDisplay: ImageDisplayConfig | null;
  detailImageDisplay: ImageDisplayConfig | null;
};

const servicesSql=(alias:string)=>
  "(SELECT json_group_array(item.service_text) FROM ("+
  "SELECT service_text FROM directory_profile_service_texts "+
  "WHERE profile_id="+alias+".id ORDER BY item_order) AS item)";

const imageSql=(alias:string,context:"thumbnail"|"detail")=>
  "(SELECT json_object('mode',display_mode,'x',focus_x,'y',focus_y,'zoom',zoom) "+
  "FROM directory_profile_image_display_settings "+
  "WHERE profile_id="+alias+".id AND display_context='"+context+"')";

export function directoryServicesSqlExpression(alias="directory_profiles") {
  if(!/^[a-z_][a-z0-9_]*$/i.test(alias))throw Error("DIRECTORY_SQL_INVALID_ALIAS");
  return servicesSql(alias);
}
export function directoryImageSqlExpression(
  context:"thumbnail"|"detail", alias="directory_profiles",
) {
  if(!/^[a-z_][a-z0-9_]*$/i.test(alias))throw Error("DIRECTORY_SQL_INVALID_ALIAS");
  return imageSql(alias,context);
}

export const DIRECTORY_PRESENTATION_SQL = [
  "SELECT",
  "(SELECT json_group_array(service_text) FROM",
  "(SELECT service_text FROM directory_profile_service_texts",
  "WHERE profile_id=?1 ORDER BY item_order)) AS services,",
  "(SELECT json_object('mode',display_mode,'x',focus_x,'y',focus_y,'zoom',zoom)",
  "FROM directory_profile_image_display_settings",
  "WHERE profile_id=?1 AND display_context='thumbnail') AS thumbnail,",
  "(SELECT json_object('mode',display_mode,'x',focus_x,'y',focus_y,'zoom',zoom)",
  "FROM directory_profile_image_display_settings",
  "WHERE profile_id=?1 AND display_context='detail') AS detail",
].join(" ");

function parse(value:string|null):unknown {
  if(value===null)return null;
  try{return JSON.parse(value);}catch{throw Error("DIRECTORY_SQL_INVALID_PROJECTION");}
}
function image(value:unknown,ctx:"thumbnail"|"detail"):ImageDisplayConfig|null {
  if(value===null)return null;
  if(!value||typeof value!=="object"||Array.isArray(value))
    throw Error("DIRECTORY_SQL_INVALID_DISPLAY");
  const v=value as Record<string,unknown>;
  const modes=ctx==="thumbnail"?["auto","crop","blur"]:["natural","crop","blur"];
  if(typeof v.mode!=="string"||!modes.includes(v.mode)||
     ![v.x,v.y,v.zoom].every(x=>typeof x==="number"&&Number.isFinite(x))||
     (v.x as number)<0||(v.x as number)>100||
     (v.y as number)<0||(v.y as number)>100||
     (v.zoom as number)<1||(v.zoom as number)>2.5)
    throw Error("DIRECTORY_SQL_INVALID_DISPLAY");
  return v as ImageDisplayConfig;
}
export function parseDirectoryPresentationSqlRead(row:{
  services:string|null;thumbnail:string|null;detail:string|null;
}):DirectoryPresentationSqlRead {
  const items=parse(row.services);
  if(!Array.isArray(items)||items.length>100||
      items.some(v=>typeof v!=="string"))
    throw Error("DIRECTORY_SQL_INVALID_SERVICES");
  return {
    services:items as string[],
    thumbnailImageDisplay:image(parse(row.thumbnail),"thumbnail"),
    detailImageDisplay:image(parse(row.detail),"detail"),
  };
}
export async function readDirectoryPresentationSql(
  database:D1Database,profileId:number,
):Promise<DirectoryPresentationSqlRead> {
  if(!Number.isSafeInteger(profileId)||profileId<1)
    throw Error("DIRECTORY_SQL_INVALID_ID");
  const row=await database.prepare(DIRECTORY_PRESENTATION_SQL)
    .bind(profileId).first<{services:string|null;thumbnail:string|null;detail:string|null}>();
  if(!row)throw Error("DIRECTORY_SQL_NO_PROJECTION");
  return parseDirectoryPresentationSqlRead(row);
}
