"use client";

import { useEffect, useState } from "react";
import {
  GOOGLE_MAPS_CONSENT_EVENT,
  GOOGLE_MAPS_CONSENT_KEY,
  hasGoogleMapsConsent,
  setGoogleMapsConsent,
} from "@/lib/google-maps-consent";

export function GoogleMapsConsentControls() {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    const read = () => setGranted(hasGoogleMapsConsent(window.localStorage.getItem(GOOGLE_MAPS_CONSENT_KEY)));
    read();
    window.addEventListener(GOOGLE_MAPS_CONSENT_EVENT, read);
    return () => window.removeEventListener(GOOGLE_MAPS_CONSENT_EVENT, read);
  }, []);

  return (
    <div className="privacy-controls">
      <p>Google Maps: <strong>{granted ? "povolené" : "nepovolené"}</strong>.</p>
      {granted ? (
        <button
          type="button"
          className="button button--light"
          onClick={() => {
            setGoogleMapsConsent(false);
            window.location.reload();
          }}
        >
          Vypnúť Google Maps
        </button>
      ) : (
        <button type="button" className="button button--light" onClick={() => setGoogleMapsConsent(true)}>
          Povoliť Google Maps
        </button>
      )}
    </div>
  );
}
