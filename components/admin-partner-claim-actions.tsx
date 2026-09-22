"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminPartnerClaimActions({ claimId }: { claimId: string }) {
  const router = useRouter();
  const [decisionNote, setDecisionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run(action: "APPROVE" | "REJECT") {
    if (busy) return;
    if (action === "APPROVE" && !window.confirm("Schváliť claim a prideliť tomuto Partner účtu OWNER membership? Existujúci OWNER nebude odobratý.")) return;
    if (action === "REJECT" && !window.confirm("Zamietnuť túto žiadosť o prevzatie profilu?")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/partners/claims/${claimId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, decisionNote }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Rozhodnutie sa nepodarilo uložiť.");
      setMessage(action === "APPROVE" ? "Claim bol schválený." : "Claim bol zamietnutý.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rozhodnutie sa nepodarilo uložiť.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-form-card">
      <h2>Rozhodnutie</h2>
      <div className="admin-commercial-actions">
        <label>Interná poznámka k rozhodnutiu<textarea rows={5} maxLength={2000} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} /></label>
        <p className="admin-partner-hint">Poznámka zostáva v administrácii a neposiela sa Partnerovi e-mailom.</p>
        <div className="admin-partner-button-row">
          <button type="button" disabled={busy} onClick={() => run("APPROVE")}>Schváliť</button>
          <button type="button" className="is-danger" disabled={busy} onClick={() => run("REJECT")}>Zamietnuť</button>
        </div>
        {message ? <p role="status" className="admin-partner-message">{message}</p> : null}
      </div>
    </section>
  );
}
