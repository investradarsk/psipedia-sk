import Link from "next/link";
import type { SiteTrafficReport } from "@/lib/site-analytics-report";
import styles from "./admin-site-traffic-panel.module.css";

const numberFormat = new Intl.NumberFormat("sk-SK");
const sourceLabels: Record<string, string> = {
  direct: "Priamo / neznámy zdroj",
  google: "Google vyhľadávanie",
  bing: "Bing",
  "other-search": "Ostatné vyhľadávače",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  "other-social": "Ostatné sociálne siete",
  referral: "Ostatné weby",
};
const deviceLabels: Record<string, string> = {
  mobile: "Mobil", tablet: "Tablet", desktop: "Počítač",
};

function NumberCard({
  name, value, caption,
}: {
  name: string;
  value: number | null;
  caption: string;
}) {
  return (
    <div className={styles.metric}>
      <span>{name}</span>
      <strong>{value === null ? "—" : numberFormat.format(value)}</strong>
      <small>{caption}</small>
    </div>
  );
}

function RankedBreakdown({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; pageviews: number }[];
}) {
  return (
    <section className={styles.panel}>
      <h3>{title}</h3>
      {rows.length === 0
        ? <p className={styles.empty}>Zatiaľ bez údajov.</p>
        : <ol className={styles.rankings}>
            {rows.map((row) => (
              <li key={row.label}>
                <span>{title === "Zariadenia" ? deviceLabels[row.label] ?? row.label : sourceLabels[row.label] ?? row.label}</span>
                <strong>{numberFormat.format(row.pageviews)}</strong>
              </li>
            ))}
          </ol>}
      <small>Anonymné zobrazenia verejných stránok, aj bez prijatia analytiky.</small>
    </section>
  );
}

export function AdminSiteTrafficPanel({ report }: { report: SiteTrafficReport }) {
  if (!report.available) {
    return (
      <section className={styles.panel} data-admin-sitewide-analytics>
        <h2>Návštevnosť celého webu</h2>
        <p className={styles.empty}>
          Vlastné štatistiky zatiaľ nie sú dostupné. Potrebujú schválené nasadenie
          migrácie D1 č. 0168. Anonymné zobrazenia sa potom merajú aj bez prijatia analytiky.
        </p>
      </section>
    );
  }

  const max = Math.max(1, ...report.points.map((row) => row.pageviews));
  const showInterval = (index: number) =>
    report.points.length <= 12 || index === 0 || index === report.points.length - 1
      || index % (report.points.length === 24 ? 4 : 5) === 0;

  return (
    <section className={styles.root} data-admin-sitewide-analytics>
      <div className={styles.header}>
        <div>
          <h2>Návštevnosť celého webu</h2>
          <p>Anonymné zobrazenia stránok meriame bez cookies a bez súhlasu. Relácie a unikátnych prehliadačov počítame len po prijatí analytiky.</p>
        </div>
      </div>

      <div className={styles.metrics}>
        <NumberCard name="Zobrazenia stránok" value={report.pageviews} caption="Verejné stránky webu" />
        <NumberCard name="Návštevy (so súhlasom)" value={report.sessions} caption="Identifikovateľné anonymné relácie · prestávka 30 min" />
        <NumberCard name="Unikátni návštevníci (so súhlasom)" value={report.uniqueVisitors}
          caption={report.window === "all" ? "Celoživotný unikátny počet neuchovávame" : "Rôzne súhlasiace prehliadače za obdobie"} />
        <NumberCard name="Aktívne relácie so súhlasom (5 min)" value={report.activeSessions5m}
          caption="Posledné zaznamenané zobrazenia, nie živý počet otvorených kariet" />
      </div>

      <section className={styles.panel} aria-labelledby="site-traffic-chart-heading">
        <div className={styles.chartHeader}>
          <div>
            <h3 id="site-traffic-chart-heading">Vývoj návštevnosti</h3>
            <p>{report.window === "all" ? "Graf: posledných 12 mesiacov, súčet: celé obdobie." : "Hodinové alebo denné intervaly UTC."}</p>
          </div>
          <div className={styles.legend}><span><i className={styles.viewColor} /> Stránky</span><span><i className={styles.visitColor} /> Návštevy</span></div>
        </div>
        <div className={styles.chart} role="img" aria-label="Graf zobrazení stránok a návštev. Presné čísla sú v tabuľke. "
          style={{ gridTemplateColumns: `repeat(${report.points.length}, minmax(0, 1fr))` }}>
          {report.points.map((point, index) => (
            <div className={styles.column} key={point.key}>
              <div className={styles.bars} title={`${point.label}: ${point.pageviews} zobrazení, ${point.sessions} návštev`}>
                <i className={styles.viewColor} style={{ height: `${point.pageviews ? Math.max(2, (point.pageviews / max) * 100) : 0}%` }} />
                <i className={styles.visitColor} style={{ height: `${point.sessions ? Math.max(2, (point.sessions / max) * 100) : 0}%` }} />
              </div>
              <span>{showInterval(index) ? point.label : ""}</span>
            </div>
          ))}
        </div>
        <details className={styles.exactTable}>
          <summary>Presné hodnoty grafu</summary>
          <div className={styles.scroll}>
            <table>
              <thead><tr><th scope="col">Obdobie</th><th scope="col">Zobrazenia</th><th scope="col">Návštevy</th></tr></thead>
              <tbody>
                {report.points.map((point) => (
                  <tr key={point.key}><th scope="row">{point.label}</th>
                    <td>{numberFormat.format(point.pageviews)}</td>
                    <td>{numberFormat.format(point.sessions)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <div className={styles.grid}>
        <RankedBreakdown title="Odkiaľ návštevníci prichádzajú" rows={report.sources} />
        <RankedBreakdown title="Zariadenia" rows={report.devices} />
      </div>

      <section className={styles.panel}>
        <h3>Najnavštevovanejšie stránky</h3>
        {report.topPages.length === 0
          ? <p className={styles.empty}>Zatiaľ bez údajov.</p>
          : <ol className={styles.rankings}>
              {report.topPages.map((row) => (
                <li key={row.path}>
                  <Link href={row.path} target="_blank" rel="noopener noreferrer">{row.path === "/" ? "Úvodná stránka" : row.path}</Link>
                  <strong>{numberFormat.format(row.pageviews)}×</strong>
                </li>
              ))}
            </ol>}
      </section>

      <p className={styles.footnote}>
        Štatistiky sa začínajú zbierať až po schválenom spustení, bez spätnej rekonštrukcie návštev.
        Počty stránok, zdrojov a zariadení sú anonymné a nezávislé od voľby cookies.
        Návštevy, unikátne prehliadače a aktívne relácie sa rátajú len pri prijatej analytike.
        Blokátory alebo automatizované požiadavky môžu údaje skresliť. Nie je to úplný serverový prenos.
      </p>
    </section>
  );
}
