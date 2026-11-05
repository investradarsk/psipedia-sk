import { ReviewAuthorVerification } from "@/components/review-author-verification";
import { UniversalPageHero } from "@/components/public-visual-system/universal-page-hero";

export const dynamic = "force-dynamic";

export default function ReviewAuthorVerificationPage() {
  return (
    <main id="obsah" className="review-auth-shell review-auth-shell--centered">
      <UniversalPageHero eyebrow="Recenzie Psipedia" title="Overenie e-mailu" intro="Overujeme bezpečnostný odkaz na pokračovanie v hodnotení." />
      <ReviewAuthorVerification />
    </main>
  );
}
