"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminDestructiveConfirmDialog } from "@/components/admin-interaction-system";

type ClaimDecision = "APPROVE" | "REJECT";

export function AdminPartnerClaimActions({ claimId }: { claimId: string }) {
  const router = useRouter();
  const [decisionNote, setDecisionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingAction, setPendingAction] = useState<ClaimDecision | null>(null);

  async function run(action: ClaimDecision) {
    if (busy || pendingAction !== action) return;
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
      setPendingAction(null);
    }
  }

  return (
    <>
      <section className="admin-form-card">
        <h2>Rozhodnutie</h2>
        <div className="admin-commercial-actions">
          <label>Interná poznámka k rozhodnutiu<textarea rows={5} maxLength={2000} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} /></label>
          <p className="admin-partner-hint">Poznámka zostáva v administrácii a neposiela sa Partnerovi e-mailom.</p>
          <div className="admin-partner-button-row">
            <button type="button" disabled={busy} onClick={() => setPendingAction("APPROVE")}>Schváliť</button>
            <button type="button" className="is-danger" disabled={busy} onClick={() => setPendingAction("REJECT")}>Zamietnuť</button>
          </div>
          {message ? <p role="status" className="admin-partner-message">{message}</p> : null}
        </div>
      </section>
      <AdminDestructiveConfirmDialog
        open={pendingAction !== null}
        title={pendingAction === "APPROVE" ? "Schváliť prevzatie profilu?" : "Zamietnuť prevzatie profilu?"}
        description={pendingAction === "APPROVE"
          ? "Schváliť claim a prideliť tomuto Partner účtu OWNER membership? Existujúci OWNER nebude odobratý."
          : "Zamietnuť túto žiadosť o prevzatie profilu?"}
        affectedCount={1}
        affectedLabel="žiadosť"
        confirmLabel={pendingAction === "APPROVE" ? "Schváliť prevzatie" : "Zamietnuť žiadosť"}
        confirmVariant={pendingAction === "APPROVE" ? "primary" : "destructive"}
        pending={busy}
        onCancel={() => { if (!busy) setPendingAction(null); }}
        onConfirm={() => { if (pendingAction) void run(pendingAction); }}
      />
    </>
  );
}
