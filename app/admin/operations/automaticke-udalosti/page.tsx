import { env } from "cloudflare:workers";
import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { AdminAutomationHistoryRead } from "@/components/admin-automation-history-read";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { normalizeAdminNotificationPath } from "@/lib/admin-web-push";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
type EventRow = {
  id: number; event_type: string; resource_type: string; actor_ref: string | null;
  title: string; body: string; created_at: string; target_url: string;
  read_at: string | null;
};
const statuses = ["started","success","no_change","partial_success","failed","skipped","cancelled"] as const;
const periods = [7, 30, 90] as const;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export default async function AdminAutomationHistory({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireAdminPageUser("/admin/operations/automaticke-udalosti");
  const params = await searchParams;
  const system = first(params.system);
  const status = first(params.status);
  const period = Number(first(params.period) || 30);
  const days = periods.includes(period as 7 | 30 | 90) ? period : 30;
  const cursor = Number(first(params.cursor));
  const safeCursor = Number.isSafeInteger(cursor) && cursor > 0 ? cursor : null;
  const conditions = ["e.source_type = 'AUTOMATION_RUN'", "e.actor_type = 'AUTOMATION'", "e.created_at >= ?"];
  const argumentsList: (string | number)[] = [new Date(Date.now() - days * 86_400_000).toISOString()];
  if (["data", "gemini", "discovery", "notion"].includes(system)) {
    conditions.push("e.resource_type = ?");
    argumentsList.push(system);
  }
  if (statuses.includes(status as (typeof statuses)[number])) {
    conditions.push("e.event_type = ?");
    argumentsList.push(`automation_run_${status}`);
  }
  if (safeCursor) {
    conditions.push("e.id < ?");
    argumentsList.push(safeCursor);
  }
  const db = (env as { DB: D1Database }).DB;
  const result = await db.prepare(`SELECT e.id, e.event_type, e.resource_type, e.actor_ref,
      e.title, e.body, e.created_at, e.target_url, r.read_at
    FROM admin_notification_events e
    LEFT JOIN admin_notification_read_receipts r ON r.event_id = e.id AND r.admin_email = ?
    WHERE ${conditions.join(" AND ")}
    ORDER BY e.id DESC LIMIT 41`)
    .bind(user.email.trim().toLowerCase(), ...argumentsList).all<EventRow>();
  const rows = result.results.slice(0, 40);
  const hasMore = result.results.length > 40;
  const next = new URLSearchParams();
  if (system) next.set("system", system);
  if (status) next.set("status", status);
  next.set("period", String(days));
  if (rows.length) next.set("cursor", String(rows[rows.length - 1].id));

  return (
    <AdminShell user={user} eyebrow="Automatizácie" title="Automatické udalosti"
      description="Audit začiatkov a výsledkov skutočne zaznamenaných behov. História zostáva dostupná aj pri neúspešnom push doručení.">
      <section className="admin-panel">
        <form method="get" className="admin-form-actions" aria-label="Filtrovať automatické udalosti">
          <label>Systém <select name="system" defaultValue={system}>
            <option value="">Všetky</option><option value="data">Dátové automatizácie</option><option value="discovery">Discovery</option><option value="notion">Notion</option><option value="gemini">Gemini</option>
          </select></label>
          <label>Stav <select name="status" defaultValue={status}>
            <option value="">Všetky</option>
            {statuses.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
          </select></label>
          <label>Obdobie <select name="period" defaultValue={days}>
            {periods.map((item) => <option key={item} value={item}>{item} dní</option>)}
          </select></label>
          <button type="submit">Filtrovať</button>
        </form>
      </section>
      <section className="admin-panel">
        {rows.length === 0 ? <p>V tomto období nie sú žiadne zaznamenané automatické udalosti.</p> :
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {rows.map((event) => <article key={event.id} style={{ borderBottom: "1px solid var(--admin-border, #ddd)", paddingBottom: "0.75rem" }}>
              <p><strong>{event.title}</strong> · {event.resource_type} · {event.event_type.replace("automation_run_", "").toUpperCase()}
                {" "}· {new Date(event.created_at).toLocaleString("sk-SK", { timeZone: "Europe/Bratislava" })}</p>
              <p>{event.body}</p>
              <div className="admin-form-actions">
                <span>{event.read_at ? "Prečítané" : "Neprečítané"}</span>
                {!event.read_at && <AdminAutomationHistoryRead eventId={event.id} />}
                <Link href={normalizeAdminNotificationPath(event.target_url)}>Otvoriť detail →</Link>
              </div>
            </article>)}
          </div>
        }
        {hasMore && <Link href={`/admin/operations/automaticke-udalosti?${next}`}>Načítať staršie udalosti →</Link>}
      </section>
    </AdminShell>
  );
}
