/**
 * Read-only completeness report for Admin / Kvalita údajov.
 * Exact canonical D1 counts, bounded pages; no Tavily or D1 writes.
 */
import { allDirectoryCategories } from "./directory.ts";
import { eventTypes } from "./events.ts";
import { allHelpCategories } from "./help.ts";
import { RAW_MISSING_PHONE_SQL, RAW_MISSING_EMAIL_SQL, RAW_MISSING_WEBSITE_SQL } from "./data-quality-contact-sql.ts";
import { qualityTodayInSlovakia, type QualityResearchKind } from "./data-quality-tavily-query.ts";

export type OverviewArea = "services" | "events" | "help";
export const overviewFields = [
  {id:"address",label:"Adresy a miesta"},
  {id:"image",label:"Obrázky"},
  {id:"web",label:"Weby a odkazy"},
  {id:"phone",label:"Telefóny"},
  {id:"email",label:"E-maily"},
  {id:"social",label:"Sociálne siete"},
  {id:"registration",label:"Registrácie"},
  {id:"date",label:"Dátumy a časy"},
  {id:"other",label:"Ostatné"},
] as const;
export type OverviewField = (typeof overviewFields)[number]["id"];
const fieldIds:OverviewField[]=overviewFields.map(x=>x.id);
export const OVERVIEW_PAGE_SIZE=50;
export const overviewAreas=[
  {id:"services",label:"Služby pre psov"},
  {id:"events",label:"Podujatia"},
  {id:"help",label:"Pomoc psom"},
] as const;

const helpCategoryOptions=[
  {value:"organization",label:"Útulky a organizácie"},
  {value:"adoption",label:"Adopcie"},
  {value:"foster",label:"Dočasná opatera"},
  ...allHelpCategories.filter(c=>c.slug!=="docasna-opatera")
    .map(c=>({value:"case:"+c.slug,label:"Prípady: "+c.label})),
  {value:"lost:LOST",label:"Stratené psy"},
  {value:"lost:FOUND",label:"Nájdené psy"},
];
export function overviewCategoryOptions(area:OverviewArea){
  if(area==="services")return allDirectoryCategories.map(x=>({value:x.slug,label:x.label}));
  if(area==="events")return eventTypes.map(x=>({value:x,label:x}));
  return helpCategoryOptions;
}

export type OverviewFilters={
  area:OverviewArea;category:string;field:OverviewField|"all";
  q:string;state:"current"|"all";page:number;
};
export function parseOverviewFilters(search:Record<string,string|string[]|undefined>):OverviewFilters{
  const first=(key:string)=>typeof search[key]==="string"?(search[key] as string):"";
  const area=overviewAreas.some(x=>x.id===first("area"))?first("area") as OverviewArea:"services";
  const category=overviewCategoryOptions(area).some(x=>x.value===first("category"))?first("category"):"";
  const field=fieldIds.includes(first("field") as OverviewField)?first("field") as OverviewField:"all";
  const rawPage=Number(first("page"));
  return {
    area,category,field,q:first("q").trim().slice(0,100),
    state:first("state")==="all"?"all":"current",
    page:Number.isSafeInteger(rawPage)&&rawPage>0?Math.min(rawPage,100000):1,
  };
}
export function overviewHref(f:OverviewFilters,patch:Partial<OverviewFilters>={}):string{
  const current={...f,...patch};
  const params=new URLSearchParams();
  params.set("area",current.area);
  if(current.category)params.set("category",current.category);
  if(current.field!=="all")params.set("field",current.field);
  if(current.q)params.set("q",current.q);
  if(current.state==="all")params.set("state","all");
  if(current.page>1)params.set("page",String(current.page));
  return "/admin/kvalita/prehlad?"+params.toString();
}

type MetricKey = `m_${OverviewField}`;
type OverviewRow = {
  id:number;kind:QualityResearchKind;name:string;category:string;status:string;city:string;
} & Record<MetricKey,number>;
export type OverviewItem={
  id:number;kind:QualityResearchKind;name:string;category:string;status:string;city:string;
  missing:OverviewField[];editorHref:string;
};
export type OverviewSummary={totalProfiles:number;incompleteProfiles:number;byField:Record<OverviewField,number>};
export type OverviewResult={
  filters:OverviewFilters;summary:OverviewSummary;visibleCount:number;
  page:number;pages:number;items:OverviewItem[];
};
type ReadDb=Pick<D1Database,"prepare">;
const empty=(col:string)=>"trim(COALESCE("+col+",''))=''";
const contactJSON="CASE WHEN json_valid(COALESCE(source_data_json,'')) THEN source_data_json ELSE '{}' END";
const missingAliases=(keys:readonly string[]) =>
  "COALESCE("+keys.map(k=>"NULLIF(trim(CAST(json_extract("+contactJSON+", '$.\""+k+"\"') AS TEXT)),'')").join(",")+",'')=''";
const socialMissing="("+missingAliases(["Facebook","facebook","Facebook URL"])+
  " OR "+missingAliases(["Instagram","instagram","Instagram URL"])+")";

/** Trusted static SQL only; user filters appear solely as bound values. */
type KindSpec={
  kind:QualityResearchKind;area:OverviewArea;table:string;name:string;category:string;status:string;
  city:string;valid:string;active:string;usesToday?:boolean;
  missing:Partial<Record<OverviewField,string>>;
};
const spec:readonly KindSpec[]=[
  {
    kind:"DIRECTORY",area:"services",table:"directory_profiles",name:"name",category:"category",
    status:"status",city:"city",valid:"1=1",active:"UPPER(COALESCE(status,'')) <> 'ARCHIVED'",
    missing:{
      address:empty("address"),image:empty("image_url"),web:RAW_MISSING_WEBSITE_SQL,
      phone:RAW_MISSING_PHONE_SQL,email:RAW_MISSING_EMAIL_SQL,social:socialMissing,
    },
  },
  {
    kind:"EVENT",area:"events",table:"managed_events",name:"title",category:"event_type",
    status:"status",city:"city",valid:"1=1",usesToday:true,
    active:"COALESCE(cancelled,0)=0 AND (COALESCE(NULLIF(end_date,''),start_date,'') = '' OR COALESCE(NULLIF(end_date,''),start_date) >= ?)",
    missing:{
      address:"("+empty("address")+" OR "+empty("venue")+")",
      image:empty("image_url"),web:empty("website_url"),
      registration:empty("registration_url"),date:empty("start_time"),other:empty("organizer"),
    },
  },
  {
    kind:"ORGANIZATION",area:"help",table:"help_organizations",name:"name",category:"'organization'",
    status:"status",city:"city",valid:"1=1",active:"UPPER(COALESCE(status,'')) <> 'ARCHIVED'",
    missing:{
      image:empty("image_url"),web:empty("website_url"),phone:empty("public_phone"),
      email:empty("public_email"),social:"("+empty("facebook_url")+" OR "+empty("instagram_url")+")",
      other:empty("registration_number"),
    },
  },
  {
    kind:"ADOPTION",area:"help",table:"adoption_dogs",name:"name",category:"'adoption'",
    status:"status",city:"city",valid:"1=1",active:"UPPER(COALESCE(status,'')) NOT IN ('RESERVED','ADOPTED','ARCHIVED')",
    missing:{
      image:empty("main_image"),web:"("+empty("contact_url")+" OR "+empty("external_source_url")+")",
      phone:empty("contact_phone"),email:empty("contact_email"),
    },
  },
  {
    kind:"FOSTER",area:"help",table:"help_cases",name:"title",category:"'foster'",
    status:"status",city:"city",valid:"category='docasna-opatera'",active:"COALESCE(resolved,0)=0",
    missing:{image:empty("image_url"),web:empty("action_url")},
  },
  {
    kind:"HELP_ITEM",area:"help",table:"help_cases",name:"title",category:"'case:' || COALESCE(category,'')",
    status:"status",city:"city",valid:"category<>'docasna-opatera'",active:"COALESCE(resolved,0)=0",
    missing:{image:empty("image_url"),web:empty("action_url")},
  },
  {
    kind:"LOST_FOUND",area:"help",table:"lost_found_dog_reports",
    name:"COALESCE(NULLIF(dog_name,''),'Hlásenie #' || id)",
    category:"'lost:' || COALESCE(type,'')",status:"status",city:"city",valid:"1=1",usesToday:true,
    active:"UPPER(COALESCE(status,'')) NOT IN ('RESOLVED','EXPIRED','REJECTED','ARCHIVED')"+
      " AND NOT (status='ACTIVE' AND COALESCE(expires_at,'')<>'' AND substr(expires_at,1,10) < ?)",
    missing:{image:empty("main_image"),web:empty("source_url")},
  },
];

/** Query scans only the selected area, not all unrelated domain tables. */
export function overviewSqlSource(f:OverviewFilters,today:string){
  const types=spec.filter(x=>x.area===f.area);
  const bindings:(string|number)[]=[];
  const selects=types.map(x=>{
    const conditions=[x.valid];
    if(f.state==="current"){
      conditions.push(x.active);
      if(x.usesToday)bindings.push(today);
    }
    const flags=fieldIds.map(k=>"CASE WHEN "+(x.missing[k]??"0")+" THEN 1 ELSE 0 END AS m_"+k).join(", ");
    return "SELECT id, '"+x.kind+"' AS kind, "+x.name+" AS name, "+x.category+
      " AS category, "+x.status+" AS status, "+x.city+" AS city, "+flags+
      " FROM "+x.table+" WHERE "+conditions.map(condition=>"("+condition+")").join(" AND ");
  });
  return {sql:"WITH profiles AS ("+selects.join(" UNION ALL ")+")",bindings};
}
function editorHref(kind:QualityResearchKind,id:number){
  const routes:Record<QualityResearchKind,string>={
    DIRECTORY:"adresar",EVENT:"podujatia",ORGANIZATION:"organizacie",
    ADOPTION:"adopcie",FOSTER:"pomoc",HELP_ITEM:"pomoc",LOST_FOUND:"stratene-najdene",
  };
  return "/admin/"+routes[kind]+"/"+id;
}

export async function loadMissingDataOverview(db:ReadDb,filters:OverviewFilters,now=new Date()):Promise<OverviewResult>{
  const source=overviewSqlSource(filters,qualityTodayInSlovakia(now));
  const predicates:string[]=[];
  const bind:(string|number)[]=[];
  if(filters.category){predicates.push("category=?");bind.push(filters.category);}
  if(filters.q){predicates.push("name LIKE ? COLLATE NOCASE");bind.push("%"+filters.q+"%");}
  const where=predicates.length?" WHERE "+predicates.join(" AND "):"";
  const columns=fieldIds.map(k=>"COALESCE(SUM(m_"+k+"),0) AS m_"+k).join(",");
  const anyMissing=fieldIds.map(k=>"m_"+k).join("+");
  const aggregate=await db.prepare(source.sql+
    " SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN ("+anyMissing+")>0 THEN 1 ELSE 0 END),0) AS incomplete,"+
    columns+" FROM profiles"+where).bind(...source.bindings,...bind)
    .first<Record<string,number>>();
  const byField=Object.fromEntries(fieldIds.map(k=>[k,Number(aggregate?.["m_"+k]??0)])) as Record<OverviewField,number>;
  const totalProfiles=Number(aggregate?.total??0);
  const incompleteProfiles=Number(aggregate?.incomplete??0);
  const visibleCount=filters.field==="all"?incompleteProfiles:byField[filters.field];
  const pages=Math.max(1,Math.ceil(visibleCount/OVERVIEW_PAGE_SIZE));
  const page=Math.min(filters.page,pages);
  const selectPredicates=[...predicates,
    filters.field==="all"?"("+anyMissing+")>0":"m_"+filters.field+"=1"];
  const listWhere=" WHERE "+selectPredicates.join(" AND ");
  const result=visibleCount?await db.prepare(source.sql+
    " SELECT * FROM profiles"+listWhere+" ORDER BY name COLLATE NOCASE,kind,id LIMIT ? OFFSET ?")
    .bind(...source.bindings,...bind,OVERVIEW_PAGE_SIZE,(page-1)*OVERVIEW_PAGE_SIZE)
    .all<OverviewRow>():{results:[] as OverviewRow[]};
  return {
    filters,summary:{totalProfiles,incompleteProfiles,byField},
    visibleCount,page,pages,
    items:result.results.map(x=>({
      id:x.id,kind:x.kind,name:x.name,category:x.category,status:x.status,city:x.city??"",
      missing:fieldIds.filter(k=>Number(x[("m_"+k) as MetricKey])===1),
      editorHref:editorHref(x.kind,x.id),
    })),
  };
}
