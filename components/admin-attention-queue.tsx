import Link from "next/link";
import {
  adminAttentionPriorities,
  adminAttentionPriorityLabels,
  adminAttentionQueueSourceTypes,
  adminAttentionSourceLabels,
  adminAttentionStateLabels,
  isAdminAttentionActive,
  type AdminAttentionFilters,
  type AdminAttentionPriority,
  type AdminAttentionState,
} from "@/lib/admin-attention-queue";
import type { AdminAttentionPage } from "@/lib/admin-attention-queue-store";
import styles from "./admin-attention-queue.module.css";

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Neznámy čas";
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Bratislava",
  }).format(date);
}

function formatAge(days: number) {
  if (days <= 0) return "dnes";
  if (days === 1) return "1 deň";
  if (days >= 2 && days <= 4) return `${days} dni`;
  return `${days} dní`;
}

function priorityClass(priority: AdminAttentionPriority) {
  if (priority === "HIGH") return styles.high;
  if (priority === "LOW") return styles.low;
  return styles.medium;
}

function stateClass(state: AdminAttentionState) {
  if (state === "NEW") return styles.stateNew;
  if (state === "IN_PROGRESS") return styles.stateProgress;
  if (state === "RESOLVED") return styles.stateResolved;
  return styles.stateDismissed;
}

function queueHref(filters: AdminAttentionFilters, cursor?: string | null) {
  const params = new URLSearchParams();
  if (filters.view && filters.view !== "active") params.set("view", filters.view);
  if (filters.sourceType && filters.sourceType !== "all") params.set("source", filters.sourceType);
  if (filters.priority && filters.priority !== "all") params.set("priority", filters.priority);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return `/admin/operations${query ? `?${query}` : ""}#centrum-pozornosti`;
}

export function AdminAttentionQueue({
  page,
  filters,
}: {
  page: AdminAttentionPage;
  filters: AdminAttentionFilters;
}) {
  const unavailable = page.sourceAvailability.filter((source) => source.state === "UNAVAILABLE");
  const hasFilters = (filters.sourceType && filters.sourceType !== "all")
    || (filters.priority && filters.priority !== "all")
    || (filters.view && filters.view !== "active");
  const selectedUnavailable = filters.sourceType && filters.sourceType !== "all"
    ? unavailable.some((source) => source.sourceType === filters.sourceType)
    : false;

  return (
    <div className={styles.workspace} data-testid="admin-attention-queue">
      <section className="admin-stats" aria-label="Súhrn upozornení">
        <div><span>Aktívne</span><strong>{page.availability === "UNAVAILABLE" ? "—" : page.summary.active}</strong></div>
        <div><span>Nové</span><strong>{page.availability === "UNAVAILABLE" ? "—" : page.summary.byState.NEW}</strong></div>
        <div><span>Rieši sa</span><strong>{page.availability === "UNAVAILABLE" ? "—" : page.summary.byState.IN_PROGRESS}</strong></div>
        <div><span>História</span><strong>{page.availability === "UNAVAILABLE" ? "—" : page.summary.history}</strong></div>
      </section>

      {page.pagination.invalidCursor && (
        <p className="admin-flash" role="alert">
          Odkaz na stránku už nie je platný. Zobrazuje sa prvá strana s rovnakými filtrami.
        </p>
      )}
      {page.availability === "PARTIAL" && (
        <div className="admin-flash" role="alert">
          <strong>Výsledky nie sú úplné.</strong>{" "}
          Nedostupné zdroje: {unavailable.map((source) => adminAttentionSourceLabels[source.sourceType]).join(", ")}.{" "}
          <Link href={queueHref(filters)}>Skúsiť znova</Link>
        </div>
      )}
      {page.availability === "UNAVAILABLE" && (
        <div className="admin-flash" role="alert">
          <strong>Upozornenia sa momentálne nepodarilo načítať.</strong>{" "}
          Žiadny zdroj sa netvári ako prázdny; stav je označený ako nedostupný.{" "}
          <Link href={queueHref(filters)}>Skúsiť znova</Link>
        </div>
      )}

      <ul className={styles.sourceCounts} aria-label="Aktívne upozornenia podľa zdroja">
        {adminAttentionQueueSourceTypes.map((sourceType) => (
          <li key={sourceType}>
            <span>{adminAttentionSourceLabels[sourceType]}</span>
            <strong>{page.summary.bySource[sourceType] ?? "—"}</strong>
          </li>
        ))}
      </ul>

      <form className={styles.filters} method="get" action="/admin/operations" aria-label="Filtrovať upozornenia">
        <label>
          <span>Zobrazenie</span>
          <select name="view" defaultValue={filters.view ?? "active"}>
            <option value="active">Aktívne</option>
            <option value="history">História</option>
            <option value="all">Všetko</option>
          </select>
        </label>
        <label>
          <span>Zdroj</span>
          <select name="source" defaultValue={filters.sourceType ?? "all"}>
            <option value="all">Všetky zdroje</option>
            {adminAttentionQueueSourceTypes.map((sourceType) => (
              <option key={sourceType} value={sourceType}>{adminAttentionSourceLabels[sourceType]}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Priorita</span>
          <select name="priority" defaultValue={filters.priority ?? "all"}>
            <option value="all">Všetky priority</option>
            {adminAttentionPriorities.map((priority) => <option key={priority} value={priority}>{adminAttentionPriorityLabels[priority]}</option>)}
          </select>
        </label>
        <button type="submit">Filtrovať</button>
        {hasFilters && <Link href="/admin/operations#centrum-pozornosti">Vyčistiť filtre</Link>}
      </form>

      <p role="status">
        {page.availability === "PARTIAL" ? "Nájdené v dostupných zdrojoch" : "Nájdené"}: <strong>{page.resultCount}</strong>
        {" · "}Zobrazené: <strong>{page.items.length}</strong>
      </p>

      {page.items.length ? (
        <section className={styles.list} aria-label="Položky upozornení">
          {page.items.map((item) => (
            <article
              className={`${styles.card} ${isAdminAttentionActive(item) ? "" : styles.historyCard}`}
              key={item.key}
              data-source={item.sourceType}
              data-priority={item.priority}
              data-attention-state={item.attentionState}
            >
              <header>
                <div className={styles.kicker}>
                  <span className={`${styles.state} ${stateClass(item.attentionState)}`}>{adminAttentionStateLabels[item.attentionState]}</span>
                  <span className={`${styles.priority} ${priorityClass(item.priority)}`}>{adminAttentionPriorityLabels[item.priority]}</span>
                  <span>{adminAttentionSourceLabels[item.sourceType]}</span>
                </div>
                <h2>{item.title}</h2>
                <div className={styles.meta}><span>Zdrojový stav: {item.status}</span><span>ID: {item.sourceId}</span></div>
              </header>
              <div className={styles.reason}>
                <strong>Kontext</strong>
                <p>{item.reason}</p>
              </div>
              <div className={styles.details}>
                <strong>{formatAge(item.ageDays)}</strong>
                <div className={styles.meta}><span title={formatTimestamp(item.relevantAt)}>Od {formatTimestamp(item.relevantAt)}</span></div>
                {item.metadata?.map((entry) => <div className={styles.meta} key={`${entry.label}:${entry.value}`}><span>{entry.label}: {entry.value}</span></div>)}
              </div>
              <Link className={styles.open} href={item.targetHref}>Otvoriť</Link>
            </article>
          ))}
        </section>
      ) : page.availability !== "UNAVAILABLE" && (
        <div className={styles.empty}>
          <h2>{selectedUnavailable
            ? "Zvolený zdroj je momentálne nedostupný"
            : hasFilters ? "Pre zvolený filter sa nič nenašlo" : "Žiadne aktívne upozornenia"}</h2>
          <p>{selectedUnavailable
            ? "Skús načítanie zopakovať; nedostupný zdroj sa nezobrazuje ako zavádzajúca nula."
            : hasFilters ? "Vyčisti filtre alebo zvoľ inú kombináciu." : "Všetky dostupné canonical workflowy sú bez otvorených položiek."}</p>
        </div>
      )}

      {(page.pagination.nextCursor || page.pagination.invalidCursor) && (
        <nav className="admin-pagination" aria-label="Stránkovanie upozornení">
          {page.pagination.invalidCursor
            ? <Link href={queueHref(filters)}>Prvá strana</Link>
            : <span aria-disabled="true">Aktuálna strana</span>}
          {page.pagination.nextCursor
            ? <Link href={queueHref(filters, page.pagination.nextCursor)}>Ďalšia strana →</Link>
            : <span aria-disabled="true">Ďalšia strana →</span>}
        </nav>
      )}
    </div>
  );
}
