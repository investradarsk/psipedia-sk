import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listAutomationSourceCandidates, listAutomationSourcesAdmin } from "@/lib/data-automation-source-store";
import { listAutomationDiscoveryRoots } from "@/lib/data-automation-discovery-store";
import { listAutomationFindingSummaries } from "@/lib/data-automation-store";
import { listAutomationClusterFindingIds, listAutomationClusterSummaries } from "@/lib/data-automation-cluster-admin";
import {
  automationCategoryBySlug,
  automationSourcesForCategory,
  automationCandidatesForCategory,
  automationDiscoveryRootsForCategory,
  automationCandidateAttentionCount,
  automationCategoryFindingCount,
  automationFindingsForSources,
  automationFindingLabel,
  automationSourceFindingCount,
  automationCategoryLastCheck,
  automationCategoryStatus,
  automationReadableError,
  automationSourceDomain,
  automationSourceAttentionCount,
} from "@/lib/admin-automation-presentation";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string }> };

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Bratislava",
  }).format(date);
}

function sourceState(source: {
  reviewStatus: string;
  enabled: boolean;
  lastRunStatus: string | null;
  lastErrorCode: string | null;
}) {
  if (source.lastRunStatus === "FAILED" || source.lastErrorCode) return { label: "Problém", className: styles.badgeDanger };
  if (source.reviewStatus === "PENDING") return { label: "Čaká na schválenie", className: styles.badgeWarning };
  if (!source.enabled) return { label: "Vypnutý", className: styles.badgeWarning };
  return { label: "Aktívny", className: styles.badgeGood };
}

function cadenceLabel(minutes: number) {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "každý deň" : `každých ${days} dní`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "každú hodinu" : `každých ${hours} hodín`;
  }
  return `každých ${minutes} minút`;
}

export default async function AutomationCategoryPage({ params }: Props) {
  const slug = (await params).category;
  const category = automationCategoryBySlug(slug);
  if (!category) notFound();
  const user = await requireAdminPageUser("/admin/automatizacie/" + slug);

  let allSources = [];
  let allCandidates = [];
  let allRoots = [];
  let allFindings = [];
  let unavailable = false;

  try {
    [allSources, allCandidates, allRoots, allFindings] = await Promise.all([
      listAutomationSourcesAdmin(undefined, 200),
      listAutomationSourceCandidates(undefined, 200),
      listAutomationDiscoveryRoots(undefined, 100),
      listAutomationFindingSummaries(undefined, 500),
    ]);
  } catch {
    unavailable = true;
  }

  const sources = automationSourcesForCategory(allSources, slug);
  const candidates = automationCandidatesForCategory(allCandidates, slug);
  const newCandidates = candidates.filter((candidate) => candidate.reviewStatus === "NEW" && candidate.lifecycle === "ACTIVE");
  const discoveryRoots = automationDiscoveryRootsForCategory(allRoots, slug);
  const categoryFindings = automationFindingsForSources(allFindings, sources);

  let clusters = [];
  let linkedFindingIds: number[] = [];
  try {
    clusters = await listAutomationClusterSummaries({
      sourceIds: sources.map((source) => source.id),
      entityTypes: category.entityTypes,
      limit: 50,
    });
    linkedFindingIds = await listAutomationClusterFindingIds(clusters.map((cluster) => cluster.id));
  } catch {
    // Graceful legacy fallback: source/findings UI stays available without cluster schema.
  }

  const linkedSet = new Set(linkedFindingIds);
  const legacyFindings = categoryFindings.filter((finding) => !linkedSet.has(finding.id));
  const findingCount = automationCategoryFindingCount(allFindings, sources);
  const sourceAttentionCount = automationSourceAttentionCount(sources);
  const candidateCount = automationCandidateAttentionCount(candidates);
  const attentionCount = candidateCount + findingCount + sourceAttentionCount;
  const status = unavailable ? "Čaká na dáta" : automationCategoryStatus(sources);

  return (
    <AdminShell
      user={user}
      eyebrow="Automatizácie"
      title={category.title}
      description={category.description}
      actions={<><Link href="/admin/automatizacie">← Všetky automatizácie</Link><Link href="/admin/automatizacie/zdroje">Pokročilé: všetky zdroje</Link></>}
    >
      <section className={[styles.statusHero, attentionCount > 0 || status === "Problém" ? styles.statusHeroWarning : styles.statusHeroGood].join(" ")}>
        <div>
          <strong>{attentionCount > 0 ? "Vyžaduje kontrolu" : status}</strong>
          <p>
            {sources.length
              ? sources.filter((source) => source.enabled).length + " aktívnych zdrojov"
              : "Pre túto kategóriu zatiaľ nie je nastavený aktívny zdroj."}
            {" · "}posledná kontrola {formatDate(automationCategoryLastCheck(sources))}
          </p>
        </div>
        <div className={styles.statusCount}>
          <strong>{attentionCount}</strong>
          <span>na kontrolu</span>
        </div>
      </section>

      <nav className={styles.sectionNav} aria-label="Sekcie automatizácie">
        <a href="#nove-zdroje">Nové zdroje {candidateCount > 0 ? `(${candidateCount})` : ""}</a>
        <a href="#zdroje">Zdroje</a>
        <a href="#nalezy">Koncepty a nálezy</a>
        <a href="#historia">História</a>
        <a href="#pokrocile">Pokročilé</a>
      </nav>

      <section className={[styles.section, styles.sectionAttention].join(" ")} id="nove-zdroje">
        <div className={styles.sectionHeader}>
          <div>
            <h2>Našli sa nové zdroje</h2>
            <p>Automatizácia našla weby relevantné pre túto kategóriu. Najprv ich otvor a až na detaile rozhodni, či ich zaradiť medzi zdroje Psipedie.</p>
          </div>
          <span className={styles.sectionCount}>{newCandidates.length}</span>
        </div>

        {newCandidates.length ? (
          <div className={styles.itemList}>
            {newCandidates.map((candidate) => (
              <article className={styles.itemCard} key={candidate.id}>
                <div className={styles.itemMain}>
                  <div className={styles.itemTitle}>
                    <strong>{candidate.label || automationSourceDomain(candidate.sourceUrl)}</strong>
                    <span className={[styles.badge, styles.badgeWarning].join(" ")}>Nový zdroj</span>
                  </div>
                  <p>{automationSourceDomain(candidate.sourceUrl)} · {candidate.reason}</p>
                  <p>Nájdené {formatDate(candidate.firstDetectedAt)} · naposledy potvrdené {formatDate(candidate.lastSeenAt)}</p>
                </div>
                <Link className={[styles.itemAction, styles.itemActionPrimary].join(" ")} href={"/admin/automatizacie/" + slug + "/novy-zdroj/" + candidate.id}>Skontrolovať</Link>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>Momentálne nie je žiadny nový zdroj, ktorý by vyžadoval tvoje rozhodnutie.</div>
        )}
      </section>

      <section className={styles.section} id="zdroje">
        <div className={styles.sectionHeader}>
          <div>
            <h2>Zdroje</h2>
            <p>Schválené alebo provisionované zdroje pre túto kategóriu. Technické parametre zostávajú v pokročilých údajoch.</p>
          </div>
          <span className={styles.sectionCount}>{sources.length}</span>
        </div>

        {sources.length ? (
          <div className={styles.itemList}>
            {sources.map((source) => {
              const state = sourceState(source);
              return (
                <article className={styles.itemCard} key={source.id}>
                  <div className={styles.itemMain}>
                    <div className={styles.itemTitle}>
                      <strong>{source.label}</strong>
                      <span className={[styles.badge, state.className].join(" ")}>{state.label}</span>
                    </div>
                    <p>{automationSourceDomain(source.sourceUrl)}</p>
                    <p>
                      Posledná kontrola {formatDate(source.lastCheckedAt)}
                      {" · "}ďalšia {formatDate(source.nextCheckAt)}
                      {" · "}na kontrolu {automationSourceFindingCount(allFindings, source.id)}
                    </p>
                    {source.lastErrorCode && <p><strong>Problém:</strong> {automationReadableError(source.lastErrorCode)}</p>}
                  </div>
                  <Link className={styles.itemAction} href={"/admin/automatizacie/zdroje/" + source.id}>Otvoriť zdroj</Link>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>Pre túto kategóriu zatiaľ nie je nakonfigurovaný žiadny zdroj.</div>
        )}
      </section>

      <section className={styles.section} id="nalezy">
        <div className={styles.sectionHeader}>
          <div>
            <h2>Koncepty a nálezy</h2>
            <p>Backend ešte nemá jednotný concept model. Tu preto zostávajú reálne clustre a otvorené nálezy, z ktorých sa pripravujú ďalšie admin rozhodnutia.</p>
          </div>
          <span className={styles.sectionCount}>{clusters.length || findingCount}</span>
        </div>

        {clusters.length ? (
          <div className={styles.itemList}>
            {clusters.map((cluster) => (
              <article className={styles.itemCard} key={cluster.id}>
                <div className={styles.itemMain}>
                  <div className={styles.itemTitle}>
                    <strong>{cluster.title}</strong>
                    {cluster.sourceCount > 1 && <span className={styles.badgeGood}>{cluster.sourceCount} zdroje</span>}
                    {cluster.sourceCount === 1 && <span className={styles.badge}>1 zdroj</span>}
                    {cluster.openConflictCount > 0 && <span className={styles.badgeDanger}>{cluster.openConflictCount} konflikt</span>}
                    {cluster.possibleMatchCount > 0 && <span className={styles.badgeWarning}>Možná zhoda</span>}
                  </div>
                  <p>{cluster.openFindingCount} otvorených zmien · posledná zmena {formatDate(cluster.updatedAt)}</p>
                </div>
                <Link className={styles.itemAction} href={"/admin/automatizacie/" + slug + "/cluster/" + cluster.id}>Skontrolovať</Link>
              </article>
            ))}
          </div>
        ) : categoryFindings.length ? (
          <div className={styles.itemList}>
            {categoryFindings.slice(0, 20).map((finding) => (
              <article className={styles.itemCard} key={finding.id}>
                <div className={styles.itemMain}>
                  <div className={styles.itemTitle}>
                    <strong>{automationFindingLabel(finding.findingType)}</strong>
                    <span className={styles.badge}>{finding.sourceLabel}</span>
                  </div>
                  <p>{finding.reason}</p>
                  <p>Nájdené {formatDate(finding.lastDetectedAt)}</p>
                </div>
                <Link className={styles.itemAction} href={"/admin/operations/automation/" + finding.id}>Skontrolovať</Link>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>Žiadne otvorené nálezy ani návrhy na kontrolu.</div>
        )}

        {clusters.length > 0 && legacyFindings.length > 0 && (
          <details className={styles.advanced}>
            <summary>Staršie nálezy bez cluster linkage ({legacyFindings.length})</summary>
            <div className={styles.advancedBody}>
              <div className={styles.itemList}>
                {legacyFindings.slice(0, 20).map((finding) => (
                  <div className={styles.itemCard} key={finding.id}>
                    <div className={styles.itemMain}>
                      <strong>{automationFindingLabel(finding.findingType)}</strong>
                      <p>{finding.reason}</p>
                    </div>
                    <Link className={styles.itemAction} href={"/admin/operations/automation/" + finding.id}>Skontrolovať</Link>
                  </div>
                ))}
              </div>
            </div>
          </details>
        )}
      </section>

      <section className={styles.section} id="historia">
        <div className={styles.sectionHeader}>
          <div>
            <h2>História</h2>
            <p>Posledná aktivita zdrojov v tejto kategórii.</p>
          </div>
        </div>
        {sources.length ? (
          <div className={styles.techGrid}>
            {sources.map((source) => (
              <div className={styles.techRow} key={source.id}>
                <strong>{source.label}</strong>
                <span>Posledná kontrola {formatDate(source.lastCheckedAt)} · stav {source.lastRunStatus ?? "—"}</span>
                <span>Skontrolované {source.checkedCount} · nové {source.newFindingCount} · chyby {source.errorCount}</span>
              </div>
            ))}
          </div>
        ) : <p>Zatiaľ bez histórie.</p>}
      </section>

      <details className={styles.advanced} id="pokrocile">
        <summary>Pokročilé</summary>
        <div className={styles.advancedBody}>
          <section className={styles.advancedSection}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Automatické hľadanie zdrojov</h2>
                <p>Discovery roots sú technický motor hľadania. Bežný admin potrebuje vidieť iba ich stav, frekvenciu a posledné hľadanie.</p>
              </div>
              <span className={styles.sectionCount}>{discoveryRoots.length}</span>
            </div>
            {discoveryRoots.length ? (
              <div className={styles.techGrid}>
                {discoveryRoots.map((root) => (
                  <div className={styles.techRow} key={root.id}>
                    <strong>{root.label}</strong>
                    <span>{root.enabled ? "Aktívne" : "Vypnuté"} · {cadenceLabel(root.cadenceMinutes)} · posledné hľadanie {formatDate(root.lastCheckedAt)}</span>
                    <span>{root.lastErrorCode ? "Chyba: " + automationReadableError(root.lastErrorCode) : "Bez evidovanej chyby"}</span>
                  </div>
                ))}
              </div>
            ) : <p>Pre túto kategóriu nie je nastavené automatické hľadanie zdrojov.</p>}
          </section>

          <section className={styles.advancedSection}>
            <h2>Technické údaje zdrojov</h2>
            {sources.length ? (
              <div className={styles.techGrid}>
                {sources.map((source) => (
                  <div className={styles.techRow} key={source.id}>
                    <strong>{source.label}</strong>
                    <span>{source.entityType} · {source.connectorType} · cadence {source.cadenceMinutes} min</span>
                    <span>source key {source.sourceKey}</span>
                  </div>
                ))}
              </div>
            ) : <p>Bez technických údajov zdrojov.</p>}
          </section>

          <p><Link href="/admin/automatizacie/zdroje">Otvoriť globálnu správu všetkých zdrojov a discovery →</Link></p>
        </div>
      </details>
    </AdminShell>
  );
}
