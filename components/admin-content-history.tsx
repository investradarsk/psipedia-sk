"use client";

import { useState } from "react";
import styles from "./admin-content-history.module.css";

type EntityType = "section" | "section_visual";
type Revision = {
  id: number; entityType: EntityType; entityKey: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor: string; occurredAt: string;
};

const fieldNames: Record<string, string> = {
  label: "Názov", eyebrow: "Krátky nadpis", description: "Popis",
  intro: "Úvodný text", hero_config_json: "Nastavenia hlavičky",
  subpages_json: "Podsekcie a ich poradie", position: "Poradie",
  visible: "Viditeľnosť", image_url: "Obrázok", image_key: "Kľúč obrázka",
  alt_text: "ALT text", desktop_x: "Desktop – vodorovne",
  desktop_y: "Desktop – zvisle", desktop_zoom: "Desktop – priblíženie",
  mobile_x: "Mobil – vodorovne", mobile_y: "Mobil – zvisle",
  mobile_zoom: "Mobil – priblíženie",
};

function shortValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "string") return value.length > 240 ? value.slice(0, 240) + "…" : value;
  return String(value);
}

function changes(revision: Revision) {
  const keys = Object.keys(fieldNames);
  return keys.filter(key => JSON.stringify(revision.before?.[key]) !== JSON.stringify(revision.after?.[key]))
    .map(key => ({ key, label: fieldNames[key], previous: revision.before?.[key], next: revision.after?.[key] }));
}

export function AdminContentHistory({
  entityType, entityKey, label, disabled = false,
}: {
  entityType: EntityType;
  entityKey: string;
  label: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [canRestore, setCanRestore] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ entityType, key: entityKey });
      const response = await fetch("/api/admin/content-history?" + params, { cache: "no-store" });
      const data = await response.json() as { revisions?: Revision[]; canRestore?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "Históriu sa nepodarilo načítať.");
      setRevisions(data.revisions ?? []);
      setCanRestore(data.canRestore === true);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "História nie je dostupná.");
    } finally { setBusy(false); }
  }

  async function restoreLast() {
    const revision = revisions[0];
    if (!revision || !canRestore || disabled || busy) return;
    if (!window.confirm(
      "Obnoviť poslednú zmenu: " + label + "?\n\n" +
      "Najprv sa znova skontroluje aktuálna verzia. Ak sa niečo medzičasom zmenilo, obnova sa odmietne. " +
      "Po obnove sa stránka načíta znova a neuložené zmeny v tomto editore sa stratia. Pokračovať?"
    )) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/content-history", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: "restore-last", entityType, key: entityKey, revisionId: revision.id }),
      });
      const payload = await response.json() as { restored?: boolean; error?: string };
      if (!response.ok || !payload.restored) throw new Error(payload.error || "Obnova nebola vykonaná.");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Obnova zlyhala.");
      await load();
    } finally { setBusy(false); }
  }

  return (
    <section className={styles.root} aria-label={"História: " + label}>
      <div className={styles.heading}>
        <div>
          <strong>História zmien – {label}</strong>
          <p>Zmeny sa sledujú od zavedenia histórie. Zobrazuje sa posledných 30 revízií.</p>
        </div>
        <button type="button" disabled={busy} onClick={() => {
          if (open) setOpen(false);
          else { setOpen(true); void load(); }
        }}>{open ? "Skryť históriu" : "Zobraziť históriu"}</button>
      </div>
      {open && (
        <div className={styles.body} aria-busy={busy}>
          {busy && <p role="status">Načítavam alebo kontrolujem zmeny…</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          {loaded && !revisions.length && <p>Zatiaľ tu nie sú uložené žiadne zmeny.</p>}
          {loaded && revisions.length > 0 && (
            <>
              <p className={styles.note}>Obnoviť možno iba poslednú revíziu, ak aktuálny obsah stále zodpovedá jej výsledku. Staršie verzie sú len na prezeranie.</p>
              <ol className={styles.timeline}>
                {revisions.map((revision, index) => {
                  const diffs = changes(revision);
                  return <li key={revision.id}>
                    <div className={styles.revision}>
                      <span><strong>{new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(revision.occurredAt))}</strong>
                        <small>{revision.operation === "INSERT" ? "Vytvorenie" : revision.operation === "DELETE" ? "Obnovenie predvoleného stavu" : "Úprava"} · {revision.actor}</small>
                      </span>
                      <button type="button" onClick={() => setSelected(selected === revision.id ? null : revision.id)}>
                        {selected === revision.id ? "Skryť rozdiely" : "Čo sa zmenilo"}
                      </button>
                    </div>
                    {selected === revision.id && (
                      <div className={styles.diff}>
                        {diffs.length ? diffs.map(diff => (
                          <div key={diff.key} className={styles.change}>
                            <strong>{diff.label}</strong>
                            <div><span>Pôvodne</span><p>{shortValue(diff.previous)}</p></div>
                            <div><span>Potom</span><p>{shortValue(diff.next)}</p></div>
                          </div>
                        )) : <p>Bez zmeny sledovaných polí.</p>}
                        <small>Pri dlhých textoch a JSON konfiguráciách je náhľad skrátený.</small>
                      </div>
                    )}
                    {index === 0 && <div className={styles.restore}>
                      <button type="button" disabled={busy || disabled || !canRestore} onClick={() => void restoreLast()}>
                        Vrátiť poslednú zmenu
                      </button>
                      {!canRestore && <small>Obnova nie je bezpečná: aktuálna verzia sa zmenila alebo poslednú zmenu nemožno vrátiť.</small>}
                      {disabled && <small>Najprv ulož alebo zruš rozpracované úpravy.</small>}
                    </div>}
                  </li>;
                })}
              </ol>
              <button type="button" disabled={busy} onClick={() => void load()}>Aktualizovať históriu</button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
