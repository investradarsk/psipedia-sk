"use client";

import Link from "next/link";
import { AdminRecordId } from "./admin-record-id";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminInlineRowActions, AdminInlineCellInput } from "@/components/admin-inline-edit-controls";
import { AdminReviewCheckbox } from "@/components/admin-review-checkbox";
import { AdminNumberedPagination } from "@/components/admin-pagination";
import { AdminDataTableRegion } from "@/components/admin-data-table-region";
import { adminFilteredListHref } from "@/lib/admin-list-query";
import { dogReportStatusLabel, dogReportTypeShortLabel, type AdminDogReport } from "@/lib/lost-found-dogs";
import type { LostFoundStatus } from "@/lib/lost-found-lifecycle.js";
import styles from "./admin-lost-found.module.css";

type Counts = { total: number } & Record<LostFoundStatus, number>;
type Result = { items: AdminDogReport[]; total: number; page: number; pageSize: number; pages: number };
type Filters = { q: string; type: string; status: string; region: string; locality: string };
const tabs: Array<{ key: string; label: string; count: (counts: Counts) => number }> = [
  { key: "", label: "Všetky", count: (c) => c.total }, { key: "PENDING", label: "Čakajúce", count: (c) => c.PENDING },
  { key: "ACTIVE", label: "Aktívne", count: (c) => c.ACTIVE }, { key: "RESOLVED", label: "Vyriešené", count: (c) => c.RESOLVED },
  { key: "EXPIRED", label: "Expirované", count: (c) => c.EXPIRED }, { key: "REJECTED", label: "Zamietnuté", count: (c) => c.REJECTED },
  { key: "DRAFT", label: "Koncepty", count: (c) => c.DRAFT }, { key: "ARCHIVED", label: "Archív", count: (c) => c.ARCHIVED },
];
function href(filters: Filters, page = 1, status = filters.status) {
  return adminFilteredListHref("/admin/stratene-najdene", [
    ["q", filters.q],
    ["type", filters.type],
    ["status", status],
    ["region", filters.region],
    ["locality", filters.locality],
  ], page);
}
export function AdminLostFoundDashboard({ result, counts, filters, reviewedIds = [] }: { result: Result; counts: Counts; filters: Filters; reviewedIds?: number[] }) {
  const router = useRouter();
  const reviewed = new Set(reviewedIds);
  const [inlineDraft, setInlineDraft] = useState<{ id: number; key: string; expectedUpdatedAt: string; dogName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const viewKey = JSON.stringify([filters, result.page, result.items.map(item => item.id)]);
  const activeInline = inlineDraft?.key === viewKey && result.items.some(item => item.id === inlineDraft.id && item.updatedAt === inlineDraft.expectedUpdatedAt)
    ? inlineDraft : null;
  function beginInline(item: AdminDogReport) {
    if (busy || item.status === "ARCHIVED" || item.duplicateOfId !== null) return;
    setMessage("");
    setInlineDraft({ id: item.id, key: viewKey, expectedUpdatedAt: item.updatedAt, dogName: item.dogName || "" });
  }
  async function saveInline() {
    const draft = activeInline;
    if (!draft || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/lost-found/" + draft.id, {
        method: "PATCH", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set-inline-dog-name", dogName: draft.dogName || null,
          expectedUpdatedAt: draft.expectedUpdatedAt }),
      });
      const answer = await response.json() as { error?: string };
      if (!response.ok) throw new Error(answer.error || "Meno psa sa nepodarilo uložiť.");
      setInlineDraft(null);
      setMessage("Meno psa bolo aktualizované.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rýchlu úpravu sa nepodarilo uložiť.");
    } finally {
      setBusy(false);
    }
  }
  return <>
    <nav className={styles.tabs} aria-label="Stavy hlásení">{tabs.map((tab)=><Link key={tab.key||"all"} data-active={filters.status===tab.key} href={href(filters,1,tab.key)}>{tab.label} <strong>{tab.count(counts)}</strong></Link>)}</nav>
    <form className={styles.filters} method="get"><input name="q" defaultValue={filters.q} aria-label="Fulltext" placeholder="Meno, obec, farba, popis…"/><select name="type" defaultValue={filters.type} aria-label="Typ"><option value="">LOST + FOUND</option><option value="LOST">Stratené</option><option value="FOUND">Nájdené</option></select><input name="region" defaultValue={filters.region} aria-label="Kraj" placeholder="Kraj"/><input name="locality" defaultValue={filters.locality} aria-label="Okres alebo lokalita" placeholder="Okres / lokalita"/>{filters.status&&<input type="hidden" name="status" value={filters.status}/>}<button type="submit">Filtrovať</button></form>
    {message && <p role="status">{message}</p>}
    <AdminDataTableRegion className={styles.tableWrap} label="Zoznam hlásení"><table className={styles.table}><thead><tr><th scope="col">ID</th><th scope="col">Hlásenie</th><th scope="col">Typ</th><th scope="col">Stav</th><th scope="col">Lokalita</th><th scope="col">Dátum</th><th scope="col">Aktualizované</th><th scope="col">Akcie</th></tr></thead><tbody>{result.items.map((report)=><tr key={report.id}><td><AdminRecordId id={report.id} kind="lost-found" compact /></td><td><div className={styles.rowTitle}>{activeInline?.id === report.id
      ? <AdminInlineCellInput label={"Meno psa v hlásení " + report.id}
          value={activeInline.dogName} maxLength={120} disabled={busy}
          onChange={dogName => setInlineDraft(prev => prev ? { ...prev, dogName } : null)} />
      : <strong>{report.dogName||report.breed||`Hlásenie #${report.id}`}</strong>}<small>/{report.slug}</small>{report.duplicateOfId&&<small>Duplicita hlásenia #{report.duplicateOfId}</small>}</div></td><td><span className={styles.type}>{dogReportTypeShortLabel(report.type)}</span></td><td className={styles.status}>{dogReportStatusLabel[report.status]}</td><td>{report.city}{report.district?` · ${report.district}`:""}</td><td>{report.eventDate||"—"}</td><td>{new Date(report.updatedAt).toLocaleDateString("sk-SK")}</td><td><div className={styles.rowTitle}><AdminReviewCheckbox entityType="LOST_FOUND" entityId={report.id} initialReviewed={reviewed.has(report.id)} compact />{report.status !== "ARCHIVED" && report.duplicateOfId === null && <span className={styles.inlineDesktop}><AdminInlineRowActions
        editing={activeInline?.id === report.id} busy={busy}
        disabled={Boolean(activeInline && activeInline.id !== report.id)}
        onEdit={() => beginInline(report)}
        onSave={() => void saveInline()}
        onCancel={() => { if (!busy) setInlineDraft(null); }}
      /></span>}
      <Link className={styles.edit} href={`/admin/stratene-najdene/${report.id}`}>Upraviť →</Link></div></td></tr>)}{!result.items.length&&<tr><td colSpan={8}>Žiadne hlásenia pre zvolené filtre.</td></tr>}</tbody></table></AdminDataTableRegion>
    <AdminNumberedPagination page={result.page} totalPages={result.pages}
      hrefForPage={(page)=>href(filters,page)} className={styles.pagination} ariaLabel="Stránkovanie" />
  </>;
}
