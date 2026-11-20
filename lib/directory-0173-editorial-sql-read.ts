/**
 * 0173 SQL-first detail read after the owner-approved Notion -> D1 import.
 *
 * One read-only, indexed SQL statement covers qualifications, SEO, opening
 * hours, quality resolutions and media. Absence is distinguishable from a
 * committed row; no old JSON values are copied into D1 on reads.
 * Protected/older records with no 0173 rows retain their existing presentation
 * until a verified full SQL-only cutover.
 */
export type Directory0173SqlSeo = {
  title: string;
  description: string;
  focusKeyword: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  noindex: boolean;
};
export type Directory0173SqlQualityRow = {
  field: "phone" | "email" | "website" | "image" | "address";
  status: "DOES_NOT_EXIST" | "NOT_PUBLIC" | "NOT_APPLICABLE" | "NOT_FOUND";
  checkedAt: string;
};
export type Directory0173SqlRead = {
  qualifications: string[] | null;
  seo: Directory0173SqlSeo | null;
  hoursText: string | null;
  quality: Directory0173SqlQualityRow[];
  galleryUrls: string[] | null;
};

export const DIRECTORY_0173_DETAIL_READ_SQL = [
  "SELECT",
  "(SELECT json_group_array(qualification_text) FROM",
  "(SELECT qualification_text FROM directory_profile_qualifications",
  "WHERE profile_id=?1 ORDER BY item_order)) AS qualifications_json,",
  "(SELECT json_object('title',title,'description',description,",
  "'focusKeyword',focus_keyword,'canonicalUrl',canonical_url,",
  "'ogTitle',og_title,'ogDescription',og_description,",
  "'ogImage',og_image_url,'noindex',noindex)",
  "FROM directory_profile_seo WHERE profile_id=?1) AS seo_json,",
  "(SELECT hours_text FROM directory_profile_opening_hours",
  "WHERE profile_id=?1 AND day_of_week=0) AS hours_text,",
  "(SELECT json_group_array(json_object('field',quality_field,",
  "'status',resolution_status,'checkedAt',checked_at))",
  "FROM directory_profile_quality_resolutions WHERE profile_id=?1) AS quality_json,",
  "(SELECT json_group_array(json_object('url',image_url,'key',image_key)) FROM",
  "(SELECT image_url,image_key FROM directory_profile_media",
  "WHERE profile_id=?1 ORDER BY item_order)) AS media_json",
].join(" ");

type ProjectionRow = {
  qualifications_json: string | null;
  seo_json: string | null;
  hours_text: string | null;
  quality_json: string | null;
  media_json: string | null;
};
const QUALITY_FIELDS = new Set(["phone", "email", "website", "image", "address"]);
const QUALITY_STATUSES = new Set([
  "DOES_NOT_EXIST","NOT_PUBLIC","NOT_APPLICABLE","NOT_FOUND",
]);
function parseArray(value: string | null, name: string): unknown[] {
  if(value === null) return [];
  let result: unknown;
  try { result=JSON.parse(value); }
  catch { throw new Error("DIRECTORY_0173_SQL_READ_INVALID_"+name); }
  if(!Array.isArray(result) || result.length > 250)
    throw new Error("DIRECTORY_0173_SQL_READ_INVALID_"+name);
  return result;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function readSeo(value: string | null): Directory0173SqlSeo | null {
  if(value === null) return null;
  let parsed: unknown;
  try { parsed=JSON.parse(value); }
  catch { throw new Error("DIRECTORY_0173_SQL_READ_INVALID_SEO"); }
  if(!isRecord(parsed)) throw new Error("DIRECTORY_0173_SQL_READ_INVALID_SEO");
  const asText = (key: string) => {
    const v=parsed[key];
    if(typeof v !== "string") throw new Error("DIRECTORY_0173_SQL_READ_INVALID_SEO");
    return v;
  };
  const noindex=parsed.noindex;
  if(noindex!==0 && noindex!==1) throw new Error("DIRECTORY_0173_SQL_READ_INVALID_SEO");
  return {
    title:asText("title"),description:asText("description"),
    focusKeyword:asText("focusKeyword"),canonicalUrl:asText("canonicalUrl"),
    ogTitle:asText("ogTitle"),ogDescription:asText("ogDescription"),
    ogImage:asText("ogImage"),noindex:noindex===1,
  };
}

export function parseDirectory0173SqlProjection(row: ProjectionRow): Directory0173SqlRead {
  const qualifications=parseArray(row.qualifications_json,"QUALIFICATIONS");
  if(qualifications.some(x=>typeof x!=="string"))
    throw new Error("DIRECTORY_0173_SQL_READ_INVALID_QUALIFICATIONS");
  const quality=parseArray(row.quality_json,"QUALITY");
  if(quality.some(x=>!isRecord(x)||
    !QUALITY_FIELDS.has(String(x.field))||
    !QUALITY_STATUSES.has(String(x.status))||
    typeof x.checkedAt!=="string"))
    throw new Error("DIRECTORY_0173_SQL_READ_INVALID_QUALITY");
  const media=parseArray(row.media_json,"MEDIA");
  if(media.some(x=>!isRecord(x)||!(x.url===null||typeof x.url==="string")||
    !(x.key===null||typeof x.key==="string")))
    throw new Error("DIRECTORY_0173_SQL_READ_INVALID_MEDIA");
  if(row.hours_text!==null&&typeof row.hours_text!=="string")
    throw new Error("DIRECTORY_0173_SQL_READ_INVALID_HOURS");
  // SQL media can contain key-only R2 assets. Preserve the previous gallery
  // unless EVERY SQL media row contains a usable URL; never silently drop R2.
  const galleryUrls=media.length && media.length<=6 &&
    media.every(x=>isRecord(x)&&typeof x.url==="string"&&x.url.trim())
    ? media.map(x=>(x as Record<string, string>).url) : null;
  return {
    qualifications: qualifications.length ? qualifications as string[] : null,
    seo:readSeo(row.seo_json),
    hoursText:row.hours_text,
    quality:quality as Directory0173SqlQualityRow[],
    galleryUrls,
  };
}

export async function readDirectory0173EditorialSql(
  database:D1Database,
  profileId:number,
):Promise<Directory0173SqlRead> {
  if(!Number.isSafeInteger(profileId)||profileId<1)
    throw new Error("DIRECTORY_0173_SQL_READ_INVALID_ID");
  const row=await database.prepare(DIRECTORY_0173_DETAIL_READ_SQL)
    .bind(profileId).first<ProjectionRow>();
  if(!row)throw new Error("DIRECTORY_0173_SQL_READ_MISSING_PROJECTION");
  return parseDirectory0173SqlProjection(row);
}
