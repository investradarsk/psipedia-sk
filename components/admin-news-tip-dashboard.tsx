"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/icons";
import {
  newsTipStatusOptions,
  newsTipTopicIcon,
  newsTipTopicLabel,
  type NewsTip,
  type NewsTipStatus,
} from "@/lib/news-tip";

type StatusFilter = "all" | NewsTipStatus;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bratislava" }).format(new Date(value));
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("sk-SK", { dateStyle: "long", timeZone: "Europe/Bratislava" }).format(new Date(`${value}T12:00:00Z`));
}

const statusLabels: Record<NewsTipStatus, string> = { new: "Nový", reviewing: "Overujem", used: "Spracovaný", dismissed: "Odložený" };

export function AdminNewsTipDashboard({ initialTips }: { initialTips: NewsTip[] }) {
  const [tips, setTips] = useState(initialTips);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [notes, setNotes] = useState<Record<number, string>>(() => Object.fromEntries(initialTips.map((tip) => [tip.id, tip.internalNote])));
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("sk");
    return tips.filter((tip) => (status === "all" || tip.status === status)
      && (!needle || `${tip.title} ${tip.summary} ${tip.location} ${tip.contactName} ${tip.contactEmail ?? ""} ${newsTipTopicLabel(tip.topic)}`.toLocaleLowerCase("sk").includes(needle)));
  }, [query, status, tips]);

  async function saveTip(tip: NewsTip, nextStatus: NewsTipStatus) {
    setBusyId(tip.id); setMessage("");
    try {
      const response = await fetch(`/api/admin/news-tips/${tip.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus, internalNote: notes[tip.id] ?? "" }),
      });
      const data = await response.json() as { tip?: NewsTip; error?: string };
      if (!response.ok || !data.tip) throw new Error(data.error || "Tip sa nepodarilo uložiť.");
      setTips((current) => current.map((item) => item.id === tip.id ? data.tip as NewsTip : item));
      setNotes((current) => ({ ...current, [tip.id]: data.tip?.internalNote ?? "" }));
      setMessage(nextStatus === tip.status ? "Poznámka bola uložená." : `Tip je označený ako „${statusLabels[nextStatus]}“.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tip sa nepodarilo uložiť.");
    } finally { setBusyId(null); }
  }

  async function removeTip(tip: NewsTip) {
    if (!window.confirm(`Naozaj chceš natrvalo vymazať tip „${tip.title}“?`)) return;
    setBusyId(tip.id); setMessage("");
    try {
      const response = await fetch(`/api/admin/news-tips/${tip.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Tip sa nepodarilo vymazať.");
      setTips((current) => current.filter((item) => item.id !== tip.id));
      setMessage("Tip bol vymazaný.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tip sa nepodarilo vymazať.");
    } finally { setBusyId(null); }
  }

  return (
    <>
      <section className="admin-stats" aria-label="Stav redakčných tipov">
        <div><span>Všetky tipy</span><strong>{tips.length}</strong></div>
        <div><span>Nové</span><strong>{tips.filter((tip) => tip.status === "new").length}</strong></div>
        <div><span>Spracované</span><strong>{tips.filter((tip) => tip.status === "used").length}</strong></div>
      </section>
      <section className="admin-panel">
        <div className="admin-toolbar">
          <label className="admin-search"><SearchIcon size={19} /><span className="sr-only">Hľadať tip</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Názov, téma, miesto alebo kontakt" /></label>
          <div className="admin-status-filter" aria-label="Filtrovať podľa stavu">
            <button type="button" className={status === "all" ? "is-active" : ""} onClick={() => setStatus("all")}>Všetky</button>
            {newsTipStatusOptions.map((option) => <button type="button" className={status === option.value ? "is-active" : ""} onClick={() => setStatus(option.value)} key={option.value}>{option.label}</button>)}
          </div>
        </div>
        {message && <p className="admin-flash" role="status">{message}</p>}
        {visible.length ? (
          <div className="admin-tip-list">
            {visible.map((tip) => (
              <article className={`admin-tip-card is-${tip.status}`} key={tip.id}>
                <header>
                  <span className="admin-tip-icon" aria-hidden="true">{newsTipTopicIcon(tip.topic)}</span>
                  <div><div><span className={`admin-tip-status is-${tip.status}`}>{statusLabels[tip.status]}</span><span>{formatDate(tip.createdAt)}</span></div><small>{newsTipTopicLabel(tip.topic)}</small><h2>{tip.title}</h2></div>
                </header>
                <div className="admin-tip-body">
                  <div className="admin-tip-story"><h3>Informácie od čitateľa</h3><p>{tip.summary}</p><dl>{tip.location && <><dt>Miesto</dt><dd>{tip.location}</dd></>}{tip.eventDate && <><dt>Dátum udalosti</dt><dd>{formatEventDate(tip.eventDate)}</dd></>}</dl>{tip.sourceUrl && <a href={tip.sourceUrl} target="_blank" rel="noreferrer">Otvoriť zaslaný zdroj ↗</a>}</div>
                  <aside><h3>Kontakt</h3>{tip.contactName || tip.contactEmail ? <>{tip.contactName && <strong>{tip.contactName}</strong>}{tip.contactEmail && <a href={`mailto:${tip.contactEmail}`}>{tip.contactEmail}</a>}<small>Potvrdenie informovania: {tip.consent ? "áno" : "nie"}</small></> : <p>Tip bol poslaný bez kontaktu.</p>}<Link href="/admin/novy">Vytvoriť novinku →</Link></aside>
                </div>
                <label className="admin-tip-note"><span>Interná poznámka</span><textarea value={notes[tip.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [tip.id]: event.target.value }))} maxLength={2000} rows={3} placeholder="Čo treba overiť, koho kontaktovať alebo prečo tip odkladáme…" /></label>
                <footer>
                  <button type="button" disabled={busyId === tip.id} onClick={() => void saveTip(tip, tip.status)}>Uložiť poznámku</button>
                  {newsTipStatusOptions.filter((option) => option.value !== tip.status).map((option) => <button className={option.value === "used" ? "is-primary" : ""} type="button" disabled={busyId === tip.id} onClick={() => void saveTip(tip, option.value)} key={option.value}>{option.label}</button>)}
                  <button className="is-danger" type="button" disabled={busyId === tip.id} onClick={() => void removeTip(tip)}>Vymazať</button>
                </footer>
              </article>
            ))}
          </div>
        ) : <div className="admin-empty"><span>💡</span><h2>Žiadne tipy</h2><p>Nové námety od čitateľov sa zobrazia práve tu.</p></div>}
      </section>
    </>
  );
}
