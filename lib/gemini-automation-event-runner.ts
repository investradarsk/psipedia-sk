import { createGeminiEventRequest } from "./gemini-automation-event-contract.ts";
import { loadGeminiEventMemory, checkGeminiEventDedupe } from "./gemini-automation-event-dedupe.ts";
import { bridgeGeminiEventToNotion } from "./gemini-automation-event-bridge.ts";
import { discoverGeminiEventCandidates } from "./gemini-automation-discovery.ts";
import { resolveGeminiConfig, type GeminiFetch } from "./gemini-automation-client.ts";
import { beginGeminiManualPilotRun,finishGeminiRun,markGeminiSettingLastRun } from "./gemini-automation-store.ts";
import { GeminiAutomationError, type GeminiRuntimeConfig } from "./gemini-automation-types.ts";
import { GeminiPilotGuardError, type GeminiPilotSummary } from "./gemini-automation-pilot.ts";
import type { NotionEventsHelpSyncBindings } from "./notion-events-help-sync.ts";

const RUNNING_WINDOW_MS=15*60_000;
export function parseGeminiEventRunBody(value:unknown):{stableKey:string} {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new GeminiPilotGuardError("PILOT_INVALID_SCOPE");
  const body=value as Record<string,unknown>;
  if(Object.keys(body).length!==1 || typeof body.stable_key!=="string")
    throw new GeminiPilotGuardError("PILOT_INVALID_SCOPE");
  try { createGeminiEventRequest({stableKey:body.stable_key,maxCandidates:1}); }
  catch { throw new GeminiPilotGuardError("PILOT_INVALID_SCOPE"); }
  return {stableKey:body.stable_key};
}
type Dependencies={
  discovery?:typeof discoverGeminiEventCandidates;
  dedupe?:typeof checkGeminiEventDedupe;
  bridge?:typeof bridgeGeminiEventToNotion;
};
export async function runGeminiEventCategory(input:{
  database:D1Database;env:GeminiRuntimeConfig & NotionEventsHelpSyncBindings;
  stableKey:string;now?:()=>Date;fetchImpl?:GeminiFetch;dependencies?:Dependencies;
}):Promise<GeminiPilotSummary> {
  const {stableKey}=parseGeminiEventRunBody({stable_key:input.stableKey});
  const setting=await input.database.prepare(
    "SELECT id,max_new_concepts FROM gemini_automation_settings WHERE stable_key=? LIMIT 1")
    .bind(stableKey).first<{id:number;max_new_concepts:number}>();
  if(!setting)throw new GeminiPilotGuardError("PILOT_SETTING_NOT_SAVED");
  const maximum=Math.min(setting.max_new_concepts,5);
  if(!Number.isSafeInteger(maximum)||maximum<1)throw new GeminiPilotGuardError("PILOT_LIMIT_ZERO");
  const now=input.now??(()=>new Date()),start=now().toISOString();
  const model=input.env.GEMINI_MODEL?.trim()||"unconfigured";
  const runId=await beginGeminiManualPilotRun(input.database,{
    settingId:setting.id,stableKey,model,at:start,
    staleBefore:new Date(new Date(start).getTime()-RUNNING_WINDOW_MS).toISOString(),
  });
  if(!runId)throw new GeminiPilotGuardError("PILOT_ALREADY_RUNNING");
  const summary:GeminiPilotSummary={runId,status:"SUCCESS",model,candidateCount:0,duplicateCount:0,
    possibleDuplicateCount:0,rejectedBeforeCount:0,conceptCount:0,groundedSearchQueryCount:0,concepts:[]};
  let requestCount=0;
  try {
    resolveGeminiConfig(input.env);
    if(!/^gemini-3(?:[.-]|$)/.test(model))throw new GeminiAutomationError("CONFIG_MISSING");
    const memory=await loadGeminiEventMemory(input.database,stableKey);
    // One provider interaction only. No model rewrite, retry or alternate search transport.
    requestCount=1;
    const found=await (input.dependencies?.discovery??discoverGeminiEventCandidates)({
      env:input.env,stableKey,maxCandidates:maximum,fetchImpl:input.fetchImpl,knownContext:memory,
    });
    summary.candidateCount=found.candidates.length;
    summary.groundedSearchQueryCount=found.providerMetrics.groundedSearchQueryCount;
    if(summary.candidateCount>maximum)throw new GeminiAutomationError("INVALID_RESPONSE");
    for(const candidate of found.candidates) {
      // Candidate is parsed again by the bridge. Deduplication never trusts provider hints.
      const decision=await (input.dependencies?.dedupe??checkGeminiEventDedupe)(input.database,stableKey,candidate);
      if(decision.status!=="NEW")summary.duplicateCount++;
      if(decision.status==="POSSIBLE_DUPLICATE")summary.possibleDuplicateCount++;
      if(decision.status==="REJECTED_BEFORE")summary.rejectedBeforeCount++;
      if(decision.status!=="NEW")continue;
      const linked=await (input.dependencies?.bridge??bridgeGeminiEventToNotion)({
        database:input.database,notion:input.env,stableKey,candidate,
      });
      if(linked.created) {
        summary.conceptCount++;
        summary.concepts.push({conceptId:linked.conceptId,canonicalEntityId:linked.canonicalEntityId,notionPageId:linked.notionPageId});
      }
    }
    await finishGeminiRun(input.database,{id:runId,status:"SUCCESS",at:now().toISOString(),
      requestCount,groundedSearchQueryCount:summary.groundedSearchQueryCount,candidateCount:summary.candidateCount,
      duplicateCount:summary.duplicateCount,conceptCount:summary.conceptCount,errorCount:0});
  }catch(error) {
    summary.status="FAILED";
    if(error instanceof GeminiAutomationError) {
      summary.errorCode=error.code;
      if(error.code==="INVALID_RESPONSE" && Number.isInteger(error.groundedSearchQueryCount) &&
        (error.groundedSearchQueryCount??0)>=0 && (error.groundedSearchQueryCount??0)<=100)
        summary.groundedSearchQueryCount=error.groundedSearchQueryCount!;
    }
    await finishGeminiRun(input.database,{id:runId,status:"FAILED",at:now().toISOString(),
      requestCount,groundedSearchQueryCount:summary.groundedSearchQueryCount,candidateCount:summary.candidateCount,
      duplicateCount:summary.duplicateCount,conceptCount:summary.conceptCount,errorCount:1,errorCode:summary.errorCode});
  }
  await markGeminiSettingLastRun(input.database,setting.id,now().toISOString());
  return summary;
}
