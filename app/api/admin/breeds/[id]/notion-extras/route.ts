import {env} from "cloudflare:workers";
import {getAdminApiUser,requireAdminMutation,unauthorizedAdminResponse} from "@/lib/admin-auth";
import {getManagedBreed} from "@/lib/breed-store";
import {BREED_EXTRA_FIELDS,readBreedExtraFields,writeBreedExtraField} from "@/lib/notion-breed-extras";
import {notionRequest,type NotionPage} from "@/lib/notion-sync-shared";
import {notionPageBelongsToDataSource} from "@/lib/notion-sync-page-ownership";
import type {NotionBreedSyncBindings} from "@/lib/notion-breed-sync";

export const dynamic="force-dynamic";
type Props={params:Promise<{id:string}>};
type Bindings=NotionBreedSyncBindings & {DB?:D1Database};
const json=(data:unknown,status=200)=>Response.json(data,{
  status,headers:{"Cache-Control":"no-store"},
});
async function context(args:Props){
  const id=Number((await args.params).id);
  if(!Number.isSafeInteger(id)||id<1)throw new Error("INVALID_BREED_ID");
  const bindings=env as unknown as Bindings;
  if(!bindings.DB||!bindings.NOTION_API_TOKEN||!bindings.NOTION_BREEDS_DATA_SOURCE_ID)
    throw new Error("NOTION_BREEDS_NOT_CONFIGURED");
  const breed=await getManagedBreed(id);
  if(!breed)throw new Error("BREED_NOT_FOUND");
  const mapping=await bindings.DB.prepare(
    "SELECT notion_page_id FROM breed_notion_sync WHERE breed_id=? LIMIT 1"
  ).bind(id).first<{notion_page_id:string}>();
  if(!mapping)throw new Error("BREED_NOT_LINKED");
  return {id,bindings,mapping};
}
export async function GET(_request:Request,args:Props){
  if(!(await getAdminApiUser()))return unauthorizedAdminResponse();
  try{
    const ctx=await context(args);
    const values=await readBreedExtraFields(ctx.bindings.DB!,ctx.id);
    return json({fields:BREED_EXTRA_FIELDS.map(field=>({
      id:field.id,label:field.notion,type:field.type,
      value:values[field.id]??(field.type==="checkbox"?false:""),
    }))});
  }catch(e){return json({error:e instanceof Error?e.message:"READ_ERROR"},503);}
}
export async function PUT(request:Request,args:Props){
  const auth=await requireAdminMutation(request,{strictProvenance:true});
  if(auth.response||!auth.user)return auth.response??unauthorizedAdminResponse();
  let body:unknown;
  try{body=await request.json();}catch{return json({error:"INVALID_JSON"},400);}
  if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"INVALID_INPUT"},400);
  const {field,value}=body as Record<string,unknown>;
  if(typeof field!=="string"||!BREED_EXTRA_FIELDS.some(entry=>entry.id===field))
    return json({error:"FIELD_NOT_ALLOWED"},400);
  try{
    const ctx=await context(args);
    const page=await notionRequest<NotionPage>(ctx.bindings,
      "/pages/"+encodeURIComponent(ctx.mapping.notion_page_id));
    if(page.id!==ctx.mapping.notion_page_id||
       !notionPageBelongsToDataSource(page,ctx.bindings.NOTION_BREEDS_DATA_SOURCE_ID!)||
       String((page.properties?.["Psipedia ID"] as {rich_text?:Array<{plain_text?:string}>})?.rich_text
         ?.map(item=>item.plain_text??"").join("")??"")!==String(ctx.id))
      throw new Error("BREED_IDENTITY_MISMATCH");
    await writeBreedExtraField({
      db:ctx.bindings.DB!,bindings:ctx.bindings,page,breedId:ctx.id,field,value,
    });
    return json({ok:true,field,value});
  }catch(e){
    const code=e instanceof Error?e.message:"WRITE_ERROR";
    return json({error:/^BREED_[A-Z0-9_]+$/.test(code)?code:"REMOTE_WRITEBACK_FAILED"},409);
  }
}
