"use client";

import { useState } from "react";
import type { GeoTargetType } from "@/lib/geo";

type GoogleDiscoveryCandidate = {
  id: string;
  displayName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
};

export function AdminGooglePlacePicker({
  targetType,
  targetId,
  publicLocation = true,
  configured = true,
  disabled = false,
  compact = false,
  onConfirmed,
}: {
  targetType: GeoTargetType;
  targetId: number;
  publicLocation?: boolean;
  configured?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onConfirmed?: () => void | Promise<void>;
}) {
  const endpoint = `/api/admin/geo/${targetType}/${targetId}`;
  const [candidates, setCandidates] = useState<GoogleDiscoveryCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function discover() {
    setBusy(true);
    setMessage("");
    setError("");
    setCandidates([]);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "discover-google-place" }),
      });
      const body = await response.json() as { candidates?: GoogleDiscoveryCandidate[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Google Maps vyhľadávanie zlyhalo.");
      const next = body.candidates ?? [];
      setCandidates(next);
      if (!next.length) setMessage("Google Maps nenašiel vhodné miesto.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Google Maps vyhľadávanie zlyhalo.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(placeId: string) {
    setBusy(true);
    setMessage("");
    setError("");
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

  return (
    <div data-admin-google-place-picker style={{ display: "grid", gap: compact ? 8 : 12 }}>
      <div className="admin-editor-actions" style={{ flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={disabled || busy || !configured}
          onClick={() => void discover()}
        >
          {busy ? "Hľadám…" : "Nájsť v Google Maps"}
        </button>
      </div>

      {!configured ? <p className="admin-help">Google Places momentálne nie je dostupné.</p> : null}

      {candidates.length ? (
        <div style={{ display: "grid", gap: compact ? 8 : 12 }}>
          {candidates.map((candidate) => (
            <div className="admin-message" key={candidate.id} style={{ margin: 0 }}>
              <strong>{candidate.displayName || "Google Maps miesto"}</strong>
              <p className="admin-help" style={{ margin: "4px 0 8px", overflowWrap: "anywhere" }}>
                {candidate.formattedAddress || "Adresa nie je uvedená"}
              </p>
              <div className="admin-editor-actions">
                <button type="button" disabled={busy} onClick={() => void confirm(candidate.id)}>
                  Použiť toto miesto
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {message ? <p className="admin-message" role="status" style={{ margin: 0 }}>{message}</p> : null}
      {error ? <p className="admin-message admin-message--error" role="alert" style={{ margin: 0 }}>{error}</p> : null}
    </div>
  );
}
