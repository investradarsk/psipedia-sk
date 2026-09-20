"use client";

import { useState } from "react";
import { AD_LABEL, PROMOTABLE_ENTITY_TYPES, SPONSORED_LABEL, type MonetizationStatus } from "@/lib/monetization";
import type { DirectCampaign, PromotionRecord } from "@/lib/monetization-store";

type Placement = { id: string; label: string; public: boolean };
type InitialData = { placements: Placement[]; campaigns: DirectCampaign[]; promotions: PromotionRecord[] };

export function AdminMonetizationDashboard({ initialData }: { initialData: InitialData }) {
  const [data, setData] = useState(initialData);
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch("/api/admin/monetization", { cache: "no-store" });
    const payload = await response.json() as InitialData & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Načítanie zlyhalo.");
    setData(payload);
  }

  async function setStatus(kind: "campaign" | "promotion", id: string, status: MonetizationStatus) {
    setMessage("");
    const response = await fetch("/api/admin/monetization", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, id, status }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return setMessage(payload.error || "Aktualizácia zlyhala.");
    await refresh();
    setMessage("Stav bol uložený.");
  }

  async function createCampaign(form: FormData) {
    setMessage("");
    const placements = form.getAll("placements").map(String);
    const response = await fetch("/api/admin/monetization", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "campaign",
        name: form.get("name"),
        advertiserName: form.get("advertiserName"),
        headline: form.get("headline"),
        copy: form.get("copy"),
        destinationUrl: form.get("destinationUrl"),
        imageUrl: form.get("imageUrl"),
        imageAlt: form.get("imageAlt"),
        startAt: form.get("startAt"),
        endAt: form.get("endAt"),
        priority: form.get("priority"),
        isAffiliate: form.get("isAffiliate") === "on",
        placements,
        adminNote: form.get("adminNote"),
      }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return setMessage(payload.error || "Kampaň sa nepodarilo uložiť.");
    await refresh();
    setMessage("Kampaň bola vytvorená ako draft.");
  }

  async function createPromotion(form: FormData) {
    setMessage("");
    const response = await fetch("/api/admin/monetization", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "promotion",
        entityType: form.get("entityType"),
        entityId: form.get("entityId"),
        startAt: form.get("startAt"),
        endAt: form.get("endAt"),
        priority: form.get("priority"),
        provenance: form.get("provenance"),
        adminNote: form.get("adminNote"),
      }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return setMessage(payload.error || "Promotion sa nepodarilo uložiť.");
    await refresh();
    setMessage("Promotion bola vytvorená ako draft.");
  }

  return (
    <div className="admin-grid">
      {message ? <p role="status" className="admin-notice">{message}</p> : null}

      <section className="admin-card">
        <h2>Placement registry</h2>
        <p>Placement určuje iba miesto. Konkrétny creative sa priraďuje cez kampaň.</p>
        <ul>{data.placements.map((item) => <li key={item.id}><code>{item.id}</code> — {item.label}{item.public ? " · public V1" : " · foundation"}</li>)}</ul>
      </section>

      <section className="admin-card">
        <h2>Priame kampane</h2>
        <p>Public label: <strong>{AD_LABEL}</strong>. Produkcia zostáva prázdna, kým nevytvoríš a neaktivuješ reálnu kampaň.</p>
        {data.campaigns.length ? data.campaigns.map((campaign) => (
          <article key={campaign.id} className="admin-list-card">
            <strong>{campaign.name}</strong> · {campaign.advertiserName} · <code>{campaign.status}</code>
            <p>{campaign.headline} · {campaign.placements.join(", ")}</p>
            <small>{campaign.startAt || "bez začiatku"} → {campaign.endAt || "bez konca"}</small>
            <div className="admin-actions">
              <button type="button" onClick={() => setStatus("campaign", campaign.id, "active")}>Aktivovať</button>
              <button type="button" onClick={() => setStatus("campaign", campaign.id, "paused")}>Pozastaviť</button>
              <button type="button" onClick={() => setStatus("campaign", campaign.id, "archived")}>Archivovať</button>
            </div>
          </article>
        )) : <p>Žiadne kampane.</p>}
        <form action={createCampaign} className="admin-form-grid">
          <label>Názov kampane<input name="name" required /></label>
          <label>Zadávateľ<input name="advertiserName" required /></label>
          <label>Nadpis<input name="headline" required /></label>
          <label>Krátky text<input name="copy" /></label>
          <label>Cieľová URL<input name="destinationUrl" type="url" required /></label>
          <label>Creative asset (/media/ alebo /images/)<input name="imageUrl" required /></label>
          <label>Alt text<input name="imageAlt" required /></label>
          <label>Začiatok<input name="startAt" type="datetime-local" /></label>
          <label>Koniec<input name="endAt" type="datetime-local" /></label>
          <label>Priorita<input name="priority" type="number" min="-100" max="100" defaultValue="0" /></label>
          <fieldset><legend>Placementy</legend>{data.placements.map((item) => <label key={item.id}><input type="checkbox" name="placements" value={item.id} /> {item.label}</label>)}</fieldset>
          <label><input name="isAffiliate" type="checkbox" /> Affiliate kampaň</label>
          <label>Admin poznámka<textarea name="adminNote" /></label>
          <button type="submit">Vytvoriť draft kampane</button>
        </form>
      </section>

      <section className="admin-card">
        <h2>Promoted canonical entities</h2>
        <p>Public label je vždy <strong>{SPONSORED_LABEL}</strong>. Aktivácia záznamu sama osebe nemení rating ani organické skóre.</p>
        {data.promotions.length ? data.promotions.map((promotion) => (
          <article key={promotion.id} className="admin-list-card">
            <strong>{promotion.entityType}:{promotion.entityId}</strong> · <code>{promotion.status}</code>
            <p>{promotion.startAt || "bez začiatku"} → {promotion.endAt || "bez konca"} · {SPONSORED_LABEL}</p>
            <div className="admin-actions">
              <button type="button" onClick={() => setStatus("promotion", promotion.id, "active")}>Aktivovať</button>
              <button type="button" onClick={() => setStatus("promotion", promotion.id, "paused")}>Pozastaviť</button>
              <button type="button" onClick={() => setStatus("promotion", promotion.id, "archived")}>Archivovať</button>
            </div>
          </article>
        )) : <p>Žiadne promotion záznamy.</p>}
        <form action={createPromotion} className="admin-form-grid">
          <label>Canonical entity type<select name="entityType" required>{PROMOTABLE_ENTITY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          <label>Canonical entity ID<input name="entityId" required /></label>
          <label>Začiatok<input name="startAt" type="datetime-local" /></label>
          <label>Koniec<input name="endAt" type="datetime-local" /></label>
          <label>Priorita<input name="priority" type="number" min="-100" max="100" defaultValue="0" /></label>
          <label>Provenance<input name="provenance" /></label>
          <label>Admin poznámka<textarea name="adminNote" /></label>
          <button type="submit">Vytvoriť draft promotion</button>
        </form>
      </section>
    </div>
  );
}
