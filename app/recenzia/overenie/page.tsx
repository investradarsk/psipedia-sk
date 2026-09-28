import { ReviewAuthorVerification } from "@/components/review-author-verification";

export const dynamic = "force-dynamic";

export default function ReviewAuthorVerificationPage() {
  return (
    <main id="obsah" className="review-auth-shell review-auth-shell--centered">
      <ReviewAuthorVerification />
    </main>
  );
}
