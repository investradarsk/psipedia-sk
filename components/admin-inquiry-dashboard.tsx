"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/icons";
import { directoryCategoryLabel, type DirectoryInquiry, type DirectoryInquiryStatus } from "@/lib/directory";

type StatusFilter = "all" | DirectoryInquiryStatus;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bratislava" }).format(new Date(value));
}

const statusLabels: Record<DirectoryInquiryStatus, string> = { new: "Nový", read: "Prečítaný", resolved: "Vybavený" };

export function AdminInquiryDashboard({ initialInquiries }: { initialInquiries: DirectoryInquiry[] }) {
  const [inquiries, setInquiries] = useState(initialInquiries);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("sk");
    return inquiries.filter((inquiry) => (status === "all" || inquiry.status === status)
      && (!needle || `${inquiry.profileName} ${inquiry.senderName} ${inquiry.senderEmail} ${inquiry.senderPhone} ${inquiry.message}`.toLocaleLowerCase("sk").includes(needle)));
  }, [inquiries, query, status]);

  async function updateStatus(inquiry: DirectoryInquiry, nextStatus: DirectoryInquiryStatus) {
    setBusyId(inquiry.id); setMessage("");
    try {
      const response = await fetch(`/api/admin/inquiries/${inquiry.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
      const data = await response.json() as { inquiry?: DirectoryInquiry; error?: string };
      if (!response.ok || !data.inquiry) throw new Error(data.error || "Stav sa nepodarilo zmeniť.");
      setInquiries((current) => current.map((item) => item.id === inquiry.id ? data.inquiry as DirectoryInquiry : item));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Stav sa nepodarilo zmeniť."); }
    finally { setBusyId(null); }
  }

  async function removeInquiry(inquiry: DirectoryInquiry) {
    if (!window.confirm(`Naozaj chceš natrvalo vymazať dopyt od ${inquiry.senderName}?`)) return;
    setBusyId(inquiry.id); setMessage("");
    try {
      const response = await fetch(`/api/admin/inquiries/${inquiry.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Dopyt sa nepodarilo vymazať.");
      setInquiries((current) => current.filter((item) => item.id !== inquiry.id));
      setMessage("Dopyt bol vymazaný.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Dopyt sa nepodarilo vymazať."); }
    finally { setBusyId(null); }
  }

  const newCount = inquiries.filter((item) => item.status === "new").length;
  return (
    <>
      <section className="admin-stats" aria-label="Stav dopytov"><div><span>Všetky dopyty</span><strong>{inquiries.length}</strong></div><div><span>Nové</span><strong>{newCount}</strong></div><div><span>Vybavené</span><strong>{inquiries.filter((item) => item.status === "resolved").length}</strong></div></section>
      <section className="admin-panel">
        <div className="admin-toolbar"><label className="admin-search"><SearchIcon size={19} /><span className="sr-only">Hľadať dopyt</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Meno, e-mail, profil alebo správa" /></label><div className="admin-status-filter" aria-label="Filtrovať podľa stavu">{([ ["all", "Všetky"], ["new", "Nové"], ["read", "Prečítané"], ["resolved", "Vybavené"] ] as const).map(([value, label]) => <button type="button" className={status === value ? "is-active" : ""} onClick={() => setStatus(value)} key={value}>{label}</button>)}</div></div>
        {message && <p className="admin-flash" role="status">{message}</p>}
        {visible.length ? <div className="admin-inquiry-list">{visible.map((inquiry) => <article className={`admin-inquiry-card is-${inquiry.status}`} key={inquiry.id}>
          <header><div><span className={`admin-inquiry-status is-${inquiry.status}`}>{statusLabels[inquiry.status]}</span><span>{formatDate(inquiry.createdAt)}</span></div><strong>{inquiry.senderName}</strong><p>Dopyt pre <Link href={`/adresar/${inquiry.profileCategory}/${inquiry.profileSlug}`} target="_blank">{inquiry.profileName} ↗</Link> · {directoryCategoryLabel(inquiry.profileCategory)}</p></header>
          <div className="admin-inquiry-body"><div><h3>Správa</h3><p>{inquiry.message}</p>{inquiry.dogInfo && <p className="admin-inquiry-dog"><strong>Pes:</strong> {inquiry.dogInfo}</p>}</div><aside><h3>Kontakt na záujemcu</h3><a href={`mailto:${inquiry.senderEmail}`}>{inquiry.senderEmail}</a>{inquiry.senderPhone && <a href={`tel:${inquiry.senderPhone}`}>{inquiry.senderPhone}</a>}{inquiry.recipientEmail && <><h3 className="admin-inquiry-recipient-heading">Interný kontakt profilu</h3><a href={`mailto:${inquiry.recipientEmail}`}>{inquiry.recipientEmail}</a></>}<small>Potvrdenie informovania: {inquiry.consent ? "áno" : "nie"}</small></aside></div>
          <footer>{inquiry.status !== "new" && <button type="button" disabled={busyId === inquiry.id} onClick={() => void updateStatus(inquiry, "new")}>Označiť ako nový</button>}{inquiry.status !== "read" && <button type="button" disabled={busyId === inquiry.id} onClick={() => void updateStatus(inquiry, "read")}>Prečítané</button>}{inquiry.status !== "resolved" && <button className="is-primary" type="button" disabled={busyId === inquiry.id} onClick={() => void updateStatus(inquiry, "resolved")}>Vybavené</button>}<button className="is-danger" type="button" disabled={busyId === inquiry.id} onClick={() => void removeInquiry(inquiry)}>Vymazať</button></footer>
        </article>)}</div> : <div className="admin-empty"><span>✉️</span><h2>Žiadne dopyty</h2><p>Nové správy z profilov sa zobrazia práve tu.</p></div>}
      </section>
    </>
  );
}
