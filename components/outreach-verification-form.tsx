"use client";

import { FormEvent, useState } from "react";

type Entity = {
  entityType: string;
  entityId: string;
  entityName: string;
  profileUrl: string;
  publicSnapshot: Record<string, unknown>;
};

function visibleValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "—";
}

export function OutreachVerificationForm({
  token,
  entities,
}: {
  token: string;
  entities: Entity[];
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const changes = entities
        .map((entity) => ({
          entityType: entity.entityType,
          entityId: entity.entityId,
          note: notes[entity.entityType + ":" + entity.entityId] ?? "",
        }))
        .filter((item) => item.note.trim());
      if (!changes.length) throw new Error("Doplň aspoň jednu opravu alebo informáciu.");
      const response = await fetch("/api/outreach/verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, changes }),
      });
      const payload = await response.json() as { result?: { submitted?: number }; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || "Návrh sa nepodarilo odoslať.");
      setResult({
        type: "success",
        text: "Ďakujeme. Návrh sme prijali. Verejné údaje sa nezmenili automaticky; redakcia ich najprv skontroluje.",
      });
    } catch (error) {
      setResult({ type: "error", text: error instanceof Error ? error.message : "Návrh sa nepodarilo odoslať." });
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {result && <p role="status" className={result.type === "success" ? "admin-flash" : "error-text"}>{result.text}</p>}
      {entities.map((entity) => {
        const key = entity.entityType + ":" + entity.entityId;
        return (
          <section key={key}>
            <h2>{entity.entityName}</h2>
            <p><a href={entity.profileUrl} target="_blank" rel="noreferrer">Otvoriť aktuálny verejný profil ↗</a></p>
            <dl>
              {Object.entries(entity.publicSnapshot).map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{visibleValue(value)}</dd></div>
              ))}
            </dl>
            <label>
              <strong>Čo treba opraviť alebo doplniť?</strong>
              <textarea
                rows={6}
                maxLength={5000}
                value={notes[key] ?? ""}
                onChange={(event) => setNotes((current) => ({ ...current, [key]: event.target.value }))}
                placeholder="Napíšte iba zmeny, ktoré sa týkajú tohto profilu. Ak sú údaje správne, môžete to stručne potvrdiť."
              />
            </label>
          </section>
        );
      })}
      <p>Odoslanie návrhu neznamená prevod vlastníctva profilu ani automatické publikovanie zmien.</p>
      <button className="button button--primary" type="submit" disabled={sending || result?.type === "success"}>
        {sending ? "Odosielam…" : "Odoslať návrh na kontrolu"}
      </button>
    </form>
  );
}
