"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminPartnerVerificationActions({ verificationId }: { verificationId: string }) {
  const router = useRouter();
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run(action: "VERIFY" | "REJECT") {
    if (busy) return;
    if (!window.confirm(action === "VERIFY" ? "Potvrdiť oprávnenie tohto Partnera spravovať profil?" : "Zamietnuť overenie správcu?")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/partners/verifications/${verificationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reviewNote }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Rozhodnutie sa nepodarilo uložiť.");
      setMessage(action === "VERIFY" ? "Správca bol overený." : "Overenie bolo zamietnuté.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rozhodnutie sa nepodarilo uložiť.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-form-card">
      <h2>Rozhodnutie overenia</h2>
      <div className="admin-commercial-actions">
        <label>Interná poznámka<textarea rows={5} maxLength={2000} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></label>
        <p className="admin-partner-hint">Overenie potvrdzuje oprávnenie správcu; nemení Premium, Sponsored ani organické poradie.</p>
        <div className="admin-partner-button-row">
          <button type="button" disabled={busy} onClick={() => run("VERIFY")}>Overiť</button>
          <button type="button" className="is-danger" disabled={busy} onClick={() => run("REJECT")}>Zamietnuť overenie</button>
        </div>
        {message ? <p role="status" className="admin-partner-message">{message}</p> : null}
      </div>
    </section>
  );
}
