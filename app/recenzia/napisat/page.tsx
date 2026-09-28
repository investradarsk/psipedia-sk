import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ProfileReviewSubmissionForm } from "@/components/profile-review-submission-form";
import { getPartnerTurnstileSiteKey } from "@/lib/partner-public-config";
import { reviewRatingConfig } from "@/lib/profile-review-domain";
import {
  existingProfileReviewMessage,
  findExistingProfileReview,
  ProfileReviewSubmissionError,
  resolveProfileReviewSubmissionTarget,
} from "@/lib/profile-review-submission";
import { getReviewAuthorSession } from "@/lib/review-author-auth";
import { REVIEW_AUTHOR_SESSION_COOKIE } from "@/lib/review-author-auth-store";
import { reviewAuthorAuthHref, reviewSubmissionHref } from "@/lib/review-author-return-to";
import { profileReviewSubmissionEnabled } from "@/lib/submission-feature-flags";

export const dynamic = "force-dynamic";

function StateCard({
  title,
  message,
  href,
  action,
}: {
  title: string;
  message: string;
  href: string;
  action: string;
}) {
  return (
    <main id="obsah" className="review-auth-shell review-auth-shell--centered">
      <section className="review-auth-verification-card">
        <span className="eyebrow">Recenzie Psipedia</span>
        <h1>{title}</h1>
        <p>{message}</p>
        <Link className="button button--dark" href={href}>{action}</Link>
      </section>
    </main>
  );
}

export default async function ReviewSubmissionPage({
  searchParams,
}: {
  searchParams: Promise<{ resourceId?: string | string[] }>;
}) {
  const raw = await searchParams;
  const resourceId = typeof raw.resourceId === "string" ? raw.resourceId : "";

  let target;
  try {
    target = await resolveProfileReviewSubmissionTarget(resourceId);
  } catch (error) {
    const message = error instanceof ProfileReviewSubmissionError
      ? error.message
      : "Profil pre recenziu sa nepodarilo načítať.";
    return (
      <StateCard
        title="Recenziu nemožno vytvoriť"
        message={message}
        href="/adresar"
        action="Späť do adresára"
      />
    );
  }

  if (!profileReviewSubmissionEnabled()) {
    return (
      <StateCard
        title="Recenzie pripravujeme"
        message="Odosielanie nových profilových recenzií zatiaľ nie je verejne zapnuté. Existujúce verejné recenzie zostávajú dostupné."
        href={target.profileHref + "#recenzie"}
        action="Späť na profil"
      />
    );
  }

  const submissionHref = reviewSubmissionHref(target.resourceId);
  if (!submissionHref) {
    return (
      <StateCard
        title="Recenziu nemožno vytvoriť"
        message="Profil pre recenziu nie je platný."
        href={target.profileHref}
        action="Späť na profil"
      />
    );
  }

  const jar = await cookies();
  const identity = await getReviewAuthorSession({
    token: jar.get(REVIEW_AUTHOR_SESSION_COOKIE)?.value,
  });

  if (!identity) {
    redirect(reviewAuthorAuthHref(submissionHref));
  }

  const existing = await findExistingProfileReview(target.resourceId, identity.authorId);
  if (existing) {
    return (
      <StateCard
        title="Tento profil ste už ohodnotili"
        message={existingProfileReviewMessage(existing.status)}
        href={target.profileHref + "#recenzie"}
        action="Späť na profil"
      />
    );
  }

  const config = reviewRatingConfig({
    entityType: target.entityType,
    category: target.category,
  });
  const siteKey = getPartnerTurnstileSiteKey();

  if (!siteKey) {
    return (
      <StateCard
        title="Odoslanie recenzie nie je dostupné"
        message="Bezpečnostné overenie momentálne nie je nakonfigurované."
        href={target.profileHref + "#recenzie"}
        action="Späť na profil"
      />
    );
  }

  return (
    <main id="obsah" className="review-auth-shell">
      <ProfileReviewSubmissionForm
        resourceId={target.resourceId}
        profileName={target.name}
        profileHref={target.profileHref + "#recenzie"}
        schemaVersion={config.schemaVersion}
        dimensions={config.dimensions}
        siteKey={siteKey}
      />
    </main>
  );
}
