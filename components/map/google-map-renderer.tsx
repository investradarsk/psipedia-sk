"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MapCluster, MapItem } from "@/lib/map-contract";
import {
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  type MapViewport,
} from "@/lib/map-public-ui";
import styles from "./map-public.module.css";

export type MapRendererStatus = "ready" | "loading" | "missing-config" | "load-error";

export type MapRendererCommand =
  | { key: number; type: "item"; id: string; latitude: number; longitude: number; zoom?: number }
  | { key: number; type: "cluster"; id: string; latitude: number; longitude: number; zoom: number };

type Props = {
  apiKey: string;
  mapId: string;
  testMode: boolean;
  items: MapItem[];
  clusters: MapCluster[];
  selectedItemId: string | null;
  viewport: MapViewport;
  command: MapRendererCommand | null;
  onViewportChange: (viewport: MapViewport) => void;
  onSelectItem: (id: string) => void;
  onClusterClick: (cluster: MapCluster) => void;
  onStatusChange: (status: MapRendererStatus) => void;
};

type LatLngLiteral = { lat: number; lng: number };

type ListenerHandle = { remove?: () => void };

type LatLngValue = {
  lat(): number;
  lng(): number;
};

type LatLngBoundsValue = {
  getNorthEast(): LatLngValue;
  getSouthWest(): LatLngValue;
};

type GoogleMapInstance = {
  addListener(eventName: string, handler: () => void): ListenerHandle;
  getBounds(): LatLngBoundsValue | undefined;
  getZoom(): number | undefined;
  getCenter(): LatLngValue | undefined;
  panTo(position: LatLngLiteral): void;
  setZoom(zoom: number): void;
};

type GoogleMapConstructor = new (
  element: HTMLElement,
  options: Record<string, unknown>,
) => GoogleMapInstance;

type GoogleAdvancedMarkerElement = HTMLElement & {
  map: GoogleMapInstance | null;
  position?: LatLngLiteral;
  title?: string;
  gmpClickable?: boolean;
};

type GoogleAdvancedMarkerConstructor = new (
  options: Record<string, unknown>,
) => GoogleAdvancedMarkerElement;

type GoogleRuntime = {
  maps: {
    importLibrary(name: string): Promise<unknown>;
  };
};

declare global {
  interface Window {
    google?: GoogleRuntime;
    __psipediaGoogleMapsReady?: () => void;
    __PSIPEDIA_MAP_INIT_COUNT__?: number;
  }
}

type MarkerRecord = {
  marker: GoogleAdvancedMarkerElement;
  element: HTMLDivElement;
  signature: string;
};

let googleLoaderPromise: Promise<GoogleRuntime> | null = null;

function googleScriptUrl(apiKey: string) {
  const params = new URLSearchParams({
    key: apiKey,
    loading: "async",
    v: "weekly",
    language: "sk",
    region: "SK",
    auth_referrer_policy: "origin",
    callback: "__psipediaGoogleMapsReady",
  });
  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

function loadGoogleMaps(apiKey: string) {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Maps requires a browser."));
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google);
  if (googleLoaderPromise) return googleLoaderPromise;

  googleLoaderPromise = new Promise<GoogleRuntime>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-psipedia-google-maps]");
    const finish = () => {
      if (window.google?.maps?.importLibrary) resolve(window.google);
      else reject(new Error("Google Maps loaded without importLibrary()."));
    };

    window.__psipediaGoogleMapsReady = finish;

    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps script failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = googleScriptUrl(apiKey);
    script.dataset.psipediaGoogleMaps = "1";
    script.addEventListener("error", () => {
      googleLoaderPromise = null;
      reject(new Error("Google Maps script failed to load."));
    }, { once: true });
    document.head.appendChild(script);
  });

  return googleLoaderPromise;
}

function markerSymbol(item: MapItem) {
  if (item.entityType === "organization") return "O";
  if (item.entityType === "event") return "P";
  return "S";
}

function itemSignature(item: MapItem) {
  return [
    item.latitude,
    item.longitude,
    item.entityType,
    item.precision,
    item.name,
  ].join("|");
}

function clusterSignature(cluster: MapCluster) {
  return [
    cluster.latitude,
    cluster.longitude,
    cluster.count,
    cluster.categoryCounts.services,
    cluster.categoryCounts.organizations,
    cluster.categoryCounts.events,
  ].join("|");
}

function markerClass(item: MapItem, selected: boolean) {
  return [
    styles.mapMarker,
    item.entityType === "service" ? styles.serviceMarker : "",
    item.entityType === "organization" ? styles.organizationMarker : "",
    item.entityType === "event" ? styles.eventMarker : "",
    item.precision !== "EXACT" ? styles.approximateMarker : "",
    selected ? styles.selectedMarker : "",
  ].filter(Boolean).join(" ");
}

function viewportFromMap(map: GoogleMapInstance): MapViewport | null {
  const bounds = map.getBounds();
  const center = map.getCenter();
  const zoom = map.getZoom();
  if (!bounds || !center || !Number.isFinite(zoom)) return null;
  const northEast = bounds.getNorthEast();
  const southWest = bounds.getSouthWest();
  return {
    bbox: {
      north: northEast.lat(),
      south: southWest.lat(),
      east: northEast.lng(),
      west: southWest.lng(),
    },
    center: { lat: center.lat(), lng: center.lng() },
    zoom: Math.round(zoom!),
  };
}

function testClusterViewport(cluster: MapCluster, zoom: number): MapViewport {
  const nextZoom = Math.min(20, Math.max(zoom + 2, 9));
  const span = nextZoom >= 12 ? 0.45 : nextZoom >= 10 ? 1.2 : 2.4;
  return {
    center: { lat: cluster.latitude, lng: cluster.longitude },
    zoom: nextZoom,
    bbox: {
      north: cluster.latitude + span,
      south: cluster.latitude - span,
      east: cluster.longitude + span,
      west: cluster.longitude - span,
    },
  };
}

function TestMapRenderer({
  items,
  clusters,
  selectedItemId,
  viewport,
  command,
  onViewportChange,
  onSelectItem,
  onClusterClick,
  onStatusChange,
}: Omit<Props, "apiKey" | "mapId" | "testMode">) {
  useEffect(() => {
    onStatusChange("ready");
  }, [onStatusChange]);

  useEffect(() => {
    if (!command) return;
    if (command.type === "cluster") {
      onViewportChange({
        ...testClusterViewport({
          id: command.id,
          latitude: command.latitude,
          longitude: command.longitude,
          count: 1,
          categoryCounts: { services: 0, organizations: 0, events: 0 },
        }, viewport.zoom),
        zoom: command.zoom,
      });
    }
  }, [command, onViewportChange, viewport.zoom]);

  return (
    <div className={styles.testMap} data-testid="map-test-renderer" data-map-init-count="1">
      <div className={styles.testMapLabel}>Testovací renderer mapy</div>
      <div className={styles.testMarkerLayer}>
        {clusters.map((cluster) => (
          <button
            type="button"
            className={styles.clusterMarker}
            key={cluster.id}
            data-testid={`cluster-${cluster.id}`}
            onClick={() => {
              onClusterClick(cluster);
            }}
          >
            {cluster.count}
          </button>
        ))}
        {items.map((item) => (
          <button
            type="button"
            className={markerClass(item, selectedItemId === item.id)}
            key={item.id}
            data-testid={`marker-${item.id}`}
            aria-pressed={selectedItemId === item.id}
            onClick={() => onSelectItem(item.id)}
          >
            {markerSymbol(item)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GoogleMapRenderer(props: Props) {
  const {
    apiKey,
    mapId,
    testMode,
    items,
    clusters,
    selectedItemId,
    viewport,
    command,
    onViewportChange,
    onSelectItem,
    onClusterClick,
    onStatusChange,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const markerCtorRef = useRef<GoogleAdvancedMarkerConstructor | null>(null);
  const markersRef = useRef(new Map<string, MarkerRecord>());
  const onViewportChangeRef = useRef(onViewportChange);
  const onSelectItemRef = useRef(onSelectItem);
  const onClusterClickRef = useRef(onClusterClick);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => { onViewportChangeRef.current = onViewportChange; }, [onViewportChange]);
  useEffect(() => { onSelectItemRef.current = onSelectItem; }, [onSelectItem]);
  useEffect(() => { onClusterClickRef.current = onClusterClick; }, [onClusterClick]);

  const configMissing = !apiKey.trim() || !mapId.trim();

  useEffect(() => {
    if (testMode) return;
    if (configMissing) {
      onStatusChange("missing-config");
      return;
    }
    let disposed = false;
    let idleListener: ListenerHandle | null = null;

    async function initialize() {
      if (!containerRef.current || mapRef.current) return;
      setLoadError(false);
      onStatusChange("loading");
      try {
        const google = await loadGoogleMaps(apiKey);
        const [mapsLibrary, markerLibrary] = await Promise.all([
          google.maps.importLibrary("maps"),
          google.maps.importLibrary("marker"),
        ]) as [
          { Map: GoogleMapConstructor },
          { AdvancedMarkerElement: GoogleAdvancedMarkerConstructor },
        ];
        if (disposed || !containerRef.current) return;

        const map = new mapsLibrary.Map(containerRef.current, {
          center: MAP_DEFAULT_CENTER,
          zoom: MAP_DEFAULT_ZOOM,
          mapId,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          keyboardShortcuts: true,
          clickableIcons: false,
          gestureHandling: "cooperative",
        });
        mapRef.current = map;
        markerCtorRef.current = markerLibrary.AdvancedMarkerElement;
        window.__PSIPEDIA_MAP_INIT_COUNT__ = (window.__PSIPEDIA_MAP_INIT_COUNT__ ?? 0) + 1;
        idleListener = map.addListener("idle", () => {
          const next = viewportFromMap(map);
          if (next) onViewportChangeRef.current(next);
        });
        setReady(true);
        onStatusChange("ready");
      } catch {
        if (disposed) return;
        googleLoaderPromise = null;
        setLoadError(true);
        onStatusChange("load-error");
      }
    }

    void initialize();
    return () => {
      disposed = true;
      idleListener?.remove?.();
      for (const record of markersRef.current.values()) record.marker.map = null;
      markersRef.current.clear();
      mapRef.current = null;
      markerCtorRef.current = null;
      setReady(false);
    };
  }, [apiKey, configMissing, mapId, onStatusChange, testMode]);

  useEffect(() => {
    if (testMode || !ready || !mapRef.current || !markerCtorRef.current) return;
    const map = mapRef.current;
    const AdvancedMarkerElement = markerCtorRef.current;
    const nextKeys = new Set<string>();

    for (const item of items) {
      const key = `item:${item.id}`;
      nextKeys.add(key);
      const signature = itemSignature(item);
      let record = markersRef.current.get(key);
      if (!record || record.signature !== signature) {
        if (record) record.marker.map = null;
        const element = document.createElement("div");
        element.textContent = markerSymbol(item);
        element.className = markerClass(item, selectedItemId === item.id);
        element.dataset.mapMarker = item.entityType;
        const marker = new AdvancedMarkerElement({
          map,
          position: { lat: item.latitude, lng: item.longitude },
          title: item.name,
          gmpClickable: true,
        });
        marker.append(element);
        marker.addEventListener("gmp-click", () => onSelectItemRef.current(item.id));
        record = { marker, element, signature };
        markersRef.current.set(key, record);
      } else {
        record.marker.map = map;
        record.marker.position = { lat: item.latitude, lng: item.longitude };
        record.element.className = markerClass(item, selectedItemId === item.id);
      }
    }

    for (const cluster of clusters) {
      const key = `cluster:${cluster.id}`;
      nextKeys.add(key);
      const signature = clusterSignature(cluster);
      let record = markersRef.current.get(key);
      if (!record || record.signature !== signature) {
        if (record) record.marker.map = null;
        const element = document.createElement("div");
        element.textContent = String(cluster.count);
        element.className = styles.clusterMarker;
        element.dataset.mapCluster = "true";
        const marker = new AdvancedMarkerElement({
          map,
          position: { lat: cluster.latitude, lng: cluster.longitude },
          title: `${cluster.count} záznamov v tejto oblasti`,
          gmpClickable: true,
        });
        marker.append(element);
        marker.addEventListener("gmp-click", () => onClusterClickRef.current(cluster));
        record = { marker, element, signature };
        markersRef.current.set(key, record);
      } else {
        record.marker.map = map;
        record.marker.position = { lat: cluster.latitude, lng: cluster.longitude };
      }
    }

    for (const [key, record] of markersRef.current) {
      if (nextKeys.has(key)) continue;
      record.marker.map = null;
      markersRef.current.delete(key);
    }
  }, [clusters, items, ready, selectedItemId, testMode]);

  useEffect(() => {
    if (testMode || !command || !mapRef.current) return;
    mapRef.current.panTo({ lat: command.latitude, lng: command.longitude });
    if (command.zoom) mapRef.current.setZoom(command.zoom);
  }, [command, testMode]);

  const fallbackText = useMemo(() => {
    if (configMissing) return "Google Maps nie je nakonfigurovaný";
    if (loadError) return "Mapový podklad sa nepodarilo načítať";
    return "Načítavam mapu Psipedie…";
  }, [configMissing, loadError]);

  if (testMode) {
    return (
      <TestMapRenderer
        items={items}
        clusters={clusters}
        selectedItemId={selectedItemId}
        viewport={viewport}
        command={command}
        onViewportChange={onViewportChange}
        onSelectItem={onSelectItem}
        onClusterClick={onClusterClick}
        onStatusChange={onStatusChange}
      />
    );
  }

  return (
    <div className={styles.rendererShell} data-testid="google-map-renderer">
      <div ref={containerRef} className={styles.googleMapCanvas} aria-label="Interaktívna mapa Psipedie" />
      {configMissing || !ready ? (
        <div className={styles.rendererFallback} role="status" aria-live="polite">
          <strong>{fallbackText}</strong>
          <span>Výsledky môžeš stále prehliadať v zozname.</span>
        </div>
      ) : null}
    </div>
  );
}
