import { invalidateRecordPublicCache } from "@/lib/admin-record-lifecycle-cache";
import { env } from "cloudflare:workers";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  isRecordKind, lifecycleSchemaReady, recordLifecyclePreview,
  unpublishRecord, removeRecord, type LifecycleBindings,
} from "@/lib/admin-record-lifecycle";

type Context={params:Promise<{kind:string;id:string}>};
const noStore={ "cache-control":"private, no-store" };
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:noStore});
function message(error:unknown) {
  const code=error instanceof Error?error.message:"UNKNOWN";
  const allowed=new Set([
    "INVALID_RECORD_ID","RECORD_NOT_FOUND","LOCAL_ONLY_CONFIRMATION_REQUIRED",
    "RECORD_REMOVAL_IN_PROGRESS","RECORD_NOT_PUBLIC","RECORD_CONFIRMATION_MISMATCH","NOTION_MAPPING_AMBIGUOUS","NOTION_MAPPING_INVALID","NOTION_DATA_SOURCE_UNCONFIGURED",
  ]);
  return allowed.has(code)?code:"RECORD_LIFECYCLE_FAILED";
}
async function scope(context:Context) {
  const {kind,id}=await context.params;
  const number=Number(id);
  return isRecordKind(kind)&&/^[1-9]\d*$/.test(id)&&Number.isSafeInteger(number)
    ?{kind,id:number}:null;
}
function dbBinding() {
  const bindings=env as unknown as LifecycleBindings & {DB?:D1Database};
  return {db:bindings.DB,bindings};
}
export async function GET(_request:Request,context:Context) {
  if(!await getAdminApiUser())return unauthorizedAdminResponse();
  const target=await scope(context);
  if(!target)return json({error:"INVALID_RECORD_ID"},400);
  const {db,bindings}=dbBinding();
  if(!db)return json({error:"D1_UNAVAILABLE"},503);
  try{
    if(!await lifecycleSchemaReady(db))return json({error:"LIFECYCLE_MIGRATION_0164_REQUIRED"},503);
    const preview=await recordLifecyclePreview(db,bindings,target.kind,target.id);
    return preview?json(preview):json({error:"RECORD_NOT_FOUND"},404);
  }catch(error){
    const code=message(error);
    return json({error:code},code==="NOTION_MAPPING_AMBIGUOUS"||code==="NOTION_MAPPING_INVALID"?409:503);
  }
}
export async function POST(request:Request,context:Context) {
  const auth=await requireAdminMutation(request,{strictProvenance:true});
  if(auth.response)return auth.response;
  const target=await scope(context);
  if(!target)return json({error:"INVALID_RECORD_ID"},400);
  const {db,bindings}=dbBinding();
  if(!db)return json({error:"D1_UNAVAILABLE"},503);
  if(!request.headers.get("content-type")?.toLowerCase().includes("application/json"))
    return json({error:"JSON_REQUIRED"},415);
  let body:Record<string,unknown>;
  try{
    const parsed=await request.json();
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error();
    body=parsed as Record<string,unknown>;
  }catch{return json({error:"INVALID_JSON"},400);}
  try{
    if(!await lifecycleSchemaReady(db))return json({error:"LIFECYCLE_MIGRATION_0164_REQUIRED"},503);
    const preview=await recordLifecyclePreview(db,bindings,target.kind,target.id);
    if(!preview)return json({error:"RECORD_NOT_FOUND"},404);
    if(body.action==="unpublish") {
      const result=await unpublishRecord(db,bindings,target.kind,target.id);
      await invalidateRecordPublicCache(target.kind,preview.slug,preview.category,(env as unknown as {CF_VERSION_METADATA?:{id?:string}}).CF_VERSION_METADATA?.id);
      return json(result,result.notionSync==="PENDING"?202:200);
    }
    if(body.action==="delete") {
      if(body.confirmation!=="VYMAZAŤ")return json({error:"DELETE_CONFIRMATION_REQUIRED"},400);
      if(typeof body.expectedSlug!=="string"||typeof body.expectedName!=="string"||
          typeof body.expectedCategory!=="string")
        return json({error:"DELETE_IDENTITY_REQUIRED"},400);
      const expected={
        slug:body.expectedSlug,name:body.expectedName,category:body.expectedCategory,
      };
      const result=await removeRecord(db,bindings,target.kind,target.id,auth.user!.email,
        body.localOnly===true,expected);
      await invalidateRecordPublicCache(target.kind,preview.slug,preview.category,(env as unknown as {CF_VERSION_METADATA?:{id?:string}}).CF_VERSION_METADATA?.id);
      return json(result,result.state==="COMPLETE"?200:202);
    }
    return json({error:"UNSUPPORTED_LIFECYCLE_ACTION"},400);
  }catch(error){
    const code=message(error);
    return json({error:code},code==="LOCAL_ONLY_CONFIRMATION_REQUIRED"||code==="RECORD_REMOVAL_IN_PROGRESS"||code==="RECORD_NOT_PUBLIC"||
      code==="RECORD_CONFIRMATION_MISMATCH"||code==="NOTION_MAPPING_AMBIGUOUS"||code==="NOTION_MAPPING_INVALID"?409:
      code==="RECORD_NOT_FOUND"?404:code==="NOTION_DATA_SOURCE_UNCONFIGURED"?503:400);
  }
}
