"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminDestructiveConfirmDialog } from "@/components/admin-interaction-system";

const reasons = [
  ["INCORRECT_INFORMATION", "Údaje sa nepodarilo potvrdiť"],
  ["INSUFFICIENT_EVIDENCE", "Chýbajú dostatočné podklady"],
  ["POLICY_CONFLICT", "Konflikt s pravidlami profilu"],
  ["OTHER", "Iný dôvod"],
] as const;

type ProfileDecision = "APPROVE" | "REJECT";

export function AdminPartnerProfileChangeActions({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [reasonCode, setReasonCode] = useState("INCORRECT_INFORMATION");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingAction, setPendingAction] = useState<ProfileDecision | null>(null);

  async function run(action: ProfileDecision) {
    if (busy || pendingAction !== action) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/partners/changes/${encodeURIComponent(submissionId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reasonCode: action === "REJECT" ? reasonCode : undefined }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Rozhodnutie sa nepodarilo uložiť.");
      setMessage(action === "APPROVE" ? "Úpravy boli schválené." : "Návrh bol zamietnutý.");
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
          <label>
            Dôvod pri zamietnutí
            <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} disabled={busy}>
              {reasons.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <p className="admin-partner-hint">Partner uvidí iba bezpečnú verejnú formuláciu dôvodu, nie interné risk flags ani admin poznámky.</p>
          <div className="admin-partner-button-row">
            <button type="button" disabled={busy} onClick={() => setPendingAction("APPROVE")}>Schváliť zmeny</button>
            <button type="button" className="is-danger" disabled={busy} onClick={() => setPendingAction("REJECT")}>Zamietnuť</button>
          </div>
          {message ? <p role="status" className="admin-partner-message">{message}</p> : null}
        </div>
      </section>
      <AdminDestructiveConfirmDialog
        open={pendingAction !== null}
        title={pendingAction === "APPROVE" ? "Schváliť zmeny profilu?" : "Zamietnuť návrh zmien?"}
        description={pendingAction === "APPROVE"
          ? "Schváliť tento presný patch a aplikovať ho do canonical profilu?"
          : "Zamietnuť tento návrh bez zmeny canonical profilu?"}
        affectedCount={1}
        affectedLabel="návrh"
        confirmLabel={pendingAction === "APPROVE" ? "Schváliť zmeny" : "Zamietnuť"}
        confirmVariant={pendingAction === "APPROVE" ? "primary" : "destructive"}
        pending={busy}
        onCancel={() => { if (!busy) setPendingAction(null); }}
        onConfirm={() => { if (pendingAction) void run(pendingAction); }}
      />
    </>
  );
}
