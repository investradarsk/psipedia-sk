"use client";

import { useState } from "react";

export function AdminProfileReviewVerification({ initial }: {
  initial: { available: boolean; locked: boolean; emailRequired: boolean };
}) {
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function change(emailRequired: boolean) {
    if (busy || !settings.available || settings.locked) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/profile-review-verification", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ emailRequired }),
      });
      const data = await response.json() as typeof initial & { error?: string };
      if (!response.ok) throw new Error(data.error || "Uloženie zlyhalo.");
      setSettings(data);
      setMessage("Nastavenie uložené.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Uloženie zlyhalo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-review-card" aria-label="Overovanie recenzií služieb">
      <h2>Overovanie recenzií služieb</h2>
      <p>Recenzie vždy čakajú na schválenie. Turnstile ostáva povinný v oboch režimoch. E-shopy a organizácie sa nemenia.</p>
      <label>
        <input type="checkbox" checked={settings.emailRequired} disabled={busy || !settings.available || settings.locked}
          onChange={(event) => void change(event.target.checked)} />
        Vyžadovať overenie e-mailom
      </label>
      <p>{settings.emailRequired ? "Aktívne: overenie e-mailom." : "Aktívne: jednoduché odoslanie hosťom bez e-mailu."}</p>
      {!settings.available ? <p role="status">Nastavenie nie je dostupné. Z bezpečnostných dôvodov sa vyžaduje e-mail.</p> : null}
      {settings.locked ? <p role="status">Povinné overenie je vynútené konfiguráciou Workera.</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
