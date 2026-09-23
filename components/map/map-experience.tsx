"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "@/components/icons";
import { directoryCategories } from "@/lib/directory";
import { eventTypes, slovakRegions } from "@/lib/events";
import type { MapCluster, MapItem, MapResponse } from "@/lib/map-contract";
import {
  EMPTY_MAP_FILTERS,
  MAP_DEFAULT_BBOX,
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_FETCH_DEBOUNCE_MS,
  buildMapApiUrl,
  isApproximateMapItem,
  mapFiltersForCategory,
  mapFiltersForDistrict,
  mapFiltersForRegion,
  mapItemTypeLabel,
  mapResultLabel,
  serializeMapUiFilters,
  type MapUiFilters,
  type MapViewport,
} from "@/lib/map-public-ui";
import {
  GoogleMapRenderer,
  type MapRendererCommand,
  type MapRendererStatus,
} from "./google-map-renderer";
import styles from "./map-public.module.css";

type MapApiErrorKind = "validation" | "rate-limit" | "unavailable" | "network" | "server";

type MapApiError = {
  kind: MapApiErrorKind;
  message: string;
};

type Props = {
  initialFilters: MapUiFilters;
  googleApiKey: string;
  googleMapId: string;
  testRenderer?: boolean;
};

type FilterPanelProps = {
  filters: MapUiFilters;
  onChange: (filters: MapUiFilters) => void;
  compact?: boolean;
};

function FilterFields({ filters, onChange, compact = false }: FilterPanelProps) {
  const serviceCategory = filters.category === "services";
  const eventCategory = filters.category === "events";
  const regions = slovakRegions.filter((region) => region !== "Online");

  return (
    <>
      {serviceCategory ? (
        <label>
          <span>Typ služby</span>
          <select
            value={filters.subcategory}
            onChange={(event) => onChange({ ...filters, subcategory: event.target.value })}
          >
            <option value="">Všetky služby</option>
            {directoryCategories.map((category) => (
              <option value={category.slug} key={category.slug}>{category.label}</option>
            ))}
          </select>
        </label>
      ) : null}

      <label>
        <span>Kraj</span>
        <select
          value={filters.region}
          onChange={(event) => onChange(mapFiltersForRegion(filters, event.target.value))}
        >
          <option value="">Všetky kraje</option>
          {regions.map((region) => <option value={region} key={region}>{region}</option>)}
        </select>
      </label>

      <label>
        <span>Okres</span>
        <input
          value={filters.district}
          onChange={(event) => onChange(mapFiltersForDistrict(filters, event.target.value))}
          placeholder="Napr. Nitra"
          autoComplete="address-level2"
        />
      </label>

      <label>
        <span>Mesto / obec</span>
        <input
          value={filters.city}
          onChange={(event) => onChange({ ...filters, city: event.target.value })}
          placeholder="Napr. Trnava"
          autoComplete="address-level2"
        />
      </label>

      {eventCategory ? (
        <>
          <label>
            <span>Typ podujatia</span>
            <select
              value={filters.eventType}
              onChange={(event) => onChange({ ...filters, eventType: event.target.value })}
            >
              <option value="">Všetky typy</option>
              {eventTypes.map((eventType) => <option value={eventType} key={eventType}>{eventType}</option>)}
            </select>
          </label>
          <label>
            <span>Termín</span>
            <select
              value={filters.eventTiming}
              onChange={(event) => onChange({
                ...filters,
                eventTiming: event.target.value as MapUiFilters["eventTiming"],
              })}
            >
              <option value="active">Aktuálne a najbližšie</option>
              <option value="current">Práve prebiehajú</option>
              <option value="upcoming">Budúce</option>
            </select>
          </label>
        </>
      ) : null}

      {!compact && !serviceCategory && !eventCategory ? (
        <label>
          <span>Podkategória</span>
          <input
            value={filters.subcategory}
            onChange={(event) => onChange({ ...filters, subcategory: event.target.value })}
            placeholder={filters.category === "organizations" ? "Typ organizácie" : "Voliteľné"}
          />
        </label>
      ) : null}
    </>
  );
}

function activeFilterCount(filters: MapUiFilters) {
  return [
    filters.category,
    filters.subcategory,
    filters.region,
    filters.district,
    filters.city,
    filters.eventType,
    filters.eventTiming !== "active" ? filters.eventTiming : "",
  ].filter(Boolean).length;
}

function formatEventDate(value?: string) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("sk-SK", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Bratislava",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function isMapResponse(value: unknown): value is MapResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MapResponse>;
  if (candidate.mode === "items") return Array.isArray(candidate.items) && Boolean(candidate.meta);
  if (candidate.mode === "clusters") return Array.isArray(candidate.clusters) && Boolean(candidate.meta);
  return false;
}

function responseItems(response: MapResponse | null) {
  return response?.mode === "items" ? response.items : [];
}

function responseClusters(response: MapResponse | null) {
  return response?.mode === "clusters" ? response.clusters : [];
}

function MapResultCard({
  item,
  selected,
  onSelect,
  cardRef,
}: {
  item: MapItem;
  selected: boolean;
  onSelect: () => void;
  cardRef: (element: HTMLElement | null) => void;
}) {
  const approximate = isApproximateMapItem(item);
  const eventDate = item.entityType === "event" ? formatEventDate(item.eventStart) : "";
  const linkLabel = item.entityType === "event" ? "Detail podujatia" : "Zobraziť profil";

  return (
    <article
      className={styles.resultCard}
      data-selected={selected ? "true" : "false"}
      data-testid={`map-card-${item.id}`}
      ref={cardRef}
    >
      <button
        type="button"
        className={styles.resultSelect}
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Zobraziť ${item.name} na mape`}
      >
        <span className={styles.cardMeta}>
          <span className={styles.typeBadge}>{mapItemTypeLabel(item)}</span>
          {approximate ? <span className={styles.approximateBadge}>Približná poloha</span> : null}
          {item.verified ? <span className={styles.verifiedBadge}>Overené</span> : null}
        </span>
        <strong>{item.name}</strong>
        {eventDate ? <p className={styles.eventDate}>{eventDate}</p> : null}
        <p>{item.displayLocation || item.city || item.region || "Lokalita nie je uvedená"}</p>
      </button>
      <div className={styles.cardFooter}>
        <Link className={styles.resultLink} href={item.href}>{linkLabel}</Link>
      </div>
    </article>
  );
}

function MapResults({
  response,
  loading,
  error,
  selectedItemId,
  onSelectItem,
  onRetry,
  onClearFilters,
  sheetState,
  onToggleSheet,
  cardRefs,
}: {
  response: MapResponse | null;
  loading: boolean;
  error: MapApiError | null;
  selectedItemId: string | null;
  onSelectItem: (item: MapItem) => void;
  onRetry: () => void;
  onClearFilters: () => void;
  sheetState: "peek" | "expanded";
  onToggleSheet: () => void;
  cardRefs: React.MutableRefObject<Map<string, HTMLElement>>;
}) {
  const items = responseItems(response);
  const clusters = responseClusters(response);
  const countLabel = response
    ? response.mode === "items"
      ? mapResultLabel(response.meta.count)
      : `${response.meta.count} oblastí · ${mapResultLabel(response.meta.matched)}`
    : "Výsledky";

  return (
    <aside
      className={styles.resultsPanel}
      data-sheet-state={sheetState}
      aria-label="Výsledky mapy"
      data-testid="map-results-panel"
    >
      <header className={styles.resultsHead}>
        <div className={styles.resultsHeadTop}>
          <h2>{countLabel}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {loading ? <span className={styles.loadingDot} aria-label="Načítavam výsledky" /> : null}
            <button
              type="button"
              className={styles.sheetToggle}
              onClick={onToggleSheet}
              aria-expanded={sheetState === "expanded"}
              aria-controls="map-result-scroll"
            >
              {sheetState === "expanded" ? "Zmenšiť" : "Výsledky"}
            </button>
          </div>
        </div>
        <p aria-live="polite">
          {response?.mode === "clusters"
            ? "Priblíž mapu alebo vyber zhluk, aby sa zobrazili jednotlivé miesta."
            : "Vyber kartu alebo marker. Detail sa otvorí až cez samostatné tlačidlo."}
        </p>
      </header>

      <div className={styles.resultsScroll} id="map-result-scroll">
        {error ? (
          <div className={styles.stateCard} role="alert" data-testid="map-api-error">
            <strong>{error.message}</strong>
            <span>{error.kind === "validation" ? "Skús zrušiť filtre a načítať mapu znova." : "Mapa zostáva na stránke; požiadavku môžeš zopakovať."}</span>
            <button type="button" className={styles.statusAction} onClick={onRetry}>Skúsiť znova</button>
          </div>
        ) : null}

        {!error && !response && loading ? (
          <div className={styles.stateCard} role="status">
            <strong>Načítavam mapu Psipedie…</strong>
            <span>Pripravujeme záznamy pre aktuálnu oblasť.</span>
          </div>
        ) : null}

        {!error && response?.mode === "items" && response.meta.count === 0 ? (
          <div className={styles.stateCard} data-testid="map-empty-state">
            <strong>V tejto oblasti sme nenašli záznamy pre zvolené filtre.</strong>
            <span>Skús zrušiť filtre alebo oddialiť mapu.</span>
            <button type="button" className={styles.statusAction} onClick={onClearFilters}>Zrušiť filtre</button>
          </div>
        ) : null}

        {!error && response?.mode === "clusters" && clusters.length === 0 ? (
          <div className={styles.stateCard} data-testid="map-empty-state">
            <strong>V tejto oblasti sme nenašli záznamy pre zvolené filtre.</strong>
            <span>Skús zrušiť filtre alebo zmeniť oblasť mapy.</span>
            <button type="button" className={styles.statusAction} onClick={onClearFilters}>Zrušiť filtre</button>
          </div>
        ) : null}

        {!error && response?.mode === "clusters" && clusters.length > 0 ? (
          <div className={styles.stateCard} data-testid="map-cluster-summary">
            <strong>Mapa je zatiaľ v súhrnnom pohľade.</strong>
            <span>{mapResultLabel(response.meta.matched)} je zoskupených do {response.meta.count} oblastí. Klikni na zhluk na mape a priblíž sa.</span>
          </div>
        ) : null}

        {!error && items.length > 0 ? (
          <div className={styles.resultList}>
            {items.map((item) => (
              <MapResultCard
                item={item}
                selected={selectedItemId === item.id}
                key={item.id}
                onSelect={() => onSelectItem(item)}
                cardRef={(element) => {
                  if (element) cardRefs.current.set(item.id, element);
                  else cardRefs.current.delete(item.id);
                }}
              />
            ))}
          </div>
        ) : null}
      </div>

      {response?.meta.truncated ? (
        <div className={styles.truncatedNotice} data-testid="map-truncated-state">
          Zobrazuje sa iba časť výsledkov. Priblíž mapu alebo spresni filtre.
        </div>
      ) : response?.meta.attribution?.length ? (
        <div className={styles.attribution} aria-label="Zdroj lokalizačných údajov">
          {response.meta.attribution.map((item, index) => (
            item.url
              ? <a href={item.url} target="_blank" rel="noreferrer" key={`${item.label}-${index}`}>{item.label}</a>
              : <span key={`${item.label}-${index}`}>{item.label}</span>
          ))}
        </div>
      ) : <div />}
    </aside>
  );
}

export function MapExperience({
  initialFilters,
  googleApiKey,
  googleMapId,
  testRenderer = false,
}: Props) {
  const [filters, setFilters] = useState(initialFilters);
  const [viewport, setViewport] = useState<MapViewport>({
    bbox: MAP_DEFAULT_BBOX,
    center: MAP_DEFAULT_CENTER,
    zoom: MAP_DEFAULT_ZOOM,
  });
  const [response, setResponse] = useState<MapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<MapApiError | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [rendererStatus, setRendererStatus] = useState<MapRendererStatus>(
    testRenderer ? "ready" : (!googleApiKey || !googleMapId ? "missing-config" : "loading"),
  );
  const [rendererCommand, setRendererCommand] = useState<MapRendererCommand | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [sheetState, setSheetState] = useState<"peek" | "expanded">("peek");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const requestSequence = useRef(0);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const filterDialogRef = useRef<HTMLDivElement>(null);

  const apiUrl = useMemo(() => buildMapApiUrl(viewport, filters), [filters, viewport]);
  const items = responseItems(response);
  const clusters = responseClusters(response);
  const filterCount = activeFilterCount(filters);

  const updateFilters = useCallback((next: MapUiFilters) => {
    setFilters(next);
    setSelectedItemId(null);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_MAP_FILTERS);
    setSelectedItemId(null);
  }, []);

  useEffect(() => {
    const params = serializeMapUiFilters(filters);
    const query = params.toString();
    const nextUrl = query ? `/mapa?${query}` : "/mapa";
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [filters]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetch(apiUrl, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const payload: unknown = await result.json().catch(() => null);
        if (requestId !== requestSequence.current) return;

        if (!result.ok) {
          if (result.status === 400) throw { kind: "validation", message: "Filtre sa nepodarilo spracovať." } satisfies MapApiError;
          if (result.status === 429) throw { kind: "rate-limit", message: "Mapa dostala priveľa požiadaviek. Skús to o chvíľu znova." } satisfies MapApiError;
          if (result.status === 503) throw { kind: "unavailable", message: "Mapové dáta sú dočasne nedostupné." } satisfies MapApiError;
          throw { kind: "server", message: "Mapové výsledky sa nepodarilo načítať." } satisfies MapApiError;
        }
        if (!isMapResponse(payload)) {
          throw { kind: "server", message: "Mapové výsledky majú neočakávaný formát." } satisfies MapApiError;
        }

        setResponse(payload);
        setSelectedItemId((current) => (
          current && payload.mode === "items" && payload.items.some((item) => item.id === current)
            ? current
            : null
        ));
      } catch (caught) {
        if (controller.signal.aborted || requestId !== requestSequence.current) return;
        const next = caught && typeof caught === "object" && "kind" in caught
          ? caught as MapApiError
          : { kind: "network", message: "Spojenie s mapou sa prerušilo." } satisfies MapApiError;
        setError(next);
      } finally {
        if (!controller.signal.aborted && requestId === requestSequence.current) setLoading(false);
      }
    }, MAP_FETCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [apiUrl, retryNonce]);

  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const trigger = filterTriggerRef.current;
    const dialog = filterDialogRef.current;
    if (!dialog) return;

    const first = dialog.querySelector<HTMLElement>("button, input, select");
    first?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileFiltersOpen(false);
        window.setTimeout(() => trigger?.focus(), 0);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog!.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]"))
        .filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileFiltersOpen]);

  const selectItem = useCallback((item: MapItem) => {
    setSelectedItemId(item.id);
    setSheetState("expanded");
    setRendererCommand((current) => ({
      key: (current?.key ?? 0) + 1,
      type: "item",
      id: item.id,
      latitude: item.latitude,
      longitude: item.longitude,
      zoom: Math.max(viewport.zoom, 13),
    }));
    window.requestAnimationFrame(() => {
      cardRefs.current.get(item.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [viewport.zoom]);

  const selectItemById = useCallback((id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (item) selectItem(item);
  }, [items, selectItem]);

  const selectCluster = useCallback((cluster: MapCluster) => {
    setSelectedItemId(null);
    setRendererCommand((current) => ({
      key: (current?.key ?? 0) + 1,
      type: "cluster",
      id: cluster.id,
      latitude: cluster.latitude,
      longitude: cluster.longitude,
      zoom: Math.min(20, Math.max(viewport.zoom + 2, 9)),
    }));
  }, [viewport.zoom]);

  const rendererStatusLabel = rendererStatus === "ready"
    ? "Mapa pripravená"
    : rendererStatus === "loading"
      ? "Načítavam mapu"
      : rendererStatus === "missing-config"
        ? "Google Maps nie je nakonfigurovaný"
        : "Mapový podklad nie je dostupný";

  return (
    <section className={styles.experience} aria-label="Interaktívna mapa Psipedie">
      <div className={styles.toolbar}>
        <div className={styles.primaryRow}>
          <label className={styles.searchField}>
            <SearchIcon size={19} />
            <input
              value={filters.search}
              onChange={(event) => updateFilters({ ...filters, search: event.target.value })}
              placeholder="Hľadať názov, službu alebo lokalitu"
              aria-label="Vyhľadávanie v mape"
            />
          </label>

          <div className={styles.categoryChips} aria-label="Typ obsahu">
            {[
              ["", "Všetko"],
              ["services", "Služby"],
              ["organizations", "Organizácie"],
              ["events", "Podujatia"],
            ].map(([value, label]) => (
              <button
                type="button"
                className={styles.chip}
                aria-pressed={filters.category === value}
                key={value || "all"}
                onClick={() => updateFilters(mapFiltersForCategory(filters, value as MapUiFilters["category"]))}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            ref={filterTriggerRef}
            className={styles.filterButton}
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={mobileFiltersOpen}
          >
            <span>Filtre</span>
            {filterCount ? <span className={styles.filterCount}>{filterCount}</span> : null}
          </button>
        </div>

        <div className={styles.secondaryFilters} data-testid="map-desktop-filters">
          <FilterFields filters={filters} onChange={updateFilters} />
          <button type="button" className={styles.clearFilters} onClick={clearFilters}>Zrušiť filtre</button>
        </div>
      </div>

      <div className={styles.workspace}>
        <MapResults
          response={response}
          loading={loading}
          error={error}
          selectedItemId={selectedItemId}
          onSelectItem={selectItem}
          onRetry={() => setRetryNonce((value) => value + 1)}
          onClearFilters={clearFilters}
          sheetState={sheetState}
          onToggleSheet={() => setSheetState((value) => value === "peek" ? "expanded" : "peek")}
          cardRefs={cardRefs}
        />

        <div className={styles.mapPanel}>
          <GoogleMapRenderer
            apiKey={googleApiKey}
            mapId={googleMapId}
            testMode={testRenderer}
            items={items}
            clusters={clusters}
            selectedItemId={selectedItemId}
            viewport={viewport}
            command={rendererCommand}
            onViewportChange={setViewport}
            onSelectItem={selectItemById}
            onClusterClick={selectCluster}
            onStatusChange={setRendererStatus}
          />
          <div className={styles.mapStatusPill} role="status" data-testid="map-renderer-status">
            <span>{rendererStatusLabel}</span>
          </div>
        </div>
      </div>

      {mobileFiltersOpen ? (
        <>
          <button
            type="button"
            className={styles.mobileBackdrop}
            onClick={() => {
              setMobileFiltersOpen(false);
              window.setTimeout(() => filterTriggerRef.current?.focus(), 0);
            }}
            aria-label="Zavrieť filtre"
          />
          <div
            ref={filterDialogRef}
            className={styles.mobileFilterDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="map-filter-dialog-title"
            data-testid="map-filter-dialog"
          >
            <header className={styles.mobileFilterHead}>
              <h2 id="map-filter-dialog-title">Filtre mapy</h2>
              <button
                type="button"
                aria-label="Zavrieť filtre"
                onClick={() => {
                  setMobileFiltersOpen(false);
                  window.setTimeout(() => filterTriggerRef.current?.focus(), 0);
                }}
              >×</button>
            </header>
            <div className={styles.mobileFilterBody}>
              <FilterFields filters={filters} onChange={updateFilters} compact />
            </div>
            <footer className={styles.mobileFilterActions}>
              <button type="button" onClick={clearFilters}>Zrušiť filtre</button>
              <button
                type="button"
                onClick={() => {
                  setMobileFiltersOpen(false);
                  window.setTimeout(() => filterTriggerRef.current?.focus(), 0);
                }}
              >Použiť filtre</button>
            </footer>
          </div>
        </>
      ) : null}

      {rendererStatus === "load-error" || rendererStatus === "missing-config" ? (
        <p className="sr-only" aria-live="polite">
          {rendererStatusLabel}. Textový zoznam výsledkov zostáva dostupný.
        </p>
      ) : null}

      {clusters.length > 0 ? (
        <span className="sr-only" aria-live="polite">
          Mapa zobrazuje {clusters.length} zoskupených oblastí.
        </span>
      ) : null}
    </section>
  );
}
