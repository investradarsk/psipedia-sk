import Link from "next/link";
import type { SiteCategoryMetric, SiteCategoryReport } from "@/lib/admin-site-category-report";
import { AdminBreedViewsTable } from "@/components/admin-breed-views-table";
import styles from "./admin-site-category-panel.module.css";

const format = new Intl.NumberFormat("sk-SK");
const count = (value: number | null) => value === null ? "—" : format.format(value);

function CategoryTable({
  title, description, rows, id,
}: {
  title: string;
  description: string;
  rows: SiteCategoryMetric[];
  id: string;
}) {
  const ordered = [...rows].sort((a, b) =>
    b.views - a.views || a.label.localeCompare(b.label, "sk-SK"));
  return (
    <section className={styles.panel} aria-labelledby={id}>
      <div className={styles.heading}>
        <h3 id={id}>{title}</h3>
        <p>{description}</p>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr>
            <th scope="col">Kategória</th>
            <th scope="col" title="Otvorenia konkrétnych záznamov">Detaily</th>
            <th scope="col" title="Otvorenia samotnej stránky kategórie">Prehľad</th>
          </tr></thead>
          <tbody>{ordered.map((item) => (
            <tr key={item.key}>
              <td><Link href={item.href} target="_blank" rel="noopener noreferrer">{item.label}</Link></td>
              <td className={styles.number}>{format.format(item.views)}</td>
              <td className={styles.number}>{format.format(item.landingViews)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

export function AdminSiteCategoryPanel({ report }: { report: SiteCategoryReport }) {
  if (!report.available) {
    return (
      <section className={styles.panel} data-admin-site-category-views>
        <h2>Otvorenia obsahu podľa kategórií</h2>
        <p className={styles.empty}>Údaje o kategóriách nie sú dostupné. Predchádzajúce štatistiky zostávajú funkčné.</p>
      </section>
    );
  }

  return (
    <div className={styles.root} data-admin-site-category-views>
      <div className={styles.heading}>
        <h2>Otvorenia obsahu podľa kategórií</h2>
        <p>Skutočné otvorenia verejných detailov zo súhrnných štatistík webu, bez 10-sekundovej podmienky a bez cookies. Priame otvorenie aj preklik sa počítajú rovnako.</p>
      </div>
      <div className={styles.metrics} aria-label="Otvorenia verejného obsahu">
        <div><span>Profily služieb</span><strong>{count(report.totalProfiles)}</strong></div>
        <div><span>Články</span><strong>{count(report.totalArticles)}</strong></div>
        <div><span>Podujatia</span><strong>{count(report.totalEvents)}</strong></div>
        <div><span>Pomoc psom</span><strong>{count(report.totalHelp)}</strong></div>
        <div><span>Profily plemien</span><strong>{count(report.totalBreeds)}</strong></div>
      </div>

      {report.profileTop.length > 0 && (
        <section className={styles.panel}>
          <div className={styles.heading}>
            <h3>Najotváranejšie profily služieb</h3>
            <p>Nezávislé od prísnejšej metriky kvalifikovaných návštev.</p>
          </div>
          <ol className={styles.topList}>
            {report.profileTop.map((profile) => (
              <li key={profile.href}>
                <Link href={profile.href} target="_blank" rel="noopener noreferrer">{profile.name}</Link>
                <strong>{format.format(profile.views)}×</strong>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className={styles.grid}>
        <CategoryTable id="article-category-views" title="Články" description="Čítanosť článkov podľa hlavnej rubriky." rows={report.articles} />
        <CategoryTable id="directory-category-views" title="Služby a profily" description="Počty otvorení podľa primárnej kategórie profilu." rows={report.directory} />
        <CategoryTable id="events-category-views" title="Podujatia" description="Počty otvorení jednotlivých podujatí podľa typu." rows={report.events} />
        <CategoryTable id="help-category-views" title="Pomoc psom" description="Adopcie, útulky, stratené a nájdené psy a ďalšie záznamy." rows={report.help} />
        <CategoryTable id="news-category-views" title="Novinky podľa témy" description="Podrobnejšie rozdelenie článkov z rubriky Novinky; už zahrnuté v počtoch článkov." rows={report.news} />
      </div>

      <section className={styles.panel}>
        <div className={styles.heading}>
          <h3>Všetky plemená ({report.breeds.length})</h3>
          <p>Otvorenia jednotlivých profilov plemien; hlavný atlas má samostatne {format.format(report.breedAtlasViews)} zobrazení.</p>
        </div>
        <AdminBreedViewsTable breeds={report.breeds} />
      </section>

      <p className={styles.helper}>
        Stĺpec „Detaily“ predstavuje otvorenia jednotlivých publikovaných položiek.
        „Prehľad“ sú návštevy samotnej stránky kategórie. Nie sú to unikátni ľudia ani presné kliknutia na odkazy.
        Súhrn za Novinky je podmnožinou článkov; tieto hodnoty sa nesčítavajú druhýkrát.
      </p>
    </div>
  );
}
