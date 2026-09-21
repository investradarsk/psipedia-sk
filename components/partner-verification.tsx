"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Props = {
  token: string;
};

export function PartnerVerification({ token }: Props) {
  const started = useRef(false);
  const [state, setState] = useState<"loading" | "error">("loading");
  const [message, setMessage] = useState("Overujeme prihlasovací odkaz…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function consume() {
      if (!token) {
        setState("error");
        setMessage("Prihlasovací odkaz nie je platný.");
        return;
      }
      try {
        // Keep the one-time secret out of browser history as soon as the
        // client has captured it for this single consume request.
        window.history.replaceState(null, "", "/partner/overenie");
        const response = await fetch("/api/partner/auth/consume", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await response.json() as { success?: boolean; error?: string };
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Prihlasovací odkaz je neplatný alebo už expiroval.");
        }
        window.location.replace("/partner");
      } catch (error) {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Prihlasovací odkaz je neplatný alebo už expiroval.");
      }
    }

    void consume();
  }, [token]);

  return (
    <div className="partner-verification-card" aria-live="polite">
      <span className="eyebrow">Partner účet</span>
      <h1>{state === "loading" ? "Dokončujeme prihlásenie" : "Odkaz sa nepodarilo overiť"}</h1>
      <p>{message}</p>
      {state === "loading" ? (
        <div className="partner-progress" aria-hidden="true"><span /></div>
      ) : (
        <Link className="button button--dark" href="/partner/prihlasenie">Vyžiadať nový odkaz</Link>
      )}
    </div>
  );
}
