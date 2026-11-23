import Link from "next/link";
import styles from "./admin-reviews-hub.module.css";

type Metric = number | null;

function MetricNumber({ value }: { value: Metric }) {
  return <span aria-label={value === null ? "Počet je nedostupný" : undefined}>{value === null ? "—" : value}</span>;
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
    <div className={styles.workspace} data-admin-content-module="reviews">
      <div className={styles.heading}>
        <h2 id="reviews-workspaces-title">Pracoviská</h2>
        <Link href="/recenzie" target="_blank" rel="noopener noreferrer">Verejná stránka ↗</Link>
      </div>
      <nav aria-labelledby="reviews-workspaces-title">
        <ul className={styles.list}>
          <li className={styles.row} data-review-workspace="editorial">
            <div className={styles.identity}>
              <h3>Redakčné testy</h3>
              <p>Články a produktové testy. Úpravy a publikovanie prebiehajú v Článkoch.</p>
            </div>
            <dl className={styles.metrics} aria-label="Počty redakčných testov">
              <div><dt>Spolu</dt><dd><MetricNumber value={articleCounts.total} /></dd></div>
              <div><dt>Publikované</dt><dd><MetricNumber value={articleCounts.published} /></dd></div>
            </dl>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/admin/clanky?section=recenzie">Spravovať testy</Link>
            </div>
          </li>
          <li className={styles.row} data-review-workspace="profiles">
            <div className={styles.identity}>
              <h3>Používateľské recenzie</h3>
              <p>Hodnotenia konkrétnych profilov. Schvaľovanie a kontrola viditeľnosti.</p>
            </div>
            <dl className={styles.metrics} aria-label="Počty profilových recenzií">
              <div data-attention={pendingReviews !== null && pendingReviews > 0 ? "true" : undefined}>
                <dt>Čakajú na kontrolu</dt><dd><MetricNumber value={pendingReviews} /></dd>
              </div>
              <div><dt>Spolu</dt><dd><MetricNumber value={totalReviews} /></dd></div>
            </dl>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/admin/recenzie-profilov">Moderovať</Link>
              <Link className={styles.secondary} href="/admin/recenzie-profilov?status=all">Všetky recenzie</Link>
            </div>
          </li>
          <li className={styles.row} data-review-workspace="eshops">
            <div className={styles.identity}>
              <h3>E-shopy</h3>
              <p>Samostatné profily obchodov a ich používateľské hodnotenia.</p>
            </div>
            <dl className={styles.metrics} aria-label="Počty e-shopov">
              <div><dt>Spolu</dt><dd><MetricNumber value={eshopCounts.total} /></dd></div>
              <div><dt>Publikované</dt><dd><MetricNumber value={eshopCounts.published} /></dd></div>
            </dl>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/admin/recenzie/eshopy">Spravovať e-shopy</Link>
              <Link className={styles.secondary} href="/recenzie?typ=eshopy" target="_blank" rel="noopener noreferrer">Verejné e-shopy ↗</Link>
            </div>
          </li>
        </ul>
      </nav>
      <div className={styles.categories}>
        <p>Kategórie testov: <strong><MetricNumber value={categoryCount} /></strong></p>
        <Link href="/admin/sekcie?sekcia=recenzie">Spravovať v Sekciách</Link>
      </div>
      <details className={styles.notes}>
        <summary>Rozdiel medzi testami a hodnoteniami</summary>
        <div>
          <p><strong>Redakčný test</strong> je článok s vlastnou metodikou a záverom; nejde o používateľské skóre.</p>
          <p><strong>Profilová recenzia</strong> je hodnotenie konkrétnej služby alebo profilu, ktoré podlieha moderácii.</p>
          <p><strong>Hodnotenie e-shopu</strong> vychádza z piatich oblastí: Doručenie, Komunikácia, Sortiment, Ceny a Celková skúsenosť.</p>
          <p>Externé hodnotenia, napríklad Google, sa nepripočítavajú k priemeru Psipedia.</p>
        </div>
      </details>
    </div>
  );
}
