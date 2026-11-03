/**
 * Explicit owner-confirmed one-shot field direction.
 *
 * Deliberately separate from baseline/last-write-wins reconciliation. Ordinary
 * automatic sync MUST NOT call this helper. No HTTP, SQL, or hidden side effects.
 */
export type ManualFieldDirection = "NOTION_TO_ADMIN" | "ADMIN_TO_NOTION";

export type ManualFieldResult = {
  field: string;
  state: "SAME" | "CHANGE" | "SKIPPED";
  reason?: "PROTECTED_FIELD" | "MISSING_VALUE" | "NON_JSON_VALUE";
};

function jsonClone<T>(source: T): T {
  return structuredClone(source);
}
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a,b)) return true;
  if (Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)
    && a.length===b.length&&a.every((v,i)=>same(v,b[i]));
  if(a===null||b===null||typeof a!=="object"||typeof b!=="object")return false;
  const left=a as Record<string,unknown>, right=b as Record<string,unknown>;
  const keys=Object.keys(left);
  return keys.length===Object.keys(right).length&&keys.every(k=>Object.hasOwn(right,k)&&same(left[k],right[k]));
}
function getAt(record: Record<string,unknown>,path:string): {present:boolean;value:unknown} {
  if(Object.prototype.hasOwnProperty.call(record,path))
    return {present:record[path]!==undefined,value:record[path]};
  let cursor: unknown=record;
  for(const part of path.split(".")){
    if (!cursor || typeof cursor!=="object" || Array.isArray(cursor)
      || !Object.prototype.hasOwnProperty.call(cursor,part))return {present:false,value:undefined};
    cursor=(cursor as Record<string,unknown>)[part];
  }
  return {present:cursor!==undefined,value:cursor};
}
function setAt(record:Record<string,unknown>,path:string,value:unknown):void{
  const parts=path.split(".");
  let cursor=record;
  for(const part of parts.slice(0,-1)){
    if (!cursor[part] || typeof cursor[part]!=="object" || Array.isArray(cursor[part]))
      cursor[part]={};
    cursor=cursor[part] as Record<string,unknown>;
  }
  cursor[parts[parts.length-1]]=jsonClone(value);
}
function isProtected(path:string,locked:ReadonlySet<string>):boolean{
  if(locked.has(path))return true;
  return [...locked].some(item=>path.startsWith(item+".")||item.startsWith(path+"."));
}

/** Compare the current two versions, not stale baseline receipts.
 * An explicit present empty value is transferable; a missing property is not.
 * Caller must verify mapping, exact Notion parent, source revision and D1
 * canonical identity BEFORE committing the produced candidate.
 */
export function planOwnerDirectedFields<T extends Record<string,unknown>>(input:{
  notion:T;
  admin:T;
  direction:ManualFieldDirection;
  editablePaths:readonly string[];
  protectedPaths:ReadonlySet<string>;
}): {desired:T;changes:string[];results:ManualFieldResult[]} {
  if(input.direction!=="NOTION_TO_ADMIN"&&input.direction!=="ADMIN_TO_NOTION")
    throw Error("TRANSFER_DIRECTION_INVALID");
  const source=input.direction==="NOTION_TO_ADMIN"?input.notion:input.admin;
  const target=input.direction==="NOTION_TO_ADMIN"?input.admin:input.notion;
  const desired=jsonClone(target);
  const changes:string[]=[];
  const results:ManualFieldResult[]=[];
  for(const path of new Set(input.editablePaths)){
    if(!path || path==="__proto__" || path==="constructor" || path==="prototype"
      || path.split(".").some(x=>["__proto__","constructor","prototype"].includes(x)))
      throw Error("TRANSFER_FIELD_INVALID");
    if(isProtected(path,input.protectedPaths)){
      results.push({field:path,state:"SKIPPED",reason:"PROTECTED_FIELD"});
      continue;
    }
    const src=getAt(source,path),dst=getAt(target,path);
    if(!src.present||!dst.present){
      results.push({field:path,state:"SKIPPED",reason:"MISSING_VALUE"});
      continue;
    }
    if(!same(src.value,dst.value)){
      setAt(desired,path,src.value);
      changes.push(path);
      results.push({field:path,state:"CHANGE"});
    }else results.push({field:path,state:"SAME"});
  }
  return {desired,changes,results};
}
