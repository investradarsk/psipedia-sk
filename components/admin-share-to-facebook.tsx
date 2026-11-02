"use client";

import { useState } from "react";

/** Shared opt-in handoff. Saves an unpublished item in the existing FB Images queue. */
export function AdminShareToFacebook({ title, imageUrl, publicPath }: {
  title: string; imageUrl?: string | null; publicPath: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function prepare() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/facebook-images/from-profile", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, imageUrl: imageUrl ?? "", publicPath }),
      });
      const result = await response.json() as { postId?: string; error?: string; imageWarning?: string };
      if (!response.ok || !result.postId) throw new Error(result.error || "Koncept sa nevytvoril.");
      // Opens the already-existing editor for text, image review and schedule.
      window.location.assign("/admin/facebook-obrazky?openDraft=" + encodeURIComponent(result.postId));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Príprava zlyhala.");
      setBusy(false);
    }
  }
  return <div className="admin-field">
    <button type="button" className="admin-secondary-button" onClick={() => void prepare()} disabled={busy || !title.trim() || !publicPath}>
      {busy ? "Pripravujem Facebook koncept…" : "Pripraviť do Facebook obrázkov"}
    </button>
    <small>Predvyplní odkaz na profil a dostupnú fotografiu. Text, schválenie a dátum nastavíš vo Facebook obrázkoch; nič sa samo nezverejní.</small>
    {error && <p role="alert" className="admin-message admin-message--error">{error}</p>}
  </div>;
}
