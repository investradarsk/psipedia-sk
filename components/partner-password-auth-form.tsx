"use client";

import Link from "next/link";
import { FormEvent, useCallback, useState } from "react";
import { PartnerTurnstile } from "@/components/partner-turnstile";

type Props = {
  mode: "register" | "login";
  siteKey: string;
  returnTo?: string | null;
};

function destination(onboardingComplete: boolean | undefined, returnTo: string | null) {
  if (onboardingComplete === false) {
    return returnTo ? `/partner/onboarding?returnTo=${encodeURIComponent(returnTo)}` : "/partner/onboarding";
  }
  return returnTo || "/partner";
}

export function PartnerPasswordAuthForm({ mode, siteKey, returnTo = null }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
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
      const response = await fetch(`/api/partner/auth/password/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          passwordConfirmation: mode === "register" ? passwordConfirmation : undefined,
          turnstileToken,
          returnTo,
        }),
      });
      const data = await response.json() as { message?: string; error?: string; onboardingComplete?: boolean };
      if (!response.ok) throw new Error(data.error || "Prihlásenie sa nepodarilo.");
      if (mode === "login") {
        window.location.replace(destination(data.onboardingComplete, returnTo));
        return;
      }
      setResult({
        type: "success",
        text: data.message || "Ak je možné pokračovať, poslali sme vám overovací odkaz e-mailom.",
      });
    } catch (error) {
      setResult({ type: "error", text: error instanceof Error ? error.message : "Prihlásenie sa nepodarilo." });
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="partner-auth-form" onSubmit={submit}>
      <label className="partner-field">
        <span>E-mail</span>
        <input type="email" autoComplete="email" inputMode="email" value={email}
          onChange={(event) => setEmail(event.target.value)} maxLength={320} required />
      </label>
      <label className="partner-field">
        <span>Heslo</span>
        <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password} onChange={(event) => setPassword(event.target.value)}
          minLength={mode === "register" ? 12 : undefined} maxLength={1024} required />
      </label>
      {mode === "register" ? (
        <label className="partner-field">
          <span>Potvrdenie hesla</span>
          <input type="password" autoComplete="new-password" value={passwordConfirmation}
            onChange={(event) => setPasswordConfirmation(event.target.value)} minLength={12} maxLength={1024} required />
        </label>
      ) : null}

      <PartnerTurnstile
        siteKey={siteKey}
        action={mode === "login" ? "partner_password_login" : "partner_password_register"}
        onToken={onToken}
      />

      {result && <p className={"partner-form-message is-" + result.type} role="status" aria-live="polite">{result.text}</p>}

      <button className="button button--coral partner-submit" type="submit" disabled={sending || !turnstileToken || !siteKey}>
        {sending ? "Spracúvam…" : mode === "login" ? "Prihlásiť sa" : "Vytvoriť Partner účet"}
      </button>

      {mode === "login" ? (
        <p className="partner-auth-switch"><Link href="/partner/zabudnute-heslo">Zabudli ste heslo?</Link></p>
      ) : (
        <p className="partner-password-hint">Použite aspoň 12 znakov. Môžete použiť aj dlhú heslovú frázu.</p>
      )}
    </form>
  );
}
