import { HELP_ADMIN_DOMAIN_SQL } from "./help-admin-query.ts";
import { qualityTodayInSlovakia } from "./data-quality-tavily-query.ts";
import { manualMappingEditorHref } from "./notion-manual-transfer-mapping.ts";

/** Read-only review reminders. Age is not proof of stale data, and
 * editorial lock ownership is not proof of external source verification. */
const review=(type:string)=>"SELECT r.reviewed_at FROM admin_entity_reviews r WHERE r.entity_type='"+type+"' AND r.entity_id=p.id";
const specs=[
 {id:"directory",label:"Služby pre psov",days:90,table:"directory_profiles",name:"p.name",where:"p.status='published'",date:"(SELECT r.reviewed_at FROM directory_profile_review_state r WHERE r.profile_id=p.id AND r.unlock_pending=0)",basis:"Redakčná kontrola"},
 {id:"events",label:"Podujatia",days:14,table:"managed_events",name:"p.title",where:"p.status='published' AND COALESCE(p.cancelled,0)=0 AND (COALESCE(NULLIF(p.end_date,''),p.start_date,'')='' OR COALESCE(NULLIF(p.end_date,''),p.start_date)>=?2)",date:"("+review("EVENT")+")",basis:"Redakčná kontrola"},
 {id:"organizations",label:"Organizácie",days:90,table:"help_organizations",name:"p.name",where:"p.status='PUBLISHED' AND p.archived_at IS NULL",date:"p.last_verified_at",basis:"Posledné overenie"},
 {id:"adoptions",label:"Adopcie",days:7,table:"adoption_dogs",name:"p.name",where:"p.status IN ('ACTIVE','RESERVED')",date:"p.last_verified_at",basis:"Posledné overenie"},
 {id:"lost-found",label:"Stratené a nájdené",days:7,table:"lost_found_dog_reports",name:"COALESCE(NULLIF(TRIM(p.dog_name),''),'Hlásenie #'||p.id)",where:"p.status='ACTIVE' AND p.published_at IS NOT NULL AND p.duplicate_of_id IS NULL AND (p.expires_at IS NULL OR julianday(p.expires_at)>julianday(?1))",date:"(SELECT c.last_reviewed_at FROM help_source_checks c WHERE c.entity_type='LOST_FOUND' AND c.entity_id=p.id AND c.source_url=TRIM(COALESCE(p.source_url,'')))",basis:"Ručné overenie zdroja"},
 {id:"help-cases",label:"Ostatná pomoc",days:30,table:"help_cases",name:"p.title",where:"p.status='published' AND COALESCE(p.resolved,0)=0 AND "+HELP_ADMIN_DOMAIN_SQL,date:"("+review("HELP_CASE")+")",basis:"Redakčná kontrola"},
 {id:"eshops",label:"E-shopy",days:90,table:"managed_eshops",name:"p.name",where:"p.status='published'",date:"("+review("ESHOP")+")",basis:"Redakčná kontrola"},
 {id:"breeds",label:"Plemená",days:365,table:"managed_breeds",name:"p.name",where:"p.status='published'",date:"("+review("BREED")+")",basis:"Redakčná kontrola"},
 {id:"articles",label:"Články",days:365,table:"managed_articles",name:"p.title",where:"(p.status='published' OR (p.status='scheduled' AND julianday(p.published_at)<=julianday(?1)))",date:"p.updated_at",basis:"Posledná úprava (nie overenie)"},
] as const;
type Spec=typeof specs[number];
export const freshnessAgendas=specs.map(({id,label,days,basis})=>({id,label,days,basis}));
type Counts={total:number;due:number;unknown:number};
type Row={id:number;name:string;status:string;checked_at:string|null;reason:"unknown"|"due"|"recent"};
export type FreshnessOverview={agenda:string;counts:Counts|null;items:Array<Row&{href:string|null}>;hasMore:boolean;page:number};
function query(spec:Spec){
 // Named parameters are bound once even if used in multiple conditions.
 return "WITH clock AS (SELECT ?1 AS now,?2 AS today,?3 AS age), records AS (SELECT p.id,"+spec.name+
 " AS name,p.status,"+spec.date+" AS checked_at FROM "+spec.table+" p WHERE "+spec.where+
 "), classified AS (SELECT *,CASE WHEN julianday(checked_at) IS NULL OR julianday(checked_at)>julianday(clock.now) THEN 'unknown' "+
 "WHEN julianday(checked_at)<=julianday(clock.now)-clock.age THEN 'due' ELSE 'recent' END AS reason FROM records CROSS JOIN clock) ";
}
export async function loadFreshnessOverview(db:D1Database,agenda:string,page=1,now=new Date()):Promise<FreshnessOverview[]>{
 const date=now.toISOString(),today=qualityTodayInSlovakia(now);
 const selected=specs.some(s=>s.id===agenda)?agenda:"directory";
 const safePage=Number.isSafeInteger(page)&&page>0?Math.min(10000,page):1;
 return Promise.all(specs.map(async spec=>{
  try{
   const sql=query(spec),args=[date,today,spec.days] as const;
   const totals=await db.prepare(sql+"SELECT COUNT(*) AS total,COALESCE(SUM(reason='due'),0) AS due,COALESCE(SUM(reason='unknown'),0) AS unknown FROM classified").bind(...args).first<Counts>();
   if(!totals||![totals.total,totals.due,totals.unknown].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error("FRESHNESS_UNAVAILABLE");
   if(spec.id!==selected)return {agenda:spec.id,counts:totals,items:[],hasMore:false,page:1};
   const rows=await db.prepare(sql+"SELECT id,name,status,checked_at,reason FROM classified WHERE reason IN ('unknown','due') ORDER BY CASE reason WHEN 'unknown' THEN 0 ELSE 1 END,julianday(checked_at),id LIMIT 26 OFFSET ?4").bind(...args,(safePage-1)*25).all<Row>();
   if(!rows.success||!Array.isArray(rows.results))throw Error("FRESHNESS_UNAVAILABLE");
   const items=rows.results.slice(0,25).map(row=>({...row,href:spec.id==="articles"?"/admin/clanky/"+row.id:manualMappingEditorHref(spec.id,row.id)}));
   return {agenda:spec.id,counts:totals,items,hasMore:rows.results.length>25,page:safePage};
  }catch{return {agenda:spec.id,counts:null,items:[],hasMore:false,page:safePage};}
 }));
}
