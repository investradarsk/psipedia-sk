"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ManagedBreedSummary } from "@/lib/breed-store";
import {
  adminBreedCounts,
  defaultAdminBreedFilters,
  filterAdminBreeds,
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
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManagedBreedSummary | null>(null);
  const [bulkStatus, setBulkStatus] = useState<BulkStatus | null>(null);

  const visible = useMemo(() => filterAdminBreeds(breeds, filters), [breeds, filters]);
  const counts = useMemo(() => adminBreedCounts(breeds), [breeds]);
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
  const visibleIds = visible.map((breed) => breed.id);
  const selectedBreeds = breeds.filter((breed) => selected.has(breed.id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected = visibleIds.some((id) => selected.has(id)) && !allVisibleSelected;
  const bulkTargets = bulkStatus ? selectedBreeds.filter((breed) => breed.status !== bulkStatus) : [];

  function changeFilter(key: keyof AdminBreedFilters, value: string) {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === "fciGroup") next.fciSection = "all";
      return next;
    });
    setSelected(new Set());
  }

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleVisible(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      visibleIds.forEach((id) => checked ? next.add(id) : next.delete(id));
      return next;
    });
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

    <section className="admin-panel">
      <div className={styles.filters} aria-label="Filtre plemien">
        <label className="admin-search">
          <span>Hľadať</span>
          <div><SearchIcon size={18}/><input value={filters.query} onChange={(event) => changeFilter("query", event.target.value)} placeholder="Názov, slug, pôvod, FCI…"/></div>
        </label>
        <label><span>FCI skupina</span><select value={filters.fciGroup} onChange={(event) => changeFilter("fciGroup", event.target.value)}><option value="all">Všetky skupiny</option>{fciGroups.map(([number, label]) => <option value={number} key={number}>FCI {number} · {label}</option>)}</select></label>
        <label><span>FCI sekcia</span><select value={filters.fciSection} onChange={(event) => changeFilter("fciSection", event.target.value)}><option value="all">Všetky sekcie</option>{sections.map((section) => <option value={section} key={section}>{section}</option>)}</select></label>
        <label><span>Pôvod</span><select value={filters.origin} onChange={(event) => changeFilter("origin", event.target.value)}><option value="all">Všetky krajiny</option>{origins.map((origin) => <option value={origin} key={origin}>{origin}</option>)}</select></label>
        <label><span>Publikovanie</span><select value={filters.status} onChange={(event) => changeFilter("status", event.target.value)}><option value="all">Všetky stavy</option><option value="published">Publikované</option><option value="draft">Koncepty</option></select></label>
        <label><span>Úplnosť</span><select value={filters.completeness} onChange={(event) => changeFilter("completeness", event.target.value)}><option value="all">Všetky profily</option><option value="incomplete">Len neúplné</option><option value="complete">Bez detegovaných medzier</option></select></label>
        <div className={styles.filterActions}><AdminActionButton variant="link" onClick={() => { setFilters(defaultAdminBreedFilters); setSelected(new Set()); }}>Zrušiť filtre</AdminActionButton></div>
      </div>

      <div className={styles.resultBar}>
        <label className={styles.selectPage}>
          <input
            type="checkbox"
            checked={allVisibleSelected}
            ref={(node) => { if (node) node.indeterminate = someVisibleSelected; }}
            disabled={!visible.length || busy}
            onChange={(event) => toggleVisible(event.currentTarget.checked)}
          />
          Vybrať zobrazené ({visible.length})
        </label>
        <strong role="status">Nájdené: {visible.length} z {breeds.length}</strong>
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

      <div className={styles.list} aria-busy={busy}>
        {visible.map((breed) => <article className={styles.row} key={breed.id}>
          <input aria-label={`Vybrať ${breed.name}`} type="checkbox" checked={selected.has(breed.id)} disabled={busy} onChange={() => toggle(breed.id)}/>
          <div className={styles.thumb}>{breed.image ? <img src={breed.image} alt=""/> : <span>Bez<br/>obrázka</span>}</div>
          <div className={styles.identity}>
            <div className={styles.statusLine}><span className={`admin-status admin-status--${breed.status}`}>{breed.status === "published" ? "Publikované" : "Koncept"}</span>{breed.fciNumber && <span>FCI {breed.fciNumber}</span>}</div>
            <h2><Link href={`/admin/plemena/${breed.id}`}>{breed.name}</Link></h2>
            <p>/{breed.slug}</p>
          </div>
          <div className={styles.meta}><strong>FCI {breed.fciGroup} · {breed.fciSection || "Sekcia neuvedená"}</strong><span>{breed.origin || "Pôvod neuvedený"}</span></div>
          <div className={styles.issueList}>{breed.completenessIssues.length ? breed.completenessIssues.map((issue) => <span className={styles.issue} data-breed-completeness key={issue}>{issue}</span>) : <span className={styles.complete}>Bez detegovaných medzier</span>}</div>
          <div className={styles.updated}><strong>Upravené</strong><br/>{formatUpdatedAt(breed.updatedAt)}</div>
          <div className={styles.actions}>
            {breed.status === "published" && <Link href={`/plemena/${breed.slug}`} target="_blank">Pozrieť ↗</Link>}
            <Link className="admin-row-edit" href={`/admin/plemena/${breed.id}`}>Upraviť</Link>
            <AdminActionButton variant="destructive" disabled={busy} onClick={() => setDeleteTarget(breed)}>Odstrániť</AdminActionButton>
          </div>
        </article>)}
        {!visible.length && <div className={styles.empty}>Žiadne plemeno nezodpovedá zvoleným filtrom.</div>}
      </div>
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
