import Link from "next/link";
import {
  roundPublicRating,
  type PublicProfileReview,
  type PublicProfileReviewData,
} from "@/lib/profile-review-read";
import styles from "./profile-review-section.module.css";

function formatRating(value: number | null) {
  const rounded = roundPublicRating(value);
  return rounded === null
    ? null
    : new Intl.NumberFormat("sk-SK", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(rounded);
}

function reviewCountLabel(value: number) {
  if (value === 1) return "1 recenzia";
  if (value >= 2 && value <= 4) return `${value} recenzie`;
  return `${value} recenzií`;
}

function formatReviewDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatServiceMonth(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}-01T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("sk-SK", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function reviewPageHref(baseHref: string, page: number) {
  return page <= 1 ? `${baseHref}#recenzie` : `${baseHref}?reviewsPage=${page}#recenzie`;
}

function RatingStars({ rating }: { rating: number }) {
  const label = formatRating(rating) ?? String(rating);
  return (
    <span className={styles.rating}>
      <span className={styles.stars} aria-hidden="true">★★★★★</span>
      <span>{label} z 5</span>
    </span>
  );
}

function RatingDistribution({ data }: { data: PublicProfileReviewData }) {
  const total = data.summary.count;
  return (
    <div className={styles.distribution} aria-label="Rozdelenie hodnotení podľa počtu hviezdičiek">
      {[5, 4, 3, 2, 1].map((rating) => {
        const count = data.summary.distribution[rating as 1 | 2 | 3 | 4 | 5];
        const percent = total > 0 ? (count / total) * 100 : 0;
        return (
          <div className={styles.distributionRow} key={rating}>
            <span>{rating} ★</span>
            <span
              className={styles.distributionTrack}
              role="img"
              aria-label={`${rating} hviezdičiek: ${count} z ${total} recenzií`}
            >
              <span className={styles.distributionFill} style={{ width: `${percent}%` }} />
            </span>
            <strong>{count}</strong>
          </div>
        );
      })}
    </div>
  );
}

function DimensionAverages({ data }: { data: PublicProfileReviewData }) {
  if (!data.summary.dimensions.length) return null;
  return (
    <dl className={styles.dimensionAverages}>
      {data.summary.dimensions.map((dimension) => (
        <div key={dimension.key}>
          <dt>{dimension.label}</dt>
          <dd>{formatRating(dimension.average)} z 5</dd>
        </div>
      ))}
    </dl>
  );
}

function ProviderReply({ review }: { review: PublicProfileReview }) {
  if (!review.providerReply) return null;
  const date = formatReviewDate(review.providerReply.publishedAt);
  return (
    <aside className={styles.reply} aria-label="Odpoveď prevádzkovateľa">
      <strong>Odpoveď prevádzkovateľa</strong>
      <p>{review.providerReply.body}</p>
      {date ? <time dateTime={review.providerReply.publishedAt}>{date}</time> : null}
    </aside>
  );
}

function ProfileReviewCard({ review }: { review: PublicProfileReview }) {
  const serviceMonth = formatServiceMonth(review.serviceMonth);
  const reviewDate = formatReviewDate(review.publishedAt);
  return (
    <article className={styles.reviewCard}>
      <header className={styles.reviewHeader}>
        <div>
          <strong className={styles.author}>{review.displayName}</strong>
          {reviewDate ? <time dateTime={review.publishedAt}>{reviewDate}</time> : null}
        </div>
        <RatingStars rating={review.overallRating} />
      </header>

      {(serviceMonth || review.serviceTypeLabel) ? (
        <p className={styles.serviceContext}>
          {review.serviceTypeLabel ? <span>{review.serviceTypeLabel}</span> : null}
          {serviceMonth ? <span>Služba: {serviceMonth}</span> : null}
        </p>
      ) : null}

      {review.dimensions.length ? (
        <dl className={styles.reviewDimensions}>
          {review.dimensions.map((dimension) => (
            <div key={dimension.key}>
              <dt>{dimension.label}</dt>
              <dd>{dimension.value} z 5</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className={styles.body}>{review.body}</p>
      {review.helpfulCount > 0 ? (
        <p className={styles.helpful}>{review.helpfulCount}× označené ako užitočné</p>
      ) : null}
      <ProviderReply review={review} />
    </article>
  );
}

function ProfileReviewList({ data }: { data: PublicProfileReviewData }) {
  return (
    <ol className={styles.reviewList}>
      {data.reviews.map((review) => (
        <li key={review.id}><ProfileReviewCard review={review} /></li>
      ))}
    </ol>
  );
}

export function ProfileReviewSection({
  data,
  baseHref,
  readError = false,
}: {
  data: PublicProfileReviewData | null;
  baseHref: string;
  readError?: boolean;
}) {
  if (readError || !data) {
    return (
      <section className={styles.section} id="recenzie" aria-labelledby="profile-reviews-heading">
        <span className={styles.eyebrow}>Skúsenosti používateľov</span>
        <h2 id="profile-reviews-heading">Recenzie</h2>
        <div className={styles.zeroState}>
          <strong>Recenzie sa momentálne nepodarilo načítať.</strong>
          <p>Profil zostáva dostupný; hodnotenia skúste zobraziť neskôr.</p>
        </div>
      </section>
    );
  }

  if (data.summary.count === 0) {
    return (
      <section className={styles.section} id="recenzie" aria-labelledby="profile-reviews-heading">
        <span className={styles.eyebrow}>Skúsenosti používateľov</span>
        <h2 id="profile-reviews-heading">Recenzie</h2>
        <div className={styles.zeroState} data-review-zero-state>
          <strong>Zatiaľ bez recenzií</strong>
          <p>Tento profil zatiaľ nemá hodnotenia používateľov Psipedia.sk.</p>
        </div>
      </section>
    );
  }

  const average = formatRating(data.summary.average);
  return (
    <section className={styles.section} id="recenzie" aria-labelledby="profile-reviews-heading">
      <span className={styles.eyebrow}>Skúsenosti používateľov</span>
      <h2 id="profile-reviews-heading">Recenzie</h2>

      <div className={styles.summary}>
        <div className={styles.score}>
          <strong>{average}</strong>
          <RatingStars rating={data.summary.average ?? 0} />
          <span>{reviewCountLabel(data.summary.count)}</span>
        </div>
        <RatingDistribution data={data} />
        <DimensionAverages data={data} />
      </div>

      <ProfileReviewList data={data} />

      {data.pagination.totalPages > 1 ? (
        <nav className={styles.pagination} aria-label="Stránkovanie recenzií">
          {data.pagination.page > 1 ? (
            <Link rel="prev" href={reviewPageHref(baseHref, data.pagination.page - 1)}>← Predchádzajúce</Link>
          ) : <span aria-disabled="true">← Predchádzajúce</span>}
          <strong>Strana {data.pagination.page} z {data.pagination.totalPages}</strong>
          {data.pagination.page < data.pagination.totalPages ? (
            <Link rel="next" href={reviewPageHref(baseHref, data.pagination.page + 1)}>Ďalšie →</Link>
          ) : <span aria-disabled="true">Ďalšie →</span>}
        </nav>
      ) : null}
    </section>
  );
}
