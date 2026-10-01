"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AdminGooglePlacePicker } from "@/components/admin-google-place-picker";
import type {
  GeoAdminGoogleFilter,
  GeoAdminOperatorData,
  GeoAdminOperatorFilter,
  GeoAdminOperatorGroupFilter,
  GeoAdminOperatorRow,
} from "@/lib/geo-admin-operator";

const groupOptions: Array<{ value: GeoAdminOperatorGroupFilter; label: string }> = [
  { value: "ALL", label: "Všetko" },
  { value: "SERVICES", label: "Služby" },
  { value: "HELP", label: "Pomoc psom" },
  { value: "EVENTS", label: "Podujatia" },
];

const operatorOptions: Array<{ value: GeoAdminOperatorFilter; label: string }> = [
  { value: "ALL", label: "Všetky stavy" },
  { value: "ON_MAP", label: "Na mape" },
  { value: "PENDING", label: "Čaká na spracovanie" },
  { value: "NEEDS_REVIEW", label: "Treba skontrolovať" },
  { value: "MISSING_ADDRESS", label: "Chýba adresa" },
  { value: "INCOMPLETE_ADDRESS", label: "Neúplná adresa" },
  { value: "INVALID_ADDRESS", label: "Neplatná adresa" },
  { value: "FAILED", label: "Chyby" },
  { value: "NOT_PUBLIC", label: "Nezobrazuje sa verejne" },
  { value: "ERRORS", label: "Všetky chyby" },
];

const googleOptions: Array<{ value: GeoAdminGoogleFilter; label: string }> = [
  { value: "ALL", label: "Všetky mapové stavy" },
  { value: "PLACE", label: "🏷️ Google Maps — konkrétne miesto" },
  { value: "COORDINATES", label: "📍 Iba súradnice" },
  { value: "NOT_REQUIRED", label: "✓ Google Maps netreba" },
  { value: "UNRESOLVED", label: "⚪ Treba vyriešiť" },
];

type BulkResult = {
  targetId: number;
  name: string;
  result: "UPDATED" | "REVIEW" | "NO_MATCH" | "SKIPPED" | "ERROR";
  reason: string;
};

function googleStatus(item: GeoAdminOperatorRow) {
  if (item.googleMapsTarget === "PLACE") return "🏷️ Konkrétne miesto — vybavené";
  if (item.googleMapsTarget === "COORDINATES") return "📍 Iba súradnice";
  if (item.googleMapsTarget === "NOT_REQUIRED") {
    return item.googleMapsNotRequiredSystemDerived
      ? "✓ Google Maps netreba — online podujatie"
      : "✓ Google Maps netreba — vybavené";
  }
  return "⚪ Treba vyriešiť";
}

function countForGroup(data: GeoAdminOperatorData, group: GeoAdminOperatorGroupFilter) {
  if (group === "ALL") return data.counts.total;
  return data.counts.groups[group];
}

function filterFingerprint(data: GeoAdminOperatorData) {
  return JSON.stringify({
    category: data.filters.category,
    operator: data.filters.operator,
    google: data.filters.google,
    query: data.filters.query,
  });
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
  const bulkContext = useMemo(() => filterFingerprint(data), [
    data.filters.category,
    data.filters.operator,
    data.filters.google,
    data.filters.query,
  ]);

  useEffect(() => {
    setSearchDraft(data.filters.query);
  }, [data.filters.query]);

  useEffect(() => {
    setBulkCursor(null);
    setBulkResults([]);
    setBulkMessage("");
  }, [bulkContext]);

  function navigate(mutator: (params: URLSearchParams) => void, replace = false) {
    const params = new URLSearchParams(searchParams.toString());
    mutator(params);
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
    // searchParams is intentionally resolved only when the debounce fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft, data.filters.query]);

  function resetFilters() {
    navigate((params) => {
      const pageSize = params.get("pageSize");
      for (const key of ["group", "category", "operator", "google", "q", "page"]) params.delete(key);
      if (pageSize) params.set("pageSize", pageSize);
    });
    setSearchDraft("");
    setActivePickerKey(null);
  }

  function changeGroup(group: GeoAdminOperatorGroupFilter) {
    navigate((params) => {
      if (group === "ALL") params.delete("group");
      else params.set("group", group);
      params.delete("category");
      params.delete("page");
    });
    setActivePickerKey(null);
  }

  function pageHref(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) params.delete("page");
    else params.set("page", String(page));
    const suffix = params.toString();
    return suffix ? `/admin/mapy?${suffix}` : "/admin/mapy";
  }

  async function mapWorkflowAction(item: GeoAdminOperatorRow, action: "google-maps-not-required" | "reset-google-maps-not-required") {
    const busy = `${action}:${item.key}`;
    setBusyKey(busy);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/geo/${item.targetType}/${item.targetId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Mapový stav sa nepodarilo uložiť.");
      setMessage(action === "google-maps-not-required"
        ? `${item.name}: Google Maps netreba — mapová kontrola je vybavená.`
        : `${item.name}: Google Maps je znovu vyžadované.`);
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
    try {
      const selectResponse = await fetch("/api/admin/geo/bulk-google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "select-targets",
          count,
          cursor: bulkCursor,
          filters: {
            category: data.filters.category,
            operator: data.filters.operator,
            google: data.filters.google,
            query: data.filters.query,
          },
        }),
      });
      const selection = await selectResponse.json() as {
        error?: string;
        targetIds?: number[];
        nextCursor?: string | null;
        hasMore?: boolean;
      };
      if (!selectResponse.ok) throw new Error(selection.error || "Ďalšiu Google dávku sa nepodarilo vybrať.");
      const targetIds = selection.targetIds ?? [];
      if (!targetIds.length) {
        setBulkCursor(selection.nextCursor ?? null);
        setBulkMessage("Pre aktuálny filter už nie sú ďalšie eligible profily.");
        return;
      }

      const results: BulkResult[] = [];
      for (const targetId of targetIds) {
        const response = await fetch("/api/admin/geo/bulk-google", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "process-target",
            confirm: "GOOGLE-PLACE-BULK",
            targetId,
          }),
        });
        const body = await response.json() as { error?: string; result?: BulkResult };
        if (!response.ok || !body.result) {
          results.push({
            targetId,
            name: "",
            result: "ERROR",
            reason: body.error || "Google profil sa nepodarilo spracovať.",
          });
        } else {
          results.push(body.result);
        }
      }
      setBulkResults(results);
      setBulkCursor(selection.nextCursor ?? null);
      setBulkMessage(
        `Google Maps kontrola: spracované ${results.length}. ` +
        `Potvrdené ${results.filter((item) => item.result === "UPDATED").length}, ` +
        `na kontrolu ${results.filter((item) => item.result === "REVIEW").length}, ` +
        `nenájdené ${results.filter((item) => item.result === "NO_MATCH").length}, ` +
        `preskočené ${results.filter((item) => item.result === "SKIPPED").length}, ` +
        `chyby ${results.filter((item) => item.result === "ERROR").length}.` +
        (selection.hasMore ? " Môžeš pokračovať ďalšou dávkou." : " Toto bola posledná dostupná dávka."),
      );
      router.refresh();
    } catch (error) {
      setBulkMessage(error instanceof Error ? error.message : "Google bulk operácia zlyhala.");
    } finally {
      setBulkBusy(false);
    }
  }

  const hasFilters = data.filters.group !== "ALL"
    || Boolean(data.filters.category)
    || data.filters.operator !== "ALL"
    || data.filters.google !== "ALL"
    || Boolean(data.filters.query);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="admin-form-card" data-admin-map-summary>
        <div className="admin-section-heading">
          <div>
            <h2>Mapový workflow</h2>
            <p>
              Počty sú za celý aktuálny serverový filter, nie iba za zobrazenú stránku.
              Browser dostáva najviac {data.pagination.pageSize} kariet.
            </p>
          </div>
        </div>

        <div className="admin-status-filter" aria-label="Počty podľa sekcie" style={{ flexWrap: "wrap" }}>
          {groupOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              className={data.filters.group === option.value ? "is-active" : ""}
              aria-pressed={data.filters.group === option.value}
              onClick={() => changeGroup(option.value)}
            >
              {option.label} ({countForGroup(data, option.value)})
            </button>
          ))}
        </div>

        <div className="admin-message" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span>Celkom <strong>{data.counts.total}</strong></span>
          <span>🏷️ Google Place <strong>{data.counts.google.PLACE}</strong></span>
          <span>📍 Iba súradnice <strong>{data.counts.google.COORDINATES}</strong></span>
          <span>✓ Google Maps netreba <strong>{data.counts.google.NOT_REQUIRED}</strong></span>
          <span>⚪ Treba vyriešiť <strong>{data.counts.google.UNRESOLVED}</strong></span>
        </div>

        <details>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Operator stavy</summary>
          <div className="admin-message" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
            <span>Na mape <strong>{data.counts.operators.ON_MAP}</strong></span>
            <span>Čaká <strong>{data.counts.operators.PENDING}</strong></span>
            <span>Kontrola <strong>{data.counts.operators.NEEDS_REVIEW}</strong></span>
            <span>Chýba adresa <strong>{data.counts.operators.MISSING_ADDRESS}</strong></span>
            <span>Neúplná <strong>{data.counts.operators.INCOMPLETE_ADDRESS}</strong></span>
            <span>Neplatná <strong>{data.counts.operators.INVALID_ADDRESS}</strong></span>
            <span>Chyby <strong>{data.counts.operators.FAILED}</strong></span>
            <span>Neverejná <strong>{data.counts.operators.NOT_PUBLIC}</strong></span>
          </div>
        </details>
      </section>

      <section className="admin-form-card" data-admin-map-filters>
        <div className="admin-grid admin-grid--2">
          <label>
            Kategória / typ
            <select
              value={data.filters.category}
              onChange={(event) => setParam("category", event.target.value)}
            >
              <option value="">Všetky kategórie</option>
              {data.categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label} ({category.count})
                </option>
              ))}
            </select>
          </label>

          <label>
            Operator stav
            <select
              value={data.filters.operator}
              onChange={(event) => setParam("operator", event.target.value)}
            >
              {operatorOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            Google Maps
            <select
              value={data.filters.google}
              onChange={(event) => setParam("google", event.target.value)}
            >
              {googleOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            Hľadať
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Názov, mesto, okres, kraj, adresa, venue…"
            />
          </label>
        </div>

        <div className="admin-editor-actions" style={{ flexWrap: "wrap", marginTop: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Na stránku
            <select
              value={String(data.pagination.pageSize)}
              onChange={(event) => navigate((params) => {
                params.set("pageSize", event.target.value);
                params.delete("page");
              })}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>
          <button type="button" disabled={!hasFilters} onClick={resetFilters}>Zrušiť všetky filtre</button>
        </div>
      </section>

      {data.filters.group === "SERVICES" ? (
        <section className="admin-form-card" data-google-bulk>
          <div className="admin-section-heading">
            <div>
              <h2>Google bulk — Služby</h2>
              <p>
                Server vyberie ďalších eligible profilov z celého filtrovaného datasetu, nie iba z aktuálnej stránky.
                Google Maps netreba, aktuálny Place, manual override a explicit private sa neberú.
              </p>
            </div>
          </div>
          <div className="admin-editor-actions" style={{ flexWrap: "wrap" }}>
            <label>
              Počet profilov na kontrolu
              <input
                id="google-bulk-count"
                type="number"
                min={1}
                max={100}
                value={bulkCount}
                onChange={(event) => setBulkCount(Number(event.target.value))}
                onBlur={() => setBulkCount(normalizedBulkCount())}
                style={{ width: 100, marginLeft: 8 }}
              />
            </label>
            <button type="button" disabled={bulkBusy} onClick={() => void runBulk()}>
              {bulkBusy
                ? "Spracúvam…"
                : bulkCursor
                  ? `Pokračovať ďalšou dávkou (max. ${normalizedBulkCount()})`
                  : `Skontrolovať cez Google Maps (max. ${normalizedBulkCount()})`}
            </button>
            {bulkCursor ? (
              <button type="button" disabled={bulkBusy} onClick={() => {
                setBulkCursor(null);
                setBulkResults([]);
                setBulkMessage("Bulk cursor bol resetnutý pre aktuálny filter.");
              }}>
                Začať od začiatku
              </button>
            ) : null}
          </div>
          {bulkMessage ? <p className="admin-message" role="status">{bulkMessage}</p> : null}
          {bulkResults.length ? (
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Výsledky poslednej dávky ({bulkResults.length})</summary>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {bulkResults.map((result) => (
                  <p className="admin-help" key={result.targetId}>
                    #{result.targetId} {result.name || "Profil"} — <strong>{result.result}</strong>: {result.reason}
                  </p>
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {message ? <p className="admin-message" role="status">{message}</p> : null}

      <section style={{ display: "grid", gap: 12 }} data-admin-map-items>
        {data.items.map((item) => {
          const pickerOpen = activePickerKey === item.key;
          const notRequiredBusy = busyKey === `google-maps-not-required:${item.key}`;
          const resetBusy = busyKey === `reset-google-maps-not-required:${item.key}`;
          return (
            <article className="admin-form-card" key={item.key} style={{ overflow: "hidden" }}>
              <div className="admin-section-heading">
                <div style={{ minWidth: 0 }}>
                  <p className="admin-kicker">{item.groupLabel} · {item.categoryLabel}</p>
                  <h2 style={{ overflowWrap: "anywhere" }}>{item.name}</h2>
                  <p>{[item.city, item.district, item.region].filter(Boolean).join(" · ") || "Bez lokalizačného popisu"}</p>
                </div>
                <Link href={item.editorHref}>Otvoriť profil</Link>
              </div>

              <div className="admin-message" style={{ display: "grid", gap: 6 }}>
                <strong>Google Maps</strong>
                <span>{googleStatus(item)}</span>
                {item.formattedAddress ? <span>{item.formattedAddress}</span> : null}
                {!item.formattedAddress && item.publicAddress ? <span>Verejná adresa: {item.publicAddress}</span> : null}
              </div>

              {item.addressWarning ? (
                <p className="admin-message admin-message--warning">
                  ⚠️ {item.addressWarning}
                </p>
              ) : null}

              {item.googleMapsTarget === "NOT_REQUIRED" ? (
                item.googleMapsNotRequiredSystemDerived ? (
                  <p className="admin-help">Online podujatie fyzický Google Place nepotrebuje.</p>
                ) : (
                  <div className="admin-editor-actions" style={{ flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={resetBusy}
                      onClick={() => void mapWorkflowAction(item, "reset-google-maps-not-required")}
                    >
                      {resetBusy ? "Ukladám…" : "Znovu vyžadovať Google Maps"}
                    </button>
                  </div>
                )
              ) : (
                <>
                  <div className="admin-editor-actions" style={{ flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={!item.googlePickerAvailable}
                      onClick={() => setActivePickerKey(pickerOpen ? null : item.key)}
                    >
                      {item.googleMapsTarget === "PLACE" ? "Zmeniť Google miesto" : "Nájsť v Google Maps"}
                    </button>
                    {item.googleMapsTarget !== "PLACE" ? (
                      <button
                        type="button"
                        disabled={notRequiredBusy}
                        onClick={() => void mapWorkflowAction(item, "google-maps-not-required")}
                      >
                        {notRequiredBusy ? "Ukladám…" : "✓ Google Maps netreba"}
                      </button>
                    ) : null}
                  </div>
                  {!item.googlePickerAvailable && item.googlePickerUnavailableReason ? (
                    <p className="admin-help">{item.googlePickerUnavailableReason}</p>
                  ) : null}
                </>
              )}

              {pickerOpen && item.googleMapsTarget !== "NOT_REQUIRED" ? (
                <div className="admin-message" style={{ marginTop: 10 }} data-active-google-picker={item.key}>
                  <div className="admin-editor-actions" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                    <strong>Google Maps kandidáti</strong>
                    <button type="button" onClick={() => setActivePickerKey(null)}>Zavrieť</button>
                  </div>
                  <AdminGooglePlacePicker
                    targetType={item.targetType}
                    targetId={item.targetId}
                    compact
                    autoDiscover
                    available={item.googlePickerAvailable}
                    unavailableReason={item.googlePickerUnavailableReason ?? ""}
                    allowExplicitPrivateOverride={false}
                    onConfirmed={() => {
                      setActivePickerKey(null);
                      router.refresh();
                    }}
                  />
                </div>
              ) : null}

              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>Technické detaily</summary>
                <div className="admin-help" style={{ display: "grid", gap: 4, marginTop: 8, overflowWrap: "anywhere" }}>
                  <span>Operator: {item.operatorState} — {item.operatorReason}</span>
                  <span>geocode_status: {item.geocodeStatus ?? "—"}</span>
                  <span>google_place_id: {item.googlePlaceId ?? "—"}</span>
                  <span>google_place_source_fingerprint: {item.googlePlaceSourceFingerprint ?? "—"}</span>
                  <span>source_fingerprint: {item.sourceFingerprint ?? "—"}</span>
                  <span>provider: {item.provider ?? "—"}</span>
                  <span>manual_override: {item.manualOverride ? "áno" : "nie"}</span>
                  <span>explicit_private: {item.explicitPrivate ? "áno" : "nie"}</span>
                </div>
              </details>
            </article>
          );
        })}

        {!data.items.length ? (
          <article className="admin-form-card">
            <h2>Žiadne položky pre zvolený filter</h2>
            <p>Skús zrušiť niektorý filter alebo prejsť na inú sekciu.</p>
          </article>
        ) : null}
      </section>

      <nav className="admin-form-card" aria-label="Stránkovanie máp">
        <div className="admin-editor-actions" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          {data.pagination.page > 1
            ? <Link href={pageHref(data.pagination.page - 1)}>Predchádzajúca</Link>
            : <span className="admin-help">Predchádzajúca</span>}
          <span>
            Strana <strong>{data.pagination.page}</strong> z <strong>{data.pagination.totalPages}</strong>
            {" · "}{data.pagination.from}–{data.pagination.to} z {data.pagination.totalItems}
          </span>
          {data.pagination.page < data.pagination.totalPages
            ? <Link href={pageHref(data.pagination.page + 1)}>Ďalšia</Link>
            : <span className="admin-help">Ďalšia</span>}
        </div>
      </nav>
    </div>
  );
}
