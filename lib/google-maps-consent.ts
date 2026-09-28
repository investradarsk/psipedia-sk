export const GOOGLE_MAPS_CONSENT_KEY = "psipedia-google-maps-consent";
export const GOOGLE_MAPS_CONSENT_EVENT = "psipedia:google-maps-consent-changed";

export function hasGoogleMapsConsent(storageValue: string | null) {
  return storageValue === "granted";
}

export function setGoogleMapsConsent(granted: boolean) {
  if (typeof window === "undefined") return;
  if (granted) window.localStorage.setItem(GOOGLE_MAPS_CONSENT_KEY, "granted");
  else window.localStorage.removeItem(GOOGLE_MAPS_CONSENT_KEY);
  window.dispatchEvent(new Event(GOOGLE_MAPS_CONSENT_EVENT));
}
