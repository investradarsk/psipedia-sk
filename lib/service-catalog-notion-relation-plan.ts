/** Safe three-way reconciliation for an editable Notion service relation. */
export type CatalogRelationPlan={action:"pull"|"push"|"record"|"conflict";target:readonly string[]};
export function planCatalogRelationSync(
  canonical:readonly string[],notion:readonly string[],previous:readonly string[]|null
):CatalogRelationPlan{
  const sorted=(ids:readonly string[])=>[...new Set(ids)].sort();
  const local=sorted(canonical),remote=sorted(notion),old=previous===null?null:sorted(previous);
  const equal=(a:readonly string[],b:readonly string[])=>JSON.stringify(a)===JSON.stringify(b);
  if(equal(local,remote))return {action:"record",target:local};
  if(old===null){
    if(!local.length)return {action:"pull",target:remote};
    if(!remote.length)return {action:"push",target:local};
    return {action:"conflict",target:[]};
  }
  const leftChanged=!equal(local,old),rightChanged=!equal(remote,old);
  if(leftChanged&&rightChanged)return {action:"conflict",target:[]};
  if(rightChanged)return {action:"pull",target:remote};
  if(leftChanged)return {action:"push",target:local};
  return {action:"conflict",target:[]};
}
