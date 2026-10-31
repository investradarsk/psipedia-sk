/**
 * Directional, aggregate-only Notion transfer receipts.
 * Recorded AFTER successful changes; never store editorial values or tokens.
 * Migration 0148 is optional until deployed; failure to record must not block sync.
 */
export type NotionTransferDirection = "NOTION_TO_ADMIN" | "ADMIN_TO_NOTION";
export type NotionTransferReceipt = {
  scope:string; direction:NotionTransferDirection; recordCount:number; createdAt:string;
};
export async function recordNotionTransfer(
  db:Pick<D1Database,"prepare">,
  scope:string,direction:NotionTransferDirection,recordCount:number,
):Promise<void>{
  if(!/^(breeds|articles|eshops|events|organizations|adoptions|help-cases|lost-found|service-catalog|facebook-images|directory:[a-z0-9-]+)$/.test(scope)
    || !Number.isSafeInteger(recordCount)||recordCount<=0||recordCount>10000)return;
  try{
    await db.prepare("INSERT INTO notion_transfer_audit(scope,direction,record_count) VALUES (?,?,?)")
      .bind(scope,direction,recordCount).run();
  }catch{
    // Protected D1 0148 may not have been applied. Never block the real importer.
    console.warn("notion_transfer_audit_write_unavailable");
  }
}
export async function readNotionTransferAudit(
  db:Pick<D1Database,"prepare">,scope:string,
):Promise<{ready:boolean;records:NotionTransferReceipt[]}>{
  const ready=await db.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='notion_transfer_audit' LIMIT 1",
  ).first();
  if(!ready)return {ready:false,records:[]};
  const rows=await db.prepare(
    "SELECT scope,direction,record_count AS recordCount,created_at AS createdAt "+
    "FROM notion_transfer_audit WHERE scope=? ORDER BY id DESC LIMIT 15",
  ).bind(scope).all<NotionTransferReceipt>();
  return {ready:true,records:(rows.results??[]).filter(x=>
    (x.direction==="NOTION_TO_ADMIN"||x.direction==="ADMIN_TO_NOTION")
    && Number.isSafeInteger(x.recordCount))};
}
