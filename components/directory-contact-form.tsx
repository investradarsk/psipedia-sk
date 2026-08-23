"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function DirectoryContactForm({ profileId, profileName }: { profileId: number; profileName: string }) {
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [dogInfo, setDogInfo] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true); setResult(null);
    try {
      const response = await fetch("/api/directory/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId, senderName, senderEmail, senderPhone, dogInfo, message, company, consent }),
      });
      const data = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "Dopyt sa nepodarilo odoslať.");
      setResult({ type: "success", text: `Dopyt pre ${profileName} sme prijali. Redakcia Psipedie ho skontroluje a ozve sa ti na uvedený e-mail.` });
      setSenderName(""); setSenderEmail(""); setSenderPhone(""); setDogInfo(""); setMessage(""); setConsent(false);
    } catch (error) {
      setResult({ type: "error", text: error instanceof Error ? error.message : "Dopyt sa nepodarilo odoslať." });
    } finally { setSending(false); }
  }

  return (
    <form className="directory-contact-form" onSubmit={submit}>
      <div className="directory-contact-heading"><span aria-hidden="true">✉️</span><div><span className="eyebrow">Kontakt cez Psipediu</span><h2>Napíš svoj dopyt</h2><p>Správa príde najprv redakcii. Skontrolujeme ju a sprostredkujeme ďalší kontakt.</p></div></div>
      <div className="directory-contact-grid">
        <label><span>Meno a priezvisko</span><input value={senderName} onChange={(event) => setSenderName(event.target.value)} autoComplete="name" required minLength={2} maxLength={100} /></label>
        <label><span>E-mail</span><input type="email" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} autoComplete="email" required maxLength={180} /></label>
        <label><span>Telefón <small>nepovinné</small></span><input type="tel" value={senderPhone} onChange={(event) => setSenderPhone(event.target.value)} autoComplete="tel" maxLength={40} /></label>
        <label><span>Pes <small>nepovinné</small></span><input value={dogInfo} onChange={(event) => setDogInfo(event.target.value)} placeholder="Plemeno, vek a čo riešite" maxLength={300} /></label>
      </div>
      <label className="directory-contact-message"><span>Správa</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={6} minLength={20} maxLength={3000} placeholder="Stručne opíš, s čím potrebuješ pomôcť a aký termín ti vyhovuje." required /><small>{message.length} / 3 000 znakov</small></label>
      <p className="form-privacy-hint">Neposielaj čísla dokladov, prihlasovacie údaje ani citlivú zdravotnú dokumentáciu ľudí. Uveď iba údaje potrebné na vybavenie dopytu.</p>
      <label className="directory-honeypot" aria-hidden="true"><span>Firma</span><input value={company} onChange={(event) => setCompany(event.target.value)} tabIndex={-1} autoComplete="off" /></label>
      <label className="directory-contact-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>Potvrdzujem, že som sa oboznámil/a so spracúvaním údajov na vybavenie dopytu. Viac v <Link href="/sukromie" target="_blank">zásadách ochrany osobných údajov</Link>.</span></label>
      {result && <p className={`directory-contact-result is-${result.type}`} role="status">{result.text}</p>}
      <button className="button button--primary" type="submit" disabled={sending}>{sending ? "Odosielam…" : "Odoslať dopyt cez Psipediu"}</button>
    </form>
  );
}
