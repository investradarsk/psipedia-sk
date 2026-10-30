"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AdminRecordTable } from "@/components/admin-record-table";
import { AdminReviewCheckbox } from "@/components/admin-review-checkbox";
import { BulkSelectionCheckbox } from "@/components/admin-bulk-selection";
import {
  AdminActionButton,
  AdminBulkActionToolbar,
  AdminBulkEditShell,
  AdminDestructiveConfirmDialog,
  AdminDrawer,
  AdminModalDialog,
} from "@/components/admin-interaction-system";
import {
  bratislavaDateKey,
  eventDateStatus,
  eventHref,
  eventTypes,
  formatEventDate,
  slovakRegions,
  type EventStatus,
  type EventType,
} from "@/lib/events";
import {
  defaultEventFilters,
  type AdminEventFilters,
  type AdminEventSummary,
  type BulkEventField,
} from "@/lib/admin-events";
import { ADMIN_EVENT_PAGE_SIZE, adminEventListSearchParams, type AdminEventPageResult } from "@/lib/admin-event-pagination";
import styles from "./admin-event-dashboard.module.css";

const timeLabels = { upcoming: "Nadchádzajúce", current: "Prebieha", past: "Ukončené" };
const subscribeToHydration = () => () => {};

type BulkValue = EventStatus | EventType | boolean;
type AdminEventApiPage = AdminEventPageResult & { reviewedIds: number[] };

async function fetchAdminEventPage(filters: AdminEventFilters, page: number, signal?: AbortSignal): Promise<AdminEventApiPage> {
  const params = adminEventListSearchParams({ filters, page, pageSize: ADMIN_EVENT_PAGE_SIZE });
  const response = await fetch("/api/admin/events?" + params.toString(), { signal, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Podujatia sa nepodarilo načítať.");
  return data as AdminEventApiPage;
}

function selectionPayload(events: AdminEventSummary[]) {
  return events.map(({ id, status, eventType, cancelled, updatedAt }) => ({ id, status, eventType, cancelled, updatedAt }));
}

function matchesBulkValue(event: AdminEventSummary, field: BulkEventField, value: BulkValue) {
  if (field === "status") return event.status === value;
  if (field === "eventType") return event.eventType === value;
  return event.cancelled === value;
}

export function AdminEventDashboard({ initialPage, reviewedIds: initialReviewedIds = [] }: { initialPage: AdminEventPageResult; reviewedIds?: number[] }) {
  const [reviewedIds, setReviewedIds] = useState(initialReviewedIds);
  const reviewed = useMemo(() => new Set(reviewedIds), [reviewedIds]);
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [data, setData] = useState(initialPage);
  const events = data.events;
  const initialRequest = useRef(true);
  const pendingRequest = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState(defaultEventFilters);
  const [today, setToday] = useState(bratislavaDateKey);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmStatus, setConfirmStatus] = useState<EventStatus | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminEventSummary | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkField, setBulkField] = useState<Exclude<BulkEventField, "status">>("eventType");
  const [bulkType, setBulkType] = useState<EventType>("Výstava");
  const [bulkCancelled, setBulkCancelled] = useState(false);
  const [quickEvent, setQuickEvent] = useState<AdminEventSummary | null>(null);
  const [quickType, setQuickType] = useState<EventType>("Výstava");
  const [quickCancelled, setQuickCancelled] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setToday((current) => {
      const next = bratislavaDateKey();
      return next === current ? current : next;
    }), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (initialRequest.current) { initialRequest.current = false; return; }
    const controller = new AbortController();
    pendingRequest.current?.abort();
    pendingRequest.current = controller;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void fetchAdminEventPage(filters, page, controller.signal).then((snapshot) => {
        if (controller.signal.aborted) return;
        setData(snapshot);
        setReviewedIds(snapshot.reviewedIds);
      }).catch((error) => {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Načítanie zlyhalo.");
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    }, filters.query ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [filters, page, today]);

  const counts = data.counts;
  const pages = data.pages;
  const currentPage = data.page;
  const rows = events;
  const years = data.years;
  const selectedEvents = events.filter((event) => selected.has(event.id));
  const pageAllSelected = rows.length > 0 && rows.every((event) => selected.has(event.id));
  const pageSomeSelected = rows.some((event) => selected.has(event.id)) && !pageAllSelected;
  const bulkValue: BulkValue = bulkField === "eventType" ? bulkType : bulkCancelled;
  const bulkTargets = selectedEvents.filter((event) => !matchesBulkValue(event, bulkField, bulkValue));

  function changeFilter(key: keyof AdminEventFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
    setSelected(new Set());
    setBulkEditOpen(false);
    setMessage("");
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkEditOpen(false);
  }

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function reload() {
    pendingRequest.current?.abort();
    const snapshot = await fetchAdminEventPage(filters, page);
    setData(snapshot);
    setReviewedIds(snapshot.reviewedIds);
    setSelected(new Set());
    setBulkEditOpen(false);
    setLoading(false);
  }

  async function applyBulk(field: BulkEventField, value: BulkValue) {
    const targets = events.filter((event) => selected.has(event.id) && !matchesBulkValue(event, field, value));
    if (!targets.length) {
      setMessage("Vybrané podujatia už majú požadovanú hodnotu.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/events/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          field,
          value,
          confirmedCount: targets.length,
          events: selectionPayload(targets),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Hromadná zmena zlyhala.");
      await reload();
      setMessage(`Zmenených podujatí: ${data.changed}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Zmena zlyhala.");
    } finally {
      setBusy(false);
      setConfirmStatus(null);
    }
  }

  function openQuickEdit(event: AdminEventSummary) {
    setQuickEvent(event);
    setQuickType(event.eventType);
    setQuickCancelled(event.cancelled);
  }

  async function saveQuickEdit() {
    if (!quickEvent) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/events/${quickEvent.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventType: quickType, cancelled: quickCancelled, updatedAt: quickEvent.updatedAt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Rýchla úprava zlyhala.");
      await reload();
      setQuickEvent(null);
      setMessage("Sekundárne nastavenia podujatia boli uložené.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rýchla úprava zlyhala.");
    } finally {
      setBusy(false);
    }
  }

  async function removeEvent() {
    if (!deleteTarget) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/events/${deleteTarget.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Podujatie sa nepodarilo odstrániť.");
      await reload();
      setDeleteTarget(null);
      setMessage("Podujatie bolo odstránené.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Odstránenie zlyhalo.");
    } finally {
      setBusy(false);
    }
  }

  const statusTargets = confirmStatus
    ? selectedEvents.filter((event) => event.status !== confirmStatus)
    : [];

  return (
    <div className={`admin-events-workspace ${styles.workspace}`} data-hydrated={hydrated}>
      <section className="admin-stats admin-event-stats" aria-label="Stav celého kalendára">
        {([["all", "Všetky"], ["upcoming", "Nadchádzajúce"], ["current", "Prebiehajúce"], ["past", "Minulé"], ["published", "Publikované"], ["draft", "Koncepty"]] as const).map(([key, label]) => (
          <div key={key} data-count={key}><span>{label}</span><strong>{counts[key]}</strong></div>
        ))}
      </section>

      <section className="admin-panel">
        <fieldset className="admin-event-controls" disabled={!hydrated || busy}>
          <legend className="sr-only">Vyhľadávanie a filtre podujatí</legend>
          <label className="admin-search">
            <span className="sr-only">Hľadať podujatie</span>
            <input value={filters.query} onChange={(event) => changeFilter("query", event.target.value)} placeholder="Názov, mesto, areál, organizátor, typ, kraj alebo slug" />
          </label>
          <div className={`admin-status-filter admin-event-time-filters ${styles.timeFilters}`} aria-label="Časový stav">
            {[["all", "Všetky"], ["upcoming", "Nadchádzajúce"], ["current", "Prebiehajúce"], ["past", "Minulé"], ["cancelled", `Zrušené (${counts.cancelled})`]].map(([value, label]) => (
              <button type="button" key={value} aria-pressed={filters.time === value} className={filters.time === value ? "is-active" : ""} onClick={() => changeFilter("time", value)}>{label}</button>
            ))}
          </div>
          <div className="admin-event-filters">
            <div><label htmlFor="admin-event-filter-status">Publikačný stav</label><select id="admin-event-filter-status" value={filters.status} onChange={(event) => changeFilter("status", event.target.value)}><option value="all">Všetky stavy</option><option value="published">Publikované</option><option value="draft">Koncepty</option></select></div>
            <div><label htmlFor="admin-event-filter-type">Typ podujatia</label><select id="admin-event-filter-type" value={filters.type} onChange={(event) => changeFilter("type", event.target.value)}><option value="">Všetky typy</option>{eventTypes.map((value) => <option key={value}>{value}</option>)}</select></div>
            <div><label htmlFor="admin-event-filter-region">Kraj</label><select id="admin-event-filter-region" value={filters.region} onChange={(event) => changeFilter("region", event.target.value)}><option value="">Všetky kraje</option>{slovakRegions.map((value) => <option key={value}>{value}</option>)}</select></div>
            <div><label htmlFor="admin-event-filter-month">Mesiac začiatku</label><select id="admin-event-filter-month" value={filters.month} onChange={(event) => changeFilter("month", event.target.value)}><option value="">Všetky mesiace</option>{["Január", "Február", "Marec", "Apríl", "Máj", "Jún", "Júl", "August", "September", "Október", "November", "December"].map((value, index) => <option value={String(index + 1).padStart(2, "0")} key={value}>{value}</option>)}</select></div>
            <div><label htmlFor="admin-event-filter-year">Rok začiatku</label><select id="admin-event-filter-year" value={filters.year} onChange={(event) => changeFilter("year", event.target.value)}><option value="">Všetky roky</option>{years.map((value) => <option key={value}>{value}</option>)}</select></div>
            <div><label htmlFor="admin-event-filter-sort">Zoradiť</label><select id="admin-event-filter-sort" value={filters.sort} onChange={(event) => changeFilter("sort", event.target.value)}><option value="date">Podľa dátumu a priebehu</option><option value="updated">Posledná úprava</option><option value="created">Najnovšie vytvorené</option><option value="title">Podľa názvu A–Z</option></select></div>
          </div>
          <button type="button" onClick={() => { setFilters(defaultEventFilters); setPage(1); clearSelection(); setMessage(""); }}>Zrušiť filtre</button>
        </fieldset>

        <div className="admin-event-bulk">
          <BulkSelectionCheckbox checked={pageAllSelected} indeterminate={pageSomeSelected}
            disabled={!hydrated || busy || loading || !rows.length}
            label="Vybrať túto stranu"
            onChange={(checked) => {
              setSelected((current) => {
                const next = new Set(current);
                rows.forEach((row) => {
                  if (checked) next.add(row.id);
                  else next.delete(row.id);
                });
                return next;
              });
            }} />
          <span role="status">Vybrané: {selected.size}</span>
        </div>

        {selected.size > 500 && <p role="alert">V jednej dávke vyber najviac 500 podujatí.</p>}

        {!!selected.size && selected.size <= 500 && (
          <AdminBulkActionToolbar
            selectedCount={selected.size}
            selectionDescription="Výber je explicitný; filtre samy nič nemenia."
            primaryAction={<AdminActionButton variant="primary" disabled={busy} onClick={() => setBulkEditOpen(true)}>Hromadne upraviť</AdminActionButton>}
            secondaryActions={<AdminActionButton variant="secondary" disabled={busy} onClick={() => setConfirmStatus("published")}>Publikovať</AdminActionButton>}
            destructiveAction={<AdminActionButton variant="destructive" disabled={busy} onClick={() => setConfirmStatus("draft")}>Stiahnuť do konceptu</AdminActionButton>}
            onClear={clearSelection}
          />
        )}

        {bulkEditOpen && !!selected.size && (
          <div className={styles.bulkEditPanel}>
            <AdminBulkEditShell
              title="Spoločné nastavenia podujatí"
              affectedCount={bulkTargets.length}
              affectedLabel="podujatí"
              fieldSelection={(
                <div className={styles.bulkField}>
                  <label htmlFor="event-bulk-field">Pole</label>
                  <select id="event-bulk-field" value={bulkField} onChange={(event) => setBulkField(event.target.value as Exclude<BulkEventField, "status">)}>
                    <option value="eventType">Typ podujatia</option>
                    <option value="cancelled">Stav zrušenia</option>
                  </select>
                </div>
              )}
              newValue={bulkField === "eventType" ? (
                <div className={styles.bulkField}>
                  <label htmlFor="event-bulk-type">Nový typ</label>
                  <select id="event-bulk-type" value={bulkType} onChange={(event) => setBulkType(event.target.value as EventType)}>
                    {eventTypes.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </div>
              ) : (
                <div className={styles.bulkField}>
                  <label htmlFor="event-bulk-cancelled">Nový stav</label>
                  <select id="event-bulk-cancelled" value={bulkCancelled ? "true" : "false"} onChange={(event) => setBulkCancelled(event.target.value === "true")}>
                    <option value="false">Aktívne / nezrušené</option>
                    <option value="true">Zrušené</option>
                  </select>
                </div>
              )}
              unchangedNote="Názov, termín, čas, lokalita, organizátor, text, obrázok, SEO, slug a publikačný stav zostanú bez zmeny."
              preview={(
                <div className={styles.bulkPreview}>
                  <span>Vybrané: <strong>{selected.size}</strong></span>
                  <span>Zmení sa: <strong>{bulkTargets.length}</strong></span>
                  <span>Už majú túto hodnotu: <strong>{selected.size - bulkTargets.length}</strong></span>
                </div>
              )}
              validationMessage={bulkTargets.length ? undefined : "Žiadne z vybraných podujatí nepotrebuje túto zmenu."}
              confirmDisabled={!bulkTargets.length}
              pending={busy}
              onCancel={() => setBulkEditOpen(false)}
              onConfirm={() => void applyBulk(bulkField, bulkValue)}
            />
          </div>
        )}

        <p className="admin-event-result-count" role="status">Nájdené: {data.total} z {counts.all} · Zobrazené: {rows.length}. Časové filtre nezahŕňajú zrušené podujatia.</p>
        {message && <p className="admin-flash" role="status">{message}</p>}

        {rows.length > 0 && <AdminRecordTable
          rows={rows}
          label="Zoznam podujatí"
          busy={busy || loading}
          columns={[
            { id: "select", label: "Výber", width: 70, cell: (event) => <input
              type="checkbox" aria-label={"Vybrať " + event.title}
              checked={selected.has(event.id)} disabled={!hydrated || busy || loading}
              onChange={() => toggle(event.id)} /> },
            { id: "title", label: "Podujatie", width: 270, sortValue: (event) => event.title, cell: (event) => <Link href={"/admin/podujatia/" + event.id}><strong>{event.title}</strong></Link> },
            { id: "date", label: "Termín", width: 170, sortValue: (event) => event.startDate + event.startTime, cell: (event) => formatEventDate(event) + (event.startTime ? " · " + event.startTime : "") },
            { id: "city", label: "Mesto", width: 145, sortValue: (event) => event.city || "", cell: (event) => event.city || "—" },
            { id: "type", label: "Typ", width: 160, sortValue: (event) => event.eventType, cell: (event) => event.eventType },
            { id: "status", label: "Publikácia", width: 130, sortValue: (event) => event.status, cell: (event) => <span className={"admin-status admin-status--" + event.status}>{event.status === "published" ? "Publikované" : "Koncept"}</span> },
            { id: "timeState", label: "Časový stav", width: 125, cell: (event) => event.cancelled ? "Zrušené" : timeLabels[eventDateStatus(event, today)] },
            { id: "organizer", label: "Organizátor", width: 180, initiallyHidden: true, sortValue: (event) => event.organizer || "", cell: (event) => event.organizer || "—" },
            { id: "reviewed", label: "AI kontrola", width: 145, cell: (event) => <AdminReviewCheckbox entityType="EVENT" entityId={event.id} initialReviewed={reviewed.has(event.id)} compact /> },
            { id: "actions", label: "Akcie", width: 260, cell: (event) => <div className={styles.tableActions}>
              <Link href={"/admin/podujatia/" + event.id}>Upraviť</Link>
              {event.status === "published" && <Link href={eventHref(event)} target="_blank" rel="noreferrer">Web ↗</Link>}
              <AdminActionButton variant="neutral" disabled={!hydrated || busy || loading} onClick={() => openQuickEdit(event)}>Rýchla úprava</AdminActionButton>
              <AdminActionButton variant="destructive" disabled={!hydrated || busy || loading} onClick={() => setDeleteTarget(event)}>Odstrániť</AdminActionButton>
            </div> },
          ]}
        />}

        {!rows.length && <div className="admin-empty"><h2>Žiadne podujatia</h2><p>Skús zmeniť vyhľadávanie alebo filtre.</p></div>}
        <nav className="admin-event-pagination" aria-label="Stránky podujatí">
          <button type="button" disabled={!hydrated || busy || loading || currentPage === 1} onClick={() => { clearSelection(); setPage(currentPage - 1); }}>Predchádzajúca</button>
          <span>Strana {currentPage} z {pages}</span>
          <button type="button" disabled={!hydrated || busy || loading || currentPage === pages} onClick={() => { clearSelection(); setPage(currentPage + 1); }}>Nasledujúca</button>
        </nav>
      </section>

      <AdminModalDialog
        open={confirmStatus !== null}
        title={confirmStatus === "published" ? "Publikovať vybrané podujatia" : "Stiahnuť vybrané podujatia do konceptu"}
        description="Pred potvrdením skontroluj počet. Mení sa iba publikačný stav."
        onClose={() => setConfirmStatus(null)}
        footer={(
          <>
            <AdminActionButton variant="neutral" disabled={busy} onClick={() => setConfirmStatus(null)}>Zrušiť</AdminActionButton>
            <AdminActionButton
              variant={confirmStatus === "draft" ? "destructive" : "primary"}
              data-admin-autofocus="true"
              disabled={busy || !statusTargets.length}
              onClick={() => confirmStatus && void applyBulk("status", confirmStatus)}
            >
              {busy ? "Spracúvam…" : confirmStatus === "published" ? "Publikovať" : "Stiahnuť do konceptu"}
            </AdminActionButton>
          </>
        )}
      >
        <p className={styles.confirmSummary}>
          Zmení sa <strong>{statusTargets.length}</strong> z {selected.size} vybraných podujatí. Typ, termín, zrušenie, text, obrázok a SEO sa nemenia.
        </p>
      </AdminModalDialog>

      <AdminDrawer
        open={quickEvent !== null}
        title="Rýchla úprava"
        description={quickEvent ? quickEvent.title : undefined}
        onClose={() => setQuickEvent(null)}
        footer={(
          <>
            <AdminActionButton variant="neutral" disabled={busy} onClick={() => setQuickEvent(null)}>Zrušiť</AdminActionButton>
            <AdminActionButton variant="primary" data-admin-autofocus="true" disabled={busy} onClick={() => void saveQuickEdit()}>{busy ? "Ukladám…" : "Uložiť"}</AdminActionButton>
          </>
        )}
      >
        <div className={styles.quickForm}>
          <div>
            <label htmlFor="event-quick-type">Typ podujatia</label>
            <select id="event-quick-type" value={quickType} onChange={(event) => setQuickType(event.target.value as EventType)}>
              {eventTypes.map((value) => <option key={value}>{value}</option>)}
            </select>
          </div>
          <label className={styles.quickCheckbox} htmlFor="event-quick-cancelled">
            <input id="event-quick-cancelled" type="checkbox" checked={quickCancelled} onChange={(event) => setQuickCancelled(event.target.checked)} />
            <span>Podujatie je zrušené</span>
          </label>
          <p className={styles.quickHint}>Rýchla úprava nemení názov, termín, miesto, text, obrázok, SEO ani publikačný stav. Na tieto zmeny použi celý editor.</p>
        </div>
      </AdminDrawer>

      <AdminDestructiveConfirmDialog
        open={deleteTarget !== null}
        title="Natrvalo odstrániť podujatie?"
        description={deleteTarget ? `Odstráni sa „${deleteTarget.title}“. Túto akciu nie je možné v admin rozhraní vrátiť späť.` : undefined}
        affectedCount={deleteTarget ? 1 : 0}
        affectedLabel="podujatie"
        confirmLabel="Odstrániť podujatie"
        pending={busy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void removeEvent()}
      />
    </div>
  );
}
