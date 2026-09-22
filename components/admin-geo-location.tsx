"use client";

import { useEffect, useState } from "react";
import type { GeoPointRecord } from "@/lib/geo-store";
import type { GeoSourceLocation, GeoTargetType } from "@/lib/geo";

type Snapshot = {
  point: GeoPointRecord | null;
  source: GeoSourceLocation;
  schemaReady: boolean;
  provider: { name: string; configured: boolean };
  productionBackfillEnabled: boolean;
  publicMapEnabled: boolean;
};

const visibilityLabels = {
  EXACT_PUBLIC: "Presná verejná poloha",
  APPROXIMATE_PUBLIC: "Približná verejná poloha",
  HIDDEN: "Nezobrazovať na mape",
} as const;

export function AdminGeoLocation({ targetType, targetId, sensitive = false }: {
  targetType: GeoTargetType;
  targetId: number;
  sensitive?: boolean;
}) {
  const endpoint = `/api/admin/geo/${targetType}/${targetId}`;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [visibility, setVisibility] = useState("");
  const [precision, setPrecision] = useState("MUNICIPALITY");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [reason, setReason] = useState("");

  async function reload() {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = await response.json() as Snapshot & { error?: string };
      if (!response.ok) throw new Error(body.error || "Geo stav sa nepodarilo načítať.");
      setSnapshot(body);
      setVisibility(body.point?.publicVisibility ?? "");
      setPrecision(body.point?.publicPrecision ?? "MUNICIPALITY");
      setLatitude(body.point?.latitude === null || body.point?.latitude === undefined ? "" : String(body.point.latitude));
      setLongitude(body.point?.longitude === null || body.point?.longitude === undefined ? "" : String(body.point.longitude));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Geo stav sa nepodarilo načítať.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const body = await response.json() as Snapshot & { error?: string };
        if (!response.ok) throw new Error(body.error || "Geo stav sa nepodarilo načítať.");
        if (cancelled) return;
        setSnapshot(body);
        setVisibility(body.point?.publicVisibility ?? "");
        setPrecision(body.point?.publicPrecision ?? "MUNICIPALITY");
        setLatitude(body.point?.latitude === null || body.point?.latitude === undefined ? "" : String(body.point.latitude));
        setLongitude(body.point?.longitude === null || body.point?.longitude === undefined ? "" : String(body.point.longitude));
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Geo stav sa nepodarilo načítať.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadInitial();
    return () => { cancelled = true; };
  }, [endpoint]);

  async function mutate(payload: Record<string, unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Geo operácia zlyhala.");
      setMessage(success);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Geo operácia zlyhala.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <section className="admin-form-card" id="geo"><h2>Poloha na mape</h2><p className="admin-help">Načítavam geo stav…</p></section>;
  if (!snapshot) return <section className="admin-form-card" id="geo"><h2>Poloha na mape</h2><p className="admin-message admin-message--error">{error || "Geo stav nie je dostupný."}</p></section>;

  const point = snapshot.point;
  const source = snapshot.source;
  const sourceSummary = [source.address, source.city, source.district, source.region].filter(Boolean).join(" · ");
  const exactEscalation = visibility === "EXACT_PUBLIC" && point?.publicVisibility !== "EXACT_PUBLIC";

  return <section className="admin-form-card" id="geo" data-admin-geo-location>
    <div className="admin-card-heading"><div><span>GEO</span><div><h2>Poloha na mape</h2><p>Source údaje a verejný marker sú oddelené. Verejná mapa ešte nie je zapnutá.</p></div></div></div>

    {sensitive && <p className="admin-message admin-message--error"><strong>Citlivý typ lokality.</strong> Presná ulica nesmie byť zverejnená iba preto, že je uložená v canonical dátach.</p>}
    {!snapshot.schemaReady && <p className="admin-message admin-message--error"><strong>Geo schéma ešte nie je nasadená.</strong> Migrácia 0063 musí byť aplikovaná cez autorizovaný D1 migration proces. Canonical profil funguje ďalej bez geo operácií.</p>}
    {snapshot.schemaReady && !snapshot.provider.configured && <p className="admin-help"><strong>Geoapify nie je nakonfigurovaný.</strong> Manuálna klasifikácia funguje; provider retry je bezpečne disabled.</p>}

    <div className="admin-field-grid">
      <div className="admin-field"><label>Source lokalita</label><p className="admin-help">{sourceSummary || "Bez použiteľnej lokality"}</p></div>
      <div className="admin-field"><label>Target</label><p className="admin-help">{targetType} #{targetId}</p></div>
      <div className="admin-field"><label>Stav</label><p className="admin-help">{point?.geocodeStatus ?? "Neinicializované"}</p></div>
      <div className="admin-field"><label>Metóda</label><p className="admin-help">{point?.resolutionMethod ?? "—"}{point?.manualOverride ? " · manual override" : ""}</p></div>
      <div className="admin-field"><label>Provider / provenance</label><p className="admin-help">{point?.provider ?? "—"}{point?.provenance ? ` · ${point.provenance}` : ""}</p></div>
      <div className="admin-field"><label>Posledné geocoding</label><p className="admin-help">{point?.lastGeocodedAt ? new Date(point.lastGeocodedAt).toLocaleString("sk-SK") : "—"}</p></div>
    </div>

    {!snapshot.schemaReady ? null : !point ? <div className="admin-editor-actions">
      <button type="button" disabled={busy} onClick={() => mutate({ action: "initialize" }, "Geo záznam bol inicializovaný.")}>Vytvoriť geo záznam</button>
    </div> : <>
      <div className="admin-field-grid">
        <div className="admin-field">
          <label htmlFor={`geo-visibility-${targetType}-${targetId}`}>Verejná visibility</label>
          <select id={`geo-visibility-${targetType}-${targetId}`} value={visibility} onChange={(event) => setVisibility(event.target.value)}>
            <option value="">Nevyhodnotené</option>
            {Object.entries(visibilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="admin-field">
          <label htmlFor={`geo-precision-${targetType}-${targetId}`}>Precision</label>
          <select id={`geo-precision-${targetType}-${targetId}`} value={precision} disabled={visibility === "HIDDEN"} onChange={(event) => setPrecision(event.target.value)}>
            <option value="EXACT">EXACT</option><option value="NEIGHBORHOOD">NEIGHBORHOOD</option>
            <option value="MUNICIPALITY">MUNICIPALITY</option><option value="SERVICE_AREA">SERVICE_AREA</option>
            <option value="APPROXIMATE">APPROXIMATE</option>
          </select>
        </div>
      </div>
      <div className="admin-editor-actions">
        <button type="button" disabled={busy || !visibility} onClick={() => {
          if (exactEscalation && !window.confirm("Potvrďte, že ide o verejne navštevovanú prevádzku/miesto. Presná poloha môže zverejniť ulicu.")) return;
          void mutate({ action: "classify", visibility, precision, reason: exactEscalation ? "ADMIN_EXACT_PUBLIC_CONFIRMATION" : "ADMIN_CLASSIFICATION" }, "Privacy klasifikácia bola uložená.");
        }}>Uložiť klasifikáciu</button>
        <button type="button" disabled={busy || !snapshot.provider.configured || !point.publicVisibility || point.publicVisibility === "HIDDEN" || point.manualOverride} onClick={() => mutate({ action: "retry" }, "Geocoding pokus bol spracovaný.")}>Skúsiť geocoding</button>
      </div>

      <hr />
      <h3>Manuálny marker</h3>
      <p className="admin-help">Automatický geocoder nikdy neprepíše manual marker. Po zmene source lokality zostane bod zachovaný a stav prejde na STALE.</p>
      <div className="admin-field-grid">
        <div className="admin-field"><label htmlFor={`geo-lat-${targetType}-${targetId}`}>Latitude</label><input id={`geo-lat-${targetType}-${targetId}`} inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></div>
        <div className="admin-field"><label htmlFor={`geo-lng-${targetType}-${targetId}`}>Longitude</label><input id={`geo-lng-${targetType}-${targetId}`} inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></div>
        <div className="admin-field"><label htmlFor={`geo-reason-${targetType}-${targetId}`}>Dôvod manuálnej zmeny</label><input id={`geo-reason-${targetType}-${targetId}`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Prečo je tento bod správny?" /></div>
      </div>
      <div className="admin-editor-actions">
        <button type="button" disabled={busy || !latitude || !longitude || !reason || visibility === "HIDDEN" || !visibility} onClick={() => mutate({
          action: "manual", latitude: Number(latitude), longitude: Number(longitude),
          visibility, precision, reason,
        }, "Manual marker bol uložený.")}>Uložiť manual marker</button>
        {point.manualOverride && <button type="button" disabled={busy} onClick={() => {
          if (!window.confirm("Resetovať manual override? Súradnice sa odstránia a automatika ich môže znovu vyriešiť.")) return;
          void mutate({ action: "reset-manual" }, "Manual override bol resetovaný.");
        }}>Reset manual override</button>}
      </div>
    </>}

    {point?.lastErrorCode && <p className="admin-help">Posledný problém: <strong>{point.lastErrorCode}</strong>{point.retryAfterAt ? ` · retry po ${new Date(point.retryAfterAt).toLocaleString("sk-SK")}` : ""}</p>}
    {message && <p className="admin-message" role="status">{message}</p>}
    {error && <p className="admin-message admin-message--error" role="alert">{error}</p>}
  </section>;
}
