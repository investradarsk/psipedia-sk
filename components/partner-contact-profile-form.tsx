"use client";

import { FormEvent, useState } from "react";

type Props = {
  mode: "onboarding" | "settings";
  initial?: {
    contactName?: string;
    phone?: string | null;
    relationship?: string | null;
  };
  returnTo?: string | null;
};

export function PartnerContactProfileForm({ mode, initial = {}, returnTo = null }: Props) {
  const [contactName, setContactName] = useState(initial.contactName ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [relationship, setRelationship] = useState(initial.relationship ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/partner/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactName, phone, relationship }),
      });
      const data = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Kontaktné údaje sa nepodarilo uložiť.");
      }
      if (mode === "onboarding") {
        window.location.replace(returnTo || "/partner");
        return;
      }
      setResult({ type: "success", text: "Kontaktné údaje boli uložené." });
    } catch (error) {
      setResult({
        type: "error",
        text: error instanceof Error ? error.message : "Kontaktné údaje sa nepodarilo uložiť.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="partner-auth-form" onSubmit={submit}>
      <label className="partner-field">
        <span>Meno a priezvisko *</span>
        <input
          type="text"
          autoComplete="name"
          value={contactName}
          onChange={(event) => setContactName(event.target.value)}
          minLength={2}
          maxLength={120}
          required
        />
      </label>
      <label className="partner-field">
        <span>Telefón</span>
        <input
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          maxLength={32}
        />
      </label>
      <label className="partner-field">
        <span>Vaša úloha / vzťah k profilu</span>
        <input
          type="text"
          autoComplete="organization-title"
          value={relationship}
          onChange={(event) => setRelationship(event.target.value)}
          maxLength={100}
          placeholder="napr. majiteľ, manažér, správca profilu"
        />
      </label>
      {result && (
        <p className={"partner-form-message is-" + result.type} role={result.type === "error" ? "alert" : "status"} aria-live="polite">
          {result.text}
        </p>
      )}
      <button className="button button--coral partner-submit" type="submit" disabled={busy}>
        {busy ? "Ukladám…" : mode === "onboarding" ? "Pokračovať do Partner účtu" : "Uložiť kontaktné údaje"}
      </button>
    </form>
  );
}
