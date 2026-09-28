"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { PartnerTurnstile } from "@/components/partner-turnstile";

export function ReviewAuthorAuthForm({
  siteKey,
  returnTo,
}: {
  siteKey: string;
  returnTo: string | null;
}) {
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const onToken = useCallback((token: string) => setTurnstileToken(token), []);

  useEffect(() => {
    if (result) statusRef.current?.focus();
  }, [result]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!turnstileToken || sending) return;
    setSending(true);
    setResult(null);
    try {
      const response = await fetch("/api/review-author/auth/request-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, turnstileToken, returnTo }),
      });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Overovací odkaz sa nepodarilo vyžiadať.");
      setResult({
        type: "success",
        text: data.message || "Ak je možné pokračovať, poslali sme vám overovací odkaz e-mailom.",
      });
    } catch (error) {
      setResult({
        type: "error",
        text: error instanceof Error ? error.message : "Overovací odkaz sa nepodarilo vyžiadať.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="review-auth-form" onSubmit={submit}>
      <label className="review-auth-field" htmlFor="review-author-email">
        <span>E-mail</span>
        <input
          id="review-author-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={320}
          aria-describedby="review-author-email-help"
          required
        />
      </label>
      <p id="review-author-email-help" className="review-auth-help">
        E-mail používame iba na overenie autora recenzie a bezpečný prístup k jeho budúcim recenziám.
      </p>

      <PartnerTurnstile
        siteKey={siteKey}
        action="review_author_auth_request"
        onToken={onToken}
      />

      {result && (
        <p
          ref={statusRef}
          tabIndex={-1}
          className={"review-auth-message is-" + result.type}
          role="status"
          aria-live="polite"
        >
          {result.text}
        </p>
      )}

      <button
        className="button button--coral review-auth-submit"
        type="submit"
        disabled={sending || !turnstileToken || !siteKey}
        aria-busy={sending}
      >
        {sending ? "Odosielam…" : "Poslať overovací odkaz"}
      </button>
    </form>
  );
}
