import Link from "next/link";
import styles from "./admin-reviews-hub.module.css";

type Metric = number | null;

function metric(value: Metric, suffix: string) {
  return value === null ? "—" : `${value} ${suffix}`;
}

export function AdminReviewsHub({
  articleCounts,
  pendingReviews,
  totalReviews,
  categoryCount,
  eshopCounts,
}: {
  articleCounts: { total: Metric; published: Metric; draft: Metric; scheduled: Metric };
  pendingReviews: Metric;
  totalReviews: Metric;
  categoryCount: Metric;
  eshopCounts: { total: Metric; published: Metric };
}) {
  return (
    <div className={styles.workspace}>
      <section className={styles.overview} aria-labelledby="reviews-admin-overview">
        <div className={styles.heading}>
          <div>
            <span>Prehľad</span>
            <h2 id="reviews-admin-overview">Recenzie a testy v skratke</h2>
          </div>
          <Link href="/recenzie" target="_blank" rel="noreferrer">Verejná stránka ↗</Link>
        </div>

        <div className={styles.metrics}>
          <article>
            <span>Redakčné testy</span>
            <strong>{metric(articleCounts.total, "spolu")}</strong>
            <small>{articleCounts.published === null ? "Počet publikovaných nedostupný" : `${articleCounts.published} publikovaných`}</small>
          </article>
          <article>
            <span>Na moderáciu</span>
            <strong>{pendingReviews === null ? "—" : pendingReviews}</strong>
            <small>používateľských recenzií čaká na rozhodnutie</small>
          </article>
          <article>
            <span>Používateľské recenzie</span>
            <strong>{totalReviews === null ? "—" : totalReviews}</strong>
            <small>všetky stavy spolu</small>
          </article>
          <article>
            <span>Kategórie testov</span>
            <strong>{categoryCount === null ? "—" : categoryCount}</strong>
            <small>spravovaných kategórií v Recenzie a testy</small>
          </article>
        </div>
      </section>

      <section aria-labelledby="reviews-admin-actions">
        <div className={styles.heading}>
          <div>
            <span>Správa</span>
            <h2 id="reviews-admin-actions">Rýchle pracovné odkazy</h2>
          </div>
          <p>Prejdi priamo do článkov, moderácie, kategórií alebo e-shopov.</p>
        </div>

        <div className={styles.cardGrid}>
          <article className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.icon} aria-hidden="true">★</span>
              <span className={styles.status} data-tone="live">Aktívne</span>
            </div>
            <h3>Testy produktov</h3>
            <p>Nové redakčné testy a úpravy existujúcich článkov.</p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/admin/novy?sekcia=recenzie">+ Nový test</Link>
              <Link href="/admin/clanky?section=recenzie">Spravovať testy →</Link>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.icon} aria-hidden="true">💬</span>
              <span className={styles.status} data-tone={pendingReviews && pendingReviews > 0 ? "attention" : "live"}>
                {pendingReviews && pendingReviews > 0 ? "Čaká kontrola" : "Aktívne"}
              </span>
            </div>
            <h3>Recenzie používateľov</h3>
            <p>Skontroluj a schvaľuj čakajúce hodnotenia profilov.</p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/admin/recenzie-profilov">Otvoriť moderáciu</Link>
              <Link href="/admin/recenzie-profilov?status=all">Všetky recenzie →</Link>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.icon} aria-hidden="true">▦</span>
              <span className={styles.status} data-tone="live">Spravované</span>
            </div>
            <h3>Kategórie a metodika</h3>
            <p>Nastav poradie, názvy, viditeľnosť a obsah kategórií.</p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/admin/sekcie?sekcia=recenzie">Upraviť kategórie</Link>
              <Link href="/recenzie" target="_blank" rel="noreferrer">Skontrolovať web ↗</Link>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.icon} aria-hidden="true">🛒</span>
              <span className={styles.status} data-tone="live">Aktívne</span>
            </div>
            <h3>E-shopy</h3>
            <p>Profily e-shopov a ich používateľské hodnotenia.</p>
            <details className={styles.eshopDetails}><summary>Oblasti hodnotenia</summary><div className={styles.eshopRules}>
              <span>Doručenie</span>
              <span>Komunikácia</span>
              <span>Sortiment</span>
              <span>Ceny</span>
              <span>Celková skúsenosť</span>
            </div></details>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/admin/recenzie/eshopy">Spravovať e-shopy</Link>
              <Link href="/recenzie?typ=eshopy" target="_blank" rel="noreferrer">Skontrolovať web ↗</Link>
            </div>
          </article>
        </div>
      </section>

      <details className={styles.rules} aria-labelledby="reviews-admin-rules">
        <summary id="reviews-admin-rules">Ako sa počítajú hodnotenia</summary>
        <div className={styles.ruleGrid}>
          <article><strong>Psipedia používateľské skóre</strong><p>Pri službách vzniká z publikovaných recenzií; pri e-shopoch z piatich známok od e-mailom overených používateľov.</p></article>
          <article><strong>Redakčný test</strong><p>Je samostatný obsah Psipedia s metodikou, kontextom a transparentným záverom.</p></article>
          <article><strong>Externé hodnotenia</strong><p>Google alebo iný externý zdroj sa nikdy nezmieša do priemeru Psipedia.</p></article>
        </div>
      </details>
    </div>
  );
}
