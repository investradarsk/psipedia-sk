"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/icons";
import { getHelpCategory, helpCaseHref, type HelpCase } from "@/lib/help";

type StatusFilter = "all" | "published" | "draft";

export function AdminHelpDashboard({ initialItems }: { initialItems: HelpCase[] }) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("sk");
    return items.filter((item) => (status === "all" || item.status === status)
      && (!needle || `${item.title} ${item.organization} ${item.dogName} ${item.city} ${getHelpCategory(item.category)?.label}`.toLocaleLowerCase("sk").includes(needle)));
  }, [items, query, status]);

  async function removeItem(item: HelpCase) {
    if (!window.confirm(`Naozaj chceš natrvalo odstrániť „${item.title}“?`)) return;
    setDeletingId(item.id); setMessage("");
    try {
      const response = await fetch(`/api/admin/help/${item.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Prípad sa nepodarilo odstrániť.");
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setMessage("Prípad bol odstránený.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Prípad sa nepodarilo odstrániť."); }
    finally { setDeletingId(null); }
  }

  const published = items.filter((item) => item.status === "published").length;
  const urgent = items.filter((item) => item.status === "published" && item.urgent && !item.resolved).length;
  return <><section className="admin-stats" aria-label="Stav pomoci"><div><span>Všetky prípady</span><strong>{items.length}</strong></div><div><span>Publikované</span><strong>{published}</strong></div><div><span>Urgentné aktívne</span><strong>{urgent}</strong></div></section><section className="admin-panel"><div className="admin-toolbar"><label className="admin-search"><SearchIcon size={19} /><span className="sr-only">Hľadať prípad</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Názov, pes, mesto alebo organizácia" /></label><div className="admin-status-filter" aria-label="Filtrovať podľa stavu">{([["all", "Všetky"], ["published", "Publikované"], ["draft", "Koncepty"]] as const).map(([value, label]) => <button type="button" className={status === value ? "is-active" : ""} onClick={() => setStatus(value)} key={value}>{label}</button>)}</div></div>{message && <p className="admin-flash" role="status">{message}</p>}{visible.length ? <div className="admin-article-list">{visible.map((item) => { const category = getHelpCategory(item.category); return <article className="admin-article-row admin-help-row" key={item.id}><div className="admin-help-thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span aria-hidden="true">{category?.icon ?? "🐾"}</span>}</div><div className="admin-article-main"><div className="admin-article-tags"><span className={`admin-status admin-status--${item.status}`}>{item.status === "published" ? "Publikované" : "Koncept"}</span><span>{category?.label}</span>{item.verified && <span>Overené</span>}{item.urgent && !item.resolved && <span>Urgentné</span>}{item.resolved && <span>Vybavené</span>}</div><h2><Link href={`/admin/pomoc/${item.id}`}>{item.title}</Link></h2><p>{item.city} · {item.organization}{item.dogName ? ` · ${item.dogName}` : ""}</p></div><div className="admin-row-actions">{item.status === "published" && <Link href={helpCaseHref(item)} target="_blank">Pozrieť ↗</Link>}<Link className="admin-row-edit" href={`/admin/pomoc/${item.id}`}>Upraviť</Link><button type="button" disabled={deletingId === item.id} onClick={() => void removeItem(item)}>{deletingId === item.id ? "Odstraňujem…" : "Odstrániť"}</button></div></article>; })}</div> : <div className="admin-empty"><span>❤️</span><h2>Žiadne prípady</h2><p>Pridaj prvú adopciu, výzvu alebo overenú zbierku.</p></div>}</section></>;
}
