/**
 * Services V3 — manually invoked Admin-only catalog mirror operations.
 *
 * GET: read-only D1 + dedicated Notion catalog inventory.
 * POST: opt-in, one dynamic option only. Requires authenticated Admin,
 * strict same-origin mutation provenance, four rollout safety gates for
 * page creation (three for mirror), and an explicit action/ID confirmation.
 *
 * No cron, background task, bulk action or automatic flag activation.
 * This route is NOT deployed as part of this Draft PR.
 */
import {env} from "cloudflare:workers";
import {getAdminApiUser,requireAdminMutation,unauthorizedAdminResponse} from "@/lib/admin-auth";
import {runServicesV3CatalogInternal} from "@/lib/service-catalog-notion-internal-runner";

export const dynamic="force-dynamic";
export const runtime="edge";

type Bindings={
  DB?:D1Database;
  NOTION_API_TOKEN?:string;
  SERVICE_CATALOG_ADMIN_WRITES_ENABLED?:string;
  SERVICE_CATALOG_NOTION_MIRROR_READY?:string;
  SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED?:string;
  SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED?:string;
};
const DYNAMIC=/^(svc|attr)\.admin\.[a-f0-9]{32}$/;
const ACTIONS=["PROVISION_ONE","MIRROR_ONE"] as const;
type Action=typeof ACTIONS[number];
const cfg=()=>env as unknown as Bindings;
const blocked=(message:string,status=503)=>Response.json({error:message},{status,headers:{"Cache-Control":"no-store"}});
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"no-store"}});

export async function GET(){
  const user=await getAdminApiUser();
  if(!user)return unauthorizedAdminResponse();
  const settings=cfg();
  if(!settings.DB)return blocked("D1_UNAVAILABLE");
  if(!settings.NOTION_API_TOKEN?.trim())return blocked("NOTION_TOKEN_UNAVAILABLE");
  const result=await runServicesV3CatalogInternal({
    db:settings.DB,env:settings,action:"INVENTORY",
    authorize:async()=>Boolean(user.email),
  });
  return reply(result,result.state==="INVENTORY"?200:503);
}

export async function POST(request:Request){
  const auth=await requireAdminMutation(request,{strictProvenance:true});
  if(auth.response)return auth.response;
  const settings=cfg();
  if(!settings.DB)return blocked("D1_UNAVAILABLE");
  // All writes remain OFF until separately approved production activation.
  if(settings.SERVICE_CATALOG_ADMIN_WRITES_ENABLED!=="true"||
     settings.SERVICE_CATALOG_NOTION_MIRROR_READY!=="true"||
     settings.SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED!=="true")
    return blocked("SERVICES_V3_WRITE_FLAGS_OFF");
  if(!settings.NOTION_API_TOKEN?.trim())return blocked("NOTION_TOKEN_UNAVAILABLE");
  // Enforce bounded, exact JSON shape; never accept arbitrary Notion data,
  // caller-provided properties, page IDs, source IDs or admin identities.
  const contentLength=request.headers.get("content-length");
  if(contentLength!==null&&(!/^\d+$/.test(contentLength)||Number(contentLength)>1024))
    return blocked("INVALID_REQUEST_SIZE",413);
  let body:unknown;
  try{
    const raw=await request.text();
    if(raw.length>1024)return blocked("INVALID_REQUEST_SIZE",413);
    body=JSON.parse(raw);
  }catch{return blocked("INVALID_JSON_BODY",400);}
  if(!body||typeof body!=="object"||Array.isArray(body))
    return blocked("INVALID_REQUEST_BODY",400);
  const b=body as Record<string,unknown>;
  if(Object.keys(b).length!==3||Object.keys(b).some(k=>!["action","optionId","confirmation"].includes(k)))
    return blocked("UNEXPECTED_REQUEST_FIELDS",400);
  if(typeof b.optionId!=="string"||!DYNAMIC.test(b.optionId)||
     typeof b.action!=="string"||!ACTIONS.includes(b.action as Action))
    return blocked("INVALID_OPERATION_OR_OPTION",400);
  const action=b.action as Action;
  if(action==="PROVISION_ONE"&&settings.SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED!=="true")
    return blocked("SERVICES_V3_PAGE_CREATION_OFF");
  const expected="SERVICES-V3-"+action+"-"+b.optionId;
  if(b.confirmation!==expected)return blocked("EXPLICIT_CONFIRMATION_REQUIRED",409);
  const result=await runServicesV3CatalogInternal({
    db:settings.DB,env:settings,action,optionId:b.optionId,
    authorize:async()=>Boolean(auth.user?.email),
  });
  // Propagate uncertainty as non-2xx status; never falsely report success.
  const state=result.state==="PROVISION"||result.state==="MIRROR"?result.result.state:result.state;
  const status=state==="CREATED_NEEDS_MIRROR"||state==="EXISTS"||state==="VERIFIED"?200:
    state==="REVIEW"||state==="RETRY"?409:503;
  return reply(result,status);
}
