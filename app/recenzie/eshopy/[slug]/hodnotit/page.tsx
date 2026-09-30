import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { EshopRatingForm } from "@/components/eshop-rating-form";
import { getEshopRatingForAuthor, getPublishedEshopBySlug } from "@/lib/eshop-ratings";
import { getPartnerTurnstileSiteKey } from "@/lib/partner-public-config";
import { getReviewAuthorSession } from "@/lib/review-author-auth";
import { REVIEW_AUTHOR_SESSION_COOKIE } from "@/lib/review-author-auth-store";
import { reviewAuthorAuthHref } from "@/lib/review-author-return-to";
import { profileReviewSubmissionEnabled } from "@/lib/submission-feature-flags";
import styles from "../eshop-profile.module.css";

export const dynamic = "force-dynamic";

export default async function EshopRatingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await getPublishedEshopBySlug(slug).catch(() => null);
  if (!shop) notFound();

  const returnTo = `/recenzie/eshopy/${shop.slug}/hodnotit`;
  const jar = await cookies();
  const identity = await getReviewAuthorSession({ token: jar.get(REVIEW_AUTHOR_SESSION_COOKIE)?.value });
  if (!identity) redirect(reviewAuthorAuthHref(returnTo));

  if (!profileReviewSubmissionEnabled()) {
    return <main id="obsah" className={styles.ratingShell}><div className="review-auth-verification-card"><h1>Hodnotenie momentálne nie je dostupné</h1><p>Skúste to prosím neskôr.</p><Link className="button button--dark" href={`/recenzie/eshopy/${shop.slug}`}>Späť na e-shop</Link></div></main>;
  }

  const siteKey = getPartnerTurnstileSiteKey();
  if (!siteKey) {
    return <main id="obsah" className={styles.ratingShell}><div className="review-auth-verification-card"><h1>Bezpečnostné overenie nie je dostupné</h1><p>Hodnotenie momentálne nemožno odoslať.</p><Link className="button button--dark" href={`/recenzie/eshopy/${shop.slug}`}>Späť na e-shop</Link></div></main>;
  }

  const existing = await getEshopRatingForAuthor(shop.id, identity.authorId).catch(() => null);
  return (
    <main id="obsah" className={styles.ratingShell}>
      <EshopRatingForm eshopId={shop.id} eshopName={shop.name} eshopSlug={shop.slug} siteKey={siteKey} initialRating={existing} />
    </main>
  );
}
