import { NOTION_AUTHORITY_GROUPS } from "./notion-field-authority";
import { planOwnerDirectedFields } from "./notion-manual-transfer-plan";
import {
  inspectManualBreedProfile,
  type NotionBreedSyncBindings,
} from "./notion-breed-sync";
import {
  inspectManualDirectoryProfile,
  type NotionDirectorySyncBindings,
} from "./notion-directory-sync";
import {
  inspectManualEshopProfile,
  type NotionEshopSyncBindings,
} from "./notion-eshop-sync";
import {
  inspectManualEventsHelpProfile,
  type NotionEventsHelpSyncBindings,
} from "./notion-events-help-sync";
import type { BidirectionalAgendaKey } from "./notion-events-help-adapters";
import type { ManualTransferFieldResult } from "./notion-manual-transfer-contract";
import type { ManualFieldDirection } from "./notion-manual-transfer-plan";

export type ManualInspectionBindings=NotionBreedSyncBindings &
  NotionDirectorySyncBindings & NotionEshopSyncBindings & NotionEventsHelpSyncBindings;

export type ManualInspection = {
  scope:string;
  profileId:number;
  fields:ManualTransferFieldResult[];
  changed:number;
  same:number;
  skipped:number;
  /** Value-free fingerprint, both sides. Refuse changed preview during execution. */
  fingerprint:string;
  /** Current directional source field values, used transiently for read-back proof. */
  source:Record<string,unknown>;
};
type Link={scope:string;profile_id:number;notion_page_id:string};
function stable(value:unknown):unknown{
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==="object"){
    const entries=Object.entries(value as Record<string,unknown>)
      .sort(([a],[b])=>a.localeCompare(b));
    return Object.fromEntries(entries.map(([k,v])=>[k,stable(v)]));
  }
  return value;
}
async function digest(value:unknown):Promise<string>{
  const encoded=new TextEncoder().encode(JSON.stringify(stable(value)));
  const data=await crypto.subtle.digest("SHA-256",encoded);
  return [...new Uint8Array(data)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
function at(record:Record<string,unknown>,path:string):unknown{
  if(Object.prototype.hasOwnProperty.call(record,path))return record[path];
  return path.split(".").reduce<unknown>((v,key)=>v&&typeof v==="object"
    ?(v as Record<string,unknown>)[key]:undefined,record);
}
export async function inspectManualTransferRecord(input:{
  database:D1Database;bindings:ManualInspectionBindings;link:Link;
  direction:ManualFieldDirection;
}):Promise<ManualInspection>{
  const {database,bindings,link,direction}=input;
  const group=NOTION_AUTHORITY_GROUPS.find(g=>g.scope===link.scope&&g.active);
  if(!group)throw Error("TRANSFER_SCOPE_UNSUPPORTED");
  let values:{notion:Record<string,unknown>;admin:Record<string,unknown>;excluded:string[]};
  if(link.scope==="breeds"){
    values=await inspectManualBreedProfile({database,bindings,
      profileId:link.profile_id,pageId:link.notion_page_id});
  }else if(link.scope.startsWith("directory:")){
    values=await inspectManualDirectoryProfile({database,bindings,
      scope:link.scope,profileId:link.profile_id,pageId:link.notion_page_id});
  }else if(link.scope==="eshops"){
    values=await inspectManualEshopProfile({database,bindings,
      profileId:link.profile_id,pageId:link.notion_page_id});
  }else{
    values=await inspectManualEventsHelpProfile({database,bindings,
      profileId:link.profile_id,pageId:link.notion_page_id,
      agenda:link.scope as BidirectionalAgendaKey});
  }
  const excluded=new Set(values.excluded);
  const locked=new Set(group.fields.filter(f=>f.locked).map(f=>f.id));
  for(const key of excluded)locked.add(key);
  const plan=planOwnerDirectedFields({
    notion:values.notion,admin:values.admin,direction,
    editablePaths:group.fields.map(f=>f.id),protectedPaths:locked,
  });
  const fields:ManualTransferFieldResult[]=plan.results.map(f=>({
    field:f.field,label:group.fields.find(g=>g.id===f.field)?.label??f.field,
    status:f.state==="CHANGE"?"CHANGE":f.state==="SAME"?"SAME":"SKIPPED",
    ...(f.reason?{reason:f.reason==="PROTECTED_FIELD"
      ?(excluded.has(f.field)?"SPECIAL_ADAPTER_REQUIRED":"PROTECTED_FIELD")
      :"FIELD_MISSING" as const}:{}),
  }));
  return {
    scope:link.scope,profileId:link.profile_id,fields,
    changed:fields.filter(f=>f.status==="CHANGE").length,
    same:fields.filter(f=>f.status==="SAME").length,
    skipped:fields.filter(f=>f.status==="SKIPPED").length,
    fingerprint:await digest({notion:values.notion,admin:values.admin}),
    source:direction==="NOTION_TO_ADMIN"?values.notion:values.admin,
  };
}
export function verifyManualTransferFields(
  before:ManualInspection,after:ManualInspection,
):{field:string;status:"SAME"|"UPDATED"|"SKIPPED"|"FAILED";reason_code:string|null}[]{
  return before.fields.map(f=>{
    if(f.status==="SKIPPED")return {field:f.field,status:"SKIPPED" as const,
      reason_code:f.reason??"FIELD_MISSING"};
    const final=after.fields.find(item=>item.field===f.field);
    if(f.status==="SAME"){
      return {field:f.field,status:final?.status==="SAME"?"SAME" as const:"FAILED" as const,
        reason_code:final?.status==="SAME"?null:"TRANSFER_CHANGED_DURING_RUN"};
    }
    if(final?.status!=="SAME")return {field:f.field,status:"FAILED" as const,
      reason_code:"TRANSFER_FIELD_NOT_MATCHED"};
    // The target equals the source at readback, even when the adapter
    // normalized its representation. Never use a generic DONE as proof.
    return {field:f.field,status:"UPDATED" as const,reason_code:null};
  });
}
