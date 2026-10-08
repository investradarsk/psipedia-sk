import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  if (request.headers.get("origin") !== new URL(request.url).origin
    || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Neplatná požiadavka." }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { eventId?: unknown } | null;
  if (!Number.isSafeInteger(body?.eventId) || Number(body?.eventId) < 1) {
    return Response.json({ error: "Neplatné ID udalosti." }, { status: 400 });
  }
  const database = (env as { DB: D1Database }).DB;
  // A receipt cannot be created for another source's event by guessing its ID.
  await database.prepare(`INSERT OR IGNORE INTO admin_notification_read_receipts (event_id, admin_email, read_at)
    SELECT id, ?, ? FROM admin_notification_events
    WHERE id = ? AND source_type = 'AUTOMATION_RUN' AND actor_type = 'AUTOMATION'`)
    .bind(user.email.trim().toLowerCase(), new Date().toISOString(), body?.eventId).run();
  return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
