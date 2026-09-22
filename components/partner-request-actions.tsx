"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PartnerClaimCancelButton({ claimId }: { claimId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function cancel() {
    if (busy || !window.confirm("Naozaj chcete túto čakajúcu žiadosť zrušiť?")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/partner/claims/${claimId}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Žiadosť sa nepodarilo zrušiť.");
      setMessage("Žiadosť bola zrušená.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Žiadosť sa nepodarilo zrušiť.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="partner-request-action"><button type="button" onClick={cancel} disabled={busy}>{busy ? "Ruším…" : "Zrušiť žiadosť"}</button>{message ? <span role="status">{message}</span> : null}</div>;
}

export function PartnerVerificationRequest({
  resourceId,
  state,
}: {
  resourceId: string;
  state: "UNVERIFIED" | "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED";
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (state === "PENDING_VERIFICATION") return <p className="partner-verification-note">Žiadosť o overenie čaká na kontrolu.</p>;
  if (state === "VERIFIED") return <p className="partner-verification-note is-verified">Psipedia overila oprávnenie správcu.</p>;

  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/partner/verifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resourceId, requestNote: note }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Žiadosť o overenie sa nepodarila.");
      setMessage("Žiadosť o overenie sme prijali.");
      setOpen(false);
      setNote("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Žiadosť o overenie sa nepodarila.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="partner-request-action">
      {!open ? <button type="button" onClick={() => setOpen(true)}>{state === "REJECTED" ? "Požiadať o overenie znova" : "Požiadať o overenie"}</button> : (
        <div className="partner-verification-request-form">
          <label className="partner-field"><span>Poznámka k overeniu <small>(voliteľné)</small></span><textarea rows={4} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
          <div><button type="button" onClick={submit} disabled={busy}>{busy ? "Odosielam…" : "Odoslať na overenie"}</button><button type="button" onClick={() => setOpen(false)} disabled={busy}>Zavrieť</button></div>
        </div>
      )}
      {message ? <span role="status">{message}</span> : null}
    </div>
  );
}
