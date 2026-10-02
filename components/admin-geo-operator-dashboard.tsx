"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AdminGooglePlacePicker } from "@/components/admin-google-place-picker";
import type {
  GeoAdminOperatorData,
  GeoAdminOperatorGroupFilter,
  GeoAdminOperatorRow,
} from "@/lib/geo-admin-operator";

const groupOptions: Array<{ value: GeoAdminOperatorGroupFilter; label: string }> = [
  { value: "ALL", label: "Všetko" },
  { value: "SERVICES", label: "Služby" },
  { value: "HELP", label: "Pomoc psom" },
  { value: "EVENTS", label: "Podujatia" },
];

type BulkTarget = {
  targetType: GeoAdminOperatorRow["targetType"];
  targetId: number;
  organizationId: number | null;
  key: string;
  name: string;
  group: "SERVICES" | "HELP" | "EVENTS";
  groupLabel: string;
  categoryLabel: string;
  editorHref: string;
  publicHref: string | null;
  cursorAfter: string;
};

type BulkResult = Omit<BulkTarget, "cursorAfter"> & {
  result: "UPDATED" | "REVIEW" | "NO_MATCH" | "NOT_REQUIRED" | "SKIPPED" | "ERROR";
  reason: string;
  candidate: { id: string; displayName: string; formattedAddress: string } | null;
};

type BulkProgress = {
  processed: number;
  total: number;
  currentName: string;
};

function countForGroup(data: GeoAdminOperatorData, group: GeoAdminOperatorGroupFilter) {
  if (group === "ALL") return data.counts.total;
  return data.counts.groups[group];
}

function mapStatus(item: GeoAdminOperatorRow) {
  return item.googleMapsTarget === "COORDINATES"
    ? "📍 Iba súradnice — treba Google miesto"
    : "⚪ Treba vyriešiť";
}

export function AdminGeoOperatorDashboard({ data }: { data: GeoAdminOperatorData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchDraft, setSearchDraft] = useState(data.filters.query);
  const [activePickerKey, setActivePickerKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [bulkCount, setBulkCount] = useState(20);
  const [bulkCursor, setBulkCursor] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkProgress, setBulkProgress] = useState<BulkProgress>({ processed: 0, total: 0, currentName: "" });
  const stopAfterCurrentRef = useRef(false);
  const [stopRequested, setStopRequested] = useState(false);

  const bulkSessionKey = `psipedia:google-bulk-unresolved:${JSON.stringify({
    group: data.filters.group,
    category: data.filters.category,
    query: data.filters.query,
  })}`;

  function navigate(mutator: (params: URLSearchParams) => void, replace = false) {
    const params = new URLSearchParams(searchParams.toString());
    mutator(params);
    for (const obsolete of ["operator", "google"]) params.delete(obsolete);
    const suffix = params.toString();
    const href = suffix ? `/admin/mapy?${suffix}` : "/admin/mapy";
    if (replace) router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  }

  function setParam(key: string, value: string, options: { resetPage?: boolean; replace?: boolean } = {}) {
    navigate((params) => {
      if (!value || value === "ALL") params.delete(key);
      else params.set(key, value);
      if (options.resetPage !== false) params.delete("page");
    }, options.replace);
  }

  useEffect(() => {
    if (searchDraft === data.filters.query) return;
    const timer = window.setTimeout(() => {
      setParam("q", searchDraft.trim(), { resetPage: true, replace: true });
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft, data.filters.query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.sessionStorage.getItem(bulkSessionKey);
        if (!saved) return;
        const parsed = JSON.parse(saved) as { cursor?: string | null };
        if (parsed.cursor) {
          setBulkCursor(parsed.cursor);
          setBulkMessage("Predchádzajúca dávka bola prerušená. Môžeš pokračovať od ďalšej nevyriešenej položky.");
        }
      } catch {
        window.sessionStorage.removeItem(bulkSessionKey);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [bulkSessionKey]);

  function persistBulkCursor(cursor: string | null) {
    try {
      if (cursor) window.sessionStorage.setItem(bulkSessionKey, JSON.stringify({ cursor }));
      else window.sessionStorage.removeItem(bulkSessionKey);
    } catch {
      // Resume UX je best-effort; serverový cursor ostáva autorita.
    }
  }

  function changeGroup(group: GeoAdminOperatorGroupFilter) {
    navigate((params) => {
      if (group === "ALL") params.delete("group");
      else params.set("group", group);
      params.delete("category");
      params.delete("page");
    });
    setActivePickerKey(null);
    setBulkCursor(null);
    persistBulkCursor(null);
  }

  function resetFilters() {
    navigate((params) => {
      const pageSize = params.get("pageSize");
      for (const key of ["group", "category", "q", "page", "operator", "google"]) params.delete(key);
      if (pageSize) params.set("pageSize", pageSize);
    });
    setSearchDraft("");
    setActivePickerKey(null);
    setBulkCursor(null);
    persistBulkCursor(null);
  }

  function pageHref(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("operator");
    params.delete("google");
    if (page <= 1) params.delete("page");
    else params.set("page", String(page));
    const suffix = params.toString();
    return suffix ? `/admin/mapy?${suffix}` : "/admin/mapy";
  }

  async function markNotRequired(item: GeoAdminOperatorRow) {
    setBusyKey(item.key);
    setMessage("");
    try {
      const endpoint = item.group === "HELP" && item.organizationId
        ? `/api/admin/organizations/${item.organizationId}/google-place`
        : `/api/admin/geo/${item.targetType}/${item.targetId}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "google-maps-not-required" }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Mapový stav sa nepodarilo uložiť.");
      setMessage(`${item.name}: Google Maps netreba — položka je vybavená.`);
      setActivePickerKey(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mapový stav sa nepodarilo uložiť.");
    } finally {
      setBusyKey(null);
    }
  }

  function normalizedBulkCount() {
    const value = Math.trunc(Number(bulkCount) || 1);
    return Math.max(1, Math.min(100, value));
  }

  async function runBulk() {
    const count = normalizedBulkCount();
    setBulkCount(count);
    setBulkBusy(true);
    setBulkMessage("");
    setBulkResults([]);
    setBulkProgress({ processed: 0, total: 0, currentName: "" });
    stopAfterCurrentRef.current = false;
    setStopRequested(false);
    try {
      const selectResponse = await fetch("/api/admin/geo/bulk-google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "select-targets",
          count,
          cursor: bulkCursor,
          filters: {
            group: data.filters.group,
            category: data.filters.category,
            query: data.filters.query,
          },
        }),
      });
      const selection = await selectResponse.json() as {
        error?: string;
        targets?: BulkTarget[];
        hasMore?: boolean;
      };
      if (!selectResponse.ok) throw new Error(selection.error || "Ďalšiu Google dávku sa nepodarilo vybrať.");
      const targets = selection.targets ?? [];
      if (!targets.length) {
        setBulkMessage("Pre tento inbox už nie sú ďalšie nevyriešené položky.");
        setBulkCursor(null);
        persistBulkCursor(null);
        return;
      }

      setBulkProgress({ processed: 0, total: targets.length, currentName: targets[0]?.name ?? "" });
      let processed = 0;
      let lastCursor = bulkCursor;
      const collected: BulkResult[] = [];
      for (const target of targets) {
        if (stopAfterCurrentRef.current) break;
        setBulkProgress({ processed, total: targets.length, currentName: target.name });
        const response = await fetch("/api/admin/geo/bulk-google", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "process-target",
            confirm: "GOOGLE-PLACE-BULK",
            targetType: target.targetType,
            targetId: target.targetId,
            organizationId: target.organizationId,
          }),
        });
        const body = await response.json() as { error?: string; result?: BulkResult };
        const result: BulkResult = !response.ok || !body.result
          ? {
              ...target,
              result: "ERROR",
              reason: body.error || "Google target sa nepodarilo spracovať.",
              candidate: null,
            }
          : body.result;
        processed += 1;
        collected.push(result);
        setBulkResults([...collected]);
        lastCursor = target.cursorAfter;
        setBulkCursor(lastCursor);
        persistBulkCursor(lastCursor);
        setBulkProgress({ processed, total: targets.length, currentName: target.name });
        if (stopAfterCurrentRef.current) break;
      }

      const stopped = stopAfterCurrentRef.current && processed < targets.length;
      const hasMore = stopped || Boolean(selection.hasMore);
      setBulkMessage(
        stopped
          ? `Zastavené po ${processed} / ${targets.length}. Môžeš pokračovať od ďalšej položky.`
          : hasMore
            ? `Skontrolovaných ${processed} položiek. Môžeš pokračovať ďalšou dávkou.`
            : "Google Maps kontrola dokončená. V tomto filtri už nie sú ďalšie nevyriešené položky.",
      );
      if (!hasMore) {
        setBulkCursor(null);
        persistBulkCursor(null);
      }
      router.refresh();
    } catch (error) {
      setBulkMessage(error instanceof Error ? error.message : "Google bulk operácia zlyhala.");
    } finally {
      setBulkBusy(false);
      stopAfterCurrentRef.current = false;
      setStopRequested(false);
    }
  }

  const bulkSummary = bulkResults.reduce((summary, result) => {
    if (result.result === "REVIEW") summary.review += 1;
    else if (result.result === "NO_MATCH") summary.noMatch += 1;
    else if (result.result === "ERROR") summary.error += 1;
    else summary.done += 1;
    return summary;
  }, { done: 0, review: 0, noMatch: 0, error: 0 });

  const bulkDetails = bulkResults.filter((item) =>
    item.result === "REVIEW" || item.result === "NO_MATCH" || item.result === "ERROR");
  const hasFilters = data.filters.group !== "ALL" || Boolean(data.filters.category) || Boolean(data.filters.query);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="admin-form-card" data-admin-map-summary>
        <div className="admin-section-heading">
          <div>
            <h2>Mapy</h2>
            <p><strong>Treba vyriešiť: {data.counts.total}</strong></p>
            <p className="admin-help">Zobrazené sú iba profily, organizácie a podujatia, ktoré ešte potrebujú Google Maps doriešenie.</p>
          </div>
        </div>

        <div className="admin-status-filter" aria-label="Nevyriešené podľa sekcie" style={{ flexWrap: "wrap" }}>
          {groupOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              className={data.filters.group === option.value ? "is-active" : ""}
              onClick={() => changeGroup(option.value)}
            >
              {option.label} ({countForGroup(data, option.value)})
            </button>
          ))}
        </div>
      </section>

      <section className="admin-form-card" data-admin-map-filters>
        <div className="admin-field-grid">
          <div className="admin-field">
            <label htmlFor="map-category">Kategória</label>
            <select
              id="map-category"
              value={data.filters.category}
              onChange={(event) => setParam("category", event.target.value)}
            >
              <option value="">Všetky kategórie</option>
              {data.categories.map((category) => (
                <option key={category.value} value={category.value}>{category.label} ({category.count})</option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="map-search">Hľadať</label>
            <input
              id="map-search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Názov, mesto alebo adresa"
            />
          </div>
          <div className="admin-field">
            <label htmlFor="map-page-size">Na stránku</label>
            <select
              id="map-page-size"
              value={String(data.pagination.pageSize)}
              onChange={(event) => setParam("pageSize", event.target.value)}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>
        {hasFilters ? (
          <div className="admin-editor-actions">
            <button type="button" onClick={resetFilters}>Zrušiť filtre</button>
          </div>
        ) : null}
      </section>

      <section className="admin-form-card" data-google-bulk>
        <div className="admin-section-heading">
          <div>
            <h2>Google Maps — hromadná kontrola</h2>
            <p className="admin-help">Dávka sa vyberá zo serverového unresolved inboxu, nie iba z aktuálnej stránky.</p>
          </div>
        </div>
        <div className="admin-editor-actions" style={{ alignItems: "end", flexWrap: "wrap" }}>
          <div className="admin-field" style={{ maxWidth: 160 }}>
            <label htmlFor="google-bulk-count">Počet</label>
            <input
              id="google-bulk-count"
              type="number"
              min={1}
              max={100}
              value={bulkCount}
              disabled={bulkBusy}
              onChange={(event) => setBulkCount(Number(event.target.value))}
            />
          </div>
          <button type="button" disabled={bulkBusy} onClick={() => void runBulk()}>
            {bulkBusy ? "Kontrolujem…" : `Skontrolovať ďalších ${normalizedBulkCount()}`}
          </button>
          {bulkBusy ? (
            <button
              type="button"
              disabled={stopRequested}
              onClick={() => {
                stopAfterCurrentRef.current = true;
                setStopRequested(true);
              }}
            >
              {stopRequested ? "Zastavujem…" : "Zastaviť po aktuálnej"}
            </button>
          ) : null}
        </div>
        {bulkProgress.total ? (
          <p className="admin-help">
            {bulkProgress.processed} / {bulkProgress.total}
            {bulkProgress.currentName ? ` · ${bulkProgress.currentName}` : ""}
          </p>
        ) : null}
        {bulkResults.length ? (
          <div data-google-bulk-summary style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <strong>✓ Hotovo: {bulkSummary.done}</strong>
            <strong>⚠ Na kontrolu: {bulkSummary.review}</strong>
            <strong>○ Nenájdené: {bulkSummary.noMatch}</strong>
            <strong>✕ Chyby: {bulkSummary.error}</strong>
          </div>
        ) : null}
        {bulkDetails.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {bulkDetails.map((result) => (
              <div className="admin-message" key={`${result.key}:${result.result}`}>
                <strong>{result.name} — {result.result}</strong>
                <p className="admin-help">{result.reason}</p>
                {result.candidate ? <p className="admin-help">{result.candidate.displayName} · {result.candidate.formattedAddress}</p> : null}
                <Link href={result.editorHref}>Otvoriť profil</Link>
              </div>
            ))}
          </div>
        ) : null}
        {bulkMessage ? <p className="admin-message" role="status">{bulkMessage}</p> : null}
      </section>

      {message ? <p className="admin-message" role="status">{message}</p> : null}

      <section style={{ display: "grid", gap: 12 }} aria-label="Nevyriešené mapové položky">
        {data.items.length ? data.items.map((item) => {
          const pickerOpen = activePickerKey === item.key;
          const endpoint = item.group === "HELP" && item.organizationId
            ? `/api/admin/organizations/${item.organizationId}/google-place`
            : `/api/admin/geo/${item.targetType}/${item.targetId}`;
          return (
            <article className="admin-form-card" key={item.key} data-admin-map-item={item.key}>
              <div className="admin-section-heading">
                <div>
                  <p className="admin-help">{item.groupLabel} · {item.categoryLabel}</p>
                  <h3>{item.name}</h3>
                  <p>{item.formattedAddress || "Chýba adresa"}</p>
                  <p className="admin-help">{mapStatus(item)}</p>
                </div>
                <Link href={item.editorHref}>Otvoriť profil</Link>
              </div>

              <div className="admin-editor-actions" style={{ flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={!item.googlePickerAvailable}
                  onClick={() => setActivePickerKey(pickerOpen ? null : item.key)}
                >
                  {pickerOpen ? "Skryť Google Maps" : "Nájsť v Google Maps"}
                </button>
                <button
                  type="button"
                  disabled={busyKey === item.key}
                  onClick={() => void markNotRequired(item)}
                >
                  ✓ Google Maps netreba
                </button>
              </div>

              {!item.googlePickerAvailable && item.googlePickerUnavailableReason ? (
                <p className="admin-help">{item.googlePickerUnavailableReason}</p>
              ) : null}

              {pickerOpen && item.googlePickerAvailable ? (
                <AdminGooglePlacePicker
                  targetType={item.targetType}
                  targetId={item.targetId}
                  endpoint={endpoint}
                  compact
                  autoDiscover
                  available={item.googlePickerAvailable}
                  unavailableReason={item.googlePickerUnavailableReason ?? ""}
                  onConfirmed={async () => {
                    setActivePickerKey(null);
                    router.refresh();
                  }}
                />
              ) : null}

              <details>
                <summary>Technické detaily</summary>
                <div className="admin-help" style={{ display: "grid", gap: 4, marginTop: 8 }}>
                  <span>Interný GEO stav: {item.operatorState}</span>
                  <span>Geo point: {item.geoPointId ?? "—"}</span>
                  <span>Provider: {item.provider ?? "—"}</span>
                  <span>Manual override: {item.manualOverride ? "Áno" : "Nie"}</span>
                  <span>Explicit private: {item.explicitPrivate ? "Áno" : "Nie"}</span>
                </div>
              </details>
            </article>
          );
        }) : (
          <div className="admin-form-card">
            <strong>V tomto filtri nie je čo riešiť.</strong>
          </div>
        )}
      </section>

      {data.pagination.totalPages > 1 ? (
        <nav className="admin-editor-actions" aria-label="Stránkovanie mapového inboxu">
          {data.pagination.page > 1 ? <Link href={pageHref(data.pagination.page - 1)}>← Predchádzajúca</Link> : null}
          <span className="admin-help">
            {data.pagination.from}–{data.pagination.to} z {data.pagination.totalItems}
          </span>
          {data.pagination.page < data.pagination.totalPages ? <Link href={pageHref(data.pagination.page + 1)}>Ďalšia →</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}
