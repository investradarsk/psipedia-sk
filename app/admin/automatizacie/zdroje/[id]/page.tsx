import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAutomationSourceDetail } from "@/components/admin-automation-source-detail";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getAutomationSourceAdmin, listAutomationSourceRuns } from "@/lib/data-automation-source-store";
import { automationCategoryForSource } from "@/lib/admin-automation-presentation";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function AutomationSourceDetailPage({ params }: Props) {
  const rawId = (await params).id;
  const user = await requireAdminPageUser("/admin/automatizacie/zdroje/" + rawId);
  const id = Number.parseInt(rawId, 10);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const source = await getAutomationSourceAdmin(id).catch(() => null);
  if (!source) notFound();
  const runs = await listAutomationSourceRuns(id).catch(() => []);
  const category = automationCategoryForSource(source);

  return (
    <AdminShell user={user} eyebrow="Automatizácie" title={source.label} description="Stav, kontrola a správa konkrétneho zdroja. Technické nastavenia sú sekundárne."
      actions={<Link href={category ? "/admin/automatizacie/" + category : "/admin/automatizacie"}>← Späť na automatizácie</Link>}>
      <AdminAutomationSourceDetail source={source} />
      <details className={styles.advanced}><summary>História behov ({runs.length})</summary><div className={styles.advancedBody}>
        {runs.length ? <div className={styles.techGrid}>{runs.map((run) => (
          <div className={styles.techRow} key={String(run.id)}><strong>Kontrola #{String(run.id)} · {String(run.status)}</strong><span>{String(run.started_at)} → {String(run.completed_at ?? "—")}</span><span>skontrolované {String(run.checked_count)} · nové {String(run.new_finding_count)} · chyby {String(run.error_count)}</span></div>
        ))}</div> : <p>Zatiaľ nie je zaznamenaná žiadna kontrola.</p>}
      </div></details>
    </AdminShell>
  );
}
