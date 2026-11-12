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


/**
 * Acknowledging one signed editorial edit must not hide a historical error
 * about a different field or about the canonical Services V3 relation.
 * Only a fully named legacy field conflict, for exactly the fields explicitly
 * handled by this event, can be retired after its field write is verified.
 */
export function directoryEditorialEventMayClearError(
  existingError: string, acknowledgedFields: readonly string[],
): boolean {
  const error = existingError.trim();
  if (!error) return true;
  const conflict = error.match(/^CONFLICT:\s*LOSSLESS_FIELD_REVIEW_REQUIRED\s*\(([^()]*)\)\s*$/);
  if (!conflict) return false;
  const entries = conflict[1].split(",").map(part => part.trim()).filter(Boolean);
  if (!entries.length || !acknowledgedFields.length) return false;
  const acknowledged = new Set(acknowledgedFields);
  return entries.every(entry => {
    const match = entry.match(/^([a-zA-Z][a-zA-Z0-9_.-]*):(BASELINE_UNAVAILABLE|UNVERIFIED_DELETE|AMBIGUOUS_SAME_FIELD)$/);
    return Boolean(match && acknowledged.has(match[1]));
  });
}
