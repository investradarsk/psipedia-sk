import Link from "next/link";
import type { AdminTrafficReport, TrafficPoint, TrafficRank, TrafficSeries } from "@/lib/admin-traffic-analytics";
import type { SiteTrafficReport } from "@/lib/site-analytics-report";
import { AdminSiteTrafficPanel } from "@/components/admin-site-traffic-panel";
import styles from "./admin-traffic-dashboard.module.css";

const windows = [
  { key: "24h", label: "24 hodín" },
  { key: "7d", label: "7 dní" },
  { key: "30d", label: "30 dní" },
  { key: "all", label: "Celkovo" },
] as const;

const numberFormat = new Intl.NumberFormat("sk-SK");

function count(value: number | null) {
  return value === null ? "—" : numberFormat.format(value);
}

function Metric({
  label,
  value,
  description,
}: {
  label: string;
  value: number | null;
  description: string;
}) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong className={styles.metricValue} data-available={value !== null}>
        {count(value)}
      </strong>
      <small>{value === null ? "Údaje nedostupné" : description}</small>
    </div>
  );
}

function dayLegend(index: number, length: number) {
  if (length <= 12) return true;
  const step = length === 24 ? 4 : 5;
  return index === 0 || index === length - 1 || index % step === 0;
}

function TrafficChart({ report }: { report: AdminTrafficReport }) {
  const { articles, profiles } = report;
  const ready = articles.available || profiles.available;
  const articlePoints = articles.points;
  const profilePoints = profiles.points;
  const max = Math.max(
    1,
    ...articlePoints.map((point) => articles.available ? point.views : 0),
    ...profilePoints.map((point) => profiles.available ? point.views : 0),
  );
  const exactRows = articlePoints.map((point, index) => ({
    label: point.label,
    articles: articlePoints[index]?.views ?? 0,
    profiles: profilePoints[index]?.views ?? 0,
  }));

  return (
    <section className={styles.panel} aria-labelledby="traffic-chart-title">
      <div className={styles.panelHeader}>
        <div>
          <h2 id="traffic-chart-title">Vývoj zobrazení obsahu</h2>
          <p>
            {report.window === "all"
              ? "Graf zobrazuje posledných 12 kalendárnych mesiacov. Súčet vyššie je za celé obdobie."
              : "Rovnomerné intervaly UTC v zvolenom časovom okne."}
          </p>
        </div>
        <div className={styles.legend} aria-label="Legenda grafu">
          {articles.available && <span><i className={styles.articleDot} aria-hidden="true" /> Články</span>}
          {profiles.available && <span><i className={styles.profileDot} aria-hidden="true" /> Profily</span>}
        </div>
      </div>

      {ready ? (
        <>
          <div className={styles.chart} style={{ gridTemplateColumns: `repeat(${articlePoints.length}, minmax(0, 1fr))` }} role="img" aria-label="Graf kvalifikovaných zobrazení článkov a profilov. Presné hodnoty sú dostupné v tabuľke pod grafom.">
            {articlePoints.map((point: TrafficPoint, index: number) => {
              const profile = profilePoints[index];
              return (
                <div className={styles.chartColumn} key={point.key}>
                  <div className={styles.bars} title={`${point.label}: články ${articles.available ? point.views : "nedostupné"}, profily ${profiles.available ? profile?.views ?? 0 : "nedostupné"}`}>
                    {articles.available && (
                      <span
                        className={styles.articleBar}
                        style={{ height: `${point.views > 0 ? Math.max(2, (point.views / max) * 100) : 0}%` }}
                      />
                    )}
                    {profiles.available && (
                      <span
                        className={styles.profileBar}
                        style={{ height: `${(profile?.views ?? 0) > 0 ? Math.max(2, ((profile?.views ?? 0) / max) * 100) : 0}%` }}
                      />
                    )}
                  </div>
                  <span className={styles.chartLabel}>
                    {dayLegend(index, articlePoints.length) ? point.label : ""}
                  </span>
                </div>
              );
            })}
          </div>
          <details className={styles.tableDisclosure}>
            <summary>Presné hodnoty grafu</summary>
            <div className={styles.tableScroll}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Interval</th>
                    <th scope="col">Články</th>
                    <th scope="col">Profily</th>
                  </tr>
                </thead>
                <tbody>
                  {exactRows.map((row, index) => (
                    <tr key={index}>
                      <th scope="row">{row.label}</th>
                      <td>{articles.available ? count(row.articles) : "—"}</td>
                      <td>{profiles.available ? count(row.profiles) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p className={styles.empty}>Štatistiky sú momentálne nedostupné. Po obnovení dát z D1 sa zobrazia automaticky.</p>
      )}
    </section>
  );
}

function Ranking({
  title,
  source,
  id,
}: {
  title: string;
  source: TrafficSeries;
  id: string;
}) {
  return (
    <section className={styles.panel} aria-labelledby={id}>
      <div className={styles.panelHeader}>
        <div>
          <h2 id={id}>{title}</h2>
          <p>Podľa skutočných kvalifikovaných zobrazení vo vybranom období.</p>
        </div>
      </div>
      {!source.available ? (
        <p className={styles.empty}>Údaje nie sú dostupné.</p>
      ) : source.top.length === 0 ? (
        <p className={styles.empty}>Za toto obdobie zatiaľ nemáme žiadne započítané zobrazenia.</p>
      ) : (
        <ol className={styles.rankings}>
          {source.top.map((entry: TrafficRank, index: number) => (
            <li key={entry.id} className={styles.ranking}>
              <span className={styles.rankNumber}>{index + 1}.</span>
              <div className={styles.rankDetails}>
                <Link href={entry.href} target="_blank" rel="noopener noreferrer">
                  {entry.title}
                </Link>
                <small>{entry.description}</small>
              </div>
              <strong className={styles.rankCount} title="Kvalifikované zobrazenia">
                {count(entry.views)}×
              </strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function AdminTrafficDashboard({ report, siteReport }: { report: AdminTrafficReport; siteReport: SiteTrafficReport }) {
  return (
    <div className={styles.root} data-admin-traffic-statistics>
      <nav className={styles.filters} aria-label="Obdobie návštevnosti">
        {windows.map((window) => (
          <Link
            key={window.key}
            href={`/admin/nastavenia/statistiky?obdobie=${window.key}`}
            aria-current={report.window === window.key ? "page" : undefined}
            className={report.window === window.key ? styles.activeFilter : undefined}
            prefetch={false}
          >
            {window.label}
          </Link>
        ))}
      </nav>

      <AdminSiteTrafficPanel report={siteReport} />

      <div>
        <h2 style={{ margin: "12px 0 5px", fontSize: "1rem" }}>Čítanosť článkov a profilov</h2>
        <p style={{ margin: "0 0 8px", color: "#567063", fontSize: ".79rem" }}>
          Podrobné zobrazenia obsahu sú samostatná metrika od návštevnosti celého webu.
        </p>
      </div>
      <div className={styles.metrics} aria-label="Súhrn zobrazení">
        <Metric label="Kvalifikované zobrazenia spolu" value={report.combined} description="Články aj profily" />
        <Metric label="Prečítania článkov" value={report.articles.total} description="Viditeľné aspoň 10 sekúnd" />
        <Metric label="Návštevy profilov" value={report.profiles.total} description="Viditeľné aspoň 10 sekúnd" />
      </div>

      {!report.profiles.available && (
        <p className={styles.warning} role="status">
          Štatistiky profilov zatiaľ nie sú dostupné. Nová tabuľka vyžaduje schválené nasadenie D1 migrácie 0167.
          Dostupné prečítania článkov sa zobrazujú nezávisle.
        </p>
      )}

      <TrafficChart report={report} />

      <div className={styles.rankingGrid}>
        <Ranking id="traffic-articles-title" title="Najčítanejšie články" source={report.articles} />
        <Ranking id="traffic-profiles-title" title="Najnavštevovanejšie profily" source={report.profiles} />
      </div>

      <p className={styles.footnote}>
        Údaje sú z D1 a predstavujú kvalifikované zobrazenia obsahu, nie unikátnych ľudí ani všetky návštevy webu.
        Návštevníci celej stránky a používatelia práve online sa zatiaľ v tomto prehľade nemerajú.
        GA4 meria súhlasom povolené návštevy oddelene. Posledné načítanie:{" "}
        <time dateTime={report.generatedAt}>
          {new Intl.DateTimeFormat("sk-SK", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Bratislava" }).format(new Date(report.generatedAt))}
        </time>.
      </p>
    </div>
  );
}
