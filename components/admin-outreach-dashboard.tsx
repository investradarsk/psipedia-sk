"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type Campaign = {
  id: string;
  name: string;
  status: string;
  purpose: string;
  counts: {
    selectedEntities: number;
    uniqueRecipients: number;
    deduplicated: number;
    suppressed: number;
    invalidEmails: number;
  };
  createdAt: string;
  previewedAt: string | null;
};

type Provider = { configured: boolean; providerKey: string; reason: string | null };

export function AdminOutreachDashboard({
  initialCampaigns,
  provider,
}: {
  initialCampaigns: Campaign[];
  provider: Provider;
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [name, setName] = useState("");
  const [organizations, setOrganizations] = useState(true);
  const [directory, setDirectory] = useState(true);
  const [status, setStatus] = useState("all");
  const [region, setRegion] = useState("");
  const [verification, setVerification] = useState("all");
  const [contactHistory, setContactHistory] = useState("never");
  const [limit, setLimit] = useState(250);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const entityTypes = [
        organizations ? "HELP_ORGANIZATION" : null,
        directory ? "DIRECTORY_PROFILE" : null,
      ].filter(Boolean);
      if (!entityTypes.length) throw new Error("Vyber aspoň jeden modul.");
      const response = await fetch("/api/admin/outreach/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          selection: { entityTypes, status, region, verification, contactHistory, limit },
        }),
      });
      const payload = await response.json() as { campaign?: Campaign; error?: string };
      if (!response.ok || !payload.campaign) throw new Error(payload.error || "Kampaň sa nepodarilo vytvoriť.");
      setCampaigns((current) => [payload.campaign as Campaign, ...current]);
      setName("");
      window.location.href = "/admin/operations/outreach/" + payload.campaign.id;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kampaň sa nepodarilo vytvoriť.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="admin-stats" aria-label="Outreach status">
        <div><span>Kampane</span><strong>{campaigns.length}</strong></div>
        <div><span>DRAFT</span><strong>{campaigns.filter((item) => item.status === "DRAFT").length}</strong></div>
        <div><span>Aktívne</span><strong>{campaigns.filter((item) => ["READY", "SENDING"].includes(item.status)).length}</strong></div>
        <div><span>Provider</span><strong>{provider.configured ? provider.providerKey : "Vypnutý"}</strong></div>
      </section>

      {!provider.configured && (
        <section className="admin-panel">
          <h2>Reálne odosielanie je vypnuté</h2>
          <p>Foundation funguje v preview/dry-run režime. Send zostane fail-closed, kým nie je explicitne povolený a nakonfigurovaný provider. Dôvod: {provider.reason || "nenakonfigurované"}.</p>
        </section>
      )}

      <section className="admin-panel">
        <h2>Nová verification kampaň</h2>
        <p>Výber používa iba structured canonical verejné kontaktné e-maily. Eventy a voľné Help poznámky sa neparsujú.</p>
        <form onSubmit={create}>
          <label><span>Názov kampane</span><input value={name} onChange={(event) => setName(event.target.value)} minLength={3} maxLength={160} required /></label>
          <fieldset>
            <legend>Moduly</legend>
            <label><input type="checkbox" checked={organizations} onChange={(event) => setOrganizations(event.target.checked)} /> Organizácie</label>
            <label><input type="checkbox" checked={directory} onChange={(event) => setDirectory(event.target.checked)} /> Adresár / služby</label>
          </fieldset>
          <div className="admin-filter-grid">
            <label><span>Stav</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Všetky</option><option value="published">Publikované</option><option value="draft">Draft</option></select></label>
            <label><span>Kraj</span><input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Prázdne = všetky" /></label>
            <label><span>Overenie</span><select value={verification} onChange={(event) => setVerification(event.target.value)}><option value="all">Všetky</option><option value="verified">Overené</option><option value="unverified">Neoverené</option></select></label>
            <label><span>História kontaktu</span><select value={contactHistory} onChange={(event) => setContactHistory(event.target.value)}><option value="never">Ešte nekontaktované</option><option value="contacted">Kontaktované</option><option value="all">Všetky</option></select></label>
            <label><span>Max. entities</span><input type="number" min={1} max={500} value={limit} onChange={(event) => setLimit(Number(event.target.value))} /></label>
          </div>
          {message && <p role="status">{message}</p>}
          <button className="button button--primary" type="submit" disabled={busy}>{busy ? "Vytváram…" : "Vytvoriť DRAFT kampaň"}</button>
        </form>
      </section>

      <section className="admin-panel">
        <h2>Kampane</h2>
        {campaigns.length ? (
          <div className="admin-change-table" role="table">
            <div className="is-heading" role="row"><strong>Kampaň</strong><strong>Stav</strong><strong>Preview</strong></div>
            {campaigns.map((campaign) => (
              <div role="row" key={campaign.id}>
                <strong><Link href={"/admin/operations/outreach/" + campaign.id}>{campaign.name}</Link></strong>
                <span>{campaign.status} · {campaign.counts.uniqueRecipients} recipientov</span>
                <span>{campaign.previewedAt ? "áno" : "nie"}</span>
              </div>
            ))}
          </div>
        ) : <p className="admin-empty">Zatiaľ nie je vytvorená žiadna outreach kampaň.</p>}
      </section>
    </>
  );
}
