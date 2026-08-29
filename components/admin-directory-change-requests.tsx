"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { directoryCategoryLabel, type DirectoryProfileChangeRequest, type DirectoryProfileEditableData } from "@/lib/directory";

const statusLabels = { new: "Nový", approved: "Schválený", rejected: "Zamietnutý" } as const;
const commonLabels: Array<[keyof Omit<DirectoryProfileEditableData, "specialized">, string]> = [
  ["name", "Názov"], ["serviceType", "Typ služby"], ["city", "Mesto / obec"], ["district", "Okres"], ["region", "Kraj"],
  ["address", "Adresa"], ["phone", "Telefón"], ["email", "E-mail"], ["website", "Web"], ["facebook", "Facebook"],
  ["instagram", "Instagram"], ["description", "Popis"], ["services", "Ponúkané služby"], ["priceNote", "Orientačná cena"],
  ["coverage", "Lokalita / pokrytie"], ["online", "Dostupnosť online"],
];

function valueText(value: unknown) {
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "boolean") return value ? "Áno" : "Nie";
  return String(value ?? "").trim() || "—";
}

function fields(data: DirectoryProfileEditableData | null) {
  if (!data) return [];
  return [
    ...commonLabels.map(([key, label]) => ({ key: String(key), label, value: valueText(data[key]) })),
    ...Object.entries(data.specialized).map(([label, value]) => ({ key: `specialized.${label}`, label, value: valueText(value) })),
  ];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bratislava" }).format(new Date(value));
}

export function AdminDirectoryChangeRequests({ initialRequests }: { initialRequests: DirectoryProfileChangeRequest[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [status, setStatus] = useState<"all" | DirectoryProfileChangeRequest["status"]>("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const visible = useMemo(() => requests.filter((item) => status === "all" || item.status === status), [requests, status]);

  async function review(item: DirectoryProfileChangeRequest, nextStatus: "approved" | "rejected") {
    const question = nextStatus === "approved"
      ? "Označiť návrh ako schválený? Profil sa automaticky nezmení; údaje potom preneste cez editor profilu."
      : "Zamietnuť návrh? Verejný profil zostane bez zmeny.";
    if (!window.confirm(question)) return;
    setBusyId(item.id); setMessage("");
    try {
      const response = await fetch(`/api/admin/profile-change-requests/${item.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
      const payload = await response.json() as { request?: DirectoryProfileChangeRequest; error?: string };
      if (!response.ok || !payload.request) throw new Error(payload.error || "Návrh sa nepodarilo spracovať.");
      setRequests((current) => current.map((candidate) => candidate.id === item.id ? payload.request as DirectoryProfileChangeRequest : candidate));
      setMessage(nextStatus === "approved" ? "Návrh bol označený ako schválený. Profil nebol automaticky zmenený." : "Návrh bol zamietnutý. Profil zostal bez zmeny.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Návrh sa nepodarilo spracovať.");
    } finally { setBusyId(null); }
  }

  return <>
    <section className="admin-stats" aria-label="Stav návrhov"><div><span>Všetky návrhy</span><strong>{requests.length}</strong></div><div><span>Nové</span><strong>{requests.filter((item) => item.status === "new").length}</strong></div><div><span>Schválené</span><strong>{requests.filter((item) => item.status === "approved").length}</strong></div><div><span>Zamietnuté</span><strong>{requests.filter((item) => item.status === "rejected").length}</strong></div></section>
    <section className="admin-panel"><div className="admin-toolbar"><div className="admin-status-filter" aria-label="Filtrovať návrhy podľa stavu">{([['all','Všetky'],['new','Nové'],['approved','Schválené'],['rejected','Zamietnuté']] as const).map(([value,label]) => <button type="button" className={status === value ? "is-active" : ""} onClick={() => setStatus(value)} key={value}>{label}</button>)}</div></div>
      {message && <p className="admin-flash" role="status">{message}</p>}
      {visible.length ? <div className="admin-change-list">{visible.map((item) => {
        const current = fields(item.currentData);
        const proposed = fields(item.proposedData);
        const currentByKey = new Map(current.map((field) => [field.key, field.value]));
        const differences = proposed.filter((field) => currentByKey.get(field.key) !== field.value);
        return <article className={`admin-change-card is-${item.status}`} key={item.id}><header><div><span className={`admin-inquiry-status is-${item.status}`}>{statusLabels[item.status]}</span><span>{formatDate(item.createdAt)}</span></div><h2>{item.profileName}</h2><p>{directoryCategoryLabel(item.profileCategory)} · <Link href={`/adresar/${item.profileCategory}/${item.profileSlug}`} target="_blank">Verejný profil ↗</Link></p></header>
          <div className="admin-change-contact"><div><h3>Navrhovateľ</h3><strong>{item.requesterName}</strong><a href={`mailto:${item.requesterEmail}`}>{item.requesterEmail}</a>{item.requesterPhone && <a href={`tel:${item.requesterPhone}`}>{item.requesterPhone}</a>}{item.requesterRole && <span>{item.requesterRole}</span>}<small>Oprávnenie: {item.authorized ? "potvrdené" : "nepotvrdené"} · Spracovanie údajov: {item.consent ? "súhlas" : "bez súhlasu"}</small></div><div><h3>Poznámka k úprave</h3><p>{item.note || "Bez poznámky."}</p></div></div>
          <section className="admin-change-diff"><h3>Rozdiely</h3>{differences.length ? <div className="admin-change-table" role="table"><div className="is-heading" role="row"><strong>Pole</strong><strong>Aktuálne</strong><strong>Navrhované</strong></div>{differences.map((field) => <div role="row" key={field.key}><strong>{field.label}</strong><span>{currentByKey.get(field.key) ?? "—"}</span><span>{field.value}</span></div>)}</div> : <p>Navrhované verejné údaje sú zhodné s aktuálnym profilom.</p>}</section>
          <div className="admin-change-snapshots"><details><summary>Aktuálne údaje profilu</summary>{item.currentData ? <dl>{current.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl> : <p>Profil už nie je dostupný.</p>}</details><details><summary>Všetky navrhované údaje</summary><dl>{proposed.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl></details></div>
          <footer><Link className="admin-change-edit-link" href={`/admin/adresar/${item.profileId}`}>Otvoriť profil v editore</Link>{item.status === "new" && <><button type="button" disabled={busyId === item.id} onClick={() => void review(item, "rejected")}>Zamietnuť</button><button className="is-primary" type="button" disabled={busyId === item.id} onClick={() => void review(item, "approved")}>Schváliť návrh</button></>}{item.reviewedAt && <small>Posúdené {formatDate(item.reviewedAt)}{item.reviewedBy ? ` · ${item.reviewedBy}` : ""}</small>}</footer>
        </article>;
      })}</div> : <p className="admin-empty">V tomto stave nie sú žiadne návrhy úprav.</p>}
    </section>
  </>;
}
