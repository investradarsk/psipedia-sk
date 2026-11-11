import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

type Bindings = {
  DB?: D1Database;
  NOTION_BREED_SYNC_ENABLED?: string;
  NOTION_BREED_WORKCOPY_SYNC_ENABLED?: string;
  NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED?: string;
};
type Counts = {
  total: number; active: number | null; shadow: number | null;
  verified: number | null; receiptPrefixes: number | null;
  activeErrors: number | null;
};

/** Read-only production D1 proof after the 344-link cutover.
 * Never fetches private field contents, writes to Notion, or mutates D1.
 */
export async function GET(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const bindings = env as unknown as Bindings;
  if (!bindings.DB) {
    return Response.json({ code: "BREED_WORKCOPY_STATUS_DB_UNAVAILABLE" }, { status: 503, headers });
  }
  try {
    const result = await bindings.DB.prepare(
      "SELECT COUNT(*) AS total, " +
      "SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) AS active, " +
      "SUM(CASE WHEN status='SHADOW' THEN 1 ELSE 0 END) AS shadow, " +
      "SUM(CASE WHEN status='VERIFIED' THEN 1 ELSE 0 END) AS verified, " +
      "SUM(CASE WHEN status='ACTIVE' AND work_sync_receipt LIKE 'breed-field-v1:%' " +
        "THEN 1 ELSE 0 END) AS receiptPrefixes, " +
      "SUM(CASE WHEN status='ACTIVE' AND work_last_error_code IS NOT NULL " +
        "THEN 1 ELSE 0 END) AS activeErrors " +
      "FROM breed_notion_workcopy_links"
    ).first<Counts>();
    const total = Number(result?.total ?? 0);
    const active = Number(result?.active ?? 0);
    const shadow = Number(result?.shadow ?? 0);
    const verified = Number(result?.verified ?? 0);
    const receiptPrefixes = Number(result?.receiptPrefixes ?? 0);
    const activeErrors = Number(result?.activeErrors ?? 0);
    const oldSyncEnabled = bindings.NOTION_BREED_SYNC_ENABLED === "true";
    const workCopySyncEnabled = bindings.NOTION_BREED_WORKCOPY_SYNC_ENABLED === "true";
    const activationEnabled = bindings.NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED === "true";
    // Owner-only evidence for one profile: distinguish undelivered webhook
    // (no inbox row) from a queued/retried event and a D1 field-write failure.
    // No Notion field contents, secret signatures or tokens are returned.
    const requested=Number(new URL(request.url).searchParams.get("profileId")??0);
    let profileDiagnostics: unknown = null;
    if (Number.isSafeInteger(requested) && requested>0) {
      const link=await bindings.DB.prepare(
        "SELECT breed_id,work_notion_page_id,work_last_error_code,work_last_synced_at "+
        "FROM breed_notion_workcopy_links WHERE breed_id=? AND status='ACTIVE' LIMIT 1",
      ).bind(requested).first<{
        breed_id:number;work_notion_page_id:string;
        work_last_error_code:string|null;work_last_synced_at:string|null;
      }>();
      if (link) {
        const inbox=await bindings.DB.prepare(
          "SELECT event_type,status,attempts,received_at,updated_at,outcome,last_error_code "+
          "FROM notion_webhook_inbox WHERE page_id=? "+
          "ORDER BY received_at DESC LIMIT 5",
        ).bind(link.work_notion_page_id).all<{
          event_type:string;status:string;attempts:number;received_at:number;
          updated_at:number;outcome:string|null;last_error_code:string|null;
        }>().catch(()=>({results:[]}));
        profileDiagnostics={
          breedId:link.breed_id,workNotionPageId:link.work_notion_page_id,
          lastFieldError:link.work_last_error_code,
          lastSyncedAt:link.work_last_synced_at,
          recentWebhookEvents:inbox.results,
        };
      }
    }
    return Response.json({
      total, active, shadow, verified, receiptPrefixes, activeErrors,
      ...(profileDiagnostics?{profileDiagnostics}:{}),
      oldSyncEnabled, workCopySyncEnabled, activationEnabled,
      activeCohortReady: total === 344 && active === 344 && shadow === 0 &&
        verified === 0 && receiptPrefixes === 344,
      singleNewEngine: !oldSyncEnabled && workCopySyncEnabled && !activationEnabled,
    }, { headers });
  } catch {
    return Response.json({ code: "BREED_WORKCOPY_STATUS_READ_FAILED" }, { status: 503, headers });
  }
}
