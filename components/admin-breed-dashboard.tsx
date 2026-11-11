"use client";

import Link from "next/link";
import { AdminRecordTable } from "./admin-record-table";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ManagedBreedSummary } from "@/lib/breed-store";
import { AdminInlineRowActions, AdminInlineCellInput } from "@/components/admin-inline-edit-controls";
import {
  adminBreedCounts,
  defaultAdminBreedFilters,
  filterAdminBreeds,
  paginateAdminBreeds,
  sortAdminBreedRows,
  type AdminBreedSort,
  type AdminBreedFilters,
} from "@/lib/admin-breeds";
import {
  AdminActionButton,
  AdminBulkActionToolbar,
  AdminDestructiveConfirmDialog,
  AdminModalDialog,
} from "@/components/admin-interaction-system";
import { SearchIcon } from "./icons";
import styles from "./admin-breed-dashboard.module.css";

type BulkStatus = "draft" | "published";

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function AdminBreedDashboard({ initialBreeds }: { initialBreeds: ManagedBreedSummary[] }) {
  const [breeds, setBreeds] = useState(initialBreeds);
  const [filters, setFilters] = useState<AdminBreedFilters>(defaultAdminBreedFilters);
  const [requestedPage, setRequestedPage] = useState(1);
  const [breedSort, setBreedSort] = useState<AdminBreedSort>({ id: "fci", desc: false });
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManagedBreedSummary | null>(null);
  const [bulkStatus, setBulkStatus] = useState<BulkStatus | null>(null);
  const [inlineDraft, setInlineDraft] = useState<{ id: number; updatedAt: string; intro: string } | null>(null);

  // E2E and assistive integrations can wait for interactive readiness before
  // changing controlled filters; SSR markup alone does not attach handlers.
  useEffect(() => {
    panelRef.current?.setAttribute("data-admin-breed-hydrated", "true");
    return () => panelRef.current?.removeAttribute("data-admin-breed-hydrated");
  }, []);

  const visible = useMemo(() => filterAdminBreeds(breeds, filters), [breeds, filters]);
  // Sort all matching breeds before paging. Sorting only a rendered 50-row slice is incorrect.
  const sortedVisible = useMemo(() => sortAdminBreedRows(visible, breedSort), [visible, breedSort]);
  const counts = useMemo(() => adminBreedCounts(breeds), [breeds]);
  const pageData = useMemo(() => paginateAdminBreeds(sortedVisible, requestedPage), [sortedVisible, requestedPage]);
  const fciGroups = useMemo(
    () => [...new Map(breeds.map((breed) => [breed.fciGroup, breed.group])).entries()].sort((a, b) => a[0] - b[0]),
    [breeds],
  );
  const sections = useMemo(
    () => [...new Set(breeds.filter((breed) => filters.fciGroup === "all" || breed.fciGroup === Number(filters.fciGroup)).map((breed) => breed.fciSection).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sk")),
    [breeds, filters.fciGroup],
  );
  const origins = useMemo(
    () => [...new Set(breeds.map((breed) => breed.origin).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sk")),
    [breeds],
  );
  // “Select visible” means the current rendered page; selected breeds on
  // other pages remain selected for the existing guarded bulk action.
  const visibleIds = pageData.items.map((breed) => breed.id);
  const activeInline = inlineDraft && pageData.items.some(item =>
    item.id === inlineDraft.id && item.updatedAt === inlineDraft.updatedAt) ? inlineDraft : null;

  function beginInline(breed: ManagedBreedSummary) {
    if (busy) return;
    setMessage("");
    setInlineDraft({ id: breed.id, updatedAt: breed.updatedAt, intro: breed.intro ?? "" });
  }

  async function saveInline() {
    const draft = activeInline;
    if (!draft || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/breeds/${draft.id}`, {
        method: "PATCH", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "set-inline-intro", intro: draft.intro,
          expectedUpdatedAt: draft.updatedAt,
        }),
      });
      const answer = await response.json() as {
        error?: string; breed?: { intro: string; updatedAt: string };
        notionEditorialWriteback?: { status: string };
      };
      if (!response.ok || !answer.breed) throw new Error(answer.error || "Úvod sa nepodarilo uložiť.");
      setBreeds(current => current.map(item => item.id === draft.id
        ? { ...item, intro: answer.breed!.intro, updatedAt: answer.breed!.updatedAt } : item));
      setInlineDraft(null);
      setMessage(answer.notionEditorialWriteback?.status === "blocked"
        ? "Úvod bol uložený. Synchronizácia s Notion si vyžaduje kontrolu."
        : "Úvod plemena bol uložený.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rýchlu úpravu sa nepodarilo uložiť.");
    } finally {
      setBusy(false);
    }
  }
  const selectedBreeds = breeds.filter((breed) => selected.has(breed.id));
  const bulkTargets = bulkStatus ? selectedBreeds.filter((breed) => breed.status !== bulkStatus) : [];

  function changePage(nextPage: number) {
    setRequestedPage(nextPage);
    // A long page may have placed the pager far below its first row.
    // Return keyboard and touch users to the next page’s first rows.
    requestAnimationFrame(() => listRef.current?.scrollIntoView({ block: "start", behavior: "auto" }));
  }

  function changeFilter(key: keyof AdminBreedFilters, value: string) {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === "fciGroup") next.fciSection = "all";
      return next;
    });
    setSelected(new Set());
    setRequestedPage(1);
  }

  async function removeBreed() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/breeds/${deleteTarget.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Plemeno sa nepodarilo odstrániť.");
      setBreeds((items) => items.filter((item) => item.id !== deleteTarget.id));
      setSelected((current) => {
        const next = new Set(current);
        next.delete(deleteTarget.id);
        return next;
      });
      setMessage("Plemeno bolo odstránené.");
      setDeleteTarget(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Plemeno sa nepodarilo odstrániť.");
    } finally {
      setBusy(false);
    }
  }

  async function applyBulkStatus() {
    if (!bulkStatus || !bulkTargets.length || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/breeds/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: bulkStatus,
          confirmedCount: bulkTargets.length,
          breeds: bulkTargets.map(({ id, status, updatedAt }) => ({ id, status, updatedAt })),
        }),
      });
      const data = await response.json() as { changed?: number; updatedAt?: string; error?: string };
      if (!response.ok || !data.updatedAt) throw new Error(data.error || "Hromadná zmena zlyhala.");
      setBreeds((items) => items.map((breed) => selected.has(breed.id) && breed.status !== bulkStatus
        ? { ...breed, status: bulkStatus, updatedAt: data.updatedAt! }
        : breed));
      setSelected(new Set());
      setMessage(`Publikačný stav bol zmenený pre ${data.changed ?? bulkTargets.length} plemien.`);
      setBulkStatus(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Hromadná zmena zlyhala.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <section className="admin-stats" aria-label="Stav atlasu">
      <div><span>Všetky plemená</span><strong>{counts.all}</strong></div>
      <div><span>Publikované</span><strong>{counts.published}</strong></div>
      <div><span>Koncepty</span><strong>{counts.draft}</strong></div>
      <div><span>Obsahovo neúplné</span><strong>{counts.incomplete}</strong></div>
    </section>

    <section ref={panelRef} className="admin-panel">
      <div className={styles.filters} aria-label="Filtre plemien">
        <label className="admin-search">
          <span>Hľadať</span>
          <div><SearchIcon size={18}/><input value={filters.query} onChange={(event) => changeFilter("query", event.target.value)} placeholder="Názov, slug, pôvod, FCI…" title="Vyhľadáva aj podľa presného Admin ID, napr. 1842"/></div>
        </label>
        <label><span>FCI skupina</span><select value={filters.fciGroup} onChange={(event) => changeFilter("fciGroup", event.target.value)}><option value="all">Všetky skupiny</option>{fciGroups.map(([number, label]) => <option value={number} key={number}>FCI {number} · {label}</option>)}</select></label>
        <label><span>FCI sekcia</span><select value={filters.fciSection} onChange={(event) => changeFilter("fciSection", event.target.value)}><option value="all">Všetky sekcie</option>{sections.map((section) => <option value={section} key={section}>{section}</option>)}</select></label>
        <label><span>Pôvod</span><select value={filters.origin} onChange={(event) => changeFilter("origin", event.target.value)}><option value="all">Všetky krajiny</option>{origins.map((origin) => <option value={origin} key={origin}>{origin}</option>)}</select></label>
        <label><span>Publikovanie</span><select value={filters.status} onChange={(event) => changeFilter("status", event.target.value)}><option value="all">Všetky stavy</option><option value="published">Publikované</option><option value="draft">Koncepty</option></select></label>
        <label><span>Úplnosť</span><select value={filters.completeness} onChange={(event) => changeFilter("completeness", event.target.value)}><option value="all">Všetky profily</option><option value="incomplete">Len neúplné</option><option value="complete">Bez detegovaných medzier</option></select></label>
        <div className={styles.filterActions}><AdminActionButton variant="link" onClick={() => { setFilters(defaultAdminBreedFilters); setSelected(new Set()); setRequestedPage(1); }}>Zrušiť filtre</AdminActionButton></div>
      </div>

      <div className={styles.resultBar}>
        <strong role="status">Nájdené: {visible.length} z {breeds.length} · Zobrazené {pageData.from}–{pageData.to}</strong>
        <span>Výber platí pre záznamy na aktuálnej strane. Označené spolu: {selected.size}</span>
      </div>

      {selected.size > 500 && <p role="alert">V jednej dávke vyber najviac 500 plemien.</p>}
      {!!selected.size && selected.size <= 500 && <AdminBulkActionToolbar
        selectedCount={selected.size}
        selectionDescription="Mení sa iba publikačný stav; odborný obsah zostane bez zmeny."
        primaryAction={<AdminActionButton variant="primary" disabled={busy} onClick={() => setBulkStatus("published")}>Publikovať</AdminActionButton>}
        destructiveAction={<AdminActionButton variant="destructive" disabled={busy} onClick={() => setBulkStatus("draft")}>Stiahnuť do konceptu</AdminActionButton>}
        onClear={() => setSelected(new Set())}
      />}

      {message && <p className="admin-flash" role="status">{message}</p>}

      <div ref={listRef} aria-busy={busy}>
        {pageData.items.length > 0 ? <AdminRecordTable
          rows={pageData.items}
          label="Plemená"
          busy={busy}
          rowDataAttribute="data-admin-breed-row"
          stretch
          serverSorting={{
            id: breedSort.id,
            desc: breedSort.desc,
            allowedIds: ["name", "fci", "origin", "status", "updated"],
            onChange: next => {
              if (next.id !== "name" && next.id !== "fci" && next.id !== "origin" && next.id !== "status" && next.id !== "updated") return;
              setBreedSort({ id: next.id, desc: next.desc });
              setRequestedPage(1);
            },
          }}
          selection={{
            selectedIds: [...selected].filter(id => visibleIds.includes(id)),
            onChange: ids => setSelected(current => new Set([
              ...[...current].filter(id => !visibleIds.includes(id)),
              ...ids,
            ])),
            labelForRow: breed => `Vybrať ${breed.name}`,
          }}
          columns={[
            { id: "photo", label: "Foto", width: 75, cell: breed =>
              <span className={styles.gridThumb}>{breed.image
                ? <img src={breed.image} alt="" loading="lazy" decoding="async" />
                : <span>—</span>}</span> },
            { id: "name", label: "Plemeno", width: 260, sortValue: breed => breed.name,
              cell: breed => <div className={styles.gridIdentity}>
                <strong><Link prefetch={false} href={`/admin/plemena/${breed.id}`}>{breed.name}</Link></strong>
                <small title={breed.slug}>/{breed.slug}</small>
              </div> },
            { id: "fci", label: "FCI", width: 125, sortValue: breed => breed.fciGroup,
              cell: breed => <span>Sk. {breed.fciGroup}{breed.fciNumber ? ` · č. ${breed.fciNumber}` : ""}</span> },
            { id: "origin", label: "Pôvod", width: 145, sortValue: breed => breed.origin,
              cell: breed => breed.origin || "—" },
            { id: "status", label: "Publikovanie", width: 130, sortValue: breed => breed.status,
              cell: breed => <span className={`admin-status admin-status--${breed.status}`}>
                {breed.status === "published" ? "Publikované" : "Koncept"}</span> },
            { id: "completeness", label: "Úplnosť", width: 180,
              cell: breed => breed.completenessIssues.length
                ? <span className={styles.issue} data-breed-completeness
                    title={breed.completenessIssues.join(", ")}>
                    {breed.completenessIssues.length} nedostatkov · {breed.completenessIssues[0]}</span>
                : <span className={styles.complete}>Bez detegovaných medzier</span> },
            { id: "intro", label: "Úvod", width: 255, cell: breed =>
              activeInline?.id === breed.id
                ? <AdminInlineCellInput label={`Úvod plemena ${breed.name}`} value={activeInline.intro}
                    maxLength={1000} disabled={busy}
                    onChange={intro => setInlineDraft(current => current ? { ...current, intro } : null)} />
                : <span className={styles.inlineDesktop} title={breed.intro || ""}>{breed.intro || "Úvod nie je vyplnený."}</span> },
            { id: "updated", label: "Upravené", width: 155, sortValue: breed => breed.updatedAt,
              cell: breed => formatUpdatedAt(breed.updatedAt) },
            { id: "actions", label: "Akcie", width: 255, cell: breed =>
              <div className={styles.gridActions}>
                {breed.status === "published" && <Link prefetch={false}
                  href={`/plemena/${breed.slug}`} target="_blank">Web ↗</Link>}
                <span className={styles.inlineDesktop}><AdminInlineRowActions
                  editing={activeInline?.id === breed.id} busy={busy}
                  disabled={Boolean(activeInline && activeInline.id !== breed.id)}
                  onEdit={() => beginInline(breed)}
                  onSave={() => void saveInline()}
                  onCancel={() => { if (!busy) setInlineDraft(null); }}
                /></span>
                <Link prefetch={false} href={`/admin/plemena/${breed.id}`}>Upraviť</Link>
                <AdminActionButton variant="destructive" disabled={busy}
                  onClick={() => setDeleteTarget(breed)}>Odstrániť</AdminActionButton>
              </div> },
          ]}
        /> : <div className={styles.empty}>Žiadne plemeno nezodpovedá zvoleným filtrom.</div>}
      </div>
      {pageData.totalPages > 1 && (
        <nav className={styles.pagination} aria-label="Stránkovanie plemien">
          <button type="button" disabled={busy || pageData.page === 1}
            onClick={() => changePage(1)}>Prvá</button>
          <button type="button" disabled={busy || pageData.page === 1}
            onClick={() => changePage(pageData.page - 1)}>Predchádzajúca</button>
          <span aria-live="polite">Strana {pageData.page} z {pageData.totalPages}</span>
          <button type="button" disabled={busy || pageData.page === pageData.totalPages}
            onClick={() => changePage(pageData.page + 1)}>Nasledujúca</button>
          <button type="button" disabled={busy || pageData.page === pageData.totalPages}
            onClick={() => changePage(pageData.totalPages)}>Posledná</button>
        </nav>
      )}
    </section>

    <AdminModalDialog
      open={bulkStatus !== null}
      title={bulkStatus === "published" ? "Publikovať vybrané plemená" : "Stiahnuť vybrané plemená do konceptu"}
      description="Pred potvrdením sa mení iba publikačný stav. Server odmietne zastaraný výber; publikovanie navyše vyžaduje existujúce FCI číslo a importný kľúč."
      onClose={() => setBulkStatus(null)}
      footer={<>
        <AdminActionButton variant="neutral" disabled={busy} onClick={() => setBulkStatus(null)}>Zrušiť</AdminActionButton>
        <AdminActionButton
          variant={bulkStatus === "published" ? "primary" : "destructive"}
          data-admin-autofocus="true"
          disabled={busy || !bulkTargets.length}
          onClick={() => void applyBulkStatus()}
        >{busy ? "Spracúvam…" : bulkStatus === "published" ? "Publikovať" : "Stiahnuť do konceptu"}</AdminActionButton>
      </>}
    >
      <p className={styles.confirmSummary}>Zmení sa <strong>{bulkTargets.length}</strong> z {selected.size} vybraných plemien. {selected.size - bulkTargets.length} už má cieľový stav.</p>
    </AdminModalDialog>

    <AdminDestructiveConfirmDialog
      open={deleteTarget !== null}
      title="Natrvalo odstrániť plemeno?"
      description={deleteTarget ? `Odstráni sa „${deleteTarget.name}“ aj jeho existujúce breed relations. Túto akciu nie je možné v admin rozhraní vrátiť späť.` : undefined}
      affectedCount={deleteTarget ? 1 : 0}
      affectedLabel="plemeno"
      confirmLabel="Odstrániť plemeno"
      pending={busy}
      onCancel={() => setDeleteTarget(null)}
      onConfirm={() => void removeBreed()}
    />
  </>;
}
