"use client";

import { useEffect } from "react";

export default function ReviewAuthorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[review-author-route] render failed", error);
  }, [error]);

  return (
    <main className="review-auth-shell review-auth-shell--centered">
      <section className="review-auth-verification-card" role="alert">
        <p className="eyebrow">Recenzie na Psipedii</p>
        <h1>Overenie e-mailu sa momentálne nepodarilo načítať.</h1>
        <p>Skúste stránku obnoviť alebo načítanie zopakovať.</p>
        <button className="button" type="button" onClick={reset}>
          Skúsiť znova
        </button>
      </section>
    </main>
  );
}
