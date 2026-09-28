"use client";

import { useCallback, useState } from "react";
import { PartnerLogoutButton } from "@/components/partner-logout-button";
import { PartnerTurnstile } from "@/components/partner-turnstile";

export function PartnerSettingsActions({ siteKey }: { siteKey: string }) {
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [error, setError] = useState("");
  const onToken = useCallback((token: string) => setTurnstileToken(token), []);

  async function deactivate() {
    if (!confirmDeactivate || !turnstileToken || busy || logoutBusy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/partner/account/deactivate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turnstileToken }),
      });
      const data = await response.json() as { success?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "Deaktivácia sa nepodarila.");
      if (!data.success) throw new Error(data.error || "Deaktivácia sa nepodarila.");
      window.location.replace("/partner/prihlasenie");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Deaktivácia sa nepodarila.");
      setBusy(false);
    }
  }

  return (
    <div className="partner-settings-actions">
      <section className="partner-settings-card">
        <h2>Odhlásenie</h2>
        <p>Odhlásite sa z tohto zariadenia. Ostatné prihlásenia zostanú aktívne.</p>
        <PartnerLogoutButton
          className="button button--dark"
          accessibleName="Odhlásiť sa"
          disabled={busy}
          onBusyChange={setLogoutBusy}
        />
      </section>

      <section className="partner-settings-card partner-danger-zone">
        <h2>Deaktivovať Partner účet</h2>
        <p>Prístup k Partner účtu sa zablokuje a všetky aktívne prihlásenia sa zneplatnia. Profily organizácií alebo služieb sa tým nemažú.</p>
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
          disabled={busy || logoutBusy || !confirmDeactivate || !turnstileToken || !siteKey}
        >
          {busy ? "Deaktivujem…" : "Deaktivovať účet"}
        </button>
      </section>

      {error && <p className="partner-form-message is-error" role="alert">{error}</p>}
    </div>
  );
}
