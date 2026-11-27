/** Use the existing integer offset to persist a catalog signature + index.
 * Old raw offsets and changed catalogs restart once; no D1 migration.
 * The 1000 stride is far above the current <100 breed fields. */
const STRIDE=1000;
function signature(fields){
  if(fields.length>=STRIDE)throw Error("BREED_RECOVERY_CATALOG_TOO_LARGE");
  let hash=2166136261;
  for(const char of JSON.stringify(fields))hash=Math.imul(hash^char.charCodeAt(0),16777619);
  return (hash>>>0)+1;
}
export function decodeBreedCursor(fields,id,offset){
  const version=signature(fields);
  return Math.floor(offset/STRIDE)===version
    ? {id,offset:offset%STRIDE} : {id:0,offset:0};
}
export function encodeBreedCursor(fields,offset){
  if(!Number.isSafeInteger(offset)||offset<0||offset>=STRIDE)throw Error("BREED_RECOVERY_OFFSET_INVALID");
  return signature(fields)*STRIDE+offset;
}
