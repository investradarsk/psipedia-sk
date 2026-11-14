import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminProfileReviewActions } from "@/components/admin-profile-review-actions";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getProfileReviewAdmin } from "@/lib/profile-review-admin";
import { profileReviewStatusLabel, profileReviewEntityTypeLabel, profileReviewCategoryLabel, profileReviewActorLabel, profileReviewActionLabel, profileReviewAccountStatusLabel, profileReviewRiskLabel } from "@/lib/admin-profile-review-labels";
import "../reviews.css";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("sk-SK", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Bratislava",
      }).format(date);
}

export default async function AdminProfileReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAdminPageUser(`/admin/recenzie-profilov/${id}`);
  const review = await getProfileReviewAdmin(id);
  if (!review) notFound();

  return (
    <AdminShell
      user={user}
      eyebrow="Profilová recenzia"
      title={review.targetName}
      description={`${profileReviewStatusLabel(review.status)} · ${review.overallRating} / 5 hviezdičiek`}
      actions={<Link href="/admin/recenzie-profilov">← Späť na recenzie</Link>}
    >
      <div className="admin-review-detail-grid">
        <section className="admin-review-card">
          <h2>Recenzia</h2>
          <dl className="admin-review-definition">
            <div><dt>Celkové hodnotenie</dt><dd>{review.overallRating} / 5</dd></div>
            <div><dt>Stav</dt><dd>{profileReviewStatusLabel(review.status)}</dd></div>
            <div><dt>Mesiac služby</dt><dd>{review.serviceMonth ?? "—"}</dd></div>
            <div><dt>Typ služby</dt><dd>{review.serviceTypeKey ? profileReviewCategoryLabel(review.serviceTypeKey) : "—"}</dd></div>
            <div><dt>Vytvorené</dt><dd>{formatDate(review.createdAt)}</dd></div>
            <div><dt>Zverejnené</dt><dd>{formatDate(review.publishedAt)}</dd></div>
          </dl>
          <h3>Text</h3>
          <p className="admin-review-body" data-testid="admin-review-body">{review.body}</p>
          <h3>Doplnkové hodnotenia</h3>
          {review.dimensions.length ? (
            <ul className="admin-review-dimensions">
              {review.dimensions.map((dimension) => (
                <li key={dimension.key}><span>{dimension.label}</span><strong>{dimension.value} / 5</strong></li>
              ))}
            </ul>
          ) : <p>Bez doplnkových hodnotení.</p>}
        </section>

        <section className="admin-review-card">
          <h2>Cieľový profil</h2>
          <dl className="admin-review-definition">
            <div><dt>Názov</dt><dd>{review.targetName}</dd></div>
            <div><dt>Typ</dt><dd>{profileReviewEntityTypeLabel(review.entityType)}</dd></div>
            <div><dt>Kategória</dt><dd>{profileReviewCategoryLabel(review.targetCategory)}</dd></div>
            <div><dt>Identifikátor profilu</dt><dd className="admin-review-technical">{review.resourceId}</dd></div>
          </dl>
          {review.targetHref ? <Link href={review.targetHref} target="_blank" rel="noreferrer">Verejný profil ↗</Link> : null}
        </section>

        <section className="admin-review-card">
          <h2>Recenzent</h2>
          <dl className="admin-review-definition">
            <div><dt>Zobrazované meno</dt><dd>{review.reviewerDisplayName}</dd></div>
            <div><dt>Stav účtu</dt><dd>{profileReviewAccountStatusLabel(review.reviewerStatus)}</dd></div>
            <div><dt>Identifikátor recenzenta</dt><dd className="admin-review-technical">{review.reviewerId}</dd></div>
          </dl>
          <p className="admin-review-hint">Súkromné kontaktné údaje recenzenta sa tu nezobrazujú.</p>
        </section>

        <section className="admin-review-card">
          <h2>Rizikové signály</h2>
          {review.riskFlags.length ? (
            <ul className="admin-review-risk-list">
              {review.riskFlags.map((flag) => <li key={flag}>{profileReviewRiskLabel(flag)}</li>)}
            </ul>
           ) : <p>Bez rizikových signálov.</p>}
          <p className="admin-review-hint">Upozornenie na riziko slúži na posúdenie moderátorom; samo osebe neznamená porušenie pravidiel.</p>
        </section>

        <section className="admin-review-card">
          <h2>Nahlásenia</h2>
          <dl className="admin-review-definition">
            <div><dt>Spolu</dt><dd>{review.reports.total}</dd></div>
            <div><dt>Otvorené</dt><dd>{review.reports.open}</dd></div>
            <div><dt>V kontrole</dt><dd>{review.reports.inReview}</dd></div>
            <div><dt>Vyriešené</dt><dd>{review.reports.resolved}</dd></div>
            <div><dt>Zamietnuté</dt><dd>{review.reports.dismissed}</dd></div>
          </dl>
          <p className="admin-review-hint">Podrobnosti nahlásení sú súčasťou samostatnej správy recenzií.</p>
        </section>
      </div>

      <AdminProfileReviewActions reviewId={review.id} currentStatus={review.status} />

      <section className="admin-review-card">
        <h2>História zmien</h2>
        {review.audit.length ? (
          <div className="admin-review-audit">
            {review.audit.map((event) => (
              <article key={event.id}>
                <div>
                  <strong>{profileReviewActionLabel(event.action)}</strong>
                  <span>{event.fromStatus ? profileReviewStatusLabel(event.fromStatus) : "—"} → {event.toStatus ? profileReviewStatusLabel(event.toStatus) : "—"}</span>
                </div>
                <p>{event.reasonCode ? "Dôvod zmeny bol zaznamenaný." : "Bez doplneného dôvodu."}</p>
                {event.moderatorNote ? <p>Interná poznámka: {event.moderatorNote}</p> : null}
                <small>
                  {profileReviewActorLabel(event.actorType)}{event.actorRef ? ` · ${event.actorRef}` : ""} · {formatDate(event.createdAt)}
                </small>
              </article>
            ))}
          </div>
         ) : <p>Zatiaľ bez zaznamenaných zmien.</p>}
      </section>
    </AdminShell>
  );
}
