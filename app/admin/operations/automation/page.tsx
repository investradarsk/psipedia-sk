import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listAutomationSourceHealth } from "@/lib/data-automation-store";
import { listAutomationSourceCandidates, listAutomationSourcesAdmin } from "@/lib/data-automation-source-store";
import { listAutomationDiscoveryRoots } from "@/lib/data-automation-discovery-store";

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

function sourceState(row: Record<string, unknown>) {
  if (row.last_run_status === "FAILED" || row.last_error_code) return "Problém";
  if (row.review_status === "PENDING") return "Čaká na schválenie";
  if (!row.enabled) return "Vypnutý";
  if (!row.last_run_status) return "Ešte nekontrolovaný";
  return "V poriadku";
}

function sourceBadge(row: Record<string, unknown>) {
  if (row.last_run_status === "FAILED" || row.last_error_code) return styles.badgeDanger;
  if (row.review_status === "PENDING" || !row.enabled) return styles.badgeWarning;
  return styles.badgeGood;
}

export default async function AutomationOperationsPage() {
  const user = await requireAdminPageUser("/admin/operations/automation");
  let sources: Record<string, unknown>[] = [];
  let newCandidates = 0;
  let discoveryRoots = 0;
  let unavailable = false;

  try {
    const [health, candidates, sourceAdmin, roots] = await Promise.all([
      listAutomationSourceHealth(),
      listAutomationSourceCandidates(undefined, 200),
      listAutomationSourcesAdmin(undefined, 200),
      listAutomationDiscoveryRoots(undefined, 100),
    ]);
    const reviewById = new Map(sourceAdmin.map((source) => [source.id, source.reviewStatus]));
    sources = health.map((row) => ({
      ...row,
      review_status: reviewById.get(Number(row.id)) ?? "PENDING",
    }));
    newCandidates = candidates.filter((candidate) => candidate.reviewStatus === "NEW").length;
    discoveryRoots = roots.filter((root) => root.enabled && root.reviewStatus === "APPROVED").length;
  } catch {
    unavailable = true;
  }

  const activeSources = sources.filter((row) => Boolean(row.enabled)).length;
  const failedSources = sources.filter((row) => row.last_run_status === "FAILED" || Boolean(row.last_error_code)).length;
  const pendingSources = sources.filter((row) => row.review_status === "PENDING").length;
  const needsAttention = failedSources + pendingSources + newCandidates;

  return (
    <AdminShell
      user={user}
      eyebrow="Admin Operations"
      title="Automatický research"
      description="Prehľad toho, čo automatizácia sleduje a čo od teba potrebuje. Bežné technické údaje sú schované v detailoch."
      actions={<><Link href="/admin/operations/automation/sources">Zdroje a návrhy</Link><Link href="/admin/operations">Operácie</Link></>}
    >
      {unavailable ? (
        <section className="admin-panel">
          <h2>Automatizácia zatiaľ nie je dostupná</h2>
          <p>Databázová schéma alebo pripojenie nie je pripravené. Skús stránku obnoviť po deployi alebo migrácii.</p>
        </section>
      ) : (
        <>
          <section className={[styles.statusHero, needsAttention > 0 ? styles.statusHeroWarning : styles.statusHeroGood].join(" ")} aria-label="Celkový stav automatizácie">
            <div>
              <strong>{needsAttention > 0 ? "Automatizácia potrebuje tvoju pozornosť" : "Automatizácia je v poriadku"}</strong>
              <p>{needsAttention > 0
                ? "Najprv vyrieš nové kandidátske zdroje, čakajúce schválenia alebo zdroje s chybou. Ostatné môže zostať bez zásahu."
                : "Aktívne zdroje nehlásia problém a nie je tu žiadna nová položka, ktorú musíš riešiť."}</p>
            </div>
            <div className={styles.statusCount}><strong>{needsAttention}</strong><span>na kontrolu</span></div>
          </section>

          <section className={styles.hubGrid} aria-label="Rýchle akcie automatizácie">
            <Link className={[styles.hubCard, newCandidates > 0 ? styles.hubCardPrimary : ""].filter(Boolean).join(" ")} href="/admin/operations/automation/sources#kandidati">
              <span className={styles.hubKicker}>Nové nálezy</span>
              <div className={styles.hubMetric}><strong>{newCandidates}</strong><span>nových zdrojov</span></div>
              <h2>Čaká na tvoje rozhodnutie</h2>
              <p>Nové weby alebo registre, ktoré automatizácia našla. Schváliš iba tie, ktoré chceš ďalej používať.</p>
              <span className={styles.hubOpen}>Skontrolovať návrhy →</span>
            </Link>

            <Link className={[styles.hubCard, pendingSources + failedSources > 0 ? styles.hubCardPrimary : styles.hubCardGood].filter(Boolean).join(" ")} href="/admin/operations/automation/sources#zdroje">
              <span className={styles.hubKicker}>Monitorované zdroje</span>
              <div className={styles.hubMetric}><strong>{activeSources}</strong><span>aktívnych</span></div>
              <h2>Zdroje a ich stav</h2>
              <p>{pendingSources + failedSources > 0 ? String(pendingSources + failedSources) + " zdrojov čaká na schválenie alebo hlási problém." : "Aktívne zdroje sú bez zjavnej chyby."}</p>
              <span className={styles.hubOpen}>Spravovať zdroje →</span>
            </Link>

            <Link className={styles.hubCard} href="/admin/operations/automation/sources#discovery">
              <span className={styles.hubKicker}>Objavovanie zdrojov</span>
              <div className={styles.hubMetric}><strong>{discoveryRoots}</strong><span>aktívnych oblastí</span></div>
              <h2>Discovery</h2>
              <p>Systém pravidelne prehľadáva schválené verejné zoznamy a navrhuje ďalšie zdroje.</p>
              <span className={styles.hubOpen}>Pozrieť discovery →</span>
            </Link>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Stav zdrojov</h2>
                <p>Na prvý pohľad vidíš iba to, či zdroj funguje. Počet záznamov, trvanie a ďalšie technické metriky sú v rozbalení.</p>
              </div>
              <span className={styles.sectionCount}>{sources.length}</span>
            </div>

            {sources.length ? (
              <div className={styles.itemList}>
                {sources.map((row) => (
                  <div className={styles.itemCard} key={text(row.id)}>
                    <div className={styles.itemMain}>
                      <div className={styles.itemTitle}>
                        <strong>{text(row.label)}</strong>
                        <span className={[styles.badge, sourceBadge(row)].join(" ")}>{sourceState(row)}</span>
                        <span className={styles.badge}>{text(row.entity_type)}</span>
                      </div>
                      <p>Ďalšia kontrola: {formatDate(row.next_check_at)}{row.last_error_code ? " · chyba: " + text(row.last_error_code) : ""}</p>
                    </div>
                    <Link className={styles.itemAction} href={"/admin/operations/automation/sources/" + text(row.id)}>Otvoriť zdroj</Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>Zatiaľ nie sú nakonfigurované žiadne zdroje.</div>
            )}

            {sources.length > 0 && (
              <details className={styles.advanced}>
                <summary>Technické údaje o posledných behoch</summary>
                <div className={styles.advancedBody}>
                  <div className={styles.techGrid}>
                    {sources.map((row) => (
                      <div className={styles.techRow} key={"tech-" + text(row.id)}>
                        <strong>{text(row.label)}</strong>
                        <span>{text(row.last_run_status)} · checked {text(row.checked_count)} · new {text(row.new_finding_count)} · errors {text(row.error_count)}</span>
                        <span>{text(row.duration_ms)} ms · next {formatDate(row.next_check_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            )}
          </section>
        </>
      )}
    </AdminShell>
  );
}
