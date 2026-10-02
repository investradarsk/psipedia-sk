"use client";

import { useEffect, useState } from "react";
import { AdminGooglePlacePicker } from "@/components/admin-google-place-picker";
import type { GeoSourceLocation, GeoTargetType } from "@/lib/geo";
import type { GeoPointRecord } from "@/lib/geo-store";

type ProfileGoogleMapsSnapshot = {
  point: GeoPointRecord | null;
  source: GeoSourceLocation;
  schemaReady: boolean;
  explicitPrivate: boolean;
  googlePlacesConfigured: boolean;
  googlePlaceAction: { available: boolean; reason: string };
  googleMapsNotRequired?: boolean;
  googleMapsNotRequiredSystemDerived?: boolean;
  representedLocationLabel?: string | null;
  representedLocationRole?: string | null;
  representedTargetId?: number | null;
  siteCount?: number;
};

function currentResolution(point: GeoPointRecord | null) {
  return Boolean(
    point
    && point.resolvedSourceFingerprint
    && point.sourceFingerprint
    && point.resolvedSourceFingerprint === point.sourceFingerprint,
  );
}

function workflowStatus(snapshot: ProfileGoogleMapsSnapshot) {
  if (snapshot.googleMapsNotRequiredSystemDerived) return "✓ Google Maps netreba — online podujatie";
  if (snapshot.googleMapsNotRequired) return "✓ Google Maps netreba — vybavené";
  if (
    snapshot.point?.provider === "google_places"
    && snapshot.point.geocodeStatus === "RESOLVED"
    && currentResolution(snapshot.point)
  ) {
    return "🏷️ Google Maps — konkrétne miesto — vybavené";
  }
  if (
    snapshot.point?.latitude !== null
    && snapshot.point?.latitude !== undefined
    && snapshot.point?.longitude !== null
    && snapshot.point?.longitude !== undefined
    && snapshot.point.publicVisibility !== "HIDDEN"
    && currentResolution(snapshot.point)
  ) {
    return "📍 Iba súradnice";
  }
  return "⚪ Treba vyriešiť";
}

export function AdminProfileGoogleMaps({
  targetType,
  targetId,
  endpoint: endpointOverride,
  publicLocation = true,
  allowExplicitPrivateOverride = false,
}: {
  targetType: GeoTargetType;
  targetId: number;
  endpoint?: string;
  publicLocation?: boolean;
  allowExplicitPrivateOverride?: boolean;
}) {
  const endpoint = endpointOverride ?? `/api/admin/geo/${targetType}/${targetId}`;
  const [snapshot, setSnapshot] = useState<ProfileGoogleMapsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<"not-required" | "reset" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        // GET loads only canonical state. Google Places discovery is deliberately
        // absent here and starts only when the admin clicks the picker button.
        const response = await fetch(endpoint, { cache: "no-store" });
        const body = await response.json() as ProfileGoogleMapsSnapshot & { error?: string };
        if (!response.ok) throw new Error(body.error || "Google Maps stav sa nepodarilo načítať.");
        if (!cancelled) setSnapshot(body);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Google Maps stav sa nepodarilo načítať.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [endpoint]);

  async function workflowAction(action: "google-maps-not-required" | "reset-google-maps-not-required") {
    setBusyAction(action === "google-maps-not-required" ? "not-required" : "reset");
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Google Maps stav sa nepodarilo uložiť.");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Google Maps stav sa nepodarilo uložiť.");
      setBusyAction(null);
    }
  }

  if (loading) {
    return <div data-admin-profile-google-maps><p className="admin-help">Načítavam Google Maps stav…</p></div>;
  }
  if (!snapshot) {
    return <div data-admin-profile-google-maps>{error ? <p className="admin-message admin-message--error">{error}</p> : null}</div>;
  }

  const status = workflowStatus(snapshot);
  const hasCurrentPlace = status.startsWith("🏷️");
  const systemNotRequired = Boolean(snapshot.googleMapsNotRequiredSystemDerived);
  const notRequired = Boolean(snapshot.googleMapsNotRequired);
  const manualOverride = Boolean(snapshot.point?.manualOverride);
  const blockedByPrivate = Boolean(snapshot.explicitPrivate && !allowExplicitPrivateOverride);
  const pickerAvailable = snapshot.googlePlaceAction.available && !manualOverride && !blockedByPrivate;
  const unavailableReason = manualOverride
    ? "Poloha má manuálny GEO override. Google Place ho nesmie potichu prepísať."
    : blockedByPrivate
      ? "Lokalita je explicitne neverejná. Najprv zmeň rozhodnutie o súkromí v technických GEO údajoch."
      : snapshot.googlePlaceAction.reason;

  return (
    <section
      className="admin-form-card"
      data-admin-profile-google-maps
      data-google-maps-target-type={targetType}
      data-google-maps-endpoint={endpoint}
      style={{ marginTop: "1rem" }}
    >
      <div className="admin-card-heading">
        <div>
          <span>GOOGLE MAPS</span>
          <div>
            <h3>Google Maps</h3>
            <p>Jednoduché redakčné rozhodnutie pre konkrétne miesto profilu.</p>
          </div>
        </div>
      </div>

      <p className="admin-message" role="status"><strong>{status}</strong></p>

      {snapshot.representedLocationLabel ? (
        <p className="admin-help">
          Tento blok reprezentuje lokalitu: <strong>{snapshot.representedLocationLabel}</strong>
          {snapshot.representedLocationRole ? ` · ${snapshot.representedLocationRole}` : ""}
          {snapshot.siteCount && snapshot.siteCount > 1 ? ` · z ${snapshot.siteCount} SITE` : ""}
        </p>
      ) : null}

      {systemNotRequired ? (
        <p className="admin-help">Online podujatie nemá fyzický Google Maps target.</p>
      ) : notRequired ? (
        <div className="admin-editor-actions" style={{ flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void workflowAction("reset-google-maps-not-required")}
          >
            {busyAction === "reset" ? "Ukladám…" : "Znovu vyžadovať Google Maps"}
          </button>
        </div>
      ) : (
        <>
          <AdminGooglePlacePicker
            targetType={targetType}
            targetId={targetId}
            endpoint={endpoint}
            buttonLabel={hasCurrentPlace ? "Zmeniť Google miesto" : "Nájsť profil v Google Maps"}
            publicLocation={publicLocation}
            configured={snapshot.googlePlacesConfigured}
            available={pickerAvailable}
            unavailableReason={unavailableReason}
            allowExplicitPrivateOverride={allowExplicitPrivateOverride}
            onConfirmed={() => window.location.reload()}
          />
          {!hasCurrentPlace ? (
            <div className="admin-editor-actions" style={{ flexWrap: "wrap", marginTop: ".75rem" }}>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void workflowAction("google-maps-not-required")}
              >
                {busyAction === "not-required" ? "Ukladám…" : "✓ Google Maps netreba"}
              </button>
            </div>
          ) : null}
        </>
      )}

      {error ? <p className="admin-message admin-message--error" role="alert">{error}</p> : null}
    </section>
  );
}
