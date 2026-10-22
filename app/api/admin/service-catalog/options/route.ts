import {env} from "cloudflare:workers";
import {getAdminApiUser,requireAdminMutation,unauthorizedAdminResponse} from "@/lib/admin-auth";
import {createAdminCatalogOption,listAdminCatalogOptions,ServiceCatalogConflictError,ServiceCatalogInputError,ServiceCatalogSchemaError,requireServiceCatalogAuditSchema} from "@/lib/service-catalog-admin-store";

export const dynamic="force-dynamic";
type Bindings={DB?:D1Database;SERVICE_CATALOG_ADMIN_WRITES_ENABLED?:string;SERVICE_CATALOG_NOTION_MIRROR_READY?:string};
const settings=()=>env as unknown as Bindings;
// Deliberate double safety gate. Neither variable is enabled in current Wrangler.
const writersEnabled=()=>settings().SERVICE_CATALOG_ADMIN_WRITES_ENABLED==="true";
export async function GET(){
  const admin=await getAdminApiUser();
  if(!admin)return unauthorizedAdminResponse();
  const db=settings().DB;
  if(!db)return Response.json({error:"D1 is unavailable."},{status:503});
  try{return Response.json({options:await listAdminCatalogOptions(db)});}
  catch(error){return Response.json({error:error instanceof Error?error.message:"Read failed."},
    {status:error instanceof ServiceCatalogSchemaError?503:500});}
}
export async function POST(request:Request){
  const auth=await requireAdminMutation(request);
  if(auth.response)return auth.response;
  if(!writersEnabled())return Response.json({error:"Canonical options are not activated."},{status:503});
  const db=settings().DB;
  if(!db)return Response.json({error:"D1 is unavailable."},{status:503});
  try{
    await requireServiceCatalogAuditSchema(db);
    const option=await createAdminCatalogOption(db,await request.json(),auth.user!.email);
    return Response.json({option},{status:201});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"Write failed."},
      {status:error instanceof ServiceCatalogInputError||error instanceof SyntaxError?400:error instanceof ServiceCatalogConflictError?409:error instanceof ServiceCatalogSchemaError?503:500});
  }
}
