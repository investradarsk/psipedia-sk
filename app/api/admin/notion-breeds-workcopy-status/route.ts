import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { assessBreedWorkcopyReadiness } from "@/lib/breed-workcopy-readiness.mjs";

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
export async function GET() {
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
    const readiness = assessBreedWorkcopyReadiness({
      total, active, shadow, verified, receiptPrefixes, activeErrors,
      oldSyncEnabled, workCopySyncEnabled, activationEnabled,
    });
    return Response.json({
      total, active, shadow, verified, receiptPrefixes, activeErrors,
      oldSyncEnabled, workCopySyncEnabled, activationEnabled,
      ...readiness,
    }, { headers });
  } catch {
    return Response.json({ code: "BREED_WORKCOPY_STATUS_READ_FAILED" }, { status: 503, headers });
  }
}
