"use client";

import Link from "next/link";
import { FormEvent, useCallback, useState } from "react";
import { PartnerTurnstile } from "@/components/partner-turnstile";

type Props = {
  mode: "register" | "login";
  siteKey: string;
  returnTo?: string | null;
};

export function PartnerAuthForm({ mode, siteKey, returnTo = null }: Props) {
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const onToken = useCallback((token: string) => setTurnstileToken(token), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!turnstileToken || sending) return;
    setSending(true);
    setResult(null);
    try {
      const response = await fetch("/api/partner/auth/request-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, turnstileToken, returnTo, mode: mode === "login" ? "LOGIN" : "REGISTER" }),
      });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Prihlasovací odkaz sa nepodarilo vyžiadať.");
      setResult({
        type: "success",
        text: data.message || "Ak je možné pokračovať, poslali sme vám prihlasovací odkaz e-mailom.",
      });
    } catch (error) {
      setResult({
        type: "error",
        text: error instanceof Error ? error.message : "Prihlasovací odkaz sa nepodarilo vyžiadať.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="partner-auth-form" onSubmit={submit}>
      <label className="partner-field">
        <span>Pracovný e-mail</span>
        <input
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={320}
          required
        />
      </label>

      <PartnerTurnstile
        siteKey={siteKey}
        action="partner_auth_request"
        onToken={onToken}
      />

      {result && (
        <p className={"partner-form-message is-" + result.type} role="status" aria-live="polite">
          {result.text}
        </p>
      )}

      <button className="button button--coral partner-submit" type="submit" disabled={sending || !turnstileToken || !siteKey}>
        {sending ? "Odosielam…" : "Poslať prihlasovací odkaz"}
      </button>

      <p className="partner-auth-switch">
        {mode === "register" ? (
          <>Partner účet už máte? <Link href={returnTo ? `/partner/prihlasenie?returnTo=${encodeURIComponent(returnTo)}` : "/partner/prihlasenie"}>Prihlásiť sa</Link></>
        ) : (
          <>Ešte nemáte Partner účet? <Link href={returnTo ? `/partner/registracia?returnTo=${encodeURIComponent(returnTo)}` : "/partner/registracia"}>Začať registráciu</Link></>
        )}
      </p>
    </form>
  );
}
