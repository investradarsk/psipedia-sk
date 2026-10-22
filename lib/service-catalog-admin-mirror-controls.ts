/**
 * Browser-safe, pure eligibility for the existing Services V3 one-option
 * D1 -> dedicated Notion catalog workflow. Never authorizes a mutation.
 *
 * The server route independently enforces Admin Access, exact same-origin,
 * the release flags, full canonical D1/Notion inventory and a durable lease.
 */
import type {CatalogEditorItem} from "./service-catalog-admin-editor-view.ts";

export type CatalogMirrorManualAction="PROVISION_ONE"|"MIRROR_ONE";
export type CatalogMirrorInventoryForUi=Readonly<{
  mode:"READ_ONLY";
  blocked:boolean;
  items:readonly Readonly<{
    optionId:string;
    version:number;
    disposition:"NEEDS_PAGE"|"MAPPED_PENDING"|"SYNCED_VERIFIED"|"BLOCKED";
  }>[];
}>;

export function manualCatalogMirrorAction(
  item:CatalogEditorItem|null,
  inventory:CatalogMirrorInventoryForUi|null,
  gates:Readonly<{mirrorEnabled:boolean;pageCreationEnabled:boolean}>
):CatalogMirrorManualAction|null{
  if(!item||item.source!=="admin"||item.status!=="DRAFT"||item.mirror!=="PENDING"||
     !/^(svc|attr)\.admin\.[a-f0-9]{32}$/.test(item.id)||
     !Number.isSafeInteger(item.version)||item.version===null||item.version<1||
     !inventory||inventory.mode!=="READ_ONLY"||inventory.blocked||
     !gates.mirrorEnabled)return null;
  const matches=inventory.items.filter(row=>row.optionId===item.id);
  if(matches.length!==1||matches[0].version!==item.version)return null;
  if(matches[0].disposition==="NEEDS_PAGE")
    return gates.pageCreationEnabled?"PROVISION_ONE":null;
  if(matches[0].disposition==="MAPPED_PENDING")return "MIRROR_ONE";
  return null;
}

export function manualCatalogMirrorConfirmation(
  action:CatalogMirrorManualAction,optionId:string
):string{
  return "SERVICES-V3-"+action+"-"+optionId;
}
