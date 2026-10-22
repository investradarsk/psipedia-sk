import {env} from "cloudflare:workers";
import {requireAdminMutation} from "@/lib/admin-auth";
import {mutateAdminCatalogOption} from "@/lib/service-catalog-admin-lifecycle";
import {ServiceCatalogConflictError,ServiceCatalogInputError,ServiceCatalogSchemaError,requireServiceCatalogAuditSchema} from "@/lib/service-catalog-admin-store";

export const dynamic="force-dynamic";
type Props={params:Promise<{id:string}>};
type Bindings={DB?:D1Database;SERVICE_CATALOG_ADMIN_WRITES_ENABLED?:string;SERVICE_CATALOG_NOTION_MIRROR_READY?:string};

/** One existing resource namespace; no separate approve/retire shadow APIs. */
export async function PATCH(request:Request,{params}:Props){
  const auth=await requireAdminMutation(request);
  if(auth.response)return auth.response;
  const cfg=env as unknown as Bindings;
  if(cfg.SERVICE_CATALOG_ADMIN_WRITES_ENABLED!=="true")
    return Response.json({error:"Canonical catalog lifecycle is not activated."},{status:503});
  if(!cfg.DB)return Response.json({error:"D1 is unavailable."},{status:503});
  try{
    await requireServiceCatalogAuditSchema(cfg.DB);
    const {id}=await params;
    const option=await mutateAdminCatalogOption(cfg.DB,id,await request.json(),auth.user!.email);
    return Response.json({option});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"Catalog lifecycle failed."},
      {status:error instanceof ServiceCatalogInputError||error instanceof SyntaxError?400:error instanceof ServiceCatalogConflictError?409:error instanceof ServiceCatalogSchemaError?503:500});
  }
}
