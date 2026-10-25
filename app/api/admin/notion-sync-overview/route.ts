import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { readNotionSyncOverview } from "@/lib/notion-sync-overview";
import { readNotionRunReceipts } from "@/lib/notion-sync-run-receipts";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAdminApiUser())) return unauthorizedAdminResponse();

  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) {
    return Response.json(
      { error: "Databáza nie je pripojená." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    return Response.json({
      readOnly: true,
      basis: "EXISTING_D1_MAPPING_HISTORY",
      liveNotionStatus: "UNKNOWN",
      runBasis: "EXISTING_ADMIN_AUTOMATION_EVENTS",
      checkedAt: new Date().toISOString(),
      rows: await readNotionSyncOverview(db),
      runs: await readNotionRunReceipts(db),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "Prehľad synchronizácie nie je dostupný." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
