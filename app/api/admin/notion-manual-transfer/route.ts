import { env } from "cloudflare:workers";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  manualTransferSchemaReady,
  prepareManualTransferRun,
  readManualTransferRun,
  listManualTransferRuns,
  confirmManualTransferRun,
  confirmManualTransferItem,
  retryManualTransferFailed,
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
    const runId=url.searchParams.get("runId");
    if(!runId)return json({runs:await listManualTransferRuns(bindings.DB)});
    const offset=Number(url.searchParams.get("offset")??"0");
    const onlyErrors=url.searchParams.get("errors")==="1";
    const onlyDifferences=url.searchParams.get("differences")==="1";
    return json(await readManualTransferRun(bindings.DB,runId,offset,onlyErrors,onlyDifferences));
  }catch(error){return json({error:code(error)},400)}
}

/**
 * Only the owner-confirmed action can create a queued run; server-side
 * category and ID allowlists are enforced against the real D1 mappings.
 * This endpoint is disabled until owner deploys an owner-approved numbered migration of the proposed D1 journal
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
  const {action,confirm,runId,...requested}=payload as Record<string,unknown>;
  const actor=auth.user.email;
  try{
    if(action==="preview"){
      if(confirm!==undefined||runId!==undefined)
        return json({error:"TRANSFER_PREVIEW_REQUEST_INVALID"},400);
      return json(await prepareManualTransferRun({
        database:bindings.DB,request:requested,actor,
      }),202);
    }
    if(typeof runId!=="string")return json({error:"TRANSFER_RUN_ID_INVALID"},400);
    if(action==="confirm_item"){
      if(confirm!=="CONFIRM_ONE_NOTION_PROFILE"||Object.keys(requested).length!==1||
        typeof requested.itemId!=="number")
        return json({error:"TRANSFER_ITEM_CONFIRMATION_REQUIRED"},409);
      return json(await confirmManualTransferItem(
        bindings.DB,runId,requested.itemId,actor,
      ),202);
    }
    if(action==="confirm"){
      if(confirm!=="CONFIRM_NOTION_MANUAL_TRANSFER")
        return json({error:"TRANSFER_CONFIRMATION_REQUIRED"},409);
      return json(await confirmManualTransferRun(bindings.DB,runId,actor),202);
    }
    if(action==="retry"){
      if(confirm!=="RETRY_ONLY_FAILED")
        return json({error:"TRANSFER_RETRY_CONFIRMATION_REQUIRED"},409);
      return json(await retryManualTransferFailed(bindings.DB,runId,actor),202);
    }
    return json({error:"TRANSFER_ACTION_INVALID"},400);
  }catch(error){return json({error:code(error)},409)}
}
