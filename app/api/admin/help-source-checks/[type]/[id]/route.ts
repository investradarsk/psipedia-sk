import { env } from "cloudflare:workers";
import { requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { confirmHelpSourceManually, type HelpSourceEntityType } from "@/lib/help-source-daily-check";

export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ type: string; id: string }> };

/** A human states they checked the original source and the case remains active. */
export async function PATCH(request: Request, { params }: RouteProps) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();

  const { type, id: rawId } = await params;
  const id = Number(rawId);
  if ((type !== "ADOPTION" && type !== "LOST_FOUND") || !Number.isSafeInteger(id) || id < 1) {
    return Response.json({ error: "Neplatný typ alebo ID." }, { status: 400 });
  }
  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  if (body?.action !== "CONFIRM_ACTIVE") {
    return Response.json({ error: "Nepodporovaná akcia." }, { status: 400 });
  }
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });
  const confirmed = await confirmHelpSourceManually(db, type as HelpSourceEntityType, id);
  return confirmed
    ? Response.json({ ok: true }, { headers: { "cache-control": "no-store" } })
    : Response.json({ error: "Aktívny záznam sa nenašiel alebo kontrola ešte neprebehla." }, { status: 404 });
}
