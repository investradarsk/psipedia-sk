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
}: {
  articleCounts: { total: Metric; published: Metric; draft: Metric; scheduled: Metric };
  pendingReviews: Metric;
  totalReviews: Metric;
  categoryCount: Metric;
}) {
  return (
    <div className={styles.workspace}>
      <section className={styles.overview} aria-labelledby="reviews-admin-overview">
        <div className={styles.heading}>
          <div>
            <span>Prehľad</span>
            <h2 id="reviews-admin-overview">Jedno miesto pre celý review workflow</h2>
          </div>
          <Link href="/recenzie" target="_blank" rel="noreferrer">Otvoriť verejný hub ↗</Link>
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
            <h2 id="reviews-admin-actions">Čo chceš urobiť?</h2>
          </div>
          <p>Každá karta vedie do existujúceho canonical modulu. Dáta sa neduplikujú.</p>
        </div>

        <div className={styles.cardGrid}>
          <article className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.icon} aria-hidden="true">★</span>
              <span className={styles.status} data-tone="live">Aktívne</span>
            </div>
            <h3>Testy produktov</h3>
            <p>Vytváraj a publikuj redakčné recenzie krmív, hračiek, GPS, postrojov a ďalšej výbavy.</p>
            <div className={styles.cardMetrics}>
              <span>{articleCounts.draft === null ? "—" : articleCounts.draft} konceptov</span>
              <span>{articleCounts.scheduled === null ? "—" : articleCounts.scheduled} naplánovaných</span>
            </div>
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
            <p>Moderuj hodnotenia veterinárov, trénerov, hotelov, klubov a organizácií. Text ani hviezdičky používateľa sa neupravujú.</p>
            <div className={styles.cardMetrics}>
              <span>{pendingReviews === null ? "—" : pendingReviews} čaká</span>
              <span>{totalReviews === null ? "—" : totalReviews} spolu</span>
            </div>
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
            <p>Meň názvy, poradie, viditeľnosť, SEO a obsah kategórií ako Krmivá, GPS lokátory alebo Výcviková výbava.</p>
            <div className={styles.cardMetrics}>
              <span>{categoryCount === null ? "—" : categoryCount} kategórií</span>
              <span>bez zásahu do kódu</span>
            </div>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/admin/sekcie?sekcia=recenzie">Upraviť kategórie</Link>
              <Link href="/recenzie" target="_blank" rel="noreferrer">Skontrolovať web ↗</Link>
            </div>
          </article>

          <article className={`${styles.card} ${styles.cardMuted}`}>
            <div className={styles.cardTop}>
              <span className={styles.icon} aria-hidden="true">🛒</span>
              <span className={styles.status} data-tone="planned">Ďalšia fáza</span>
            </div>
            <h3>E-shopy</h3>
            <p>Verejný hub už s e-shopmi počíta, ale samostatné profily a ich hodnotiaci model ešte nie sú implementované.</p>
            <div className={styles.eshopRules}>
              <span>Doručenie</span>
              <span>Komunikácia</span>
              <span>Sortiment</span>
              <span>Celková skúsenosť</span>
            </div>
            <div className={styles.notice}>Žiadne falošné profily ani hviezdičky sa nevytvárajú.</div>
          </article>
        </div>
      </section>

      <section className={styles.rules} aria-labelledby="reviews-admin-rules">
        <div>
          <span>Pravidlá</span>
          <h2 id="reviews-admin-rules">Čo zostáva oddelené</h2>
        </div>
        <div className={styles.ruleGrid}>
          <article><strong>Psipedia používateľské skóre</strong><p>Vzniká iba z publikovaných recenzií používateľov na konkrétnom profile.</p></article>
          <article><strong>Redakčný test</strong><p>Je samostatný obsah Psipedia s metodikou, kontextom a transparentným záverom.</p></article>
          <article><strong>Externé hodnotenia</strong><p>Google alebo iný externý zdroj sa nikdy nezmieša do priemeru Psipedia.</p></article>
        </div>
      </section>
    </div>
  );
}
