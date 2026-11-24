"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminDestructiveConfirmDialog } from "@/components/admin-interaction-system";

type ClaimDecision = "APPROVE" | "REJECT" | "REVOKE";

export function AdminPartnerClaimActions({ claimId, status="PENDING", requiresReporterVerification=false }: {
  claimId: string; status?: string; requiresReporterVerification?: boolean;
}) {
  const router = useRouter();
  const [decisionNote, setDecisionNote] = useState("");
  const [reporterIdentityVerified, setReporterIdentityVerified] = useState(false);
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
        body: JSON.stringify({ action, decisionNote,
          ...(action==="APPROVE"&&requiresReporterVerification?{reporterIdentityVerified}:{}),
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Rozhodnutie sa nepodarilo uložiť.");
      setMessage(action === "APPROVE" ? "Prístup bol schválený." : action === "REVOKE" ? "Prístup bol odobratý." : "Žiadosť bola zamietnutá.");
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
          {status==="PENDING"&&requiresReporterVerification&&<label className="admin-partner-hint">
            <input type="checkbox" checked={reporterIdentityVerified}
              onChange={event=>setReporterIdentityVerified(event.target.checked)} />
            Overil som, že žiadateľ je pôvodný oznamovateľ alebo oprávnený správca tohto hlásenia.
          </label>}
          <div className="admin-partner-button-row">
            {status === "PENDING" ? <><button type="button" disabled={busy || (requiresReporterVerification && !reporterIdentityVerified)} onClick={() => setPendingAction("APPROVE")}>Schváliť</button>
            <button type="button" className="is-danger" disabled={busy} onClick={() => setPendingAction("REJECT")}>Zamietnuť</button></> : <button type="button" className="is-danger" disabled={busy} onClick={() => setPendingAction("REVOKE")}>Odobrať správu záznamu</button>}
          </div>
          {message ? <p role="status" className="admin-partner-message">{message}</p> : null}
        </div>
      </section>
      <AdminDestructiveConfirmDialog
        open={pendingAction !== null}
        title={pendingAction === "APPROVE" ? "Schváliť správu záznamu?" : pendingAction === "REVOKE" ? "Odobrať správu záznamu?" : "Zamietnuť správu záznamu?"}
        description={pendingAction === "APPROVE"
          ? requiresReporterVerification
            ? "Potvrdzujete, že ste porovnali údaje so súkromným kontaktom pôvodného hlásenia a overili oprávnenie žiadateľa? Záznam aj pôvodný kontakt zostanú zachované."
            : "Schváliť žiadosť a prideliť správu existujúceho záznamu? Predchádzajúci správca sa nikdy neodoberie automaticky."
          : pendingAction === "REVOKE" ? "Odobrať tomuto partnerovi aktívne oprávnenie? Záznam a história zostanú zachované." : "Zamietnuť túto žiadosť o správu záznamu?"}
        affectedCount={1}
        affectedLabel="žiadosť"
        confirmLabel={pendingAction === "APPROVE" ? "Schváliť prevzatie" : pendingAction === "REVOKE" ? "Odobrať prístup" : "Zamietnuť žiadosť"}
        confirmVariant={pendingAction === "APPROVE" ? "primary" : "destructive"}
        pending={busy}
        onCancel={() => { if (!busy) setPendingAction(null); }}
        onConfirm={() => { if (pendingAction) void run(pendingAction); }}
      />
    </>
  );
}
