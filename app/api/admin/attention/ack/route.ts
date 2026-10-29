import { env } from "cloudflare:workers";
import { requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { isAdminAttentionQueueSourceType } from "@/lib/admin-attention-queue";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const body = await request.json().catch(() => null) as {
    sourceType?: unknown; sourceId?: unknown; relevantAt?: unknown; action?: unknown;
  } | null;
  const source = body?.sourceType;
  const id = body?.sourceId;
  const relevant = body?.relevantAt;
  const action = body?.action;
  if (!isAdminAttentionQueueSourceType(source)
      || typeof id !== "string" || id.length < 1 || id.length > 200
      || typeof relevant !== "string" || relevant.length > 60 || !Number.isFinite(Date.parse(relevant))
      || !["READ", "SNOOZE_7D", "UNREAD"].includes(String(action))) {
    return Response.json({ error: "Neplatná požiadavka." }, { status: 400 });
  }
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });
  const now = new Date();
  const readAt = action === "READ" ? now.toISOString() : null;
  const snoozedUntil = action === "SNOOZE_7D"
    ? new Date(now.getTime() + 7 * 86_400_000).toISOString() : null;
  try {
    await db.prepare(
      "INSERT INTO admin_attention_ack (source_type,source_id,relevant_at,read_at,snoozed_until,updated_at)"
      + " VALUES (?,?,?,?,?,?) ON CONFLICT(source_type,source_id) DO UPDATE SET"
      + " relevant_at=excluded.relevant_at,read_at=excluded.read_at,"
      + " snoozed_until=excluded.snoozed_until,updated_at=excluded.updated_at",
    ).bind(source, id, relevant, readAt, snoozedUntil, now.toISOString()).run();
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Uloženie stavu upozornenia zlyhalo." }, { status: 503 });
  }
}
