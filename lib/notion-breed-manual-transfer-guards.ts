/**
 * One-shot breed transfer guards. Manual transfers never infer a replacement
 * value from an empty Notion cell; a blank is not permission to clear reviewed
 * Admin content. Deliberate explicit value/array updates still transfer.
 */
export function manualBreedCellHasValue(type:string,value:unknown,id=""):boolean{
  if(type==="checkbox")return typeof value==="boolean";
  if(type==="number")return typeof value==="number"&&Number.isInteger(value)
    &&value>=1&&value<=(id==="fciGroup"?10:5);
  return typeof value==="string"&&value.trim().length>0;
}

/**
 * Breed adapter may have committed a safe subset before rejecting another
 * source field. Only this known partial outcome is safe to pass to the
 * independent per-field readback verifier; other failures remain fatal.
 */
export function assertManualBreedSweepOutcome(summary:{
  enabled:boolean;scanned:number;failed:number;lastErrorCode?:string;
}):"OK"|"NEEDS_READBACK"{
  if(!summary.enabled)throw Error("TRANSFER_BREED_SYNC_DISABLED");
  if(summary.scanned!==1)throw Error("TRANSFER_BREED_ADAPTER_FAILED");
  if(summary.failed===0)return "OK";
  if(summary.failed===1&&summary.lastErrorCode==="TRANSFER_BREED_PARTIAL_FIELDS")
    return "NEEDS_READBACK";
  const error=summary.lastErrorCode;
  if(error&&/^[A-Z][A-Z0-9_]{2,100}$/.test(error))throw Error(error);
  throw Error("TRANSFER_BREED_ADAPTER_FAILED");
}
