import { env } from "cloudflare:workers";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  manualTransferSchemaReady,
  prepareManualTransferRun,
  readManualTransferRun,
} from "@/lib/notion-manual-transfer-queue";

export const dynamic="force-dynamic";
type Bindings={DB?:D1Database;NOTION_MANUAL_TRANSFER_ENABLED?:string};
function json(value:unknown,status=200){return Response.json(value,{
  status,headers:{"Cache-Control":"no-store"},
})}
function code(error:unknown){
  const message=error instanceof Error?error.message:"TRANSFER_UNKNOWN_ERROR";
  return /^[A-Z][A-Z0-9_]{2,100}$/.test(message)?message:"TRANSFER_UNKNOWN_ERROR";
}

/** Status is read-only, intentionally omitting raw provider data and field values. */
export async function GET(request:Request){
  if(!(await getAdminApiUser()))return unauthorizedAdminResponse();
  const bindings=env as unknown as Bindings;
  if(!bindings.DB)return json({error:"TRANSFER_DB_UNAVAILABLE"},503);
  try{
    const url=new URL(request.url);
    const runId=url.searchParams.get("runId")??"";
    return json(await readManualTransferRun(bindings.DB,runId));
  }catch(error){return json({error:code(error)},400)}
}

/**
 * Only the owner-confirmed action can create a queued run; server-side
 * category and ID allowlists are enforced against the real D1 mappings.
 * This endpoint is disabled until owner deploys the approved 0156 migration
 * and sets NOTION_MANUAL_TRANSFER_ENABLED=true.
 *
 * Part 3 will add preflight preview and render the explicit confirmation UI.
 */
export async function POST(request:Request){
  const auth=await requireAdminMutation(request,{strictProvenance:true});
  if(auth.response||!auth.user)return auth.response??unauthorizedAdminResponse();
  const bindings=env as unknown as Bindings;
  if(!bindings.DB)return json({error:"TRANSFER_DB_UNAVAILABLE"},503);
  if(bindings.NOTION_MANUAL_TRANSFER_ENABLED!=="true")
    return json({error:"TRANSFER_NOT_ENABLED"},409);
  if(!await manualTransferSchemaReady(bindings.DB))
    return json({error:"TRANSFER_MIGRATION_REQUIRED"},503);
  let payload:unknown;
  try{payload=await request.json()}catch{return json({error:"TRANSFER_JSON_INVALID"},400)}
  if(!payload||typeof payload!=="object"||Array.isArray(payload))
    return json({error:"TRANSFER_JSON_INVALID"},400);
  const {confirm, ...requested}=payload as Record<string,unknown>;
  if(confirm!=="CONFIRM_NOTION_MANUAL_TRANSFER")
    return json({error:"TRANSFER_CONFIRMATION_REQUIRED"},409);
  try{
    return json(await prepareManualTransferRun({
      database:bindings.DB,
      request:requested,
      actor:auth.user.email,
    }),202);
  }catch(error){return json({error:code(error)},409)}
}
