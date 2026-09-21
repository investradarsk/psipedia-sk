"use client";

import { useCallback, useState } from "react";
import { PartnerTurnstile } from "@/components/partner-turnstile";

export function PartnerSettingsActions({ siteKey }: { siteKey: string }) {
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [busy, setBusy] = useState<"logout" | "deactivate" | null>(null);
  const [error, setError] = useState("");
  const onToken = useCallback((token: string) => setTurnstileToken(token), []);

  async function logout() {
    setBusy("logout");
    setError("");
    try {
      const response = await fetch("/api/partner/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || "Odhlásenie sa nepodarilo.");
      }
      window.location.replace("/partner/prihlasenie");
    } catch {
      setError("Odhlásenie sa nepodarilo. Skúste to znova.");
      setBusy(null);
    }
  }

  async function deactivate() {
    if (!confirmDeactivate || !turnstileToken) return;
    setBusy("deactivate");
    setError("");
    try {
      const response = await fetch("/api/partner/account/deactivate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turnstileToken }),
      });
      const data = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "Deaktivácia sa nepodarila.");
      window.location.replace("/partner/prihlasenie");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Deaktivácia sa nepodarila.");
      setBusy(null);
    }
  }

  return (
    <div className="partner-settings-actions">
      <section className="partner-settings-card">
        <h2>Odhlásenie</h2>
        <p>Táto session bude okamžite zneplatnená.</p>
        <button className="button button--dark" type="button" onClick={logout} disabled={busy !== null}>
          {busy === "logout" ? "Odhlasujem…" : "Odhlásiť sa"}
        </button>
      </section>

      <section className="partner-settings-card partner-danger-zone">
        <h2>Deaktivovať Partner účet</h2>
        <p>Prístup k Partner účtu sa zablokuje a všetky aktívne sessions sa zneplatnia. Profily organizácií alebo služieb sa tým nemažú.</p>
        <label className="partner-confirm">
          <input
            type="checkbox"
            checked={confirmDeactivate}
            onChange={(event) => setConfirmDeactivate(event.target.checked)}
          />
          <span>Rozumiem, že účet už nebude možné bežne používať na prihlásenie.</span>
        </label>
        {confirmDeactivate && (
          <PartnerTurnstile
            siteKey={siteKey}
            action="partner_account_deactivate"
            onToken={onToken}
          />
        )}
        <button
          className="button partner-danger-button"
          type="button"
          onClick={deactivate}
          disabled={busy !== null || !confirmDeactivate || !turnstileToken || !siteKey}
        >
          {busy === "deactivate" ? "Deaktivujem…" : "Deaktivovať účet"}
        </button>
      </section>

      {error && <p className="partner-form-message is-error" role="alert">{error}</p>}
    </div>
  );
}
