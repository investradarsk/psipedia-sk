"use client";

import { useState } from "react";

export function AdminGeminiNotionPublish({ id, alreadyApproved, lastEditedAt }: {
  id: string;
  lastEditedAt: string;
  alreadyApproved: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [approved, setApproved] = useState(alreadyApproved);
  const [error, setError] = useState("");

  async function approve() {
    if (!confirming || loading || approved) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/api/admin/gemini-automation/notion-drafts/" + encodeURIComponent(id) + "/publish",
        { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirm: true, lastEditedAt }) },
      );
      const data = await response.json() as { status?: string; error?: string };
      if (!response.ok || data.status !== "PENDING_SYNC") {
        throw new Error(data.error || "Schválenie sa nepodarilo.");
      }
      setApproved(true);
      setConfirming(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Schválenie sa nepodarilo.");
    } finally {
      setLoading(false);
    }
  }

  if (approved) return <p role="status">
    Schválené. Profil čaká na hodinovú synchronizáciu Notion → Psipedia.
    Pred ďalším pokusom over stav v Notione alebo v Adresári.
  </p>;

  return <div className="admin-form-card">
    <h2>Publikovanie profilu</h2>
    <p>Najprv skontroluj údaje a oprav ich v Notione. Publikovanie spúšťa výhradne
      tvoje výslovné potvrdenie. Verejný profil vznikne až po úspešnej synchronizácii
      s Psipediou (spravidla pri najbližšom hodinovom behu).</p>
    {!confirming ? (
      <button type="button" className="admin-primary-action" onClick={() => setConfirming(true)}>
        Schváliť publikovanie
      </button>
    ) : (
      <>
        <p role="alert">Naozaj chceš tento profil verejne publikovať? Po synchronizácii
          bude viditeľný návštevníkom Psipedie.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <button type="button" className="admin-primary-action" disabled={loading} onClick={() => void approve()}>
            {loading ? "Schvaľujem…" : "Áno, publikovať"}
          </button>
          <button type="button" disabled={loading} onClick={() => { setConfirming(false); setError(""); }}>
            Zrušiť
          </button>
        </div>
      </>
    )}
    {error && <p role="alert">{error}</p>}
  </div>;
}
