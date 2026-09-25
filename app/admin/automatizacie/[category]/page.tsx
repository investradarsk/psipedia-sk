import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listAutomationSourcesAdmin } from "@/lib/data-automation-source-store";
import {
  automationCategoryBySlug,
  automationSourcesForCategory,
  automationCategoryFindingCount,
  automationCategoryLastCheck,
  automationCategoryStatus,
  automationReadableError,
  automationSourceDomain,
} from "@/lib/admin-automation-presentation";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string }> };

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("sk-SK", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Bratislava" }).format(date);
}

export default async function AutomationCategoryPage({ params }: Props) {
  const slug = (await params).category;
  const category = automationCategoryBySlug(slug);
  if (!category) notFound();
  const user = await requireAdminPageUser("/admin/automatizacie/" + slug);

  let allSources = [];
  let unavailable = false;
  try { allSources = await listAutomationSourcesAdmin(undefined, 200); } catch { unavailable = true; }
  const sources = automationSourcesForCategory(allSources, slug);
  const findings = automationCategoryFindingCount(sources);
  const status = unavailable ? "Čaká na dáta" : automationCategoryStatus(sources);

  return (
    <AdminShell
      user={user}
      eyebrow="Automatizácie"
      title={category.title}
      description={category.description}
      actions={<><Link href="/admin/automatizacie">← Všetky automatizácie</Link><Link href="/admin/automatizacie/zdroje">Zdroje</Link><Link href="/admin/operations">Operácie</Link></>}
    >
      <section className={[styles.statusHero, status === "Problém" ? styles.statusHeroWarning : styles.statusHeroGood].join(" ")}>
        <div><strong>{status}</strong><p>{sources.length ? sources.filter((source) => source.enabled).length + " aktívnych zdrojov" : "Pre túto kategóriu zatiaľ nie je nastavený aktívny zdroj."} · posledná kontrola {formatDate(automationCategoryLastCheck(sources))}</p></div>
        <div className={styles.statusCount}><strong>{findings}</strong><span>nových nálezov</span></div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Nálezy</h2><p>Nové položky z posledných behov zdrojov. Rozhodnutia človeka zostávajú v Operáciách / Centre pozornosti.</p></div><span className={styles.sectionCount}>{findings}</span></div>
        {sources.some((source) => source.newFindingCount > 0) ? (
          <div className={styles.itemList}>{sources.filter((source) => source.newFindingCount > 0).map((source) => (
            <div className={styles.itemCard} key={source.id}><div className={styles.itemMain}><strong>{source.label}</strong><p>{source.newFindingCount} nových nálezov z poslednej kontroly.</p></div><Link className={styles.itemAction} href="/admin/operations">Skontrolovať v operáciách</Link></div>
          ))}</div>
        ) : <div className={styles.empty}>Žiadne nové nálezy z posledných behov.</div>}
      </section>

      <section className={styles.section} id="zdroje">
        <div className={styles.sectionHeader}><div><h2>Zdroje</h2><p>Zobrazujú sa iba reálne nakonfigurované zdroje.</p></div><span className={styles.sectionCount}>{sources.length}</span></div>
        {sources.length ? <div className={styles.itemList}>{sources.map((source) => (
          <div className={styles.itemCard} key={source.id}>
            <div className={styles.itemMain}>
              <div className={styles.itemTitle}><strong>{source.label}</strong><span className={styles.badge}>{source.enabled ? "Aktívny" : "Vypnutý"}</span></div>
              <p>{automationSourceDomain(source.sourceUrl)} · sleduje: {category.title}</p>
              <p>Posledná úspešná kontrola: {formatDate(source.lastSuccessAt)} · ďalšia kontrola: {formatDate(source.nextCheckAt)} · nové nálezy: {source.newFindingCount}</p>
              {source.lastErrorCode && <p><strong>Problém:</strong> {automationReadableError(source.lastErrorCode)}</p>}
            </div>
            <Link className={styles.itemAction} href={"/admin/automatizacie/zdroje/" + source.id}>Otvoriť zdroj</Link>
          </div>
        ))}</div> : <div className={styles.empty}>Nenastavené — pre túto kategóriu momentálne neexistuje nakonfigurovaný zdroj.</div>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>História</h2><p>Prehľad poslednej aktivity podľa jednotlivých zdrojov.</p></div></div>
        {sources.length ? <div className={styles.techGrid}>{sources.map((source) => (
          <div className={styles.techRow} key={source.id}><strong>{source.label}</strong><span>Posledná kontrola {formatDate(source.lastCheckedAt)} · stav {source.lastRunStatus ?? "—"}</span><span>Skontrolované {source.checkedCount} · nové {source.newFindingCount} · chyby {source.errorCount}</span></div>
        ))}</div> : <p>Zatiaľ bez histórie.</p>}
      </section>

      {sources.length > 0 && <details className={styles.advanced}><summary>Nastavenia / technické údaje</summary><div className={styles.advancedBody}>
        {sources.map((source) => <div className={styles.techRow} key={source.id}><strong>{source.label}</strong><span>{source.entityType} · {source.connectorType} · cadence {source.cadenceMinutes} min</span><span>source key {source.sourceKey}</span></div>)}
      </div></details>}
    </AdminShell>
  );
}
