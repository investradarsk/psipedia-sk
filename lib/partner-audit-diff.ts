/** Audit payload contains only the public fields already authorized for mutation.
 * No SEO, session, encrypted credentials or unrelated canonical columns.
 */
export type FieldChange={old:unknown;new:unknown};
export function partnerFieldDiff(before:Record<string,unknown>,after:Record<string,unknown>){
  const changes:Record<string,FieldChange>={};
  for(const [key,newValue] of Object.entries(after)){
    if(["__proto__","constructor","prototype"].includes(key))continue;
    const oldValue=before[key]??null;
    if(JSON.stringify(oldValue)!==JSON.stringify(newValue))
      changes[key]={old:oldValue,new:newValue??null};
  }
  return changes;
}
export function parsePartnerAuditChanges(raw:string){
  let obj:Record<string,unknown>={};
  try{
    const parsed:unknown=JSON.parse(raw);
    if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))obj=parsed as Record<string,unknown>;
  }catch{}
  const source=obj.changes;
  if(!source||typeof source!=="object"||Array.isArray(source))return {changes:[] as Array<{field:string;old:unknown;next:unknown}>,lifecycle:obj.lifecycleAction as string|undefined,note:obj.note as string|undefined};
  const changes=Object.entries(source as Record<string,unknown>).flatMap(([field,pair])=>{
    if(!pair||typeof pair!=="object"||Array.isArray(pair))return [];
    const x=pair as Record<string,unknown>;
    return [{field,old:x.old??null,next:x.new??null}];
  });
  return {changes,lifecycle:obj.lifecycleAction as string|undefined,note:obj.note as string|undefined};
}
