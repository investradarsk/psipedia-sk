"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { normalizeReviewAuthorReturnTo } from "@/lib/review-author-return-to";

export function ReviewAuthorVerification() {
  const started = useRef(false);
  const [state, setState] = useState<"loading" | "error">("loading");
  const [message, setMessage] = useState("Overujeme odkaz…");
  const [retryReturnTo, setRetryReturnTo] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function consume() {
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const token = fragment.get("token")?.trim() ?? "";
      const returnTo = normalizeReviewAuthorReturnTo(fragment.get("returnTo"));
      setRetryReturnTo(returnTo);

      window.history.replaceState(null, "", "/recenzia/overenie");

      if (!token) {
        setState("error");
        setMessage("Overovací odkaz nie je platný.");
        return;
      }

      try {
        const response = await fetch("/api/review-author/auth/consume", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await response.json() as { success?: boolean; error?: string };
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Overovací odkaz je neplatný, expirovaný alebo už bol použitý.");
        }
        window.location.replace(returnTo || "/");
      } catch (error) {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Overovací odkaz sa nepodarilo overiť.");
      }
    }

    void consume();
  }, []);

  return (
    <div className="review-auth-verification-card" aria-live="polite">
      <span className="eyebrow">Recenzie Psipedia</span>
      <h1>{state === "loading" ? "Overujeme váš e-mail" : "Odkaz sa nepodarilo overiť"}</h1>
      <p>{message}</p>
      {state === "loading" ? (
        <div className="review-auth-progress" aria-hidden="true"><span /></div>
      ) : (
        <Link
          className="button button--dark"
          href={retryReturnTo
            ? "/recenzia/prihlasenie?returnTo=" + encodeURIComponent(retryReturnTo)
            : "/recenzia/prihlasenie"}
        >
          Poslať nový odkaz
        </Link>
      )}
    </div>
  );
}
