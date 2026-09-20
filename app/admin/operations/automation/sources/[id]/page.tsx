import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAutomationSourceDetail } from "@/components/admin-automation-source-detail";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAutomationSourceAdmin, listAutomationSourceRuns } from "@/lib/data-automation-source-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function AutomationSourceDetailPage({ params }: Props) {
  const rawId = (await params).id;
  const user = await requireAdminPageUser(`/admin/operations/automation/sources/${rawId}`);
  const id = Number.parseInt(rawId, 10);
  if (!Number.isSafeInteger(id) || id < 1) notFound();

  const source = await getAutomationSourceAdmin(id).catch(() => null);
  if (!source) notFound();
  const runs = await listAutomationSourceRuns(id).catch(() => []);

  return (
    <AdminShell
      user={user}
      eyebrow="Automation source"
      title={source.label}
      description="Konfigurácia, read-only test, review gate, manuálny run a health história jedného kontrolovaného zdroja."
      actions={<Link href="/admin/operations/automation/sources">← Všetky zdroje</Link>}
    >
      <AdminAutomationSourceDetail source={source} />
      <section className="admin-panel">
        <h2>Posledné runy</h2>
        {runs.length ? (
          <div className="admin-change-table" role="table" aria-label="Source run history">
            <div className="is-heading" role="row"><strong>Run</strong><strong>Výsledok</strong><strong>Observability</strong></div>
            {runs.map((run) => (
              <div role="row" key={String(run.id)}>
                <strong>#{String(run.id)} · {String(run.status)}</strong>
                <span>{String(run.started_at)} → {String(run.completed_at ?? "—")}</span>
                <span>checked {String(run.checked_count)} · new {String(run.new_finding_count)} · updated {String(run.updated_finding_count)} · errors {String(run.error_count)} · {String(run.duration_ms ?? "—")} ms</span>
              </div>
            ))}
          </div>
        ) : <p>Zatiaľ nie je zaznamenaný žiadny run.</p>}
      </section>
    </AdminShell>
  );
}
