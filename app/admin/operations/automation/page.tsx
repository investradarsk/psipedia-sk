import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listAutomationSourceHealth } from "@/lib/data-automation-store";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function formatDate(value: unknown) {
  const raw = text(value);
  if (raw === "—") return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Bratislava",
  }).format(date);
}

export default async function AutomationOperationsPage() {
  const user = await requireAdminPageUser("/admin/operations/automation");
  let sources: Record<string, unknown>[] = [];
  let unavailable = false;
  try {
    sources = await listAutomationSourceHealth();
  } catch {
    unavailable = true;
  }

  return (
    <AdminShell
      user={user}
      eyebrow="Admin Operations"
      title="Automatický research"
      description="Zdrojové kontroly vytvárajú findings na review. Žiadny source connector nemá oprávnenie publikovať canonical obsah."
      actions={<><Link href="/admin/operations/automation/sources">Správa zdrojov</Link><Link href="/admin/operations">Centrum pozornosti</Link></>}
    >
      {unavailable ? (
        <section className="admin-panel">
          <h2>Automation schema ešte nie je dostupná</h2>
          <p>Po aplikovaní migrácie sa tu zobrazí stav nakonfigurovaných zdrojov a posledných behov.</p>
        </section>
      ) : (
        <>
          <section className="admin-stats" aria-label="Stav automation sources">
            <div><span>Zdroje</span><strong>{sources.length}</strong></div>
            <div><span>Aktívne</span><strong>{sources.filter((row) => Boolean(row.enabled)).length}</strong></div>
            <div><span>Posledný run s chybou</span><strong>{sources.filter((row) => row.last_run_status === "FAILED").length}</strong></div>
            <div><span>Due / bez next run</span><strong>{sources.filter((row) => !row.next_check_at).length}</strong></div>
          </section>
          <section className="admin-panel">
            <h2>Source health</h2>
            {sources.length ? (
              <div className="admin-change-table" role="table">
                <div className="is-heading" role="row"><strong>Zdroj</strong><strong>Posledný run</strong><strong>Next expected</strong></div>
                {sources.map((row) => (
                  <div role="row" key={text(row.id)}>
                    <strong>{text(row.label)}<small> · {text(row.entity_type)} / {text(row.connector_type)}</small></strong>
                    <span>{text(row.last_run_status)} · checked {text(row.checked_count)} · new {text(row.new_finding_count)} · errors {text(row.error_count)} · {text(row.duration_ms)} ms</span>
                    <span>{formatDate(row.next_check_at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-empty">
                <h2>Zatiaľ nie sú nakonfigurované zdroje</h2>
                <p>Foundation je connector-based. Produkčné zdroje sa pridávajú explicitne a môžu zostať disabled, kým nie sú overené ich podmienky a adapter.</p>
              </div>
            )}
          </section>
        </>
      )}
    </AdminShell>
  );
}
