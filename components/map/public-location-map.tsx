"use client";

import { useEffect, useMemo, useState } from "react";
import type { MapItem } from "@/lib/map-contract";
import {
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsPlaceUrl,
  detailMapCommandForItems,
  isApproximateMapItem,
  type PublicMapType,
} from "@/lib/map-public-ui";
import {
  GOOGLE_MAPS_CONSENT_EVENT,
  GOOGLE_MAPS_CONSENT_KEY,
  hasGoogleMapsConsent,
  setGoogleMapsConsent,
} from "@/lib/google-maps-consent";
import {
  GoogleMapRenderer,
  type MapRendererCommand,
  type MapRendererStatus,
} from "./google-map-renderer";
import styles from "./public-location-map.module.css";

type Attribution = { label: string; url?: string };

type Props = {
  title: string;
  eyebrow?: string;
  items: MapItem[];
  attribution?: Attribution[];
  googleApiKey: string;
  googleMapId: string;
  rendererEnabled: boolean;
  testRendererEnvironment?: boolean;
};

function locationRoleLabel(item: MapItem) {
  if (item.entityType !== "organization") return null;
  if (item.locationRole === "SITE") return "Prevádzka";
  if (item.locationRole === "SERVICE_AREA") return "Oblasť pôsobenia";
  if (item.locationRole === "LEGAL_SEAT") return "Sídlo";
  return null;
}

export function PublicLocationMap({
  title,
  eyebrow = "Poloha",
  items,
  attribution,
  googleApiKey,
  googleMapId,
  rendererEnabled,
  testRendererEnvironment = false,
}: Props) {
  const testRenderer = testRendererEnvironment || process.env.NODE_ENV === "test";
  const [selectedItemId, setSelectedItemId] = useState(items[0]?.id ?? null);
  const [mapType, setMapType] = useState<PublicMapType>("roadmap");
  const [consentGranted, setConsentGranted] = useState(false);
  const [rendererStatus, setRendererStatus] = useState<MapRendererStatus>("loading");
  const [command, setCommand] = useState<MapRendererCommand | null>(() => detailMapCommandForItems(items, 1));
  const selected = items.find((item) => item.id === selectedItemId) ?? items[0] ?? null;

  useEffect(() => {
    const read = () => setConsentGranted(
      hasGoogleMapsConsent(window.localStorage.getItem(GOOGLE_MAPS_CONSENT_KEY)),
    );
    read();
    window.addEventListener(GOOGLE_MAPS_CONSENT_EVENT, read);
    return () => window.removeEventListener(GOOGLE_MAPS_CONSENT_EVENT, read);
  }, []);

  useEffect(() => {
    if (!items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(items[0]?.id ?? null);
    }
  }, [items, selectedItemId]);

  const viewport = useMemo(() => {
    const item = selected ?? items[0];
    const lat = item?.latitude ?? 48.669;
    const lng = item?.longitude ?? 19.699;
    return {
      center: { lat, lng },
      zoom: items.length > 1 ? 9 : 15,
      bbox: {
        north: lat + 0.3,
        south: lat - 0.3,
        east: lng + 0.3,
        west: lng - 0.3,
      },
    };
  }, [items, selected]);

  if (!items.length) return null;

  const placeUrl = selected ? buildGoogleMapsPlaceUrl(selected.latitude, selected.longitude) : null;
  const directionsUrl = selected && !isApproximateMapItem(selected)
    ? buildGoogleMapsDirectionsUrl(selected.latitude, selected.longitude)
    : null;
  const showRenderer = consentGranted && (testRenderer || rendererEnabled);
  const showMapControls = consentGranted && (testRenderer || rendererEnabled);

  function focusItem(item: MapItem) {
    setSelectedItemId(item.id);
    setCommand({
      key: Date.now(),
      type: "item",
      id: item.id,
      latitude: item.latitude,
      longitude: item.longitude,
      zoom: 15,
    });
  }

  return (
    <section className={styles.section} aria-labelledby="public-location-map-title" data-testid="public-location-map">
      <div className={styles.heading}>
        <span className="eyebrow">{eyebrow}</span>
        <h2 id="public-location-map-title">{title}</h2>
      </div>

      <div className={styles.shell}>
        <div className={styles.mapWrap}>
          {showRenderer ? (
            <GoogleMapRenderer
              apiKey={googleApiKey}
              mapId={googleMapId}
              testMode={testRenderer}
              rendererEnabled={rendererEnabled || testRenderer}
              consentGranted={consentGranted || testRenderer}
              items={items}
              clusters={[]}
              selectedItemId={selectedItemId}
              viewport={viewport}
              mapType={mapType}
              command={command}
              onViewportChange={() => {}}
              onSelectItem={(id) => {
                const item = items.find((candidate) => candidate.id === id);
                if (item) focusItem(item);
              }}
              onClusterClick={() => {}}
              onStatusChange={setRendererStatus}
              ariaLabel={`Interaktívna mapa: ${title}`}
            />
          ) : (
            <div className={styles.fallback} role="status">
              <strong>Interaktívna mapa momentálne nie je dostupná</strong>
              <span>Ostatný obsah profilu zostáva plne dostupný.</span>
            </div>
          )}

          {showMapControls ? (
            <div className={styles.mapTypeControl} role="group" aria-label="Typ mapového podkladu">
              <button type="button" aria-pressed={mapType === "roadmap"} onClick={() => setMapType("roadmap")}>Mapa</button>
              <button type="button" aria-pressed={mapType === "hybrid"} onClick={() => setMapType("hybrid")}>Satelit</button>
            </div>
          ) : null}

          {(rendererEnabled || testRenderer) && !consentGranted ? (
            <div className={styles.consent} data-testid="detail-map-consent-gate">
              <strong>Načítať interaktívnu Google mapu?</strong>
              <span>Google Maps sa načíta až po tvojom výslovnom povolení. Detail stránky funguje aj bez nej.</span>
              <button type="button" onClick={() => setGoogleMapsConsent(true)}>Povoliť Google Maps</button>
            </div>
          ) : null}
        </div>

        {items.length > 1 ? (
          <div className={styles.locations} aria-label="Verejné lokality organizácie">
            {items.map((item) => {
              const approximate = isApproximateMapItem(item);
              const role = locationRoleLabel(item);
              return (
                <button
                  type="button"
                  className={styles.locationButton}
                  key={item.id}
                  aria-pressed={selected?.id === item.id}
                  onClick={() => focusItem(item)}
                >
                  <span className={styles.locationTitle}>{role ?? item.name}</span>
                  {item.displayLocation ? <span className={styles.locationMeta}>{item.displayLocation}</span> : null}
                  {approximate ? <span className={styles.approximate}>Približná poloha</span> : null}
                </button>
              );
            })}
          </div>
        ) : selected && (selected.displayLocation || isApproximateMapItem(selected)) ? (
          <div className={styles.locations}>
            {isApproximateMapItem(selected) ? <span className={styles.approximate}>Približná poloha</span> : null}
            {selected.displayLocation ? <span className={styles.locationMeta}>{selected.displayLocation}</span> : null}
          </div>
        ) : null}

        {selected ? (
          <div className={styles.actions} aria-label="Mapové odkazy">
            {placeUrl ? (
              <a href={placeUrl} target="_blank" rel="noreferrer">
                {isApproximateMapItem(selected) ? "Otvoriť približnú polohu v Google Maps" : "Otvoriť v Google Maps"}
              </a>
            ) : null}
            {directionsUrl ? <a href={directionsUrl} target="_blank" rel="noreferrer">Navigovať</a> : null}
          </div>
        ) : null}

        {attribution?.length ? (
          <div className={styles.attribution} data-testid="detail-map-provider-attribution" aria-label="Zdroje mapových údajov">
            {attribution.map((entry) => entry.url
              ? <a href={entry.url} target="_blank" rel="noreferrer" key={entry.label}>{entry.label}</a>
              : <span key={entry.label}>{entry.label}</span>)}
          </div>
        ) : null}

        <span hidden data-renderer-status={rendererStatus} />
      </div>
    </section>
  );
}
