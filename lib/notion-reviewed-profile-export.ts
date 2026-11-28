import { runUnifiedReviewTransition, isUnifiedManualFenceActive } from "./notion-unified-manual-fence.ts";
import { notionRequest, notionRichTextProperty, type NotionPage as BaseNotionPage, type NotionSyncBindings } from "./notion-sync-shared.ts";
import { notionPageBelongsToDataSource } from "./notion-sync-page-ownership.ts";
import { sameNotionProperty, selectiveNotionProperties } from "./notion-selective-property-patch.ts";

type NotionPage=BaseNotionPage & {archived?:boolean;in_trash?:boolean;parent?:{type?:string;data_source_id?:string;database_id?:string}};
type Agenda="breeds"|"eshops";
const specs={
  breeds:{table:"managed_breeds",type:"BREED",mapping:"breed_notion_workcopy_links",key:"breed_id",page:"work_notion_page_id",extra:" AND status='ACTIVE'"},
  eshops:{table:"managed_eshops",type:"ESHOP",mapping:"eshop_notion_sync",key:"eshop_id",page:"notion_page_id",extra:""},
} as const;
const FLAG="Odkontrolované";

export async function readStandaloneReviewLock(db:D1Database,agenda:Agenda,id:number):Promise<boolean>{
  if(!Number.isSafeInteger(id)||id<1)throw Error("PROFILE_REVIEW_ID_INVALID");
  const spec=specs[agenda];
  const row=await db.prepare("SELECT p.status,EXISTS(SELECT 1 FROM admin_entity_reviews WHERE entity_type=? AND entity_id=p.id) reviewed,"+
    "EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind=? AND record_id=p.id) removed FROM "+spec.table+" p WHERE p.id=?")
    .bind(spec.type,agenda,id).first<{status:string;reviewed:number;removed:number}>();
  return !row||row.reviewed===1||row.removed===1||String(row.status).toLowerCase()==="archived"||
    await isUnifiedManualFenceActive(db,{scope:agenda,profile_id:id});
}

function assertIdentity(page:NotionPage,pageId:string,sourceId:string,id:number){
  const norm=(v:string)=>v.replaceAll("-","").toLowerCase();
  if(norm(page.id)!==norm(pageId)||page.archived||page.in_trash||
    !notionPageBelongsToDataSource(page,sourceId)||notionRichTextProperty(page,"Psipedia ID")!==String(id))
    throw Error("PROFILE_REVIEW_REMOTE_IDENTITY");
}

function assertComplete(page:NotionPage,desired:Record<string,unknown>){
  for(const [name,value] of Object.entries(desired)){
    const raw=page.properties?.[name] as Record<string,unknown>|undefined;
    const type=Object.keys(value as Record<string,unknown>)[0];
    if(!raw||raw.type!==type||!Object.hasOwn(raw,type)||raw.has_more===true||
      (Array.isArray(raw[type])&&(raw[type] as unknown[]).length>=25))
      throw Error("PROFILE_REVIEW_REMOTE_PROPERTY_INCOMPLETE: "+name);
  }
}

export async function mirrorStandaloneReviewFlag(input:{
  database:D1Database;bindings:NotionSyncBindings;agenda:Agenda;id:number;pageId:string;sourceId:string;
}):Promise<void>{
  const {database:db,bindings,agenda,id,pageId,sourceId}=input;
  const read=async()=>{
    const page=await notionRequest<NotionPage>(bindings,"/pages/"+encodeURIComponent(pageId));
    assertIdentity(page,pageId,sourceId,id);
    assertComplete(page,{[FLAG]:{checkbox:true}});
    return page;
  };
  const desired=await readStandaloneReviewLock(db,agenda,id);
  const page=await read();
  if(sameNotionProperty(page.properties?.[FLAG],{checkbox:desired}))return;
  if(await readStandaloneReviewLock(db,agenda,id)!==desired)throw Error("PROFILE_REVIEW_CHANGED");
  await notionRequest<NotionPage>(bindings,"/pages/"+encodeURIComponent(pageId),{method:"PATCH",
    body:JSON.stringify({properties:{[FLAG]:{checkbox:desired}}})});
  if(!sameNotionProperty((await read()).properties?.[FLAG],{checkbox:desired}))throw Error("PROFILE_REVIEW_MIRROR_UNVERIFIED");
}

/** An explicit unlock is the sole exception to the normal no-content-push rule.
 * The adapter must encode its entire independently mapped canonical projection,
 * not derive values from missing Notion properties. No new table is needed. */
export async function unlockStandaloneReviewedProfile(input:{
  database:D1Database;bindings:NotionSyncBindings;agenda:Agenda;id:number;sourceId:string;
  projection:(page:NotionPage)=>Promise<{revision:string;desired:Record<string,unknown>}>;
}):Promise<void>{
  const {database:db,bindings,agenda,id,sourceId}=input;
  if(bindings.NOTION_PROFILE_AUTHORITY_MODE!=="validated-text")throw Error("PROFILE_REVIEW_MODE_DISABLED");
  if(!Number.isSafeInteger(id)||id<1||!sourceId)throw Error("PROFILE_REVIEW_ID_INVALID");
  const spec=specs[agenda];
  const mapping=()=>db.prepare("SELECT "+spec.page+" AS page_id FROM "+spec.mapping+" WHERE "+spec.key+"=?"+spec.extra)
    .bind(id).first<{page_id:string}>();
  const canonical=()=>db.prepare("SELECT updated_at FROM "+spec.table+" p WHERE id=? AND lower(status)<>'archived'"+
    " AND EXISTS(SELECT 1 FROM admin_entity_reviews WHERE entity_type=? AND entity_id=p.id)"+
    " AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind=? AND record_id=p.id)")
    .bind(id,spec.type,agenda).first<{updated_at:string}>();
  const remote=async(pageId:string)=>{
    const page=await notionRequest<NotionPage>(bindings,"/pages/"+encodeURIComponent(pageId));
    assertIdentity(page,pageId,sourceId,id);
    return page;
  };
  async function snapshot(){
    const local=await canonical(), link=await mapping();
    if(!local||!link)throw Error("PROFILE_REVIEW_LOCK_OR_MAPPING_MISSING");
    const page=await remote(link.page_id);
    const content=await input.projection(page);
    if(content.revision!==local.updated_at||(await canonical())?.updated_at!==local.updated_at||
      (await mapping())?.page_id!==link.page_id)throw Error("PROFILE_REVIEW_REVISION_CHANGED");
    const desired={...content.desired,[FLAG]:{checkbox:true}};
    assertComplete(page,desired);
    return {revision:local.updated_at,content:{pageId:link.page_id,desired}};
  }
  const preflight=await snapshot();
  await runUnifiedReviewTransition(db,{scope:agenda,profile_id:id},{
    kind:"unlock",
    readLockedSnapshot:snapshot,
    async transferAndVerify(_fence,expected){
      const {pageId,desired}=expected.content;
      const page=await remote(pageId);
      assertComplete(page,desired);
      if(JSON.stringify(await snapshot())!==JSON.stringify(expected))return false;
      const patch=selectiveNotionProperties(page.properties??{},desired);
      if(patch)await notionRequest<NotionPage>(bindings,"/pages/"+encodeURIComponent(pageId),
        {method:"PATCH",body:JSON.stringify({properties:patch})});
      const confirmed=await remote(pageId);
      assertComplete(confirmed,desired);
      return Object.entries(desired).every(([name,value])=>sameNotionProperty(confirmed.properties?.[name],value))&&
        JSON.stringify(await snapshot())===JSON.stringify(expected);
    },
    async unlockIfCurrent(fence,expected){
      if(JSON.stringify(await snapshot())!==JSON.stringify(expected))return false;
      const confirmed=await remote(expected.content.pageId);
      assertComplete(confirmed,expected.content.desired);
      if(!Object.entries(expected.content.desired).every(([name,value])=>sameNotionProperty(confirmed.properties?.[name],value)))return false;
      const result=await db.prepare("DELETE FROM admin_entity_reviews WHERE entity_type=? AND entity_id=?"+
        " AND EXISTS(SELECT 1 FROM "+spec.table+" WHERE id=? AND updated_at=? AND lower(status)<>'archived')"+
        " AND EXISTS(SELECT 1 FROM "+spec.mapping+" WHERE "+spec.key+"=? AND "+spec.page+"=?"+spec.extra+")"+
        " AND EXISTS(SELECT 1 FROM notion_unified_manual_fence WHERE agenda=? AND entity_id=? AND owner_token=?)"+
        " AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind=? AND record_id=?)")
        .bind(spec.type,id,id,expected.revision,id,expected.content.pageId,agenda,String(id),fence.token,agenda,id).run();
      return result.success&&result.meta.changes===1;
    },
  });
  // The canonical unlock has already committed. A failed metadata-only mirror
  // is retried by ordinary sync; it is never a reason to push content again.
  await mirrorStandaloneReviewFlag({database:db,bindings,agenda,id,pageId:preflight.content.pageId,sourceId}).catch(error=>
    console.warn("PROFILE_REVIEW_FLAG_PENDING",agenda,id,error instanceof Error?error.message:"UNKNOWN"));
}
