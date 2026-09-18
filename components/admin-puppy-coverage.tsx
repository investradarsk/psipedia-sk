import Link from "next/link";
import type { PuppyCoverageArticleStatus, PuppyCoverageRow, PuppyCoverageStatus } from "@/lib/puppy-coverage";
import styles from "./admin-puppy-coverage.module.css";

const statusLabels: Record<PuppyCoverageStatus, string> = {
  COVERED: "Obsah je pripravený",
  PARTIAL: "Potrebuje doplniť",
  MISSING: "Chýba obsah",
};

const articleStatusLabels: Record<PuppyCoverageArticleStatus, string> = {
  published: "Publikované",
  scheduled: "Naplánované",
  draft: "Rozpracované",
};

function statusClass(status: PuppyCoverageStatus) {
  if (status === "COVERED") return styles.covered;
  if (status === "PARTIAL") return styles.partial;
  return styles.missing;
}

function actionLabel(status: PuppyCoverageStatus) {
  if (status === "MISSING") return "+ Vytvoriť článok";
  if (status === "PARTIAL") return "+ Doplniť obsah";
  return "+ Pridať ďalší článok";
}

export function AdminPuppyCoverage({ rows }: { rows: PuppyCoverageRow[] }) {
  const covered = rows.filter((row) => row.status === "COVERED").length;
  const partial = rows.filter((row) => row.status === "PARTIAL").length;
  const missing = rows.filter((row) => row.status === "MISSING").length;
  const attentionRows = rows.filter((row) => row.status !== "COVERED");

  return (
    <div className={styles.workspace} data-testid="admin-puppy-coverage">
      <section className="admin-stats" aria-label="Súhrn pokrytia tém Šteniatka">
        <div><span>Oblasti spolu</span><strong>{rows.length}</strong></div>
        <div><span>Obsah je pripravený</span><strong>{covered}</strong></div>
        <div><span>Potrebuje doplniť</span><strong>{partial}</strong></div>
        <div><span>Chýba obsah</span><strong>{missing}</strong></div>
      </section>

      <section className={styles.legend} aria-label="Vysvetlenie stavov pokrytia">
        <p><strong>Obsah je pripravený</strong> = oblasť má aspoň jeden publikovaný článok.</p>
        <p><strong>Potrebuje doplniť</strong> = existuje iba rozpracovaný alebo naplánovaný článok.</p>
        <p><strong>Chýba obsah</strong> = k oblasti nie je priradený žiadny článok.</p>
      </section>

      {attentionRows.length > 0 && (
        <section className={styles.attention} aria-labelledby="puppy-attention-title">
          <div>
            <span>Redakčná priorita</span>
            <h2 id="puppy-attention-title">Čo treba doplniť</h2>
            <p>{missing} oblastí bez článku · {partial} oblastí s rozpracovaným obsahom</p>
          </div>
          <div className={styles.attentionLinks}>
            {attentionRows.map((row) => (
              <Link href={`/admin/novy?sekcia=steniatka&oblast=${row.slug}`} key={row.slug}>
                <strong>{row.label}</strong>
                <span>{statusLabels[row.status]}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {rows.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Oblasť</th>
                <th scope="col">Stav</th>
                <th scope="col">Články</th>
                <th scope="col">Publikačný stav</th>
                <th scope="col">Ďalší krok</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.slug} data-coverage-priority={row.status === "COVERED" ? "ready" : "attention"}>
                  <td data-label="Oblasť">
                    <div className={styles.area}>
                      <strong>{row.label}</strong>
                      <span>{row.description}</span>
                      <code>{row.slug}</code>
                    </div>
                  </td>
                  <td data-label="Stav">
                    <span className={`${styles.status} ${statusClass(row.status)}`} data-testid={`coverage-status-${row.slug}`}>
                      {statusLabels[row.status]}
                    </span>
                  </td>
                  <td data-label="Články"><strong className={styles.count}>{row.totalCount}</strong></td>
                  <td data-label="Publikačný stav">
                    <div className={styles.counts}>
                      <span>Publikované <strong>{row.publishedCount}</strong></span>
                      <span>Rozpracované <strong>{row.draftCount}</strong></span>
                      <span>Naplánované <strong>{row.scheduledCount}</strong></span>
                    </div>
                  </td>
                  <td data-label="Ďalší krok">
                    <div className={styles.links}>
                      {row.articles.map((article) => (
                        <Link href={`/admin/clanky/${article.id}`} key={article.id}>
                          <span>{article.title}</span>
                          <small>{articleStatusLabels[article.status]}</small>
                        </Link>
                      ))}
                      <Link className={styles.add} href={`/admin/novy?sekcia=steniatka&oblast=${row.slug}`}>
                        {actionLabel(row.status)}
                      </Link>
                      <Link className={styles.preview} href={`/steniatka/${row.slug}`} target="_blank">
                        Pozrieť kategóriu ↗
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
          <p>Prehľad je iba na čítanie. Keď bude v existujúcej taxonómii dostupná oblasť, zobrazí sa tu automaticky.</p>
        </div>
      )}
    </div>
  );
}
