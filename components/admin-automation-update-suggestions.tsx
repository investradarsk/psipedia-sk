"use client";

import { useMemo, useState } from "react";
import type {
  AutomationUpdateFieldActionResult,
  CanonicalUpdateSuggestion,
  CanonicalUpdateSuggestionField,
} from "@/lib/data-automation-update-review";

type Props = {
  initialSuggestions: CanonicalUpdateSuggestion[];
  onAccepted?: (updatedValues: Record<string, unknown>, updatedAt: string) => void;
};

function scalarText(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Áno" : "Nie";
  if (Array.isArray(value)) return value.map((item) => String(item)).join("\n");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ValuePreview({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return value.length ? <ul>{value.map((item, index) => <li key={index}>{String(item)}</li>)}</ul> : <span>—</span>;
  }
  const text = scalarText(value);
  if (text.length > 420) {
    return <details><summary>Zobraziť text</summary><div style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{text}</div></details>;
  }
  return <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{text}</span>;
}

function detectedLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("sk-SK", {
    timeZone: "Europe/Bratislava",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function proposedKey(value: unknown) {
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function AdminAutomationUpdateSuggestions({ initialSuggestions, onAccepted }: Props) {
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const conflictingFields = useMemo(() => {
    const values = new Map<string, Set<string>>();
    for (const suggestion of suggestions) {
      for (const field of suggestion.fields) {
        if (!field.reviewable) continue;
        const set = values.get(field.field) ?? new Set<string>();
        set.add(proposedKey(field.proposed));
        values.set(field.field, set);
      }
    }
    return new Set([...values.entries()].filter(([, set]) => set.size > 1).map(([field]) => field));
  }, [suggestions]);

  if (!suggestions.length) return null;

  async function decide(suggestion: CanonicalUpdateSuggestion, field: CanonicalUpdateSuggestionField, action: "accept" | "reject") {
    if (action === "reject" && !window.confirm("Zamietnuť tento návrh?")) return;
    const key = `${suggestion.origin}:${suggestion.id}:${field.field}`;
    setBusy(key); setError(""); setMessage("");
    try {
      const response = await fetch(
        `/api/admin/automation-update-suggestions/${suggestion.origin}/${suggestion.id}/fields/${encodeURIComponent(field.field)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            expectedProposedValueHash: field.proposedValueHash,
            expectedUpdatedAt: suggestion.canonicalUpdatedAt,
          }),
        },
      );
      const body = await response.json() as { result?: AutomationUpdateFieldActionResult; error?: string };
      if (!response.ok || !body.result) throw new Error(body.error || "Návrh sa nepodarilo spracovať.");
      const result = body.result;
      if (result.decision === "ACCEPTED") onAccepted?.(result.updatedValues, result.updatedAt);

      setSuggestions((current) => current.flatMap((item) => {
        const actedSuggestion = item.origin === suggestion.origin && item.id === suggestion.id;
        const nextFields = item.fields.flatMap((candidate) => {
          if (actedSuggestion && candidate.field === field.field && candidate.proposedValueHash === field.proposedValueHash) return [];
          if (result.decision === "ACCEPTED" && Object.prototype.hasOwnProperty.call(result.updatedValues, candidate.field)) {
            const currentValue = result.updatedValues[candidate.field];
            if (proposedKey(currentValue) === proposedKey(candidate.proposed)) return [];
            return [{
              ...candidate,
              current: currentValue,
              state: "STALE" as const,
              reviewable: false,
              note: "Záznam sa medzitým zmenil. Skontroluj tento návrh znova.",
            }];
          }
          return [candidate];
        });
        if (!nextFields.length) return [];
        return [{ ...item, canonicalUpdatedAt: result.updatedAt || item.canonicalUpdatedAt, fields: nextFields }];
      }));
      setMessage(result.decision === "ACCEPTED" ? "Údaj bol prevzatý." : "Návrh bol zamietnutý.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Návrh sa nepodarilo spracovať.");
    } finally {
      setBusy("");
    }
  }

  const openCount = suggestions.reduce((sum, suggestion) => sum + suggestion.fields.filter((field) => field.reviewable).length, 0);

  return <section className="admin-form-card" aria-labelledby="automation-update-review-heading">
    <div className="admin-card-heading">
      <div>
        <span>↻</span>
        <div>
          <h2 id="automation-update-review-heading">Doplnenia a zmeny</h2>
          <p>{openCount > 0 ? `Automatizácia našla ${openCount} ${openCount === 1 ? "údaj na kontrolu" : "údaje na kontrolu"}.` : "Automatizácia našla zmenu, ktorá vyžaduje manuálnu kontrolu."}</p>
        </div>
      </div>
    </div>
    {message && <p className="admin-flash" role="status">{message}</p>}
    {error && <p className="admin-flash admin-flash--error" role="alert">{error}</p>}
    <div style={{ display: "grid", gap: 16 }}>
      {suggestions.map((suggestion) => <div key={`${suggestion.origin}:${suggestion.id}`} style={{ border: "1px solid var(--admin-border, #d8ded9)", borderRadius: 14, padding: 16 }}>
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <strong>{suggestion.sourceLabel || "Zdroj"}</strong>
            {suggestion.sourceUrl && <> · <a href={suggestion.sourceUrl} target="_blank" rel="noreferrer">Otvoriť zdroj ↗</a></>}
          </div>
          <small>Nájdené: {detectedLabel(suggestion.detectedAt) || "—"}</small>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {suggestion.fields.map((field) => {
            const key = `${suggestion.origin}:${suggestion.id}:${field.field}`;
            return <article key={`${field.field}:${field.proposedValueHash}`} style={{ borderTop: "1px solid var(--admin-border, #e2e7e3)", paddingTop: 12 }}>
              <h3 style={{ margin: "0 0 8px" }}>{field.label}</h3>
              {conflictingFields.has(field.field) && <p className="admin-flash admin-flash--error">Zdroje sa nezhodujú. Porovnaj návrhy pred rozhodnutím.</p>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
                <div><small>Teraz</small><div><ValuePreview value={field.current} /></div></div>
                <div><small>Nájdené</small><div><ValuePreview value={field.proposed} /></div></div>
              </div>
              {field.note && <p style={{ marginBottom: 8 }}><small>{field.note}</small></p>}
              {field.reviewable && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <button
                  type="button"
                  className="admin-primary-action"
                  disabled={busy === key}
                  aria-label={`Prevziať navrhované pole ${field.label}`}
                  onClick={() => void decide(suggestion, field, "accept")}
                >{busy === key ? "Spracúvam…" : "Prevziať"}</button>
                <button
                  type="button"
                  className="admin-secondary-action"
                  disabled={busy === key}
                  aria-label={`Zamietnuť navrhované pole ${field.label}`}
                  onClick={() => void decide(suggestion, field, "reject")}
                >Zamietnuť</button>
              </div>}
            </article>;
          })}
        </div>
      </div>)}
    </div>
  </section>;
}
