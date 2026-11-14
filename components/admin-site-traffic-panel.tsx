import Link from "next/link";
import type { SiteTrafficReport } from "@/lib/site-analytics-report";
import styles from "./admin-site-traffic-panel.module.css";

const numberFormat = new Intl.NumberFormat("sk-SK");

export function AdminSiteTrafficPanel({ report }: { report: SiteTrafficReport }) {
  if (!report.available) {
    return (
      <section className={styles.panel} data-admin-sitewide-analytics>
        <h2>Zobrazenia stránok</h2>
        <p className={styles.empty}>
          Počítadlo nie je aktívne. Vyžaduje pripravenú migráciu D1 č. 0168
          a zapnutie vlastného merania.
        </p>
      </section>
    );
  }

  const max = Math.max(1, ...report.points.map((point) => point.pageviews));
  const showLabel = (index: number) =>
    report.points.length <= 12 || index === 0 || index === report.points.length - 1
      || index % (report.points.length === 24 ? 4 : 5) === 0;

  return (
    <section className={styles.root} data-admin-sitewide-analytics>
      <div className={styles.header}>
        <h2>Zobrazenia stránok</h2>
        <p>
          Vlastné súhrnné počítadlo Psipedie. Bez cookies, identifikátorov
          návštevníkov a Google Analytics.
        </p>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span>Zobrazenia za vybrané obdobie</span>
          <strong data-site-pageview-total>
            {report.pageviews === null ? "—" : numberFormat.format(report.pageviews)}
          </strong>
          <small>Počet zaznamenaných otvorení verejných stránok</small>
        </div>
      </div>

      <section className={styles.panel} aria-labelledby="site-views-chart">
        <div className={styles.chartHeader}>
          <div>
            <h3 id="site-views-chart">Vývoj zobrazení</h3>
            <p>{report.window === "all"
              ? "Graf za posledných 12 mesiacov; celkový počet zahŕňa celú históriu."
              : "Hodinové alebo denné súčty."}</p>
          </div>
        </div>
        <div
          className={styles.chart}
          role="img"
          aria-label="Graf počtu zobrazení stránok. Presné hodnoty sú v tabuľke."
          style={{ gridTemplateColumns: `repeat(${report.points.length}, minmax(0, 1fr))` }}
        >
          {report.points.map((point, index) => (
            <div className={styles.column} key={point.key}>
              <div className={styles.bars} title={`${point.label}: ${point.pageviews} zobrazení`}>
                <i className={styles.viewColor} style={{
                  height: `${point.pageviews ? Math.max(2, (point.pageviews / max) * 100) : 0}%`,
                }} />
              </div>
              <span>{showLabel(index) ? point.label : ""}</span>
            </div>
          ))}
        </div>
        <details className={styles.exactTable}>
          <summary>Presné počty podľa obdobia</summary>
          <div className={styles.scroll}>
            <table>
              <thead>
                <tr><th scope="col">Obdobie</th><th scope="col">Zobrazenia</th></tr>
              </thead>
              <tbody>
                {report.points.map((point) => (
                  <tr key={point.key}>
                    <th scope="row">{point.label}</th>
                    <td>{numberFormat.format(point.pageviews)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className={styles.panel}>
        <h3>Najnavštevovanejšie stránky</h3>
        {report.topPages.length === 0 ? (
          <p className={styles.empty}>Zatiaľ žiadne zobrazenia.</p>
        ) : (
          <ol className={styles.rankings}>
            {report.topPages.map((row) => (
              <li key={row.path}>
                <Link href={row.path} target="_blank" rel="noopener noreferrer">
                  {row.path === "/" ? "Úvodná stránka" : row.path}
                </Link>
                <strong>{numberFormat.format(row.pageviews)}×</strong>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className={styles.footnote}>
        Počítame otvorenia verejných stránok, nie počet ľudí.
        Bez údajov o konkrétnych návštevníkoch sa opakované otvorenia
        započítavajú a automatizované požiadavky môžu ovplyvniť výsledky.
      </p>
    </section>
  );
}
