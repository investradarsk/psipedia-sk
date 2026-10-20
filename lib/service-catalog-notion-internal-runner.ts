/**
 * Opt-in Services V3 catalog internal coordinator; not wired to any API,
 * queue or cron. Separate owner authorization is required before invocation.
 *
 * The D1 database is canonical. Only dynamic admin options are mirrored.
 * No profile edits, no public publishing, no bulk creation or migration.
 * Reuses 0124 coordination locks, pinned dedicated Notion data source.
 */
import {buildServicesV3NotionBootstrapInventory} from "./service-catalog-notion-bootstrap-plan.ts";
import {createServicesV3CatalogD1Lease} from "./service-catalog-notion-durable-lease.ts";
import {createPsipediaServiceCatalogReadOnlyRegistry,
  createPsipediaServiceCatalogNotionHttpPort} from "./service-catalog-notion-http-port.ts";
import {provisionServiceCatalogNotionPage} from "./service-catalog-notion-page-provisioner.ts";
import {executeServiceCatalogNotionMirror} from "./service-catalog-notion-mirror-executor.ts";

type Env={
  NOTION_API_TOKEN?:string;
  SERVICE_CATALOG_ADMIN_WRITES_ENABLED?:string;
  SERVICE_CATALOG_NOTION_MIRROR_READY?:string;
  SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED?:string;
  SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED?:string;
};
type Action="INVENTORY"|"PROVISION_ONE"|"MIRROR_ONE";
type Input={
  db:D1Database;
  env:Env;
  action:Action;
  optionId?:string;
  /**
   * Mandatory server-owned permission check, not caller-provided HTTP state.
   * Future Admin action MUST use requireAdminMutation and explicit human intent.
   */
  authorize:()=>Promise<boolean>;
  fetcher?:typeof fetch;
};
export type CatalogInternalRunResult=
  | {state:"BLOCKED"|"REVIEW";reason:string;action:Action}
  | {state:"INVENTORY";value:Awaited<ReturnType<typeof buildServicesV3NotionBootstrapInventory>>}
  | {state:"PROVISION";result:Awaited<ReturnType<typeof provisionServiceCatalogNotionPage>>}
  | {state:"MIRROR";result:Awaited<ReturnType<typeof executeServiceCatalogNotionMirror>>};
const DYNAMIC=/^(svc|attr)\.admin\.[a-f0-9]{32}$/;
const enabled=(s?:string)=>s==="true";

export async function runServicesV3CatalogInternal(input:Input):Promise<CatalogInternalRunResult>{
  const {db,env,action}=input??{};
  if(!db?.prepare||!env||!input.authorize||typeof input.authorize!=="function")
    return {state:"BLOCKED",reason:"MISSING_SERVER_DEPENDENCY",action};
  if(!["INVENTORY","PROVISION_ONE","MIRROR_ONE"].includes(action))
    return {state:"BLOCKED",reason:"INVALID_ACTION",action};
  try{
    if(await input.authorize()!==true)
      return {state:"BLOCKED",reason:"UNAUTHORIZED",action};
  }catch{return {state:"BLOCKED",reason:"AUTHORIZATION_FAILED",action};}
  const token=env.NOTION_API_TOKEN?.trim();
  if(!token)return {state:"BLOCKED",reason:"NOTION_TOKEN_UNAVAILABLE",action};
  const flags={
    adminWrites:env.SERVICE_CATALOG_ADMIN_WRITES_ENABLED,
    notionMirrorReady:env.SERVICE_CATALOG_NOTION_MIRROR_READY,
    mirrorExecutor:env.SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED,
    allowPageProvisioning:env.SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED,
  };
  if(action!=="INVENTORY"){
    // Production currently has NONE of these Services V3 vars enabled.
    if(!enabled(flags.adminWrites)||!enabled(flags.notionMirrorReady)||!enabled(flags.mirrorExecutor))
      return {state:"BLOCKED",reason:"FEATURE_DISABLED",action};
    if(action==="PROVISION_ONE"&&!enabled(flags.allowPageProvisioning))
      return {state:"BLOCKED",reason:"PAGE_CREATION_DISABLED",action};
    if(!input.optionId||!DYNAMIC.test(input.optionId))
      return {state:"BLOCKED",reason:"INVALID_OPTION_ID",action};
  }
  try{
    const registry=createPsipediaServiceCatalogReadOnlyRegistry({token,fetcher:input.fetcher});
    if(action==="INVENTORY"){
      const value=await buildServicesV3NotionBootstrapInventory(db,registry);
      return {state:"INVENTORY",value};
    }
    const lease=createServicesV3CatalogD1Lease(db);
    const notion=createPsipediaServiceCatalogNotionHttpPort({
      token,fetcher:input.fetcher,allowWrites:true,
      allowCreates:action==="PROVISION_ONE",
    });
    if(action==="PROVISION_ONE"){
      const result=await provisionServiceCatalogNotionPage(
        {db,lease,flags,registry,notion},input.optionId!);
      return {state:"PROVISION",result};
    }
    const result=await executeServiceCatalogNotionMirror(
      {db,lease,flags,registry,notion},input.optionId!);
    return {state:"MIRROR",result};
  }catch{
    // Never convert an uncertain external mutation into a successful status.
    return {state:"REVIEW",reason:"INTERNAL_EXECUTION_UNVERIFIED",action};
  }
}
