import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAutomationSourceDetail } from "@/components/admin-automation-source-detail";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAutomationSourceAdmin, listAutomationSourceRuns } from "@/lib/data-automation-source-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function AutomationSourceDetailPage({ params }: Props) {
  const rawId = (await params).id;
  const user = await requireAdminPageUser("/admin/operations/automation/sources/" + rawId);
  const id = Number.parseInt(rawId, 10);
  if (!Number.isSafeInteger(id) || id < 1) notFound();

  const source = await getAutomationSourceAdmin(id).catch(() => null);
  if (!source) notFound();
  const runs = await listAutomationSourceRuns(id).catch(() => []);

  return (
    <AdminShell
      user={user}
      eyebrow="Automatizácie"
      title={source.label}
      description="Tu riešiš iba tento zdroj: otestovať, schváliť, zapnúť alebo skontrolovať. Technické nastavenia sú schované nižšie."
      actions={<Link href="/admin/operations/automation/sources">← Späť na zdroje</Link>}
    >
      <AdminAutomationSourceDetail source={source} />

      <details className={styles.advanced}>
        <summary>História behov ({runs.length})</summary>
        <div className={styles.advancedBody}>
          {runs.length ? (
            <div className={styles.techGrid}>
              {runs.map((run) => (
                <div className={styles.techRow} key={String(run.id)}>
                  <strong>Run #{String(run.id)} · {String(run.status)}</strong>
                  <span>{String(run.started_at)} → {String(run.completed_at ?? "—")}</span>
                  <span>checked {String(run.checked_count)} · new {String(run.new_finding_count)} · updated {String(run.updated_finding_count)} · errors {String(run.error_count)} · {String(run.duration_ms ?? "—")} ms</span>
                </div>
              ))}
            </div>
          ) : <p>Zatiaľ nie je zaznamenaný žiadny run.</p>}
        </div>
      </details>
    </AdminShell>
  );
}
