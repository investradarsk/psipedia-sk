import { env } from "cloudflare:workers";
import { requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { confirmHelpSourceManually, type HelpSourceEntityType } from "@/lib/help-source-daily-check";
import { endHelpSourceCase, HelpSourceDecisionConflict } from "@/lib/admin-help-source-decision";
import { syncSavedNotionRecord, type TargetedNotionSaveBindings } from "@/lib/notion-targeted-admin-save";

export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ type: string; id: string }> };

/** Only a logged-in administrator can confirm currentness or close a real case. */
export async function PATCH(request: Request, { params }: RouteProps) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();

  const { type, id: rawId } = await params;
  const id = Number(rawId);
  if ((type !== "ADOPTION" && type !== "LOST_FOUND") || !Number.isSafeInteger(id) || id < 1) {
    return Response.json({ error: "Neplatný typ alebo ID." }, { status: 400 });
  }
  const body = await request.json().catch(() => null) as {
    action?: unknown; expectedCheckedAt?: unknown;
  } | null;
  if (body?.action !== "CONFIRM_ACTIVE" && body?.action !== "MARK_ENDED") {
    return Response.json({ error: "Nepodporovaná akcia." }, { status: 400 });
  }
  const checkedAt = body.expectedCheckedAt;
  if (typeof checkedAt !== "string" || checkedAt.length > 80 || !Number.isFinite(Date.parse(checkedAt))) {
    return Response.json({ error: "Chýba platná verzia kontroly zdroja." }, { status: 400 });
  }

  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });

  try {
    const check = await db.prepare(
      "SELECT last_checked_at FROM help_source_checks WHERE entity_type=? AND entity_id=?",
    ).bind(type, id).first<{ last_checked_at: string | null }>();
    if (!check || check.last_checked_at !== checkedAt) throw new HelpSourceDecisionConflict();

    if (body.action === "CONFIRM_ACTIVE") {
      const confirmed = await confirmHelpSourceManually(db, type as HelpSourceEntityType, id);
      if (!confirmed) throw new HelpSourceDecisionConflict();
      const notionFieldSync = type === "ADOPTION"
        ? await syncSavedNotionRecord({
          bindings: env as unknown as TargetedNotionSaveBindings, agenda: "adoptions", entityId: id,
        })
        : "unlinked";
      return Response.json({ ok: true, status: "ACTIVE", notionFieldSync }, {
        headers: { "cache-control": "no-store" },
      });
    }

    const status = await endHelpSourceCase({
      database: db, entityType: type as HelpSourceEntityType, entityId: id,
      actorEmail: auth.user.email, requestId: request.headers.get("cf-ray"),
      checkedAt,
    });
    const notionFieldSync = await syncSavedNotionRecord({
      bindings: env as unknown as TargetedNotionSaveBindings,
      agenda: type === "ADOPTION" ? "adoptions" : "lost-found", entityId: id,
    });
    return Response.json({ ok: true, status, notionFieldSync }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof HelpSourceDecisionConflict) {
      return Response.json({ error: error.message }, {
        status: 409, headers: { "cache-control": "no-store" },
      });
    }
    return Response.json({ error: "Zmenu stavu sa nepodarilo bezpečne uložiť." }, {
      status: 503, headers: { "cache-control": "no-store" },
    });
  }
}
