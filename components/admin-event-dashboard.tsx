"use client";

import Link from "next/link";
import { AdminRecordBulkDelete } from "@/components/admin-record-bulk-delete";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminRecordTable } from "@/components/admin-record-table";
import { AdminInlineRowActions, AdminInlineCellSelect } from "@/components/admin-inline-edit-controls";
import { AdminReviewCheckbox } from "@/components/admin-review-checkbox";
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
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(defaultEventFilters);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [settledSearch, setSettledSearch] = useState(defaultEventFilters.query);
  const [today, setToday] = useState(bratislavaDateKey);
  const [page, setPage] = useState(1);
  const [initialRequestKey] = useState(() => JSON.stringify([defaultEventFilters, 1, bratislavaDateKey()]));
  const effectiveFilters = useMemo(() => ({ ...filters, query: settledSearch }), [filters, settledSearch]);
  const requestKey = JSON.stringify([effectiveFilters, page, today]);
  // Server-rendered first page is available immediately; later pages use a
  // cancellable, filter/page/day-specific query cache.
  const eventQuery = useQuery({
    queryKey: ["admin", "events", effectiveFilters, page, today],
    queryFn: ({ signal }) => fetchAdminEventPage(effectiveFilters, page, signal),
    initialData: requestKey === initialRequestKey
      ? { ...initialPage, reviewedIds: initialReviewedIds } : undefined,
    placeholderData: keepPreviousData,
    // Returning to a recently visited month/filter stays instant; writes
    // explicitly invalidate every cached events page before refetching.
    staleTime: 60_000,
  });
  const data = eventQuery.data ?? initialPage;
  const reviewedIds = eventQuery.data?.reviewedIds ?? initialReviewedIds;
  const reviewed = useMemo(() => new Set(reviewedIds), [reviewedIds]);
  const events = data.events;
  const loading = eventQuery.isPending || eventQuery.isPlaceholderData || filters.query !== settledSearch;
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
  const quickTriggerIdRef = useRef<number | null>(null);
  const [inlineEventId, setInlineEventId] = useState<number | null>(null);
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
    const timer = window.setTimeout(() => setSettledSearch(filters.query), 250);
    return () => window.clearTimeout(timer);
  }, [filters.query]);

  const counts = data.counts;
  const pages = data.pages;
  const currentPage = data.page;
  const rows = events;
  const visibleInlineId = inlineEventId !== null && rows.some(event => event.id === inlineEventId) ? inlineEventId : null;
  const years = data.years;
  const selectedEvents = events.filter((event) => selected.has(event.id));
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

  async function reload() {
    // Invalidate cached pages only after a confirmed write. Existing server
    // mutation endpoints and their concurrency checks remain authoritative.
    await queryClient.invalidateQueries({ queryKey: ["admin", "events"], refetchType: "none" });
    const fresh = await eventQuery.refetch();
    setSelected(new Set());
    setBulkEditOpen(false);
    // A successful write stays successful even if the following list refresh fails.
    return !fresh.error;
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
      const refreshed = await reload();
      setMessage(refreshed
        ? `Zmenených podujatí: ${data.changed}.`
        : `Zmenených podujatí: ${data.changed}. Zoznam sa nepodarilo obnoviť; použi „Skúsiť znova“.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Zmena zlyhala.");
    } finally {
      setBusy(false);
      setConfirmStatus(null);
    }
  }

  // The shared table may remount an action cell while a modal is open.
  // Restore focus to the current matching trigger, not its stale DOM node.
  function focusCurrentQuickTrigger() {
    const id = quickTriggerIdRef.current;
    if (id === null) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const trigger = document.querySelector<HTMLButtonElement>(
        '[data-admin-event-quick-trigger="' + id + '"]'
      );
      if (trigger && !trigger.disabled) trigger.focus({ preventScroll: true });
    }));
  }

  function closeQuickEventDrawer() {
    setQuickEvent(null);
    focusCurrentQuickTrigger();
  }

  function openQuickEdit(event: AdminEventSummary) {
    quickTriggerIdRef.current = event.id;
    setInlineEventId(null);
    setQuickEvent(event);
    setQuickType(event.eventType);
    setQuickCancelled(event.cancelled);
  }

  function beginInlineEdit(event: AdminEventSummary) {
    setInlineEventId(event.id);
    setQuickEvent(event);
    setQuickType(event.eventType);
    setQuickCancelled(event.cancelled);
    setMessage("");
  }

  function cancelInlineEdit() {
    if (busy) return;
    setInlineEventId(null);
    setQuickEvent(null);
  }

  async function saveQuickEdit() {
    if (!quickEvent) return;
    if (quickType === quickEvent.eventType && quickCancelled === quickEvent.cancelled) {
      closeQuickEventDrawer();
      setInlineEventId(null);
      setMessage("Nie sú žiadne zmeny na uloženie.");
      return;
    }
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
      setQuickEvent(null);
      setInlineEventId(null);
      const refreshed = await reload();
      focusCurrentQuickTrigger();
      setMessage(refreshed
        ? "Rýchla úprava podujatia bola uložená."
        : "Rýchla úprava bola uložená, ale zoznam sa nepodarilo obnoviť; použi „Skúsiť znova“.");
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
      setDeleteTarget(null);
      const refreshed = await reload();
      setMessage(refreshed
        ? "Podujatie bolo odstránené."
        : "Podujatie bolo odstránené, ale zoznam sa nepodarilo obnoviť; použi „Skúsiť znova“.");
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
            <input value={filters.query} onChange={(event) => changeFilter("query", event.target.value)} placeholder="Názov, Admin ID, mesto, areál, organizátor alebo slug" />
          </label>
          <div className={`admin-status-filter admin-event-time-filters ${styles.timeFilters}`} aria-label="Časový stav">
            {[["all", "Všetky"], ["upcoming", "Nadchádzajúce"], ["current", "Prebiehajúce"], ["past", "Minulé"], ["cancelled", `Zrušené (${counts.cancelled})`]].map(([value, label]) => (
              <button type="button" key={value} aria-pressed={filters.time === value} className={filters.time === value ? "is-active" : ""} onClick={() => changeFilter("time", value)}>{label}</button>
            ))}
          </div>
          <button type="button" className={styles.advancedToggle} aria-controls="admin-event-advanced-filters"
            aria-expanded={advancedFiltersOpen} onClick={() => setAdvancedFiltersOpen(open => !open)}>
            {advancedFiltersOpen ? "Skryť filtre" : "Ďalšie filtre"}
          </button>
          <div id="admin-event-advanced-filters" className={`admin-event-filters ${styles.advancedFilters}`} data-expanded={advancedFiltersOpen}>
            <div><label htmlFor="admin-event-filter-status">Publikačný stav</label><select id="admin-event-filter-status" value={filters.status} onChange={(event) => changeFilter("status", event.target.value)}><option value="all">Všetky stavy</option><option value="published">Publikované</option><option value="draft">Koncepty</option></select></div>
            <div><label htmlFor="admin-event-filter-type">Typ podujatia</label><select id="admin-event-filter-type" value={filters.type} onChange={(event) => changeFilter("type", event.target.value)}><option value="">Všetky typy</option>{eventTypes.map((value) => <option key={value}>{value}</option>)}</select></div>
            <div><label htmlFor="admin-event-filter-region">Kraj</label><select id="admin-event-filter-region" value={filters.region} onChange={(event) => changeFilter("region", event.target.value)}><option value="">Všetky kraje</option>{slovakRegions.map((value) => <option key={value}>{value}</option>)}</select></div>
            <div><label htmlFor="admin-event-filter-month">Mesiac začiatku</label><select id="admin-event-filter-month" value={filters.month} onChange={(event) => changeFilter("month", event.target.value)}><option value="">Všetky mesiace</option>{["Január", "Február", "Marec", "Apríl", "Máj", "Jún", "Júl", "August", "September", "Október", "November", "December"].map((value, index) => <option value={String(index + 1).padStart(2, "0")} key={value}>{value}</option>)}</select></div>
            <div><label htmlFor="admin-event-filter-year">Rok začiatku</label><select id="admin-event-filter-year" value={filters.year} onChange={(event) => changeFilter("year", event.target.value)}><option value="">Všetky roky</option>{years.map((value) => <option key={value}>{value}</option>)}</select></div>
            <div><label htmlFor="admin-event-filter-sort">Zoradiť</label><select id="admin-event-filter-sort" value={filters.sort} onChange={(event) => changeFilter("sort", event.target.value)}><option value="date">Podľa dátumu a priebehu</option><option value="updated">Posledná úprava</option><option value="created">Najnovšie vytvorené</option><option value="title">Podľa názvu A–Z</option><option value="city">Mesto</option><option value="status">Stav publikácie</option></select></div>
          </div>
          <button type="button" onClick={() => { setFilters(defaultEventFilters); setPage(1); clearSelection(); setMessage(""); }}>Zrušiť filtre</button>
        </fieldset>

        <div className="admin-event-bulk"><span role="status">Vybrané: {selected.size}</span></div>

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

        {!!selected.size && <AdminRecordBulkDelete
          kind="events" selectedIds={[...selected]} disabled={busy || loading || !hydrated}
          onFinished={() => { clearSelection(); void reload(); }}
        />}

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
        {eventQuery.error && <p className="admin-flash" role="alert">
          {eventQuery.error instanceof Error ? eventQuery.error.message : "Načítanie podujatí zlyhalo."}
          {" "}<button type="button" onClick={() => void eventQuery.refetch()}>Skúsiť znova</button>
        </p>}

        {rows.length > 0 && <AdminRecordTable
          rows={rows}
          label="Zoznam podujatí"
          busy={busy || loading || !hydrated}
          serverSorted
          serverSorting={{
            id: filters.sort,
            desc: filters.direction === "desc" || (!filters.direction && ["updated", "created"].includes(filters.sort)),
            allowedIds: ["title", "date", "city", "status", "updated", "created"],
            onChange: next => {
              if (!["title", "date", "city", "status", "updated", "created"].includes(next.id)) return;
              setFilters(current => ({ ...current, sort: next.id, direction: next.desc ? "desc" : "asc" }));
              setPage(1);
              clearSelection();
            },
          }}
          selection={{
            selectedIds: [...selected].filter(id => rows.some(item => item.id === id)),
            disabled: !hydrated || loading,
            selectAllLabel: "Vybrať túto stranu",
            labelForRow: item => "Vybrať " + item.title,
            onChange: ids => setSelected(current => new Set([
              ...[...current].filter(id => !rows.some(item => item.id === id)),
              ...ids,
            ])),
          }}
          columns={[
            { id: "title", label: "Podujatie", width: 270, sortValue: (event) => event.title, cell: (event) => <Link prefetch={false} href={`/admin/podujatia/${event.id}`}><strong>{event.title}</strong></Link> },
            { id: "date", label: "Termín", width: 170, sortValue: (event) => event.startDate + event.startTime, cell: (event) => formatEventDate(event) + (event.startTime ? " · " + event.startTime : "") },
            { id: "city", label: "Mesto", width: 145, sortValue: (event) => event.city || "", cell: (event) => event.city || "—" },
            { id: "type", label: "Typ", width: 160, sortValue: (event) => event.eventType,
              cell: (event) => visibleInlineId === event.id
                ? <AdminInlineCellSelect label={"Typ podujatia " + event.title}
                    value={quickType} onChange={value => setQuickType(value as EventType)}
                    disabled={busy || loading}
                    options={eventTypes.map(value => ({ value, label: value }))} />
                : event.eventType },
            { id: "status", label: "Publikácia", width: 130, sortValue: (event) => event.status, cell: (event) => <span className={"admin-status admin-status--" + event.status}>{event.status === "published" ? "Publikované" : "Koncept"}</span> },
            { id: "timeState", label: "Časový stav", width: 135,
              cell: (event) => visibleInlineId === event.id
                ? <label><input type="checkbox" aria-label={"Zrušené podujatie " + event.title}
                    checked={quickCancelled} disabled={busy || loading}
                    onChange={change => setQuickCancelled(change.target.checked)} /> Zrušené</label>
                : event.cancelled ? "Zrušené" : timeLabels[eventDateStatus(event, today)] },
            { id: "organizer", label: "Organizátor", width: 180, initiallyHidden: true, sortValue: (event) => event.organizer || "", cell: (event) => event.organizer || "—" },
            { id: "updated", label: "Aktualizované", width: 150, sortValue: (event) => event.updatedAt, cell: (event) => new Date(event.updatedAt).toLocaleDateString("sk-SK") },
            { id: "created", label: "Vytvorené", width: 145, initiallyHidden: true, sortValue: (event) => event.createdAt, cell: (event) => new Date(event.createdAt).toLocaleDateString("sk-SK") },
            { id: "reviewed", label: "AI kontrola", width: 145, cell: (event) => <AdminReviewCheckbox entityType="EVENT" entityId={event.id} initialReviewed={reviewed.has(event.id)} compact /> },
            { id: "actions", label: "Akcie", width: 260, cell: (event) => <div className={styles.tableActions}>
              <Link prefetch={false} href={"/admin/podujatia/" + event.id}>Upraviť</Link>
              {event.status === "published" && <Link prefetch={false} href={eventHref(event)} target="_blank" rel="noreferrer">Web ↗</Link>}
              <AdminInlineRowActions
                editing={visibleInlineId === event.id}
                busy={busy} disabled={!hydrated || loading || (visibleInlineId !== null && visibleInlineId !== event.id)}
                onEdit={() => beginInlineEdit(event)}
                onSave={() => void saveQuickEdit()}
                onCancel={cancelInlineEdit}
              />
              <AdminActionButton variant="neutral" data-admin-event-quick-trigger={event.id} disabled={!hydrated || busy || loading || inlineEventId !== null} onClick={() => openQuickEdit(event)}>Rýchla úprava</AdminActionButton>
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
        open={quickEvent !== null && inlineEventId === null}
        title="Rýchla úprava"
        description={quickEvent ? quickEvent.title : undefined}
        onClose={closeQuickEventDrawer}
        footer={(
          <>
            <AdminActionButton variant="neutral" disabled={busy} onClick={closeQuickEventDrawer}>Zrušiť</AdminActionButton>
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
