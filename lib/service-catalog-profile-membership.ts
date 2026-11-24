/** Canonical Services V3 membership: primary SQL category plus 0170 secondary
 * category relations. Historical JSON and Notion are not eligibility sources. */
type DB=Pick<D1Database,"prepare">;
export type ServiceProfileMembership=Readonly<{
  primary:string;status:string;categories:readonly string[];
}>;
export async function loadServiceProfileMembership(db:DB,profileId:number):Promise<ServiceProfileMembership|null>{
  const profile=await db.prepare("SELECT category,status FROM directory_profiles WHERE id=?1 LIMIT 1")
    .bind(profileId).first<{category:string;status:string}>();
  if(!profile)return null;
  const secondary=await db.prepare(
    "SELECT category FROM directory_profile_additional_categories WHERE profile_id=?1 ORDER BY category"
  ).bind(profileId).all<{category:string}>();
  return {primary:profile.category,status:profile.status,
    categories:[...new Set([profile.category,...(secondary.results??[]).map(row=>row.category)])]};
}
/** SQL-time guard: a removed secondary membership cannot authorize a stale
 * INSERT/UPDATE merely because the editor loaded the category earlier. */
export function serviceMembershipWriteGuard(profileId:string,categoriesJson:string):string{
  return `EXISTS (SELECT 1 FROM directory_profiles AS eligible_profile
    WHERE eligible_profile.id=${profileId} AND eligible_profile.status<>'archived'
    AND EXISTS (SELECT 1 FROM json_each(${categoriesJson}) AS eligible_category
      WHERE eligible_category.value=eligible_profile.category
      OR EXISTS (SELECT 1 FROM directory_profile_additional_categories AS secondary
        WHERE secondary.profile_id=eligible_profile.id
          AND secondary.category=eligible_category.value)))`;
}
