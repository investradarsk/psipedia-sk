"use client";

import Link from "next/link";
import { AdminRecordBulkDelete } from "@/components/admin-record-bulk-delete";
import { AdminRecordTable } from "./admin-record-table";
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
type Filters = { q: string; type: string; status: string; region: string; locality: string; sort?: "priority" | "name" | "city" | "status" | "date" | "updated"; direction?: "asc" | "desc" };
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
    ["sort", filters.sort && filters.sort !== "priority" ? filters.sort : ""],
    ["direction", filters.direction && filters.direction !== "desc" ? filters.direction : ""],
  ], page);
}
export function AdminLostFoundDashboard({ result, counts, filters, reviewedIds = [] }: { result: Result; counts: Counts | null; filters: Filters; reviewedIds?: number[] | null }) {
  const router = useRouter();
  const reviewed = reviewedIds === null ? null : new Set(reviewedIds);
  const [inlineDraft, setInlineDraft] = useState<{ id: number; key: string; expectedUpdatedAt: string; dogName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
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
    <nav className={styles.tabs} aria-label="Stavy hlásení">{tabs.map((tab)=><Link key={tab.key||"all"} data-active={filters.status===tab.key} href={href(filters,1,tab.key)}>{tab.label} <strong>{counts ? tab.count(counts) : "—"}</strong></Link>)}</nav>
    <form className={styles.filters} method="get"><input name="q" defaultValue={filters.q} aria-label="Fulltext" placeholder="Meno, obec, farba, popis…"/><select name="type" defaultValue={filters.type} aria-label="Typ"><option value="">LOST + FOUND</option><option value="LOST">Stratené</option><option value="FOUND">Nájdené</option></select><input name="region" defaultValue={filters.region} aria-label="Kraj" placeholder="Kraj"/><input name="locality" defaultValue={filters.locality} aria-label="Okres alebo lokalita" placeholder="Okres / lokalita"/>{filters.status&&<input type="hidden" name="status" value={filters.status}/>}<button type="submit">Filtrovať</button></form>
    {message && <p role="status">{message}</p>}
    {selected.size > 0 && <div className={styles.gridSelection}>
      <strong>Označené: {selected.size}</strong>
      <button type="button" onClick={() => setSelected(new Set())}>Zrušiť výber</button>
      <AdminRecordBulkDelete kind="lost-found" selectedIds={[...selected]} disabled={busy}
        onFinished={ids => {
          setSelected(current => new Set([...current].filter(id => !ids.includes(id))));
          router.refresh();
        }} />
    </div>}
    <AdminDataTableRegion className={styles.tableWrap} label="Zoznam hlásení">
      <AdminRecordTable
        rows={result.items}
        label="Stratené a nájdené psy"
        stretch serverSorted busy={busy}
        rowDataAttribute="data-admin-lost-found-row"
        serverSorting={{
          id: filters.sort ?? "priority",
          desc: filters.direction !== "asc",
          allowedIds: ["name", "city", "status", "date", "updated"],
          onChange: next => {
            if (!["name", "city", "status", "date", "updated"].includes(next.id)) return;
            router.push(href({ ...filters, sort: next.id as Filters["sort"], direction: next.desc ? "desc" : "asc" }, 1));
          },
        }}
        selection={{
          selectedIds: [...selected],
          labelForRow: report => `Označiť hlásenie ${report.dogName || report.breed || report.id}`,
          onChange: ids => setSelected(new Set(ids)),
        }}
        columns={[
          { id: "name", label: "Hlásenie", width: 275,
            sortValue: report => report.dogName || report.breed,
            cell: report => <div className={styles.rowTitle}>
              {activeInline?.id === report.id
                ? <AdminInlineCellInput label={"Meno psa v hlásení " + report.id}
                    value={activeInline.dogName} maxLength={120} disabled={busy}
                    onChange={dogName => setInlineDraft(prev => prev ? { ...prev, dogName } : null)} />
                : <strong><Link href={`/admin/stratene-najdene/${report.id}`}>{report.dogName || report.breed || `Hlásenie #${report.id}`}</Link></strong>}
              <small>/{report.slug}</small>
              {report.duplicateOfId && <small>Duplicita hlásenia #{report.duplicateOfId}</small>}
            </div> },
          { id: "type", label: "Typ", width: 120, cell: report => dogReportTypeShortLabel(report.type) },
          { id: "status", label: "Stav", width: 155, sortValue: report => report.status,
            cell: report => dogReportStatusLabel[report.status] },
          { id: "city", label: "Lokalita", width: 165, sortValue: report => report.city,
            cell: report => report.city + (report.district ? " · " + report.district : "") },
          { id: "date", label: "Dátum udalosti", width: 140, sortValue: report => report.eventDate,
            cell: report => report.eventDate || "—" },
          { id: "updated", label: "Aktualizované", width: 142, sortValue: report => report.updatedAt,
            cell: report => new Date(report.updatedAt).toLocaleDateString("sk-SK") },
          { id: "actions", label: "Akcie", width: 245, cell: report =>
            <div className={styles.gridRowActions}>
              {reviewed
                ? <AdminReviewCheckbox entityType="LOST_FOUND" entityId={report.id} initialReviewed={reviewed.has(report.id)} compact />
                : <span aria-label="Stav redakčnej kontroly nedostupný">—</span>}
              {report.status !== "ARCHIVED" && report.duplicateOfId === null && <span className={styles.inlineDesktop}>
                <AdminInlineRowActions editing={activeInline?.id === report.id} busy={busy}
                  disabled={Boolean(activeInline && activeInline.id !== report.id)}
                  onEdit={() => beginInline(report)} onSave={() => void saveInline()}
                  onCancel={() => { if (!busy) setInlineDraft(null); }} />
              </span>}
              <Link className={styles.edit} href={`/admin/stratene-najdene/${report.id}`}>Upraviť →</Link>
            </div> },
        ]}
      />
      {!result.items.length && <p role="status">Žiadne hlásenia pre zvolené filtre.</p>}
    </AdminDataTableRegion>
    <AdminNumberedPagination page={result.page} totalPages={result.pages}
      hrefForPage={(page)=>href(filters,page)} className={styles.pagination} ariaLabel="Stránkovanie" />
  </>;
}
