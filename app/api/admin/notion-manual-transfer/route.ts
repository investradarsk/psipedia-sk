import { env } from "cloudflare:workers";
import { NOTION_AUTHORITY_GROUPS } from "@/lib/notion-field-authority";
import { areaOfManualTransferScope, validateManualTransferRequest } from "@/lib/notion-manual-transfer-contract";
import { readManualMappingDiagnostics, manualRemoteDiagnostic } from "@/lib/notion-manual-transfer-mapping";
import { inspectManualTransferRecord, type ManualInspectionBindings } from "@/lib/notion-manual-transfer-inspect";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  manualTransferSchemaReady,
  prepareManualTransferRun,
  readManualTransferRun,
  listManualTransferRuns,
  confirmManualTransferRun,
  confirmManualTransferItem,
  retryManualTransferFailed,
  InvalidManualTransferMapping,
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
    if (url.searchParams.get("diagnostics") === "1") {
      const rawId = url.searchParams.get("profileId");
      const scope = url.searchParams.get("scope");
      const selection = rawId === null ? "ALL" : "ONE";
      if (rawId !== null && !/^[1-9]\d*$/.test(rawId))
        return json({error:"TRANSFER_PROFILE_ID_INVALID"},400);
      const query = validateManualTransferRequest({
        area: url.searchParams.get("area"), direction: "NOTION_TO_ADMIN", selection,
        ...(scope ? { scope } : {}), ...(rawId === null ? {} : { profileId: Number(rawId) }),
      }, NOTION_AUTHORITY_GROUPS);
      const offset = Number(url.searchParams.get("offset") ?? "0");
      const verify = url.searchParams.get("verify") === "1";
      if (verify && (selection !== "ONE" || offset !== 0))
        return json({error:"TRANSFER_DIAGNOSTIC_REQUEST_INVALID"},400);
      const allowed = new Set(NOTION_AUTHORITY_GROUPS.filter(group => group.active && areaOfManualTransferScope(group.scope) !== null).map(group => group.scope));
      const report = await readManualMappingDiagnostics(bindings.DB, { ...query, offset }, allowed);
      if (verify && report.result.length === 1 && !report.hasMore) {
        const { diagnostic, pageId } = report.result[0];
        if (diagnostic.issues.length || !diagnostic.profileId || !pageId) diagnostic.remote = "BLOCKED";
        else try {
          await inspectManualTransferRecord({ database: bindings.DB, bindings: env as unknown as ManualInspectionBindings,
            link: {scope: diagnostic.scope, profile_id: diagnostic.profileId, notion_page_id: pageId}, direction: query.direction });
          diagnostic.remote = "VERIFIED";
        } catch (error) { diagnostic.remote = manualRemoteDiagnostic(error); }
      }
      return json({items: report.result.map(row => row.diagnostic), offset: report.offset, hasMore: report.hasMore,
        ambiguousSelection: verify && report.result.length > 1, checkedAt: new Date().toISOString(), readOnly: true});
    }
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
  }catch(error){
    // No raw Notion ID, email, field value or provider response leaves this endpoint.
    if(error instanceof InvalidManualTransferMapping)
      return json({error:code(error),scope:error.scope,profileId:error.profileId,
        invalidPart:error.invalidPart},409);
    return json({error:code(error)},409);
  }
}
