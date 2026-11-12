/**
 * Read-only decisions for legacy Directory sync errors. A historic error
 * must not authorize copying one side over a different current value.
 */
export function recoverableDirectoryBaselineError(syncStatus:string,syncError:string):boolean{
  if(syncStatus!=="Chyba")return false;
  if(!/^CONFLICT:\s*LOSSLESS_FIELD_REVIEW_REQUIRED\s*\(/.test(syncError))return false;
  if(!syncError.includes("BASELINE_UNAVAILABLE"))return false;
  // Other field or identity errors must not be cleared by stale-baseline repair.
  if(/AMBIGUOUS_SAME_FIELD|UNVERIFIED_DELETE|PROTECTED_FIELD|MISSING_FIELD|IDENTITY_CONFLICT|SERVICES_RELATION_/.test(syncError))
    return false;
  const details=syncError.match(/\(([^)]*)\)\s*$/)?.[1];
  return !!details&&details.split(",").every(part=>
    /^\s*(?:\*|[a-zA-Z0-9_.-]+):BASELINE_UNAVAILABLE\s*$/.test(part));
}

/**
 * A successful service-only reconciliation never proves an unrelated
 * editorial, identity or address error resolved.
 */
export function directoryServiceErrorCanReplace(
  existingError:string,incomingError:string,
):boolean{
  if(!/^SERVICES_RELATION_|^DIRECTORY_SERVICES_RELATION_/.test(incomingError))return true;
  return !existingError.trim()||/^SERVICES_RELATION_|^DIRECTORY_SERVICES_RELATION_/.test(existingError.trim());
}
export function directoryServiceSuccessCanClear(existingError:string):boolean{
  return !existingError.trim()||/^SERVICES_RELATION_|^DIRECTORY_SERVICES_RELATION_/.test(existingError.trim());
}
