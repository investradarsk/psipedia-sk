import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listAutomationSourceCandidates, listAutomationSourcesAdmin } from "@/lib/data-automation-source-store";
import { listAutomationDiscoveryRoots } from "@/lib/data-automation-discovery-store";
import {
  automationCategoryBySlug,
  automationSourcesForCategory,
  automationCandidatesForCategory,
  automationDiscoveryRootsForCategory,
  automationCandidateAttentionCount,
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
  let unavailable = false;

  try {
    [allSources, allCandidates, allRoots] = await Promise.all([
      listAutomationSourcesAdmin(undefined, 200),
      listAutomationSourceCandidates(undefined, 200),
      listAutomationDiscoveryRoots(undefined, 100),
    ]);
  } catch {
    unavailable = true;
  }

  const sources = automationSourcesForCategory(allSources, slug);
  const candidates = automationCandidatesForCategory(allCandidates, slug);
  const newCandidates = candidates.filter((candidate) => candidate.reviewStatus === "NEW" && candidate.lifecycle === "ACTIVE");
  const discoveryRoots = automationDiscoveryRootsForCategory(allRoots, slug);
  const sourceAttentionCount = automationSourceAttentionCount(sources);
  const candidateCount = automationCandidateAttentionCount(candidates);
  const attentionCount = candidateCount + sourceAttentionCount;
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
                  <p>Psipedia našla nový zdroj pre kategóriu {category.title.toLowerCase()}. Zdroj je pripravený na kontrolu.</p>
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
            <p>Schválené zdroje, ktoré Psipedia používa. Nájdený obsah sa vytvára ako koncept v príslušnej admin sekcii; technické parametre zostávajú pod Pokročilé.</p>
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
                    <p>{state.label} · kontrola {cadenceLabel(source.cadenceMinutes)}</p>
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

      <section className={styles.section} id="historia">
        <div className={styles.sectionHeader}>
          <div>
            <h2>História</h2>
            <p>Posledná aktivita zdrojov. Obsahové koncepty sa spravujú v existujúcich sekciách Podujatia, Adopcie, Organizácie, Adresár alebo Pomoc psom.</p>
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
                <p>Psipedia môže automaticky hľadať nové zdroje. Tu vidíš iba stav, frekvenciu a výsledok poslednej kontroly.</p>
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
                    {root.discoveryType === "SEARCH_PROVIDER" && String(root.config.provider ?? "").toLowerCase() === "tavily" ? (
                      <Link href={"/admin/automatizacie/" + slug + "/discovery/" + root.id}>Otvoriť technické nastavenia →</Link>
                    ) : null}
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

          <p><Link href="/admin/automatizacie/zdroje">Otvoriť technickú správu zdrojov a automatického hľadania →</Link></p>
        </div>
      </details>
    </AdminShell>
  );
}
