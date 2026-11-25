/**
 * Unified READ-ONLY Admin projection over canonical D1 records, with no
 * shadow queue, stored duplicate or alternative moderation decision logic.
 */
import { env } from "cloudflare:workers";
import { sqlFoldAdminText } from "./admin-list-query";
import { getPartnerDatabase } from "./partner-auth-store";

export type InboxKind = "PARTNER"|"PUBLIC"|"CLAIM"|"INQUIRY";
export type InboxState = "pending"|"history"|"all";
export type InboxFilters = {kind:InboxKind|"all";state:InboxState;q:string;page:number};
export type InboxRow = {
  key:string;kind:InboxKind;id:string;title:string;status:string;resourceType:string;
  accountId:string|null;canonicalId:number|null;operation:string;
  createdAt:string;updatedAt:string;pending:number;
};
export type InboxResult = {
  items:Array<InboxRow & {reviewHref:string;editorHref:string|null;partnerHref:string|null;chatHref:string|null}>;
  filters:InboxFilters;total:number;pending:number;page:number;totalPages:number;pageSize:number;
};
export const INBOX_PAGE_SIZE=30;
const kinds:ReadonlyArray<string>=["PARTNER","PUBLIC","CLAIM","INQUIRY"];
const states:ReadonlyArray<string>=["pending","history","all"];
export function normalizeInboxFilters(raw:{kind?:unknown;state?:unknown;q?:unknown;page?:unknown}):InboxFilters {
  const kind=typeof raw.kind==="string"&&kinds.includes(raw.kind)?raw.kind as InboxKind:"all";
  const state=typeof raw.state==="string"&&states.includes(raw.state)?raw.state as InboxState:"pending";
  const q=typeof raw.q==="string"?raw.q.trim().slice(0,100):"";
  const n=typeof raw.page==="number"?raw.page:typeof raw.page==="string"?Number(raw.page):1;
  const page=Number.isSafeInteger(n)&&n>0?Math.min(n,10000):1;
  return {kind,state,q,page};
}

const submissionPatchJson = "CASE WHEN json_valid(s.proposed_patch_json) THEN s.proposed_patch_json ELSE '{}' END";

/** The one automated, approved help-owner grant made on publication is NOT a
 * new takeover request; its decision_note is a known system-generated marker.
 * Public unverified submitter_ref is never interpreted as a Partner account.
 */
export const INBOX_CTE=`
WITH combined AS (
 SELECT 'submission:'||s.id AS key,
   CASE WHEN s.submitter_type='PUBLIC_REPORTER' THEN 'PUBLIC' ELSE 'PARTNER' END AS kind,
   s.id AS id,
   COALESCE(NULLIF(dp.name,''),NULLIF(ho.name,''),NULLIF(me.title,''),
     NULLIF(ad.name,''),NULLIF(lf.dog_name,''),NULLIF(hc.title,''),
     NULLIF(new_profile.display_name,''),NULLIF(event_submission.display_title,''),
     CASE WHEN s.resource_type IN ('ADOPTION_DOG','LOST_FOUND_DOG','HELP_CASE') THEN
       COALESCE(
         NULLIF(json_extract(${submissionPatchJson}, '$.name'),''),
         NULLIF(json_extract(${submissionPatchJson}, '$.dogName'),''),
         NULLIF(json_extract(${submissionPatchJson}, '$.title'),'')
       ) END,
     'Podanie '||substr(s.id,1,8)) AS title,
   s.status AS status,s.resource_type AS resourceType,
   CASE WHEN s.submitter_type='PARTNER_ACCOUNT' THEN s.submitter_ref ELSE NULL END AS accountId,
   COALESCE(new_profile.resolved_canonical_id,event_submission.resolved_event_id,
     CAST(s.subject_id AS INTEGER)) AS canonicalId,
   s.operation AS operation,s.created_at AS createdAt,s.updated_at AS updatedAt,
   CASE WHEN s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN 1 ELSE 0 END AS pending
 FROM moderation_submissions s
 LEFT JOIN partner_new_profile_metadata new_profile ON new_profile.submission_id=s.id
 LEFT JOIN partner_event_submission_metadata event_submission ON event_submission.submission_id=s.id
 LEFT JOIN directory_profiles dp ON s.resource_type='DIRECTORY_PROFILE' AND dp.id=CAST(s.subject_id AS INTEGER)
 LEFT JOIN help_organizations ho ON s.resource_type='HELP_ORGANIZATION' AND ho.id=CAST(s.subject_id AS INTEGER)
 LEFT JOIN managed_events me ON s.resource_type='MANAGED_EVENT' AND me.id=CAST(s.subject_id AS INTEGER)
 LEFT JOIN adoption_dogs ad ON s.resource_type='ADOPTION_DOG' AND ad.id=CAST(s.subject_id AS INTEGER)
 LEFT JOIN lost_found_dog_reports lf ON s.resource_type='LOST_FOUND_DOG' AND lf.id=CAST(s.subject_id AS INTEGER)
 LEFT JOIN help_cases hc ON s.resource_type='HELP_CASE' AND hc.id=CAST(s.subject_id AS INTEGER)
 WHERE s.submitter_type IN ('PARTNER_ACCOUNT','PUBLIC_REPORTER') AND s.operation IN ('CREATE','UPDATE')
   AND s.resource_type IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION','MANAGED_EVENT','ADOPTION_DOG','LOST_FOUND_DOG','HELP_CASE')
   AND s.status<>'DRAFT'
 UNION ALL
 SELECT 'claim:'||c.id,'CLAIM',c.id,
   COALESCE(NULLIF(dp.name,''),NULLIF(ho.name,''),NULLIF(me.title,''),'Prevzatie profilu'),
   c.status,r.entity_type,c.account_id,COALESCE(dp.id,ho.id,me.id),
   'CLAIM',c.created_at,c.updated_at,CASE WHEN c.status='PENDING' THEN 1 ELSE 0 END
 FROM partner_claims c
 JOIN partner_resources r ON r.id=c.resource_id
 LEFT JOIN directory_profiles dp ON dp.id=r.directory_profile_id
 LEFT JOIN help_organizations ho ON ho.id=r.help_organization_id
 LEFT JOIN managed_events me ON me.id=r.managed_event_id
 UNION ALL
 SELECT 'help-claim:'||c.id,'CLAIM',c.id,
   COALESCE(NULLIF(ad.name,''),NULLIF(lf.dog_name,''),NULLIF(hc.title,''),'Prevzatie Pomoci psom'),
   c.status,c.entity_type,c.account_id,
   COALESCE(c.adoption_dog_id,c.lost_found_report_id,c.help_case_id),
   'CLAIM',c.created_at,c.updated_at,CASE WHEN c.status='PENDING' THEN 1 ELSE 0 END
 FROM partner_help_claims c
 LEFT JOIN adoption_dogs ad ON ad.id=c.adoption_dog_id
 LEFT JOIN lost_found_dog_reports lf ON lf.id=c.lost_found_report_id
 LEFT JOIN help_cases hc ON hc.id=c.help_case_id
 WHERE NOT (c.status='APPROVED' AND c.decision_note IS 'Schválený nový partnerský profil')
 UNION ALL
 SELECT 'inquiry:'||CAST(i.id AS TEXT),'INQUIRY',CAST(i.id AS TEXT),
   COALESCE(NULLIF(i.profile_name,''),'Dopyt pre službu'),
   i.status,'DIRECTORY_PROFILE',NULL,i.profile_id,
   'INQUIRY',i.created_at,i.updated_at,CASE WHEN i.status IN ('new','read') THEN 1 ELSE 0 END
 FROM directory_inquiries i
),
filtered AS (
 SELECT * FROM combined
 WHERE (?1='all' OR kind=?1)
   AND (?2='all' OR (?2='pending' AND pending=1) OR (?2='history' AND pending=0))
   AND (?3='' OR instr(${sqlFoldAdminText("title")},${sqlFoldAdminText("?3")})>0
     OR instr(lower(COALESCE(accountId,'')),lower(?3))>0 OR instr(lower(id),lower(?3))>0)
)
`;

export function inboxReviewHref(item:Pick<InboxRow,"kind"|"id"|"resourceType"|"operation"|"canonicalId">):string {
  const id=encodeURIComponent(item.id);
  if(item.kind==="INQUIRY")return "/admin/dopyty?id="+id+"#dopyt-"+id;
  if(item.kind==="CLAIM")return "/admin/partners/claims/"+id;
  if(item.kind==="PUBLIC"){
    const original=inboxEditorHref(item);
    if(original)return original;
    return item.resourceType==="LOST_FOUND_DOG"
      ?"/admin/stratene-najdene":"/admin/pomoc-psom";
  }
  if(item.resourceType==="MANAGED_EVENT")return "/admin/partners/events/"+id;
  if(item.resourceType==="DIRECTORY_PROFILE"||item.resourceType==="HELP_ORGANIZATION")
    return item.operation==="UPDATE"?"/admin/partners/changes/"+id:"/admin/partners/submissions/"+id;
  if(["ADOPTION_DOG","LOST_FOUND_DOG","HELP_CASE"].includes(item.resourceType))
    return "/admin/partners/help-submissions/"+id;
  return "/admin/partners";
}
export function inboxEditorHref(item:Pick<InboxRow,"resourceType"|"canonicalId">):string|null{
  const id=item.canonicalId;
  if(typeof id!=="number"||!Number.isSafeInteger(id)||id<=0)return null;
  const prefixes:Record<string,string>={
    DIRECTORY_PROFILE:"/admin/adresar/",HELP_ORGANIZATION:"/admin/organizacie/",
    MANAGED_EVENT:"/admin/podujatia/",ADOPTION_DOG:"/admin/adopcie/",
    LOST_FOUND_DOG:"/admin/stratene-najdene/",HELP_CASE:"/admin/pomoc/",
  };
  return prefixes[item.resourceType]?prefixes[item.resourceType]+id:null;
}
export async function listAdminInbox(input:InboxFilters,database?:D1Database):Promise<InboxResult> {
  const db=getPartnerDatabase(database??(env as unknown as {DB?:D1Database}).DB);
  const filters=normalizeInboxFilters(input),args=[filters.kind,filters.state,filters.q] as const;
  const count=await db.prepare(INBOX_CTE+
    " SELECT COUNT(*) AS total, COALESCE(SUM(pending),0) AS pending FROM filtered")
    .bind(...args).first<{total:number;pending:number}>();
  const total=Number(count?.total??0),pending=Number(count?.pending??0);
  const totalPages=Math.max(1,Math.ceil(total/INBOX_PAGE_SIZE));
  const page=Math.min(filters.page,totalPages);
  const rows=await db.prepare(INBOX_CTE+
    " SELECT * FROM filtered ORDER BY pending DESC,createdAt DESC,key DESC LIMIT ?4 OFFSET ?5")
    .bind(...args,INBOX_PAGE_SIZE,(page-1)*INBOX_PAGE_SIZE)
    .all<InboxRow>();
  return {items:rows.results.map(item=>{
    const accountId=item.accountId&&/^[A-Za-z0-9_-]{1,128}$/.test(item.accountId)?item.accountId:null;
    const partnerHref=accountId?"/admin/partners/accounts/"+encodeURIComponent(accountId):null;
    return {...item,reviewHref:inboxReviewHref(item),
      editorHref:inboxEditorHref(item),partnerHref,chatHref:partnerHref?partnerHref+"?tab=spravy":null};
  }),filters,page,totalPages,total,pending,pageSize:INBOX_PAGE_SIZE};
}
