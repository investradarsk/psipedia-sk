"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { GoogleMapRenderer, type MapRendererCommand, type MapRendererStatus } from "@/components/map/google-map-renderer";
import type { MapItem } from "@/lib/map-contract";
import { MAP_DEFAULT_BBOX, type MapViewport } from "@/lib/map-public-ui";
import type { GeoPointRecord } from "@/lib/geo-store";
import type { GeoSourceLocation, GeoTargetType } from "@/lib/geo";

type GooglePreview = {
  status: "CONFIRMED" | "NOT_CONFIRMED" | "UNAVAILABLE";
  formattedAddress: string | null;
  placeId: string | null;
  reason: string;
};

type LocationPreview = {
  latitude: number;
  longitude: number;
  providerResultId: string | null;
  sourceFingerprint: string;
  canonicalAddress: string;
  mode: "EXACT_ADDRESS" | "NUMBERLESS_PLACE";
  google: GooglePreview;
};

type GoogleDiscoveryCandidate = {
  id: string;
  displayName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  address?: {
    street: string;
    houseNumber: string;
    postalCode: string;
    locality: string;
    sublocality: string;
    district: string;
    region: string;
    countryCode: string;
  };
};

type Snapshot = {
  point: GeoPointRecord | null;
  source: GeoSourceLocation;
  schemaReady: boolean;
  provider: { name: string; configured: boolean };
  googlePlacesConfigured: boolean;
  productionBackfillEnabled: boolean;
  publicMapEnabled: boolean;
  configured: boolean;
  apiKey: string;
  mapId: string;
};

function slovakStatus(point: GeoPointRecord | null) {
  if (!point) return "Poloha ešte nie je potvrdená";
  if (point.publicVisibility === "HIDDEN") return "Neverejná poloha";
  if (point.geocodeStatus === "RESOLVED") return "Poloha potvrdená";
  if (point.geocodeStatus === "PENDING") return "Poloha sa spracúva";
  if (point.geocodeStatus === "NEEDS_REVIEW") return "Polohu treba skontrolovať";
  if (point.geocodeStatus === "FAILED") return "Polohu sa nepodarilo nájsť";
  if (point.geocodeStatus === "STALE") return "Adresa sa zmenila, polohu treba overiť znova";
  return "Poloha ešte nie je potvrdená";
}

function AdminLocationMap({
  snapshot,
  latitude,
  longitude,
  label,
  displayLocation,
}: {
  snapshot: Snapshot;
  latitude: number;
  longitude: number;
  label: string;
  displayLocation?: string;
}) {
  const [rendererStatus, setRendererStatus] = useState<MapRendererStatus>("loading");
  const [viewport, setViewport] = useState<MapViewport>({
    bbox: MAP_DEFAULT_BBOX,
    zoom: 16,
    center: { lat: latitude, lng: longitude },
  });

  const item = useMemo<MapItem>(() => ({
    id: "admin-location-preview",
    entityType: "service",
    entityId: snapshot.source.targetId,
    name: label || "Poloha profilu",
    category: "services",
    href: "#",
    latitude,
    longitude,
    precision: "EXACT",
    displayLocation,
    city: snapshot.source.city,
    district: snapshot.source.district,
    region: snapshot.source.region,
  }), [displayLocation, label, latitude, longitude, snapshot.source]);

  const command = useMemo<MapRendererCommand>(() => ({
    key: Math.round((latitude * 100000) + (longitude * 100000)),
    type: "item",
    id: item.id,
    latitude,
    longitude,
    zoom: 17,
  }), [item.id, latitude, longitude]);

  if (!snapshot.configured) {
    return <p className="admin-help">Google mapa nie je v tomto prostredí nakonfigurovaná. Polohu môžeš napriek tomu potvrdiť.</p>;
  }

  return (
    <div style={{ width: "100%", minHeight: 320, overflow: "hidden", borderRadius: 18 }}>
      <GoogleMapRenderer
        apiKey={snapshot.apiKey}
        mapId={snapshot.mapId}
        testMode={false}
        rendererEnabled
        consentGranted
        items={[item]}
        clusters={[]}
        selectedItemId={item.id}
        viewport={viewport}
        mapType="roadmap"
        command={command}
        onViewportChange={setViewport}
        onSelectItem={() => undefined}
        onClusterClick={() => undefined}
        onStatusChange={setRendererStatus}
        ariaLabel="Kontrola polohy profilu na Google mape"
      />
      {rendererStatus === "load-error" ? <p className="admin-help">Google mapu sa nepodarilo načítať. Výsledok vyhľadania zostáva zachovaný.</p> : null}
    </div>
  );
}

export function AdminGeoLocation({ targetType, targetId, sensitive = false }: {
  targetType: GeoTargetType;
  targetId: number;
  sensitive?: boolean;
}) {
  const endpoint = `/api/admin/geo/${targetType}/${targetId}`;
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [preview, setPreview] = useState<LocationPreview | null>(null);
  const [googleCandidates, setGoogleCandidates] = useState<GoogleDiscoveryCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [publicLocation, setPublicLocation] = useState(!sensitive);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = await response.json() as Snapshot & { error?: string };
      if (!response.ok) throw new Error(body.error || "Poloha sa nepodarila načítať.");
      setSnapshot(body);
      setPublicLocation(body.point?.publicVisibility ? body.point.publicVisibility !== "HIDDEN" : !sensitive);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Poloha sa nepodarila načítať.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setPortalTarget(document.getElementById("directory-location"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      setLoading(true);
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const body = await response.json() as Snapshot & { error?: string };
        if (!response.ok) throw new Error(body.error || "Poloha sa nepodarila načítať.");
        if (cancelled) return;
        setSnapshot(body);
        setPublicLocation(body.point?.publicVisibility ? body.point.publicVisibility !== "HIDDEN" : !sensitive);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Poloha sa nepodarila načítať.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadInitial();
    return () => { cancelled = true; };
  }, [endpoint, sensitive]);

  async function discoverGooglePlace() {
    setBusy(true);
    setError("");
    setMessage("");
    setPreview(null);
    setGoogleCandidates([]);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "discover-google-place" }),
      });
      const body = await response.json() as { candidates?: GoogleDiscoveryCandidate[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Google profil sa nepodarilo vyhľadať.");
      const candidates = body.candidates ?? [];
      setGoogleCandidates(candidates);
      if (!candidates.length) setMessage("Google Maps nenašiel vhodný profil. Môžeš použiť vyhľadanie podľa adresy.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Google profil sa nepodarilo vyhľadať.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmGooglePlace(placeId: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "confirm-google-place",
          placeId,
          publicLocation,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Google profil sa nepodarilo potvrdiť.");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Google profil sa nepodarilo potvrdiť.");
      setBusy(false);
    }
  }

  async function findLocation() {
    setBusy(true);
    setError("");
    setMessage("");
    setPreview(null);
    setGoogleCandidates([]);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "preview" }),
      });
      const body = await response.json() as { preview?: LocationPreview; error?: string };
      if (!response.ok || !body.preview) throw new Error(body.error || "Poloha sa nepodarila nájsť.");
      setPreview(body.preview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Poloha sa nepodarila nájsť.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPreview() {
    if (!preview) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "confirm-preview",
          publicLocation: true,
          sourceFingerprint: preview.sourceFingerprint,
          providerResultId: preview.providerResultId,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Poloha sa nepodarila potvrdiť.");
      setMessage("Poloha potvrdená.");
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Poloha sa nepodarila potvrdiť.");
    } finally {
      setBusy(false);
    }
  }

  async function savePrivate() {
    setBusy(true);
    setError("");
    setMessage("");
    setPreview(null);
    setGoogleCandidates([]);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "confirm-preview", publicLocation: false }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Neverejná poloha sa nepodarila uložiť.");
      setMessage("Poloha je neverejná.");
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Neverejná poloha sa nepodarila uložiť.");
    } finally {
      setBusy(false);
    }
  }

  if (!portalTarget) return null;

  const panel = (
    <div data-admin-geo-location style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid var(--admin-border, #d7d7cf)" }}>
      <div className="admin-card-heading">
        <div>
          <span>MAPA</span>
          <div>
            <h3>Poloha na mape</h3>
            <p>Najprv skús nájsť konkrétny profil v Google Maps. Vyplnené údaje slúžia ako pomôcka; potvrdený Google profil doplní adresu aj mapu.</p>
          </div>
        </div>
      </div>

      {loading ? <p className="admin-help">Načítavam polohu…</p> : null}
      {!loading && snapshot ? (
        <>
          <div className="admin-field">
            <label htmlFor={`geo-public-${targetType}-${targetId}`}>Verejná poloha</label>
            <select
              id={`geo-public-${targetType}-${targetId}`}
              value={publicLocation ? "yes" : "no"}
              disabled={busy}
              onChange={(event) => {
                const next = event.target.value === "yes";
                setPublicLocation(next);
                setPreview(null);
                setMessage("");
                setError("");
              }}
            >
              <option value="yes">Áno</option>
              <option value="no">Nie</option>
            </select>
            {sensitive ? <small>Pri tomto type profilu je bezpečný predvolený stav neverejný. Verejnú polohu zapni iba pri verejne navštevovanom mieste.</small> : <small>Bežné služby majú predvolene verejnú polohu.</small>}
          </div>

          {targetType === "DIRECTORY_PROFILE" ? (
            <div style={{ display: "grid", gap: ".75rem", marginBottom: "1rem" }}>
              <div className="admin-editor-actions" style={{ flexWrap: "wrap" }}>
                <button type="button" disabled={busy || !snapshot.googlePlacesConfigured} onClick={() => void discoverGooglePlace()}>
                  {busy ? "Hľadám…" : "Nájsť profil v Google Maps"}
                </button>
              </div>
              {!snapshot.googlePlacesConfigured ? <p className="admin-help">Google Places momentálne nie je dostupné. Stále môžeš použiť adresný fallback.</p> : null}
              {googleCandidates.length ? (
                <div style={{ display: "grid", gap: ".75rem" }}>
                  <p className="admin-help">Vyber správny Google profil. Po potvrdení Psipedia prevezme adresu, Google Place ID a presný bod. Nebude to manuálny marker.</p>
                  {googleCandidates.map((candidate) => (
                    <div className="admin-message" key={candidate.id}>
                      <strong>{candidate.displayName || "Google Maps miesto"}</strong>
                      <p className="admin-help">{candidate.formattedAddress || "Adresa nie je uvedená"}</p>
                      <div className="admin-editor-actions">
                        <button type="button" disabled={busy} onClick={() => void confirmGooglePlace(candidate.id)}>
                          Použiť toto miesto
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {!snapshot.schemaReady ? (
            <>
              <p className="admin-message admin-message--error">Mapová poloha v tomto prostredí nie je dostupná.</p>
              <details>
                <summary>Technické informácie</summary>
                <p className="admin-help">Canonical profil funguje ďalej bez geo operácií.</p>
              </details>
            </>
          ) : !publicLocation ? (
            <div className="admin-editor-actions">
              <button type="button" disabled={busy} onClick={() => void savePrivate()}>
                {busy ? "Ukladám…" : "Uložiť ako neverejnú polohu"}
              </button>
            </div>
          ) : (
            <>
              {snapshot.point?.geocodeStatus === "STALE" ? (
                <p className="admin-message admin-message--error">
                  <strong>Adresa sa zmenila.</strong> Poloha na mape potrebuje nové overenie.
                </p>
              ) : null}

              {snapshot.point?.geocodeStatus === "RESOLVED" && !preview ? (
                <>
                  <p className="admin-message" role="status"><strong>✅ Poloha potvrdená</strong></p>
                  {snapshot.point.latitude !== null && snapshot.point.longitude !== null ? (
                    <AdminLocationMap
                      snapshot={snapshot}
                      latitude={snapshot.point.latitude}
                      longitude={snapshot.point.longitude}
                      label={snapshot.source.label}
                      displayLocation={[snapshot.source.street ? [snapshot.source.street, snapshot.source.houseNumber].filter(Boolean).join(" ") : "", snapshot.source.city].filter(Boolean).join(", ")}
                    />
                  ) : null}
                  <div className="admin-editor-actions">
                    <button type="button" disabled={busy || !snapshot.provider.configured} onClick={() => void findLocation()}>
                      {busy ? "Hľadám…" : "Fallback: overiť podľa adresy"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="admin-editor-actions">
                  <button type="button" disabled={busy || !snapshot.provider.configured} onClick={() => void findLocation()}>
                    {busy ? "Hľadám…" : snapshot.point?.geocodeStatus === "STALE" ? "Nájsť podľa adresy znova" : "Fallback: nájsť podľa adresy"}
                  </button>
                </div>
              )}

              {!snapshot.provider.configured ? <p className="admin-help">Vyhľadanie polohy momentálne nie je dostupné.</p> : null}

              {preview ? (
                <div style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
                  {preview.google.status === "CONFIRMED" ? (
                    <div className="admin-message">
                      <strong>{preview.mode === "NUMBERLESS_PLACE" ? "✅ Nájdené miesto v Google Maps" : "✅ Nájdená adresa v Google Maps"}</strong>
                      <p className="admin-help">{preview.google.formattedAddress}</p>
                    </div>
                  ) : (
                    <div className="admin-message">
                      <strong>⚠️ Nájdená iba poloha</strong>
                      <p className="admin-help">Google Maps nepotvrdil konkrétnu adresu alebo miesto, ale poloha bola nájdená.</p>
                    </div>
                  )}

                  <AdminLocationMap
                    snapshot={snapshot}
                    latitude={preview.latitude}
                    longitude={preview.longitude}
                    label={snapshot.source.label}
                    displayLocation={preview.google.formattedAddress ?? preview.canonicalAddress.replace(/\n/g, ", ")}
                  />

                  <div className="admin-editor-actions" style={{ flexWrap: "wrap" }}>
                    <button type="button" disabled={busy} onClick={() => void confirmPreview()}>
                      {busy ? "Potvrdzujem…" : "Potvrdiť polohu"}
                    </button>
                    <button type="button" disabled={busy} onClick={() => void findLocation()}>Hľadať znova</button>
                  </div>
                </div>
              ) : null}
            </>
          )}

          <details style={{ marginTop: "1rem" }}>
            <summary>Technické informácie</summary>
            <div className="admin-field-grid" style={{ marginTop: ".75rem" }}>
              <div className="admin-field"><label>Stav</label><p className="admin-help">{slovakStatus(snapshot.point)}</p></div>
              <div className="admin-field"><label>Zdroj polohy</label><p className="admin-help">{snapshot.point?.provider === "google_places" ? "Google Maps / Google Place" : snapshot.point?.resolutionMethod === "MANUAL" ? "Ručne potvrdená poloha" : snapshot.point?.resolutionMethod ? "Automaticky nájdená poloha" : "—"}</p></div>
              <div className="admin-field"><label>Geoapify</label><p className="admin-help">{snapshot.provider.configured ? "Dostupné" : "Nedostupné"}</p></div>
              <div className="admin-field"><label>Google Maps overenie</label><p className="admin-help">{snapshot.googlePlacesConfigured ? "Dostupné" : "Nedostupné"}</p></div>
              <div className="admin-field"><label>Verejná mapa</label><p className="admin-help">{snapshot.publicMapEnabled ? "Zapnutá" : "Vypnutá"}</p></div>
            </div>
          </details>
        </>
      ) : null}

      {message ? <p className="admin-message" role="status">{message}</p> : null}
      {error ? <p className="admin-message admin-message--error" role="alert">{error}</p> : null}
    </div>
  );

  return createPortal(panel, portalTarget);
}
