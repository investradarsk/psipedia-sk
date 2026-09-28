"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const reasons = [
  ["INCORRECT_INFORMATION", "Údaje sa nepodarilo potvrdiť"],
  ["INSUFFICIENT_EVIDENCE", "Chýbajú dostatočné podklady"],
  ["POLICY_CONFLICT", "Konflikt s pravidlami profilu"],
  ["OTHER", "Iný dôvod"],
] as const;

export function AdminPartnerProfileChangeActions({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [reasonCode, setReasonCode] = useState("INCORRECT_INFORMATION");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run(action: "APPROVE" | "REJECT") {
    if (busy) return;
    const prompt = action === "APPROVE"
      ? "Schváliť tento presný patch a aplikovať ho do canonical profilu?"
      : "Zamietnuť tento návrh bez zmeny canonical profilu?";
    if (!window.confirm(prompt)) return;
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
    }
  }

  return (
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
          <button type="button" disabled={busy} onClick={() => run("APPROVE")}>Schváliť zmeny</button>
          <button type="button" className="is-danger" disabled={busy} onClick={() => run("REJECT")}>Zamietnuť</button>
        </div>
        {message ? <p role="status" className="admin-partner-message">{message}</p> : null}
      </div>
    </section>
  );
}
