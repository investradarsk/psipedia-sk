import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-automation-operations.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { automationReadableError } from "@/lib/admin-automation-presentation";
import {
  getAutomationOperationsOverview,
  type AutomationOperationsCategory,
} from "@/lib/data-automation-operations";
import {
  parseAutomationOperationsRange,
  type AutomationCadenceRecommendation,
} from "@/lib/data-automation-operations-model";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] || "" : value || "";

function count(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("sk-SK").format(value);
}

function date(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("sk-SK", {
    timeZone: "Europe/Bratislava",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function duration(value: number | null) {
  if (value === null) return "—";
  if (value < 1000) return value + " ms";
  return (value / 1000).toLocaleString("sk-SK", { maximumFractionDigits: 1 }) + " s";
}

function cadence(minutes: number | null) {
  if (!minutes) return "—";
  if (minutes % 10080 === 0) {
    const weeks = minutes / 10080;
    return weeks === 1 ? "Každý týždeň" : "Každé " + weeks + " týždne";
  }
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "Každý deň" : "Každé " + days + " dni";
  }
  if (minutes % 60 === 0) return "Každých " + (minutes / 60) + " h";
  return "Každých " + minutes + " min";
}

function recommendation(value: AutomationCadenceRecommendation) {
  if (value === "CONSIDER_SLOWER") {
    return "Posledné zdravé kontroly priniesli minimum nového obsahu. Môže stačiť spúšťať menej často.";
  }
  if (value === "CONSIDER_FASTER") {
    return "Automatizácia pravidelne nachádza nový obsah. Môže mať zmysel kontrolovať ju častejšie.";
  }
  if (value === "KEEP_CURRENT") return "Súčasná frekvencia zodpovedá doterajšej výťažnosti.";
  return "Zatiaľ málo údajov na odporúčanie.";
}

function statusLabel(status: string) {
  if (status === "SUCCESS") return "Úspešné";
  if (status === "PARTIAL") return "Čiastočné";
  if (status === "FAILED") return "Zlyhalo";
  if (status === "RUNNING") return "Prebieha";
  return status;
}

function DirectMetrics({ category }: { category: AutomationOperationsCategory }) {
  return <>
    <p className={styles.budget}>
      Tavily dnes: <strong>{count(category.todayRequestCount)}</strong>
      {category.todayRequestLimit !== null ? <> / {count(category.todayRequestLimit)}</> : null}
      {category.todayAddressRequestLimit !== null ? <> · Adresa: <strong>{count(category.todayAddressRequestCount)}</strong> / {count(category.todayAddressRequestLimit)}</> : null}
    </p>
    <div className={styles.metrics} aria-label={"Výsledky " + category.title}>
      <div><span>Tavily požiadavky</span><strong>{count(category.requestCount)}</strong></div>
      <div><span>Výsledky vyhľadávania</span><strong>{count(category.resultCount)}</strong></div>
      <div><span>Spracované kandidáty</span><strong>{count(category.candidateCount)}</strong></div>
      <div><span>Už existovalo</span><strong>{count(category.duplicateCount)}</strong></div>
      <div><span>Nové koncepty</span><strong>{count(category.newCount)}</strong></div>
      <div><span>Z toho možné duplicity</span><strong>{count(category.possibleDuplicateCount)}</strong></div>
      <div><span>Návrhy doplnení</span><strong>{count(category.updateCount)}</strong></div>
    </div>
    {(category.addressRequestCount > 0 || category.addressVerifiedExactCount !== null) && <div className={styles.panel}>
      <strong>Dohľadanie presnej adresy</strong>
      <div className={styles.metrics}>
        <div><span>Požiadavky</span><strong>{count(category.addressRequestCount)}</strong></div>
        <div><span>Search výsledky</span><strong>{count(category.addressResultCount)}</strong></div>
        <div><span>Presne overené</span><strong>{count(category.addressVerifiedExactCount)}</strong></div>
        <div><span>Bez presného výsledku</span><strong>{count(category.addressNoExactCount)}</strong></div>
      </div>
    </div>}
  </>;
}

function FeedMetrics({ category }: { category: AutomationOperationsCategory }) {
  return <>
    <p className={styles.budget}>
      Tavily dnes: <strong>{count(category.todayRequestCount)}</strong>
      {category.todayRequestLimit !== null ? <> / {count(category.todayRequestLimit)}</> : null}
    </p>
    <div className={styles.metrics} aria-label={"Výsledky " + category.title}>
    <div><span>Discovery požiadavky</span><strong>{count(category.requestCount)}</strong></div>
    <div><span>Discovery výsledky</span><strong>{count(category.resultCount)}</strong></div>
    <div><span>Kandidátne zdroje</span><strong>{count(category.candidateCount)}</strong></div>
    <div><span>Duplicitné / známe zdroje</span><strong>{count(category.duplicateCount)}</strong></div>
    <div><span>Skontrolované záznamy</span><strong>{count(category.checkedCount)}</strong></div>
    <div><span>Nové zistenia</span><strong>{count(category.newFindingCount)}</strong></div>
    <div><span>Zmenené zistenia</span><strong>{count(category.updatedFindingCount)}</strong></div>
    <div><span>Nové zdroje na kontrolu</span><strong>{count(category.newSourceCandidateCount)}</strong></div>
    <div><span>Schválené zdroje</span><strong>{count(category.approvedSourceCandidateCount)}</strong></div>
    <div><span>Zamietnuté zdroje</span><strong>{count(category.rejectedSourceCandidateCount)}</strong></div>
    <div><span>Chyby</span><strong>{count(category.errorCount)}</strong></div>
    </div>
  </>;
}

function RefreshProgress({ category }: { category: AutomationOperationsCategory }) {
  const refresh = category.refresh;
  if (!refresh) return null;
  const pct = refresh.eligibleTotal > 0
    ? Math.round(refresh.eligibleProcessedInCurrentCycle / refresh.eligibleTotal * 100)
    : 0;
  return <div className={styles.panel}>
    <strong>Kontrola existujúcich profilov</strong>
    <p className={styles.muted}>
      Bez webu: {count(refresh.withoutWebsite)} · S webom: {count(refresh.withWebsite)}
    </p>
    {refresh.state === "IN_PROGRESS" ? <div className={styles.progress}>
      <p>{count(refresh.eligibleProcessedInCurrentCycle)} / {count(refresh.eligibleTotal)} profilov skontrolovaných · {pct} %</p>
      <progress value={refresh.eligibleProcessedInCurrentCycle} max={Math.max(1, refresh.eligibleTotal)}>
        {pct} %
      </progress>
    </div> : refresh.state === "COMPLETE" ? <p>Posledný cyklus dokončený.</p>
      : refresh.state === "IDLE_AFTER_ERROR" ? <p>Posledný cyklus skončil s problémom.</p>
      : <p>Zatiaľ neprebehol celý cyklus kontroly.</p>}
    <p className={styles.muted}>
      Posledná dávka: {count(refresh.lastBatchCheckedCount)} profilov
      {refresh.lastBatchUpdateSuggestionCount !== null ? <> · návrhy zmien {count(refresh.lastBatchUpdateSuggestionCount)}</> : null}
      {refresh.lastBatchErrorCount !== null ? <> · chyby {count(refresh.lastBatchErrorCount)}</> : null}<br/>
      Posledná kontrola: {date(refresh.lastCheckedAt)} · Ďalšia dávka: {date(refresh.nextCheckAt)}
    </p>
  </div>;
}

export default async function AutomationOperationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAdminPageUser("/admin/automatizacie/prehlad");
  const raw = await searchParams;
  const range = parseAutomationOperationsRange(one(raw.range));
  const overview = await getAutomationOperationsOverview(range);

  return <AdminShell
    user={user}
    eyebrow="Automatizácie"
    title="Prehľad automatizácií"
    description="Výsledky hľadania, kontroly existujúcich záznamov, využitie vyhľadávania a stav zdrojov."
    actions={<Link href="/admin/automatizacie">← Automatizácie</Link>}
  >
    <nav className={styles.rangeNav} aria-label="Obdobie prehľadu">
      <Link href="/admin/automatizacie/prehlad?range=today" aria-current={range === "today" ? "page" : undefined}>Dnes</Link>
      <Link href="/admin/automatizacie/prehlad?range=7d" aria-current={range === "7d" ? "page" : undefined}>7 dní</Link>
      <Link href="/admin/automatizacie/prehlad?range=30d" aria-current={range === "30d" ? "page" : undefined}>30 dní</Link>
    </nav>

    {!overview.extendedMetricsAvailable && <p className={styles.notice}>
      Rozšírené metriky zatiaľ nie sú dostupné. Staršie behy zostávajú zobrazené bez vymyslených núl.
    </p>}

    <section className={styles.summaryGrid} aria-label="Súhrn automatizácií">
      <div className={styles.metricCard}><span>Tavily požiadavky</span><strong>{count(overview.global.requestCount)}</strong></div>
      <div className={styles.metricCard}><span>Výsledky vyhľadávania</span><strong>{count(overview.global.resultCount)}</strong></div>
      <div className={styles.metricCard}><span>Nové koncepty · priame hľadanie</span><strong>{count(overview.global.newEntityCount)}</strong></div>
      <div className={styles.metricCard}><span>Návrhy zmien · priame hľadanie</span><strong>{count(overview.global.updateSuggestionCount)}</strong></div>
      <div className={styles.metricCard}><span>Duplicitné / už existujúce</span><strong>{count(overview.global.duplicateCount)}</strong></div>
      <div className={styles.metricCard}><span>Chyby behov</span><strong>{count(overview.global.errorCount)}</strong></div>
    </section>

    <section className={styles.categoryGrid} aria-label="Prevádzkový stav">
      <div className={styles.panel}>
        <h2>Vyhľadávací limit</h2>
        <p className={styles.budget}>Tavily dnes: <strong>{count(overview.global.tavilyTodayUsed)}</strong>
          {overview.global.tavilyTodayLimit !== null ? <> / {count(overview.global.tavilyTodayLimit)}</> : null}
        </p>
        <p className={styles.muted}>Dohľadanie presnej adresy sa nezapočítava do discovery počtu na kartách kategórií.</p>
      </div>
      <div className={styles.panel}>
        <h2>Stav zdrojov</h2>
        <p>Schválené: <strong>{count(overview.global.approvedSources)}</strong> · Aktívne: <strong>{count(overview.global.activeSources)}</strong></p>
        <p>S problémom: <strong>{count(overview.global.problemSources)}</strong> · Čakajúce: <strong>{count(overview.global.pendingSources)}</strong></p>
        <p className={styles.muted}>Technický stav zdroja je oddelený od jeho výťažnosti.</p>
      </div>
    </section>

    <section className={styles.section} aria-label="Kategórie">
      <div className={styles.categoryGrid}>
        {overview.categories.map((category) => <article className={styles.categoryCard} key={category.slug}>
          <h2>{category.title}</h2>
          <div className={styles.statusLine}>
            <span className={styles.pill}>{category.status}</span>
            <span className={styles.muted}>{category.mode === "DIRECT_ENTITY" ? "Priame hľadanie" : "Opakované zdroje"}</span>
          </div>
          <p className={styles.muted}>
            Posledné spustenie: {date(category.lastRunAt)}<br/>
            Ďalšie spustenie: {date(category.nextRunAt)} · {cadence(category.cadenceMinutes)}
          </p>
          {category.lastErrorCode && <p className={styles.notice}>
            {automationReadableError(category.lastErrorCode)}
          </p>}

          {category.mode === "DIRECT_ENTITY" ? <DirectMetrics category={category}/> : <FeedMetrics category={category}/>}
          <RefreshProgress category={category}/>

          <div className={styles.panel}>
            <strong>Odporúčanie frekvencie</strong>
            <p>{recommendation(category.recommendation)}</p>
            <p className={styles.muted}>Odporúčanie nikdy nemení plánovanie automaticky.</p>
          </div>

          {category.recentOutcomes.length > 0 && <details className={styles.details}>
            <summary>Posledné výsledky hľadania</summary>
            <div className={styles.outcomeList}>
              {category.recentOutcomes.slice(0, 10).map((outcome, index) => <div className={styles.outcome} key={outcome.createdAt + ":" + index}>
                <strong>{outcome.label || "Bez názvu"}</strong>
                <div className={styles.muted}>
                  {outcome.outcomeType === "NEW_DRAFT" ? "Nový koncept"
                    : outcome.outcomeType === "UPDATE_SUGGESTION" ? "Návrh doplnenia"
                    : outcome.outcomeType === "POSSIBLE_DUPLICATE" ? "Možná duplicita"
                    : "Už existuje"} · {outcome.reason}
                </div>
                {outcome.canonicalHref ? <Link href={outcome.canonicalHref}>Otvoriť profil</Link>
                  : outcome.canonicalEntityId !== null && !outcome.canonicalExists
                    ? <span className={styles.muted}>Záznam už neexistuje</span>
                    : null}
              </div>)}
            </div>
          </details>}

          <details className={styles.details}>
            <summary>História behov</summary>
            {category.recentRuns.length ? <div className={styles.history}>
              {category.recentRuns.map((run) => <div className={styles.historyItem} key={run.kind + ":" + run.id}>
                <span>{date(run.startedAt)} · {statusLabel(run.status)}</span>
                <span>nové {count(run.newCount)}</span>
                <span>zmeny {count(run.updateCount)}</span>
                <span>chyby {count(run.errors)}</span>
                <span>{duration(run.durationMs)}</span>
              </div>)}
            </div> : <p className={styles.empty}>Zatiaľ nemáme údaje z behov.</p>}
          </details>

          <div className={styles.actions}>
            <Link href={"/admin/automatizacie/" + category.slug}>Otvoriť kategóriu →</Link>
          </div>
        </article>)}
      </div>
    </section>

    <section className={styles.section}>
      <div className={styles.panel}>
        <h2>Úspešnosť behov</h2>
        <p>{count(overview.global.successfulRuns)} úspešných · {count(overview.global.partialRuns)} čiastočných · {count(overview.global.failedRuns)} zlyhaných</p>
        <p className={styles.muted}>Časy sú zobrazené pre Europe/Bratislava. Staršie neinstrumentované metriky sa zobrazujú ako „—“, nie ako nula.</p>
      </div>
    </section>
  </AdminShell>;
}
