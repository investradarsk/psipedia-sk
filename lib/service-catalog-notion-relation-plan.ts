/** Safe per-service, three-way reconciliation for an editable Notion relation.
 * Each immutable service ID behaves like an independently edited boolean field.
 * Only a verified baseline authorizes inferring a deletion from an absent ID.
 */
export type CatalogRelationPlan={action:"pull"|"push"|"merge"|"record"|"conflict";target:readonly string[]};
export function planCatalogRelationSync(
  canonical:readonly string[],notion:readonly string[],previous:readonly string[]|null
):CatalogRelationPlan{
  const sorted=(ids:readonly string[])=>[...new Set(ids)].sort();
  const local=sorted(canonical),remote=sorted(notion),old=previous===null?null:sorted(previous);
  const equal=(a:readonly string[],b:readonly string[])=>JSON.stringify(a)===JSON.stringify(b);
  if(equal(local,remote))return {action:"record",target:local};
  if(old===null){
    // On first contact, neither side can prove a remote removal.
    if(!local.length)return {action:"pull",target:remote};
    if(!remote.length)return {action:"push",target:local};
    return {action:"conflict",target:[]};
  }
  const leftChanged=!equal(local,old),rightChanged=!equal(remote,old);
  if(!leftChanged&&!rightChanged)return {action:"record",target:local};
  if(!leftChanged)return {action:"pull",target:remote};
  if(!rightChanged)return {action:"push",target:local};
  // Both sides changed. Merge independently by ID relative to the last
  // confirmed common state. Unrelated additions/removals must not conflict.
  const base=new Set(old),left=new Set(local),right=new Set(remote);
  const merged=new Set<string>();
  for(const id of new Set([...old,...local,...remote])){
    const was=base.has(id),l=left.has(id),r=right.has(id);
    // A boolean value has only one possible changed state. If both sides
    // changed the same ID they agree; if one side did, its value wins.
    const final=l!==was?l:r!==was?r:was;
    if(final)merged.add(id);
  }
  const target=sorted([...merged]);
  if(equal(target,local)&&equal(target,remote))return {action:"record",target};
  if(equal(target,local))return {action:"push",target};
  if(equal(target,remote))return {action:"pull",target};
  return {action:"merge",target};
}
