import Link from "next/link";
import type { PuppyCoverageArticleStatus, PuppyCoverageRow, PuppyCoverageStatus } from "@/lib/puppy-coverage";
import styles from "./admin-puppy-coverage.module.css";

const statusLabels: Record<PuppyCoverageStatus, string> = {
  COVERED: "COVERED",
  PARTIAL: "PARTIAL",
  MISSING: "MISSING",
};

const articleStatusLabels: Record<PuppyCoverageArticleStatus, string> = {
  published: "Publikované",
  scheduled: "Naplánované",
  draft: "Draft",
};

function statusClass(status: PuppyCoverageStatus) {
  if (status === "COVERED") return styles.covered;
  if (status === "PARTIAL") return styles.partial;
  return styles.missing;
}

export function AdminPuppyCoverage({ rows }: { rows: PuppyCoverageRow[] }) {
  const covered = rows.filter((row) => row.status === "COVERED").length;
  const partial = rows.filter((row) => row.status === "PARTIAL").length;
  const missing = rows.filter((row) => row.status === "MISSING").length;

  return (
    <div className={styles.workspace} data-testid="admin-puppy-coverage">
      <section className="admin-stats" aria-label="Súhrn pokrytia obsahu Šteniatka">
        <div><span>Definované oblasti</span><strong>{rows.length}</strong></div>
        <div><span>COVERED</span><strong>{covered}</strong></div>
        <div><span>PARTIAL</span><strong>{partial}</strong></div>
        <div><span>MISSING</span><strong>{missing}</strong></div>
      </section>

      <section className={styles.legend} aria-label="Definícia stavov pokrytia">
        <p><strong>COVERED</strong> = oblasť má aspoň jeden publikovaný článok.</p>
        <p><strong>PARTIAL</strong> = existuje iba draft alebo naplánovaný článok.</p>
        <p><strong>MISSING</strong> = k oblasti nie je priradený žiadny článok.</p>
      </section>

      {rows.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Oblasť</th>
                <th scope="col">Coverage</th>
                <th scope="col">Články</th>
                <th scope="col">Statusy</th>
                <th scope="col">Relevantný obsah</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.slug}>
                  <td data-label="Oblasť">
                    <div className={styles.area}>
                      <strong>{row.label}</strong>
                      <span>{row.description}</span>
                      <code>{row.slug}</code>
                    </div>
                  </td>
                  <td data-label="Coverage">
                    <span className={`${styles.status} ${statusClass(row.status)}`} data-testid={`coverage-status-${row.slug}`}>
                      {statusLabels[row.status]}
                    </span>
                  </td>
                  <td data-label="Články"><strong className={styles.count}>{row.totalCount}</strong></td>
                  <td data-label="Statusy">
                    <div className={styles.counts}>
                      <span>Publikované <strong>{row.publishedCount}</strong></span>
                      <span>Draft <strong>{row.draftCount}</strong></span>
                      <span>Naplánované <strong>{row.scheduledCount}</strong></span>
                    </div>
                  </td>
                  <td data-label="Relevantný obsah">
                    <div className={styles.links}>
                      {row.articles.map((article) => (
                        <Link href={`/admin/clanky/${article.id}`} key={article.id}>
                          <span>{article.title}</span>
                          <small>{articleStatusLabels[article.status]}</small>
                        </Link>
                      ))}
                      <Link className={styles.add} href={`/admin/novy?sekcia=steniatka&oblast=${row.slug}`}>
                        + Pridať článok
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.empty} data-testid="admin-puppy-coverage-empty">
          <h2>Nie sú definované žiadne oblasti Šteniatok</h2>
          <p>Matrix je read-only. Keď bude v existujúcej taxonómii dostupná oblasť, zobrazí sa tu automaticky.</p>
        </div>
      )}
    </div>
  );
}
