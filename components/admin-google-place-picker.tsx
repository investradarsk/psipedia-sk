"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoTargetType } from "@/lib/geo";

export type AdminGooglePlaceCandidate = {
  id: string;
  displayName: string;
  formattedAddress: string;
};

export function AdminGooglePlacePicker({
  targetType,
  targetId,
  endpoint: endpointOverride,
  buttonLabel,
  publicLocation = true,
  configured = true,
  available = true,
  unavailableReason = "",
  compact = false,
  autoDiscover = false,
  allowExplicitPrivateOverride = false,
  onConfirmed,
}: {
  targetType: GeoTargetType;
  targetId: number;
  endpoint?: string;
  buttonLabel?: string;
  publicLocation?: boolean;
  configured?: boolean;
  available?: boolean;
  unavailableReason?: string;
  compact?: boolean;
  autoDiscover?: boolean;
  allowExplicitPrivateOverride?: boolean;
  onConfirmed?: () => void | Promise<void>;
}) {
  const endpoint = endpointOverride ?? `/api/admin/geo/${targetType}/${targetId}`;
  const [candidates, setCandidates] = useState<AdminGooglePlaceCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const autoStarted = useRef(false);

  async function discover() {
    setBusy(true);
    setError("");
    setMessage("");
    setCandidates([]);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "discover-google-place" }),
      });
      const body = await response.json() as {
        candidates?: AdminGooglePlaceCandidate[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Google Maps miesto sa nepodarilo vyhľadať.");
      const next = body.candidates ?? [];
      setCandidates(next);
      if (!next.length) setMessage("Google Maps nenašiel vhodné miesto.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Google Maps miesto sa nepodarilo vyhľadať.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!autoDiscover || autoStarted.current || !available || !configured) return;
    autoStarted.current = true;
    void discover();
    // Discovery je naviazané na mount pickera. V Admin → Mapy sa picker mountuje
    // až po explicitnom kliknutí, takže Google request nikdy nevzniká pri page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDiscover, available, configured, endpoint]);

  async function confirm(placeId: string) {
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
          allowPrivateOverride: Boolean(allowExplicitPrivateOverride && publicLocation),
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Google Maps miesto sa nepodarilo potvrdiť.");
      setCandidates([]);
      setMessage("Google Maps miesto bolo potvrdené.");
      await onConfirmed?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Google Maps miesto sa nepodarilo potvrdiť.");
    } finally {
      setBusy(false);
    }
  }

  if (!available) {
    return (
      <p className="admin-help" data-google-place-unavailable>
        {unavailableReason || "Google Maps potvrdenie pre túto položku nie je dostupné."}
      </p>
    );
  }

  return (
    <div data-admin-google-place-picker data-target-type={targetType} style={{ display: "grid", gap: compact ? 8 : 12 }}>
      <div className="admin-editor-actions" style={{ flexWrap: "wrap" }}>
        <button type="button" disabled={busy || !configured} onClick={() => void discover()}>
          {busy ? "Hľadám…" : buttonLabel ?? (compact ? "Nájsť v Google Maps" : "Nájsť profil v Google Maps")}
        </button>
      </div>
      {!configured ? <p className="admin-help">Google Places momentálne nie je dostupné.</p> : null}
      {candidates.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          {candidates.map((candidate) => (
            <div className="admin-message" key={candidate.id} style={{ overflowWrap: "anywhere", maxWidth: "100%" }}>
              <strong>{candidate.displayName || "Google Maps miesto"}</strong>
              <p className="admin-help" style={{ margin: "6px 0" }}>{candidate.formattedAddress || "Adresa nie je uvedená"}</p>
              <div className="admin-editor-actions" style={{ flexWrap: "wrap" }}>
                <button type="button" disabled={busy} onClick={() => void confirm(candidate.id)}>
                  Použiť toto miesto
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {message ? <p className="admin-message" role="status">{message}</p> : null}
      {error ? <p className="admin-message admin-message--error" role="alert">{error}</p> : null}
    </div>
  );
}
