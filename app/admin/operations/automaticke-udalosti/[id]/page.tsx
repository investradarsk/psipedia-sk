import { env } from "cloudflare:workers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import {
  automationHistoryListHref,
  parseAutomationHistoryCounts,
} from "@/lib/admin-automation-history-detail";

export const dynamic = "force-dynamic";

type EventRow = {
  id: number;
  event_type: string;
  resource_type: string;
  resource_ref: string;
  actor_ref: string | null;
  title: string;
  body: string;
  created_at: string;
};

type TimelineRow = Pick<EventRow, "id" | "event_type" | "body" | "created_at">;

const statusLabels: Record<string, string> = {
  started: "Začaté",
  success: "Úspešné",
  no_change: "Bez zmien",
  partial_success: "Čiastočný úspech",
  failed: "Zlyhané",
  skipped: "Preskočené",
  cancelled: "Zrušené",
};

function statusLabel(eventType: string) {
  const code = eventType.replace(/^automation_run_/, "");
  return statusLabels[code] ?? code.toUpperCase();
}

function eventTime(timestamp: string) {
  return new Date(timestamp).toLocaleString("sk-SK", { timeZone: "Europe/Bratislava" });
}

export default async function AdminAutomationEventDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdminPageUser("/admin/operations/automaticke-udalosti");
  const { id: rawId } = await params;
  if (!/^[1-9]\d{0,15}$/.test(rawId)) notFound();
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) notFound();

  const db = (env as { DB: D1Database }).DB;
  const event = await db.prepare(`SELECT id, event_type, resource_type, resource_ref, actor_ref,
      title, body, created_at
    FROM admin_notification_events
    WHERE id = ? AND source_type = 'AUTOMATION_RUN' AND actor_type = 'AUTOMATION'
    LIMIT 1`).bind(id).first<EventRow>();
  if (!event) notFound();

  // The same immutable run identity connects STARTED and the final stage.
  // Do not infer record-level errors from these aggregate notification events.
  const history = await db.prepare(`SELECT id, event_type, body, created_at
    FROM admin_notification_events
    WHERE source_type = 'AUTOMATION_RUN' AND actor_type = 'AUTOMATION'
      AND resource_type = ? AND resource_ref = ? AND actor_ref = ?
    ORDER BY id ASC LIMIT 20`)
    .bind(event.resource_type, event.resource_ref, event.actor_ref).all<TimelineRow>();

  const counts = parseAutomationHistoryCounts(event.body);
  const backHref = automationHistoryListHref({
    system: event.resource_type,
    runId: event.resource_ref,
    actorRef: event.actor_ref,
  });

  return (
    <AdminShell
      user={user}
      eyebrow="Automatizácie"
      title="Detail automatickej udalosti"
      description="Uložený výsledok konkrétneho behu a časová os jeho zaznamenaných stavov."
    >
      <p><Link href={backHref}>← Späť na históriu behov</Link></p>
      <section className="admin-panel" aria-labelledby="automation-event-title">
        <h2 id="automation-event-title">{event.title}</h2>
        <p><strong>Stav:</strong> {statusLabel(event.event_type)}</p>
        <p><strong>Čas udalosti:</strong> <time dateTime={event.created_at}>{eventTime(event.created_at)}</time></p>
        <p><strong>Systém:</strong> {event.resource_type}</p>
        <p><strong>Automatizácia:</strong> {event.actor_ref ?? "Neznáma"}</p>
        <p><strong>ID behu:</strong> <code>{event.resource_ref}</code></p>
        <h3>Výsledok</h3>
        <p>{event.body}</p>
        {counts.length > 0 && (
          <>
            <h3>Zaznamenané počty</h3>
            <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
              {counts.map(({ label, value }) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd style={{ margin: 0, fontSize: "1.35rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{value.toLocaleString("sk-SK")}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </section>
      <section className="admin-panel" aria-labelledby="automation-run-timeline">
        <h2 id="automation-run-timeline">Priebeh behu</h2>
        {history.results.length === 0 ? (
          <p>Ďalšie zaznamenané stavy tohto behu nie sú dostupné.</p>
        ) : (
          <ol>
            {history.results.map((stage) => (
              <li key={stage.id} style={{ marginBottom: "0.8rem" }}>
                <strong>{statusLabel(stage.event_type)}</strong>{" · "}
                <time dateTime={stage.created_at}>{eventTime(stage.created_at)}</time>
                {stage.id === event.id && " · otvorená udalosť"}
                <p>{stage.body}</p>
              </li>
            ))}
          </ol>
        )}
        <p>
          História upozornení ukladá stavy a súhrnné počty. Neobsahuje zoznam konkrétnych
          chybných alebo konfliktných položiek ani ich individuálne príčiny. Tie treba
          overiť v synchronizačných záznamoch príslušnej agendy.
        </p>
      </section>
    </AdminShell>
  );
}
