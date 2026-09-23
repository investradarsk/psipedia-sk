import Link from "next/link";
import { cookies } from "next/headers";
import { ReviewAuthorAuthForm } from "@/components/review-author-auth-form";
import { getPartnerTurnstileSiteKey } from "@/lib/partner-public-config";
import { getReviewAuthorSession } from "@/lib/review-author-auth";
import { REVIEW_AUTHOR_SESSION_COOKIE } from "@/lib/review-author-auth-store";
import { normalizeReviewAuthorReturnTo } from "@/lib/review-author-return-to";

export const dynamic = "force-dynamic";

export default async function ReviewAuthorLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const raw = await searchParams;
  const returnTo = normalizeReviewAuthorReturnTo(typeof raw.returnTo === "string" ? raw.returnTo : null);
  const siteKey = getPartnerTurnstileSiteKey();
  const jar = await cookies();
  const identity = await getReviewAuthorSession({
    token: jar.get(REVIEW_AUTHOR_SESSION_COOKIE)?.value,
  });

  if (identity) {
    return (
      <main id="obsah" className="review-auth-shell review-auth-shell--centered">
        <section className="review-auth-verification-card">
          <span className="eyebrow">Recenzie Psipedia</span>
          <h1>E-mail je overený</h1>
          <p>
            Vaša reviewer identita je pripravená. Môžete pokračovať tam, kde ste začali.
          </p>
          <Link className="button button--dark" href={returnTo || "/adresar"}>
            Pokračovať
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main id="obsah" className="review-auth-shell">
      <section className="review-auth-layout">
        <div className="review-auth-copy">
          <span className="eyebrow">Recenzie Psipedia</span>
          <h1>Najprv overíme váš e-mail</h1>
          <p className="review-auth-lead">
            Na napísanie profilovej recenzie používame jednorazový overovací odkaz.
            Nepotrebujete heslo ani Partner účet.
          </p>
          <p className="review-auth-privacy">
            Reviewer identita je oddelená od Partner účtu aj vtedy, ak používate rovnakú e-mailovú adresu.
          </p>
        </div>
        <div className="review-auth-card">
          <h2>Poslať overovací odkaz</h2>
          <p>Po overení vás bezpečne vrátime na profil, z ktorého ste začali.</p>
          <ReviewAuthorAuthForm siteKey={siteKey} returnTo={returnTo} />
        </div>
      </section>
    </main>
  );
}
