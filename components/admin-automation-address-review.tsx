"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "@/components/admin-operations-ux.module.css";
import type { AutomationAddressReviewCase } from "@/lib/data-automation-address-review-store";

function reasonLabel(reason: AutomationAddressReviewCase["reason"]) {
  if (reason === "MULTIPLE_EXACT_CANDIDATES") return "Našli sa dve alebo viaceré možné budovy.";
  return "Adresu treba potvrdiť.";
}

export function AdminAutomationAddressReview({
  review,
}: {
  review: AutomationAddressReviewCase;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(review.candidates[0]?.candidateHash ?? "");
  const [pending, setPending] = useState<"resolve" | "dismiss" | null>(null);
  const [error, setError] = useState("");

  async function send(body: Record<string, unknown>, action: "resolve" | "dismiss") {
    setPending(action);
    setError("");
    try {
      const response = await fetch(`/api/admin/automation-address-reviews/${review.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Operáciu sa nepodarilo dokončiť.");
      router.push("/admin/automatizacie/adresy");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operáciu sa nepodarilo dokončiť.");
    } finally {
      setPending(null);
    }
  }

  const canResolve = review.status === "OPEN" && review.candidates.length > 0 && Boolean(selected);

  return (
    <div className={styles.itemList}>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Čo našla automatizácia</h2>
            <p className={styles.reviewReason}>{reasonLabel(review.reason)}</p>
          </div>
        </div>
        <div className={styles.reviewSummary}>
          <p><strong>Aktuálne v Psipedii:</strong> {review.canonicalBefore.serviceAddressConfirmation === "CONFIRMED_SERVICE_LOCATION"
            ? String(review.canonicalBefore.address || "Potvrdená adresa")
            : "Bez automaticky potvrdenej adresy"}</p>
          <p><strong>Zdroj uvádza:</strong> {review.evidence || "—"}</p>
          {review.externalSourceUrl ? (
            <p>
              <a href={review.externalSourceUrl} target="_blank" rel="noreferrer">Otvoriť zdroj ↗</a>
            </p>
          ) : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Vyber správnu adresu</h2>
            <p>Po výbere sa adresa ešte raz overí u providera. Uložený snapshot sa priamo nezapíše.</p>
          </div>
          <span className={styles.sectionCount}>{review.candidates.length}</span>
        </div>

        {review.candidates.length ? (
          <div className={styles.itemList} role="radiogroup" aria-label={`Možné adresy pre ${review.canonicalName}`}>
            {review.candidates.map((candidate) => (
              <label className={styles.itemCard} key={candidate.candidateHash} style={{ cursor: "pointer" }}>
                <input
                  type="radio"
                  name="automation-address-candidate"
                  value={candidate.candidateHash}
                  checked={selected === candidate.candidateHash}
                  onChange={() => setSelected(candidate.candidateHash)}
                  aria-label={candidate.formattedAddress}
                />
                <div className={styles.itemMain}>
                  <strong className={styles.itemTitle}>{candidate.formattedAddress}</strong>
                  <div className={styles.techGrid}>
                    <span>Mesto: {candidate.city}</span>
                    <span>Okres: {candidate.district}</span>
                    <span>Kraj: {candidate.region}</span>
                    <span>PSČ: {candidate.postalCode}</span>
                    {candidate.street ? <span>Ulica: {candidate.street}</span> : null}
                    <span>Číslo: {candidate.houseNumber}</span>
                  </div>
                  <details className={styles.advanced}>
                    <summary>Pokročilé</summary>
                    <div className={styles.advancedBody}>
                      <p>Provider: {candidate.provider}</p>
                      <p>Provider ID: {candidate.providerResultId || "—"}</p>
                    </div>
                  </details>
                </div>
              </label>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>
            Automatické kandidáty už nie sú dostupné. Otvor profil a adresu uprav ručne.
          </p>
        )}

        {error ? <p role="alert" className={styles.reviewReason}>{error}</p> : null}

        <div className={styles.quickActions}>
          <button
            type="button"
            className={styles.itemActionPrimary}
            disabled={!canResolve || pending !== null}
            aria-label={`Potvrdiť vybranú adresu pre ${review.canonicalName}`}
            onClick={() => send({ action: "resolve", candidateHash: selected }, "resolve")}
          >
            {pending === "resolve" ? "Overujem…" : "Potvrdiť vybranú adresu"}
          </button>
          <button
            type="button"
            className={styles.itemAction}
            disabled={review.status !== "OPEN" || pending !== null}
            onClick={() => {
              if (window.confirm("Žiadna z ponúknutých adries nesedí? Profil zostane bez automaticky potvrdenej adresy.")) {
                void send({
                  action: "dismiss",
                  expectedFingerprint: review.fingerprint,
                }, "dismiss");
              }
            }}
          >
            {pending === "dismiss" ? "Ukladám…" : "Žiadna z možností nesedí"}
          </button>
          <Link className={styles.itemAction} href={review.canonicalHref}>Otvoriť profil</Link>
        </div>
      </section>
    </div>
  );
}
