"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminCommunityPagination, COMMUNITY_PAGE_SIZE } from "@/components/admin-community-pagination";
import { directoryCategoryLabel, type DirectoryProfileChangeRequest, type DirectoryProfileEditableData } from "@/lib/directory";

const statusLabels = { new: "Nový", approved: "Schválený", rejected: "Zamietnutý" } as const;
const commonLabels: Array<[keyof Omit<DirectoryProfileEditableData, "specialized">, string]> = [
  ["name", "Názov"], ["serviceType", "Typ služby"], ["city", "Mesto / obec"], ["district", "Okres"], ["region", "Kraj"],
  ["address", "Adresa"], ["phone", "Telefón"], ["email", "E-mail"], ["website", "Web"], ["facebook", "Facebook"],
  ["instagram", "Instagram"], ["description", "Popis"], ["services", "Ponúkané služby"], ["priceNote", "Orientačná cena"],
  ["coverage", "Lokalita / pokrytie"],
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
  const requests = initialRequests;
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"all" | DirectoryProfileChangeRequest["status"]>("all");
  const visible = useMemo(() => requests.filter((item) => status === "all" || item.status === status), [requests, status]);

  return <>
    <section className="admin-panel" data-retired-public-change-requests role="status">
      <p><strong>Historické návrhy – iba na čítanie.</strong> Verejné návrhy už neprijímame ani neschvaľujeme. Aktuálne údaje upravuje oprávnený správca cez Partner účet.</p>
    </section>
    <section className="admin-stats" aria-label="Stav návrhov" data-admin-community-metrics><div><span>Všetky návrhy</span><strong>{requests.length}</strong></div><div><span>Nové</span><strong>{requests.filter((item) => item.status === "new").length}</strong></div><div><span>Schválené</span><strong>{requests.filter((item) => item.status === "approved").length}</strong></div><div><span>Zamietnuté</span><strong>{requests.filter((item) => item.status === "rejected").length}</strong></div></section>
    <section className="admin-panel" data-admin-content-module="community-profile-suggestions"><div className="admin-toolbar"><div className="admin-status-filter" aria-label="Filtrovať návrhy podľa stavu">{([['all','Všetky'],['new','Nové'],['approved','Schválené'],['rejected','Zamietnuté']] as const).map(([value,label]) => <button type="button" className={status === value ? "is-active" : ""} onClick={() => { setStatus(value); setPage(1); }} key={value}>{label}</button>)}</div></div>
      {visible.length ? <div className="admin-change-list" data-admin-community-list>{visible.slice((Math.min(page, Math.max(1, Math.ceil(visible.length / COMMUNITY_PAGE_SIZE))) - 1) * COMMUNITY_PAGE_SIZE, Math.min(page, Math.max(1, Math.ceil(visible.length / COMMUNITY_PAGE_SIZE))) * COMMUNITY_PAGE_SIZE).map((item) => {
        const current = fields(item.currentData);
        const proposed = fields(item.proposedData);
        const currentByKey = new Map(current.map((field) => [field.key, field.value]));
        const differences = proposed.filter((field) => currentByKey.get(field.key) !== field.value);
        return <article id={`navrh-${item.id}`} className={`admin-change-card is-${item.status}`} key={item.id} data-admin-community-card><header><div><span className={`admin-inquiry-status is-${item.status}`}>{statusLabels[item.status]}</span><span>{formatDate(item.createdAt)}</span></div><h2>{item.profileName}</h2><p>{directoryCategoryLabel(item.profileCategory)} · <Link href={`/adresar/${item.profileCategory}/${item.profileSlug}`} target="_blank">Verejný profil ↗</Link></p></header>
          <div className="admin-change-contact"><div><h3>Navrhovateľ</h3><strong>{item.requesterName}</strong><a href={`mailto:${item.requesterEmail}`}>{item.requesterEmail}</a>{item.requesterPhone && <a href={`tel:${item.requesterPhone}`}>{item.requesterPhone}</a>}{item.requesterRole && <span>{item.requesterRole}</span>}<small>Oprávnenie: {item.authorized ? "potvrdené" : "nepotvrdené"} · Spracovanie údajov: {item.consent ? "súhlas" : "bez súhlasu"}</small></div><div><h3>Poznámka k úprave</h3><p>{item.note || "Bez poznámky."}</p></div></div>
          <section className="admin-change-diff"><h3>Rozdiely</h3>{differences.length ? <div className="admin-change-table" role="table"><div className="is-heading" role="row"><strong>Pole</strong><strong>Aktuálne</strong><strong>Navrhované</strong></div>{differences.map((field) => <div role="row" key={field.key}><strong>{field.label}</strong><span>{currentByKey.get(field.key) ?? "—"}</span><span>{field.value}</span></div>)}</div> : <p>Navrhované verejné údaje sú zhodné s aktuálnym profilom.</p>}</section>
          <div className="admin-change-snapshots"><details><summary>Aktuálne údaje profilu</summary>{item.currentData ? <dl>{current.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl> : <p>Profil už nie je dostupný.</p>}</details><details><summary>Všetky navrhované údaje</summary><dl>{proposed.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl></details></div>
          <footer><Link className="admin-change-edit-link" href={`/admin/adresar/${item.profileId}`}>Otvoriť profil v editore</Link>{item.reviewedAt && <small>Posúdené {formatDate(item.reviewedAt)}{item.reviewedBy ? ` · ${item.reviewedBy}` : ""}</small>}</footer>
        </article>;
      })}</div> : <div className="admin-empty"><p>{requests.length ? "Žiadne návrhy pre zvolený stav." : "Zatiaľ neprišiel žiadny návrh úpravy."}</p>{requests.length > 0 && <button type="button" onClick={() => { setStatus("all"); setPage(1); }}>Zrušiť filtre</button>}</div>}
    </section>
    <AdminCommunityPagination total={visible.length} page={page} onPageChange={setPage} />

  </>;
}
