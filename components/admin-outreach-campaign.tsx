"use client";

import { useState } from "react";

type Campaign = {
  id: string;
  name: string;
  status: string;
  selection: Record<string, unknown>;
  subjectTemplate: string;
  bodyTemplate: string;
  counts: {
    selectedEntities: number;
    uniqueRecipients: number;
    deduplicated: number;
    suppressed: number;
    invalidEmails: number;
  };
  previewedAt: string | null;
  preparedAt: string | null;
  sentAt: string | null;
};

type Recipient = {
  id: string;
  maskedEmail: string;
  sendState: string;
  attempts: number;
  lastError: string | null;
  responseSubmittedAt: string | null;
  entities: Array<{ entityName: string; profileUrl: string; entityType: string }>;
};

type ResponseItem = {
  id: string;
  resourceType: string;
  status: string;
  proposed: Record<string, unknown>;
  createdAt: string;
};

type Preview = {
  selectedEntityCount: number;
  uniqueRecipientCount: number;
  deduplicatedCount: number;
  suppressedCount: number;
  invalidEmailCount: number;
  samples: Array<{
    maskedEmail: string;
    profileUrls: string[];
    message: { subject: string; text: string };
  }>;
};

function requestedChanges(item: ResponseItem) {
  const value = item.proposed.requestedChanges;
  return typeof value === "string" ? value : "—";
}

function entityName(item: ResponseItem) {
  const outreach = item.proposed.outreach;
  if (!outreach || typeof outreach !== "object" || Array.isArray(outreach)) return item.resourceType;
  const value = (outreach as Record<string, unknown>).entityName;
  return typeof value === "string" ? value : item.resourceType;
}

export function AdminOutreachCampaign({
  campaign,
  recipients,
  responses,
  provider,
}: {
  campaign: Campaign;
  recipients: Recipient[];
  responses: ResponseItem[];
  provider: { configured: boolean; providerKey: string; reason: string | null };
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function post(path: string, body: Record<string, unknown> = {}) {
    setBusy(path);
    setMessage("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { preview?: Preview; summary?: Record<string, unknown>; error?: string };
      if (!response.ok) throw new Error(payload.error || "Akcia zlyhala.");
      if (payload.preview) {
        setPreview(payload.preview);
        setMessage("Dry run hotový. Nebol odoslaný žiadny e-mail.");
      } else {
        setMessage(payload.summary ? "Batch bol spracovaný." : "Akcia bola vykonaná.");
        window.location.reload();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Akcia zlyhala.");
    } finally {
      setBusy("");
    }
  }

  async function patchCampaign(action: string) {
    setBusy(action);
    setMessage("");
    try {
      const response = await fetch("/api/admin/outreach/campaigns/" + campaign.id, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Akcia zlyhala.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Akcia zlyhala.");
    } finally {
      setBusy("");
    }
  }

  async function review(id: string, status: "APPROVED" | "REJECTED") {
    setBusy(id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/outreach/responses/" + id, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Review zlyhalo.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review zlyhalo.");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <section className="admin-stats" aria-label="Campaign counts">
        <div><span>Entities</span><strong>{campaign.counts.selectedEntities}</strong></div>
        <div><span>Unique recipients</span><strong>{campaign.counts.uniqueRecipients}</strong></div>
        <div><span>Dedupe</span><strong>{campaign.counts.deduplicated}</strong></div>
        <div><span>Suppressed / invalid</span><strong>{campaign.counts.suppressed} / {campaign.counts.invalidEmails}</strong></div>
      </section>

      <section className="admin-panel">
        <h2>Safety gate</h2>
        <p>Stav: <strong>{campaign.status}</strong> · Provider: <strong>{provider.configured ? provider.providerKey : "vypnutý"}</strong></p>
        <p>Reálny send vyžaduje DRAFT → Dry run → READY a explicitné kliknutie admina. Jeden request spracuje najviac 25 recipientov.</p>
        <div className="admin-heading-actions">
          {campaign.status === "DRAFT" && <button type="button" disabled={Boolean(busy)} onClick={() => void post("/api/admin/outreach/campaigns/" + campaign.id + "/preview")}>Dry run / Preview</button>}
          {campaign.status === "DRAFT" && campaign.previewedAt && <button type="button" disabled={Boolean(busy)} onClick={() => void post("/api/admin/outreach/campaigns/" + campaign.id + "/prepare")}>Pripraviť READY</button>}
          {["READY", "SENDING"].includes(campaign.status) && <button className="button button--primary" type="button" disabled={Boolean(busy) || !provider.configured} onClick={() => window.confirm("Odoslať ďalší bounded batch?") && void post("/api/admin/outreach/campaigns/" + campaign.id + "/send", { limit: 25 })}>Odoslať max. 25</button>}
          {["READY", "SENDING"].includes(campaign.status) && <button type="button" disabled={Boolean(busy)} onClick={() => void patchCampaign("pause")}>Pause</button>}
          {campaign.status === "PAUSED" && <button type="button" disabled={Boolean(busy)} onClick={() => void patchCampaign("resume")}>Resume</button>}
          {["DRAFT", "READY", "SENDING", "PAUSED"].includes(campaign.status) && <button type="button" disabled={Boolean(busy)} onClick={() => window.confirm("Zrušiť kampaň?") && void patchCampaign("cancel")}>Cancel</button>}
          {campaign.status === "SENT" && <button type="button" disabled={Boolean(busy)} onClick={() => void patchCampaign("complete")}>Označiť completed</button>}
        </div>
        {message && <p className="admin-flash" role="status">{message}</p>}
      </section>

      {preview && (
        <section className="admin-panel">
          <h2>Dry run výsledok</h2>
          <p>Entities {preview.selectedEntityCount} · unique recipients {preview.uniqueRecipientCount} · dedupe {preview.deduplicatedCount} · suppressed {preview.suppressedCount} · invalid {preview.invalidEmailCount}.</p>
          {preview.samples.map((sample) => (
            <details key={sample.maskedEmail}>
              <summary>{sample.maskedEmail} · {sample.profileUrls.length} profilov</summary>
              <strong>{sample.message.subject}</strong>
              <pre>{sample.message.text}</pre>
            </details>
          ))}
        </section>
      )}

      <section className="admin-panel">
        <h2>Recipienti</h2>
        {recipients.length ? (
          <div className="admin-change-table" role="table">
            <div className="is-heading" role="row"><strong>Recipient</strong><strong>Profily</strong><strong>Delivery</strong></div>
            {recipients.map((recipient) => (
              <div role="row" key={recipient.id}>
                <strong>{recipient.maskedEmail}</strong>
                <span>{recipient.entities.map((entity) => entity.entityName).join(", ")}</span>
                <span>{recipient.sendState} · pokusy {recipient.attempts}{recipient.lastError ? " · " + recipient.lastError : ""}</span>
              </div>
            ))}
          </div>
        ) : <p className="admin-empty">Recipienti vzniknú až po Preview a príprave READY.</p>}
      </section>

      <section className="admin-panel">
        <h2>Odpovede / návrhy zmien</h2>
        {responses.length ? responses.map((item) => (
          <article className="admin-change-card" key={item.id}>
            <header><h3>{entityName(item)}</h3><p>{item.resourceType} · {item.status}</p></header>
            <p>{requestedChanges(item)}</p>
            {item.status === "SUBMITTED" && (
              <footer>
                <button type="button" disabled={busy === item.id} onClick={() => void review(item.id, "REJECTED")}>Zamietnuť</button>
                <button type="button" disabled={busy === item.id} onClick={() => void review(item.id, "APPROVED")}>Schváliť na manuálne spracovanie</button>
              </footer>
            )}
          </article>
        )) : <p className="admin-empty">Zatiaľ neprišla žiadna verification odpoveď.</p>}
        <p><strong>Dôležité:</strong> schválenie odpovede nemení canonical profil. Úprava sa vykonáva až samostatne cez existujúci editor/publikačný workflow.</p>
      </section>
    </>
  );
}
