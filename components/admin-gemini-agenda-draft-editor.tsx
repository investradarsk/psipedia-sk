"use client";

import { useState } from "react";
import type { GeminiAgendaDraft } from "@/lib/gemini-notion-agenda-review";

type Values = Record<string, string | number | boolean | null>;
const initial = (draft: GeminiAgendaDraft): Values =>
  Object.fromEntries(draft.fields.filter(field => field.editable).map(field => [field.name, field.value]));
const api = (draft: GeminiAgendaDraft) =>
  "/api/admin/gemini-automation/notion-drafts/" + encodeURIComponent(draft.id) +
  "?stable_key=" + encodeURIComponent(draft.stableKey);

export function AdminGeminiAgendaDraftEditor({ draft, onSaved }: {
  draft: GeminiAgendaDraft;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Values>(() => initial(draft));
  const [baseline, setBaseline] = useState<Values>(() => initial(draft));
  const [revision, setRevision] = useState(draft.lastEditedAt);
  const [reviewState, setReviewState] = useState(draft.reviewState);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"approve" | "reject" | "restore" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  async function submit(action: "save" | "approve" | "reject" | "restore") {
    if (busy) return;
    setError(""); setMessage("");
    // PATCH only actually edited fields. Preserves rich-text mentions, formatted
    // fragments and datetime values that a plain HTML input cannot round-trip.
    const changed = Object.fromEntries(draft.fields.filter(field =>
      field.editable && !Object.is(values[field.name], baseline[field.name]))
      .map(field => [field.name, values[field.name]]));
    if (action === "save" && Object.keys(changed).length === 0) {
      setMessage("Žiadne zmeny na uloženie.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(api(draft), {
        method: action === "save" ? "PUT" : "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, lastEditedAt: revision,
          ...(action === "save" ? { fields: changed } : { confirm: true, ...(action === "reject" ? { reason: rejectionReason.trim() } : {}) }) }),
      });
      const data = await response.json() as { draft?: GeminiAgendaDraft; error?: string };
      if (!response.ok || !data.draft) throw Error(data.error || "Notion neodpovedá. Over stav konceptu pred opakovaním.");
      setValues(initial(data.draft));
      setBaseline(initial(data.draft));
      setRevision(data.draft.lastEditedAt);
      setReviewState(data.draft.reviewState);
      setConfirm(null);
      setRejectionReason("");
      setMessage(action === "save" ? "Koncept bol uložený v pôvodnej Notion stránke bez publikovania."
        : action === "approve" ? "Schválené na následné spracovanie synchronizáciou." :
          action === "reject" ? "Koncept odmietnutý." : "Koncept obnovený.");
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Zápis do Notionu zlyhal.");
    } finally { setBusy(false); }
  }

  const readOnly = !["NEW", "IN_PROGRESS"].includes(reviewState);
  const supportedFields = draft.fields.filter(field => field.synced);
  const otherFields = draft.fields.filter(field => !field.synced);
  return (
    <div className="admin-event-editor">
      <p>Upravuješ pôvodnú Notion stránku, nie importovanú D1 entitu. Stav publikovania je oddelený od uloženia.</p>
      <p><a href={draft.notionUrl} target="_blank" rel="noreferrer">Otvoriť originál v Notione ↗</a></p>
      {draft.missingFields.length > 0 && (
        <p role="alert">Tieto polia z existujúceho editora schéma Notionu neobsahuje; nebudú uložené ani prepísané:
          {" " + draft.missingFields.join(", ")}. Doplnenie schémy vyžaduje samostatné schválenie.
        </p>
      )}
      {draft.attribution === "EVIDENCE_SIGNATURE_ONLY" && <p role="status">Gemini pôvod je zatiaľ odhadnutý podľa zdrojových dôkazov. Jednoznačné označenie vyžaduje úpravu existujúceho pracovníka Gemini.</p>}
      {draft.agenda === "help-cases" && !draft.reviewAvailable && <p role="alert">Interná kontrola Pomoci psom zatiaľ nie je nakonfigurovaná v Notione. Slug ani schvaľovanie a odmietanie konceptu nie sú povolené. Ostatné úpravy možno uložiť bez publikovania.</p>}
      {draft.agenda === "help-cases" && draft.reviewAvailable && <p>Schválenie mení výlučne interné pole Gemini kontrola. Verejné publikovanie sa nevykoná; koncept spracuje existujúca synchronizácia až následne.</p>}
      <form onSubmit={event => { event.preventDefault(); void submit("save"); }}>
        <div className="admin-field-grid">
          {supportedFields.map(field => (
            <div className="admin-field" key={field.name}>
              <label htmlFor={"gemini-agenda-" + field.name}>{field.name}{!field.editable ? " · iba na čítanie" : ""}</label>
              {field.type === "checkbox" ? (
                <input id={"gemini-agenda-" + field.name} type="checkbox"
                  disabled={readOnly || !field.editable || busy}
                  checked={Boolean(values[field.name] ?? field.value)}
                  onChange={event => setValues(previous => ({ ...previous, [field.name]: event.target.checked }))} />
              ) : field.type === "select" && field.editable ? (
                <select id={"gemini-agenda-" + field.name}
                  disabled={readOnly || busy}
                  value={String(values[field.name] ?? "")}
                  onChange={event => setValues(previous => ({ ...previous, [field.name]: event.target.value }))}>
                  <option value="">Bez hodnoty</option>
                  {(field.options ?? []).map(option => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : field.type === "rich_text" && ["Popis", "Praktické info", "Krátky popis", "Perex", "Zdravotné poznámky", "Povaha", "Špeciálne potreby"].includes(field.name) ? (
                <textarea id={"gemini-agenda-" + field.name} rows={field.name === "Popis" ? 10 : 4}
                  disabled={readOnly || !field.editable || busy}
                  value={String(values[field.name] ?? field.value ?? "")}
                  onChange={event => setValues(previous => ({ ...previous, [field.name]: event.target.value }))} />
              ) : (
                <input id={"gemini-agenda-" + field.name}
                  type={field.type === "number" ? "number" :
                    field.type === "email" ? "email" : field.type === "url" ? "url" :
                      field.type === "date" && !String(values[field.name] ?? field.value ?? "").includes("T") ? "date" : "text"}
                  disabled={readOnly || !field.editable || busy}
                  value={String(values[field.name] ?? field.value ?? "")}
                  onChange={event => setValues(previous => ({ ...previous,
                    [field.name]: field.type === "number" ? event.target.value === "" ? null : Number(event.target.value) : event.target.value }))} />
              )}
            </div>
          ))}
        </div>
        {otherFields.length > 0 && (
          <details>
            <summary>Ďalšie údaje z Notionu (iba na čítanie, {otherFields.length})</summary>
            <dl>
              {otherFields.map(field => <div key={field.name}>
                <dt>{field.name} ({field.type})</dt>
                <dd>{String(field.value ?? "") || "—"} · detailné úpravy iba v Notione</dd>
              </div>)}
            </dl>
          </details>
        )}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <div className="admin-editor-actions">
          <button type="submit" disabled={busy || readOnly}>{busy ? "Ukladám…" : "Uložiť ako koncept"}</button>
          {!draft.psipediaId && reviewState !== "APPROVED" && (
            <button type="button" disabled={busy || (draft.agenda === "help-cases" && !draft.reviewAvailable)}
              onClick={() => setConfirm(reviewState === "REJECTED" ? "restore" : "reject")}>
              {reviewState === "REJECTED" ? "Obnoviť" : "Odmietnuť"}
            </button>
          )}
          {!readOnly && (
            <button type="button" disabled={busy || (draft.agenda === "help-cases" && !draft.reviewAvailable)} onClick={() => setConfirm("approve")}>
              Schváliť koncept
            </button>
          )}
        </div>
      </form>
      {confirm && (
        <div role="alertdialog" aria-label="Potvrdenie rozhodnutia">
          <p>{confirm === "approve" ? "Schváliť tento Notion koncept na následné spracovanie? Uloženie konceptu samo osebe nepublikuje."
            : confirm === "reject" ? "Odmietnuť tento koncept?"
              : "Obnoviť odmietnutý koncept?"}</p>
          {confirm === "reject" && draft.agenda === "help-cases" && (
            <label>Dôvod odmietnutia (povinný)
              <textarea value={rejectionReason} maxLength={1000} rows={3}
                disabled={busy} onChange={event => setRejectionReason(event.target.value)} />
            </label>
          )}
          <button type="button" disabled={busy || (confirm === "reject" && draft.agenda === "help-cases" && !rejectionReason.trim())} onClick={() => void submit(confirm)}>Áno, potvrdiť</button>
          <button type="button" disabled={busy} onClick={() => setConfirm(null)}>Zrušiť</button>
        </div>
      )}
    </div>
  );
}
