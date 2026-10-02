"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

type BulkTarget = {
  targetType: GeoAdminOperatorRow["targetType"];
  targetId: number;
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

function editorialAddressPolicyNote(item: GeoAdminOperatorRow) {
  if (item.publicAddress) {
    return `Verejná adresa zostáva uložená a publikovateľná: ${item.publicAddress}`;
  }
  return "";
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
  const bulkSessionKey = `psipedia:google-bulk:${JSON.stringify({
    group: data.filters.group,
    category: data.filters.category,
    operator: data.filters.operator,
    google: data.filters.google,
    query: data.filters.query,
  })}`;

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

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(bulkSessionKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { cursor?: string | null };
      if (parsed.cursor) {
        setBulkCursor(parsed.cursor);
        setBulkMessage("Predchádzajúca Google dávka bola prerušená. Môžeš pokračovať od poslednej dokončenej položky.");
      }
    } catch {
      window.sessionStorage.removeItem(bulkSessionKey);
    }
  }, [bulkSessionKey]);

  function persistBulkCursor(cursor: string | null) {
    try {
      if (cursor) window.sessionStorage.setItem(bulkSessionKey, JSON.stringify({ cursor }));
      else window.sessionStorage.removeItem(bulkSessionKey);
    } catch {
      // Resume UX je best-effort; serverový cursor zostáva autorita.
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
            operator: data.filters.operator,
            google: data.filters.google,
            query: data.filters.query,
          },
        }),
      });
      const selection = await selectResponse.json() as {
        error?: string;
        targets?: BulkTarget[];
        nextCursor?: string | null;
        hasMore?: boolean;
      };
      if (!selectResponse.ok) throw new Error(selection.error || "Ďalšiu Google dávku sa nepodarilo vybrať.");
      const targets = selection.targets ?? [];
      if (!targets.length) {
        setBulkMessage("Pre aktuálny filter už nie sú ďalšie eligible položky.");
        return;
      }

      setBulkProgress({ processed: 0, total: targets.length, currentName: targets[0]?.name ?? "" });
      let processed = 0;
      let lastCursor = bulkCursor;
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
          }),
        });
        const body = await response.json() as { error?: string; result?: BulkResult };
        const result: BulkResult = !response.ok || !body.result
          ? {
              targetType: target.targetType,
              targetId: target.targetId,
              key: target.key,
              name: target.name,
              group: target.group,
              groupLabel: target.groupLabel,
              categoryLabel: target.categoryLabel,
              editorHref: target.editorHref,
              publicHref: target.publicHref,
              result: "ERROR",
              reason: body.error || "Google target sa nepodarilo spracovať.",
              candidate: null,
            }
          : body.result;
        processed += 1;
        lastCursor = target.cursorAfter;
        setBulkResults((previous) => [...previous, result]);
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
            ? `Google Maps kontrola dokončená: ${processed} položiek. Môžeš pokračovať ďalšou dávkou.`
            : "Google Maps kontrola dokončená. Pre aktuálny filter už nie sú ďalšie eligible položky.",
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
            <h2>Stav mapových položiek</h2>
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

        <div className="admin-status-filter" aria-label="Rýchly filter podľa operator stavu" style={{ flexWrap: "wrap" }}>
          {[
            ["ON_MAP", "Na mape"],
            ["PENDING", "Čaká na spracovanie"],
            ["NEEDS_REVIEW", "Treba skontrolovať"],
            ["MISSING_ADDRESS", "Chýba adresa"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={data.filters.operator === value ? "is-active" : ""}
              aria-pressed={data.filters.operator === value}
              onClick={() => setParam("operator", data.filters.operator === value ? "ALL" : value)}
            >
              {label}
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
              placeholder="Hľadať názov, mesto, okres, kraj alebo kategóriu"
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

      <section className="admin-form-card" data-google-bulk>
        <div className="admin-section-heading">
          <div>
            <h2>Google bulk — {groupOptions.find((option) => option.value === data.filters.group)?.label ?? "Všetko"}</h2>
            <p>
              Server vyberá 1–100 eligible položiek z celého aktuálne filtrovaného datasetu, nie iba z tejto stránky.
              Spracovanie je sekvenčné a výsledok sa zobrazí po každej položke.
            </p>
          </div>
        </div>

        <div className="admin-editor-actions" style={{ flexWrap: "wrap" }}>
          <label>
            Počet položiek
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
              ? `Spracúvam ${bulkProgress.processed} / ${bulkProgress.total || normalizedBulkCount()}`
              : bulkCursor
                ? `Pokračovať ďalšou dávkou (max. ${normalizedBulkCount()})`
                : `Skontrolovať cez Google Maps (max. ${normalizedBulkCount()})`}
          </button>
          {bulkBusy ? (
            <button type="button" disabled={stopRequested} onClick={() => {
              stopAfterCurrentRef.current = true;
              setStopRequested(true);
            }}>
              {stopRequested ? "Zastavím po aktuálnej položke…" : "Zastaviť po aktuálnej položke"}
            </button>
          ) : null}
          {bulkCursor && !bulkBusy ? (
            <button type="button" onClick={() => {
              setBulkCursor(null);
              persistBulkCursor(null);
              setBulkResults([]);
              setBulkProgress({ processed: 0, total: 0, currentName: "" });
              setBulkMessage("Bulk cursor bol resetnutý pre aktuálny filter.");
            }}>
              Začať od začiatku
            </button>
          ) : null}
        </div>

        {bulkProgress.total ? (
          <div className="admin-message" role="status" style={{ display: "grid", gap: 8 }}>
            <strong>Google Maps kontrola — {bulkProgress.processed} / {bulkProgress.total}</strong>
            <progress value={bulkProgress.processed} max={bulkProgress.total} style={{ width: "100%" }} />
            <span>{Math.round((bulkProgress.processed / bulkProgress.total) * 100)} %</span>
            {bulkBusy && bulkProgress.currentName ? <span>Aktuálne: <strong>{bulkProgress.currentName}</strong></span> : null}
            <span>
              ✓ Potvrdené: {bulkResults.filter((item) => item.result === "UPDATED").length}
              {" · "}⚠ Na kontrolu: {bulkResults.filter((item) => item.result === "REVIEW").length}
              {" · "}○ Nenájdené: {bulkResults.filter((item) => item.result === "NO_MATCH").length}
              {" · "}✓ Netreba: {bulkResults.filter((item) => item.result === "NOT_REQUIRED").length}
              {" · "}↷ Preskočené: {bulkResults.filter((item) => item.result === "SKIPPED").length}
              {" · "}✕ Chyby: {bulkResults.filter((item) => item.result === "ERROR").length}
            </span>
          </div>
        ) : null}

        {bulkMessage ? <p className="admin-message" role="status">{bulkMessage}</p> : null}

        {bulkResults.length ? (
          <div style={{ display: "grid", gap: 10 }} data-google-bulk-results>
            {bulkResults.map((result, index) => (
              <article className="admin-message" key={`${result.key}:${index}`} style={{ display: "grid", gap: 6 }}>
                <strong>{index + 1}. {result.name || result.key}</strong>
                <span>{result.groupLabel}{result.categoryLabel ? ` · ${result.categoryLabel}` : ""}</span>
                <span><strong>{result.result}</strong> — {result.reason}</span>
                {result.candidate ? (
                  <span>Google kandidát: {result.candidate.displayName} · {result.candidate.formattedAddress}</span>
                ) : null}
                <div className="admin-editor-actions" style={{ flexWrap: "wrap" }}>
                  <Link href={result.editorHref}>Otvoriť profil v admine</Link>
                  {result.publicHref ? (
                    <a href={result.publicHref} target="_blank" rel="noopener noreferrer">Otvoriť verejný profil ↗</a>
                  ) : null}
                  {(result.result === "REVIEW" || result.result === "NO_MATCH") ? (
                    <Link href={result.editorHref}>Ručne doriešiť Google Maps</Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

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
                {editorialAddressPolicyNote(item) ? <span>{editorialAddressPolicyNote(item)}</span> : null}
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
