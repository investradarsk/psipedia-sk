"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function PartnerClaimForm({
  entityType,
  canonicalId,
  name,
  publicHref,
}: {
  entityType: "DIRECTORY_PROFILE" | "HELP_ORGANIZATION";
  canonicalId: number;
  name: string;
  publicHref: string;
}) {
  const [requestMessage, setRequestMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/partner/claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityType, canonicalId, requestMessage }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Žiadosť sa nepodarilo odoslať.");
      setNotice({ kind: "success", text: "Žiadosť sme prijali a čaká na kontrolu." });
      setRequestMessage("");
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Žiadosť sa nepodarilo odoslať." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="partner-claim-card">
      <div className="partner-claim-summary">
        <span>{entityType === "DIRECTORY_PROFILE" ? "Profil v adresári" : "Organizácia Pomoc psom"}</span>
        <h2>{name}</h2>
        <Link href={publicHref} target="_blank">Verejný profil ↗</Link>
      </div>
      <form onSubmit={submit} className="partner-auth-form">
        <label className="partner-field">
          <span>Ako ste spojení s touto organizáciou/službou? <small>(voliteľné)</small></span>
          <textarea
            rows={5}
            maxLength={1000}
            value={requestMessage}
            onChange={(event) => setRequestMessage(event.target.value)}
            placeholder="Napr. som majiteľ prevádzky, štatutár organizácie alebo poverený správca."
          />
        </label>
        {notice ? <p className={"partner-form-message is-" + notice.kind} role="status" aria-live="polite">{notice.text}</p> : null}
        <button className="button button--coral partner-submit" type="submit" disabled={busy}>
          {busy ? "Odosielam…" : "Odoslať žiadosť o prevzatie"}
        </button>
        {notice?.kind === "success" ? <Link className="partner-inline-link" href="/partner/ziadosti">Zobraziť moje žiadosti →</Link> : null}
      </form>
    </section>
  );
}
