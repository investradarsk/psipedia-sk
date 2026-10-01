"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AdminGooglePlacePicker } from "@/components/admin-google-place-picker";
import {
  type GeoAdminOperatorGroup,
  type GeoAdminOperatorRow,
  type GeoAdminOperatorSummary,
} from "@/lib/geo-admin-operator";
import { geoAdminOperatorStateLabels, type GeoAdminOperatorState } from "@/lib/geo-admin-operator-state";

type GeoOperatorFilter = "ALL" | "ERRORS" | GeoAdminOperatorState;
type GeoGroupFilter = "ALL" | GeoAdminOperatorGroup;
type GoogleMapFilter = "PLACE" | "COORDINATES" | "NONE";

type GoogleBulkResult = {
  targetId: number;
  name: string;
  result: "UPDATED" | "REVIEW" | "NO_MATCH" | "SKIPPED" | "ERROR";
  reason: string;
  candidate: {
    id: string;
    displayName: string;
    formattedAddress: string;
  } | null;
};

const filters: Array<{ value: GeoOperatorFilter; label: string }> = [
  { value: "ALL", label: "Všetky" },
  { value: "ON_MAP", label: "Na mape" },
  { value: "PENDING", label: "Čaká na spracovanie" },
  { value: "NEEDS_REVIEW", label: "Treba skontrolovať" },
  { value: "MISSING_ADDRESS", label: "Chýba adresa" },
  { value: "ERRORS", label: "Chyby" },
];

const groupLabels: Record<GeoAdminOperatorGroup, string> = {
  SERVICES: "Služby",
  HELP: "Pomoc psom",
  EVENTS: "Podujatia",
};

const stateIcon: Record<GeoAdminOperatorState, string> = {
  ON_MAP: "🟢",
  PENDING: "🔵",
  NEEDS_REVIEW: "🟡",
  MISSING_ADDRESS: "🔴",
  INCOMPLETE_ADDRESS: "🔴",
  INVALID_ADDRESS: "🔴",
  FAILED: "🔴",
  NOT_PUBLIC: "⚪",
};

function matchesFilter(item: GeoAdminOperatorRow, filter: GeoOperatorFilter) {
  if (filter === "ALL") return true;
  if (filter === "ERRORS") return ["INCOMPLETE_ADDRESS", "INVALID_ADDRESS", "FAILED"].includes(item.operatorState);
  return item.operatorState === filter;
}

function addressLabel(item: GeoAdminOperatorRow) {
  if (item.formattedAddress) return item.formattedAddress.split("\n");
  if (item.city) return [item.city];
  return ["—"];
}

function addressStateLabel(item: GeoAdminOperatorRow) {
  if (item.addressState === "COMPLETE") return "🟢 Kompletná";
  if (item.addressState === "AVAILABLE") return "🟢 Dostupná";
  if (item.addressState === "MISSING") return "🔴 Chýba";
  if (item.addressState === "INCOMPLETE") return "🔴 Neúplná";
  return "🟡 Treba skontrolovať";
}

export function AdminGeoOperatorDashboard({
  items,
  summary,
}: {
  items: GeoAdminOperatorRow[];
  summary: GeoAdminOperatorSummary;
}) {
  const router = useRouter();
  const [group, setGroup] = useState<GeoGroupFilter>("ALL");
  const [filter, setFilter] = useState<GeoOperatorFilter>("ALL");
  const [query, setQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedMapTargets, setSelectedMapTargets] = useState<GoogleMapFilter[]>([]);
  const [bulkCount, setBulkCount] = useState(20);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkResults, setBulkResults] = useState<GoogleBulkResult[]>([]);
  const [bulkCursorId, setBulkCursorId] = useState<number | null>(null);

  const groupOptions = useMemo(() => {
    const counts = {
      SERVICES: items.filter((item) => item.group === "SERVICES").length,
      HELP: items.filter((item) => item.group === "HELP").length,
      EVENTS: items.filter((item) => item.group === "EVENTS").length,
    };
    return [
      { value: "ALL" as const, label: "Všetko", count: items.length },
      { value: "SERVICES" as const, label: groupLabels.SERVICES, count: counts.SERVICES },
      { value: "HELP" as const, label: groupLabels.HELP, count: counts.HELP },
      { value: "EVENTS" as const, label: groupLabels.EVENTS, count: counts.EVENTS },
    ];
  }, [items]);

  const scopedItems = useMemo(
    () => group === "ALL" ? items : items.filter((item) => item.group === group),
    [group, items],
  );

  const scopedSummary = useMemo(() => {
    if (group === "ALL") return summary;
    return Object.fromEntries(
      (Object.keys(geoAdminOperatorStateLabels) as GeoAdminOperatorState[]).map((state) => [
        state,
        scopedItems.filter((item) => item.operatorState === state).length,
      ]),
    ) as GeoAdminOperatorSummary;
  }, [group, scopedItems, summary]);

  const categoryOptions = useMemo(() => {
    const byCategory = new Map<string, { value: string; label: string; count: number }>();
    for (const item of scopedItems) {
      const current = byCategory.get(item.category);
      if (current) current.count += 1;
      else byCategory.set(item.category, { value: item.category, label: item.categoryLabel || item.category, count: 1 });
    }
    return [...byCategory.values()].sort((left, right) => left.label.localeCompare(right.label, "sk"));
  }, [scopedItems]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("sk");
    return scopedItems.filter((item) => {
      if (!matchesFilter(item, filter)) return false;
      if (selectedCategories.length && !selectedCategories.includes(item.category)) return false;
      if (selectedMapTargets.length && !selectedMapTargets.includes(item.googleMapsTarget)) return false;
      if (!needle) return true;
      return [
        item.name,
        item.city,
        item.district,
        item.region,
        item.category,
        item.categoryLabel,
        item.groupLabel,
        item.formattedAddress ?? "",
      ].join(" ").toLocaleLowerCase("sk").includes(needle);
    });
  }, [filter, query, scopedItems, selectedCategories, selectedMapTargets]);

  const serviceItems = useMemo(
    () => items.filter((item) => item.targetType === "DIRECTORY_PROFILE"),
    [items],
  );

  const bulkEligible = useMemo(
    () => visible.filter((item) => item.targetType === "DIRECTORY_PROFILE" && item.googleMapsTarget !== "PLACE"),
    [visible],
  );

  const bulkCursorIndex = useMemo(
    () => bulkCursorId === null ? -1 : serviceItems.findIndex((item) => item.targetId === bulkCursorId),
    [bulkCursorId, serviceItems],
  );

  const bulkRemaining = useMemo(
    () => visible.filter((item) => {
      if (item.targetType !== "DIRECTORY_PROFILE" || item.googleMapsTarget === "PLACE") return false;
      const itemIndex = serviceItems.findIndex((candidate) => candidate.targetId === item.targetId);
      return itemIndex > bulkCursorIndex;
    }),
    [bulkCursorIndex, serviceItems, visible],
  );

  function resetBulkSession() {
    setBulkCursorId(null);
    setBulkResults([]);
    setBulkError("");
    setBulkProgress("");
  }

  function changeGroup(next: GeoGroupFilter) {
    resetBulkSession();
    setGroup(next);
    setSelectedCategories([]);
  }

  function toggleCategory(category: string) {
    resetBulkSession();
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((value) => value !== category)
        : [...current, category],
    );
  }

  function toggleMapTarget(target: GoogleMapFilter) {
    resetBulkSession();
    setSelectedMapTargets((current) =>
      current.includes(target)
        ? current.filter((value) => value !== target)
        : [...current, target],
    );
  }

  function normalizedBulkCount() {
    const value = Math.trunc(Number(bulkCount) || 1);
    return Math.max(1, Math.min(100, value));
  }

  async function runGoogleBulk() {
    const requested = normalizedBulkCount();
    setBulkCount(requested);
    setBulkError("");
    setBulkResults([]);

    const targets = bulkRemaining.slice(0, requested);
    if (!targets.length) {
      setBulkError(bulkCursorId === null
        ? "V aktuálnom filtri nie je žiadna služba bez aktuálneho Google Place."
        : "Za poslednou dávkou už nie je ďalšia služba bez aktuálneho Google Place.");
      return;
    }

    if (!window.confirm(
      `Skontrolovať ${targets.length} profilov služieb cez Google Maps? Jednoznačné zhody sa automaticky uložia; nejasné výsledky zostanú na ručnú kontrolu.`,
    )) return;

    setBulkBusy(true);
    const results: GoogleBulkResult[] = [];

    try {
      const validationResponse = await fetch("/api/admin/geo/bulk-google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "validate-targets",
          targetIds: targets.map((item) => item.targetId),
        }),
      });
      const validation = await validationResponse.json() as { error?: string };
      if (!validationResponse.ok) throw new Error(validation.error || "Target set sa nepodarilo overiť.");

      for (let index = 0; index < targets.length; index += 1) {
        const target = targets[index];
        setBulkProgress(`Google Maps kontrola: ${index + 1}/${targets.length} — ${target.name}`);
        const response = await fetch("/api/admin/geo/bulk-google", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "process-target",
            targetId: target.targetId,
            confirm: "GOOGLE-PLACE-BULK",
          }),
        });
        const body = await response.json() as { result?: GoogleBulkResult; error?: string };
        if (!response.ok || !body.result) throw new Error(body.error || `Profil #${target.targetId} sa nepodarilo spracovať.`);
        results.push(body.result);
        setBulkResults([...results]);
      }

      setBulkCursorId(targets[targets.length - 1].targetId);
      router.refresh();
    } catch (caught) {
      setBulkError(caught instanceof Error ? caught.message : "Google bulk kontrola zlyhala.");
    } finally {
      setBulkBusy(false);
      setBulkProgress("");
    }
  }

  const onMapGooglePlaceCount = scopedItems.filter((item) => item.operatorState === "ON_MAP" && item.googleMapsTarget === "PLACE").length;
  const onMapCoordinatesCount = scopedItems.filter((item) => item.operatorState === "ON_MAP" && item.googleMapsTarget === "COORDINATES").length;

  const cards: Array<{ state: GeoAdminOperatorState; label: string }> = [
    { state: "ON_MAP", label: "Na mape" },
    { state: "PENDING", label: "Čaká na spracovanie" },
    { state: "NEEDS_REVIEW", label: "Treba skontrolovať" },
    { state: "MISSING_ADDRESS", label: "Chýba adresa" },
    { state: "INCOMPLETE_ADDRESS", label: "Neúplná / neplatná adresa" },
    { state: "FAILED", label: "Spracovanie zlyhalo" },
  ];

  return (
    <div data-admin-geo-operator>
      <section className="admin-form-card" data-admin-map-groups aria-labelledby="geo-operator-groups">
        <div className="admin-overview-heading">
          <div>
            <span>MAPY — SPOLOČNÝ HUB</span>
            <h2 id="geo-operator-groups">Služby, Pomoc psom a Podujatia</h2>
          </div>
          <p>Vyber agendu. Kategórie, zoznam, počty, mapa aj vyhľadávanie sa prispôsobia výberu.</p>
        </div>
        <div className="admin-status-filter" aria-label="Filtrovať podľa sekcie" style={{ flexWrap: "wrap" }}>
          {groupOptions.map((item) => (
            <button
              type="button"
              key={item.value}
              disabled={bulkBusy}
              className={group === item.value ? "is-active" : ""}
              aria-pressed={group === item.value}
              onClick={() => changeGroup(item.value)}
            >
              {item.label} ({item.count})
            </button>
          ))}
        </div>
      </section>

      <section className="admin-form-card" aria-labelledby="geo-operator-summary">
        <div className="admin-overview-heading">
          <div>
            <span>MAPA — STAV</span>
            <h2 id="geo-operator-summary">Stav mapových položiek</h2>
          </div>
          <p>DIRECTORY_PROFILE používa svoj exact-address contract; organizácie a podujatia používajú vlastný location contract.</p>
        </div>
        <div className="admin-stats" aria-label="Súhrn geo stavov">
          {cards.map(({ state, label }) => (
            <div key={state}>
              <span>{stateIcon[state]} {label}</span>
              <strong>{state === "INCOMPLETE_ADDRESS" ? scopedSummary.INCOMPLETE_ADDRESS + scopedSummary.INVALID_ADDRESS : scopedSummary[state]}</strong>
              {state === "ON_MAP" ? (
                <small aria-label="Spôsob otvorenia v Google Maps" style={{ display: "grid", gap: 2, marginTop: 8 }}>
                  <span>🏷️ Konkrétne miesto: {onMapGooglePlaceCount}</span>
                  <span>📍 Iba súradnice: {onMapCoordinatesCount}</span>
                </small>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {(group === "ALL" || group === "SERVICES") ? (
        <section className="admin-form-card" data-admin-google-place-bulk>
          <div className="admin-overview-heading">
            <div>
              <span>GOOGLE MAPS — HROMADNE · IBA SLUŽBY</span>
              <h2>Automaticky doplniť Google profily</h2>
            </div>
            <p>Bulk zostáva výhradne pre DIRECTORY_PROFILE. Jednoznačné zhody sa potvrdia; nejasné a explicitne neverejné polohy zostanú na kontrolu.</p>
          </div>

          <div className="admin-field-grid">
            <div className="admin-field">
              <label htmlFor="google-bulk-count">Počet profilov na kontrolu</label>
              <input
                id="google-bulk-count"
                type="number"
                min={1}
                max={100}
                step={1}
                value={bulkCount}
                disabled={bulkBusy}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setBulkCount(Number.isFinite(next) ? next : 1);
                }}
                onBlur={() => setBulkCount(normalizedBulkCount())}
              />
              <small>1 až 100 služieb z aktuálneho filtra. Kurzor po dávke pokračuje za posledným spracovaným profilom.</small>
            </div>
            <div className="admin-field">
              <label>Aktuálne dostupné</label>
              <p className="admin-help"><strong>{bulkEligible.length}</strong> služieb bez aktuálneho Google Place.<br />Za poslednou dávkou zostáva <strong>{bulkRemaining.length}</strong>.</p>
            </div>
          </div>

          <div className="admin-editor-actions" style={{ flexWrap: "wrap" }}>
            <button type="button" disabled={bulkBusy || bulkRemaining.length === 0} onClick={() => void runGoogleBulk()}>
              {bulkBusy
                ? "Spracúvam…"
                : bulkCursorId === null
                  ? `Skontrolovať cez Google Maps (max. ${normalizedBulkCount()})`
                  : `Pokračovať ďalšou dávkou (max. ${normalizedBulkCount()})`}
            </button>
            {bulkCursorId !== null ? (
              <button type="button" disabled={bulkBusy} onClick={resetBulkSession}>
                Začať od začiatku
              </button>
            ) : null}
          </div>

          {bulkProgress ? <p className="admin-message" role="status">{bulkProgress}</p> : null}
          {bulkError ? <p className="admin-message admin-message--error" role="alert">{bulkError}</p> : null}

          {bulkResults.length ? (
            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
              <p className="admin-help">
                Spracované <strong>{bulkResults.length}</strong>
                {" · "}potvrdené <strong>{bulkResults.filter((item) => item.result === "UPDATED").length}</strong>
                {" · "}na kontrolu <strong>{bulkResults.filter((item) => item.result === "REVIEW").length}</strong>
                {" · "}nenájdené <strong>{bulkResults.filter((item) => item.result === "NO_MATCH").length}</strong>
                {" · "}preskočené <strong>{bulkResults.filter((item) => item.result === "SKIPPED").length}</strong>
                {" · "}chyby <strong>{bulkResults.filter((item) => item.result === "ERROR").length}</strong>
              </p>
              {bulkResults.map((result) => (
                <article key={result.targetId} className="admin-form-card" style={{ margin: 0, overflow: "hidden" }}>
                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "start" }}>
                    <div style={{ minWidth: 0 }}>
                      <strong>{result.name || `#${result.targetId}`}</strong>
                      <p className="admin-help" style={{ margin: "6px 0 0" }}>
                        {result.result === "UPDATED" ? "✅ Potvrdené" : result.result === "REVIEW" ? "🟡 Kontrola" : result.result === "NO_MATCH" ? "⚪ Nenájdené" : result.result === "SKIPPED" ? "⏭️ Preskočené" : "🔴 Chyba"}
                      </p>
                      {result.candidate ? <p className="admin-help" style={{ margin: "6px 0 0", overflowWrap: "anywhere" }}><strong>{result.candidate.displayName}</strong><br />{result.candidate.formattedAddress}</p> : null}
                      <p className="admin-help" style={{ margin: "6px 0 0" }}>{result.reason}</p>
                    </div>
                    <Link href={`/admin/adresar/${result.targetId}#service-address`}>Otvoriť</Link>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="admin-form-card" data-admin-map-filters>
        <div className="admin-toolbar" style={{ alignItems: "stretch", gap: 12, flexWrap: "wrap" }}>
          <label className="admin-search" style={{ flex: "1 1 280px", minWidth: 0 }}>
            <span className="sr-only">Hľadať mapovú položku</span>
            <input
              value={query}
              disabled={bulkBusy}
              onChange={(event) => {
                resetBulkSession();
                setQuery(event.target.value);
              }}
              placeholder="Hľadať názov, mesto, okres, kraj alebo kategóriu"
            />
          </label>
          <div className="admin-status-filter" aria-label="Filtrovať podľa geo stavu" style={{ flexWrap: "wrap" }}>
            {filters.map((item) => (
              <button
                type="button"
                key={item.value}
                disabled={bulkBusy}
                className={filter === item.value ? "is-active" : ""}
                aria-pressed={filter === item.value}
                onClick={() => {
                  resetBulkSession();
                  setFilter(item.value);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <details open style={{ marginTop: 14 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Ďalšie filtre</summary>
          <div className="admin-field-grid" style={{ marginTop: 12 }}>
            <fieldset className="admin-field">
              <legend><strong>Kategórie</strong></legend>
              <p className="admin-help">Možnosti sa menia podľa sekcie. Checkboxy sa dajú kombinovať.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {categoryOptions.map((category) => (
                  <label key={category.value} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      disabled={bulkBusy}
                      checked={selectedCategories.includes(category.value)}
                      onChange={() => toggleCategory(category.value)}
                    />
                    <span>{category.label} ({category.count})</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="admin-field">
              <legend><strong>Google Maps / mapa</strong></legend>
              <p className="admin-help">Bez označenia sa zobrazujú všetky mapové stavy. Možnosti sa dajú kombinovať.</p>
              <div style={{ display: "grid", gap: 8 }}>
                {([
                  ["PLACE", "🏷️ Google Maps — konkrétne miesto"],
                  ["COORDINATES", "📍 Iba súradnice"],
                  ["NONE", "⚪ Bez Google Place / bez mapového cieľa"],
                ] as const).map(([value, label]) => (
                  <label key={value} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      disabled={bulkBusy}
                      checked={selectedMapTargets.includes(value)}
                      onChange={() => toggleMapTarget(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="admin-editor-actions" style={{ marginTop: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={bulkBusy || (group === "ALL" && !selectedCategories.length && !selectedMapTargets.length && filter === "ALL" && !query)}
              onClick={() => {
                resetBulkSession();
                setGroup("ALL");
                setSelectedCategories([]);
                setSelectedMapTargets([]);
                setFilter("ALL");
                setQuery("");
              }}
            >
              Zrušiť všetky filtre
            </button>
          </div>
        </details>

        <p className="admin-help" aria-live="polite">
          Zobrazené: <strong>{visible.length}</strong> z {scopedItems.length} položiek sekcie.
          {selectedCategories.length ? <> · kategórie: <strong>{selectedCategories.length}</strong></> : null}
          {selectedMapTargets.length ? <> · mapové filtre: <strong>{selectedMapTargets.length}</strong></> : null}
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          {visible.map((item) => {
            const lines = addressLabel(item);
            const addressProblem = ["MISSING_ADDRESS", "INCOMPLETE_ADDRESS", "INVALID_ADDRESS"].includes(item.operatorState);
            const review = item.operatorState === "NEEDS_REVIEW";
            return (
              <article key={item.key} className="admin-form-card" data-operator-state={item.operatorState} data-target-type={item.targetType} style={{ margin: 0, overflow: "hidden" }}>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="admin-article-tags" style={{ marginBottom: 6 }}>
                      <span>{item.groupLabel}</span>
                      <span>{item.categoryLabel}</span>
                      <span>{stateIcon[item.operatorState]} {geoAdminOperatorStateLabels[item.operatorState]}</span>
                    </div>
                    <h3 style={{ margin: 0 }}>{item.name}</h3>
                    <p className="admin-help" style={{ margin: "8px 0 0", whiteSpace: "pre-line" }}>
                      <strong>Lokalita / adresa:</strong><br />
                      {lines.map((line, index) => <span key={index}>{line}{index < lines.length - 1 ? <br /> : null}</span>)}
                    </p>
                    <p className="admin-help" style={{ margin: "6px 0 0" }}>
                      <strong>Stav adresy/lokality:</strong> {addressStateLabel(item)}
                      {" · "}
                      <strong>Stav mapy:</strong> {stateIcon[item.operatorState]} {geoAdminOperatorStateLabels[item.operatorState]}
                      {" · "}
                      <strong>Google Maps:</strong> {item.googleMapsTarget === "PLACE" ? "🏷️ Konkrétne miesto" : item.googleMapsTarget === "COORDINATES" ? "📍 Iba súradnice" : "⚪ Bez Google Place"}
                    </p>
                    <p className="admin-help" style={{ margin: "6px 0 0" }}>{item.operatorReason}</p>
                  </div>

                  <div className="admin-row-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <Link className={addressProblem || review ? "admin-primary-action" : undefined} href={item.editorHref}>
                      {addressProblem ? "Otvoriť editor lokality" : review ? "Skontrolovať problém" : "Otvoriť editor"}
                    </Link>
                    {review ? <Link href={item.attentionHref}>Centrum pozornosti</Link> : null}
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <AdminGooglePlacePicker
                    targetType={item.targetType}
                    targetId={item.targetId}
                    compact
                    available={item.googlePickerAvailable}
                    unavailableReason={item.googlePickerUnavailableReason ?? ""}
                    onConfirmed={() => router.refresh()}
                  />
                </div>

                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 700 }}>Technické detaily</summary>
                  <div className="admin-help" style={{ marginTop: 10, display: "grid", gap: 4, overflowWrap: "anywhere" }}>
                    <span>target type: {item.targetType}</span>
                    <span>canonical ID: {item.targetId}</span>
                    <span>unique key: {item.key}</span>
                    <span>geo_point ID: {item.geoPointId ?? "—"}</span>
                    <span>geocode_status: {item.geocodeStatus ?? "—"}</span>
                    <span>public_visibility: {item.publicVisibility ?? "—"}</span>
                    <span>precision: {item.publicPrecision ?? "—"}</span>
                    <span>provider: {item.provider ?? "—"}</span>
                    <span>normalized query: {item.normalizedQuery ?? "—"}</span>
                    <span>source_fingerprint: {item.sourceFingerprint ?? "—"}</span>
                    <span>resolved_source_fingerprint: {item.resolvedSourceFingerprint ?? "—"}</span>
                    <span>google_place_id: {item.googlePlaceId ?? "—"}</span>
                    <span>google_place_source_fingerprint: {item.googlePlaceSourceFingerprint ?? "—"}</span>
                    <span>google_maps_target: {item.googleMapsTarget}</span>
                    <span>latitude: {item.latitude ?? "—"}</span>
                    <span>longitude: {item.longitude ?? "—"}</span>
                    <span>error/reason code: {item.errorCode ?? item.addressReason}</span>
                    <span>manual override: {item.manualOverride ? "áno" : "nie"}</span>
                    <span>explicit private: {item.explicitPrivate ? "áno" : "nie"}</span>
                    <span>updated: {item.updatedAt ?? "—"}</span>
                    {item.legacyAddress && !item.formattedAddress ? <span><strong>Historická adresa:</strong> {item.legacyAddress}</span> : null}
                  </div>
                </details>
              </article>
            );
          })}

          {!visible.length ? (
            <div className="admin-empty">
              <span>🗺️</span>
              <h2>Žiadne položky pre zvolený filter</h2>
              <p>Skús zmeniť sekciu, stav alebo vyhľadávanie.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
