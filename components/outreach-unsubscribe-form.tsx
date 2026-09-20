"use client";

import { useState } from "react";

export function OutreachUnsubscribeForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function unsubscribe() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/outreach/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json() as { result?: { suppressed?: boolean }; error?: string };
      if (!response.ok || !payload.result?.suppressed) throw new Error(payload.error || "Odhlásenie sa nepodarilo.");
      setResult({
        type: "success",
        text: "Hotovo. Tento e-mail bol pridaný do suppression zoznamu pre ďalší profilový outreach Psipedia.",
      });
    } catch (error) {
      setResult({ type: "error", text: error instanceof Error ? error.message : "Odhlásenie sa nepodarilo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {result && <p role="status">{result.text}</p>}
      <button className="button button--primary" type="button" onClick={() => void unsubscribe()} disabled={busy || result?.type === "success"}>
        {busy ? "Spracúvam…" : "Nechcem ďalší profilový outreach"}
      </button>
    </div>
  );
}
